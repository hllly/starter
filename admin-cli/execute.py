#!/usr/bin/env python3
"""
Execute OpenClaw workflow and convert results to review-ready payload.

Supports multiple modes:
  1. Real execution: invoke platform (bootstrap or expansion) + company workflow
  2. From existing run: read company_master.tsv delta from a completed run
  3. Mock: generate sample leads (for testing)

Cold-start (bootstrap) flow:
  platform_workflow_controller --mode bootstrap  →  company_workflow_controller --mode drilldown
  Reads new outputs: platform_results.json, company_candidates.tsv
"""

import csv
import json
import os
import subprocess
import sys
from pathlib import Path

from workspace import OPENCLAW_ROOT, WORKFLOW_DIR, user_workspace, ensure_bucket_registry

# OpenClaw region names → our region labels (now Chinese labels used as values)
REGION_MAP = {
    "美国": "美国", "英国": "英国", "德国": "欧盟主要国家", "法国": "欧盟主要国家",
    "日本": "日本", "韩国": "韩国", "澳大利亚": "澳大利亚", "加拿大": "加拿大",
    "意大利": "欧盟主要国家", "西班牙": "欧盟主要国家", "荷兰": "欧盟主要国家",
    "巴西": "巴西", "印度": "印度", "中国": "中国",
    "东南亚": "东盟主要国家", "俄罗斯": "俄罗斯", "墨西哥": "墨西哥",
}
REGION_MAP_REV = {v: k for k, v in REGION_MAP.items()}

# OpenClaw source_type → our API source_type enum
SOURCE_TYPE_MAP = {
    "platform_drilldown": "industry_directory",
    "direct_company": "company_website",
}

VALID_SOURCE_TYPES = {
    "industry_directory", "association", "customs_data",
    "marketplace", "exhibitor_list", "company_website", "other",
}

VALID_BUYER_TYPES = {
    "importer", "distributor", "wholesaler",
    "brand_sourcing", "chain_retail_buyer", "trading_company", "unknown",
}


def _host_from_url(url):
    """Extract bare hostname from a URL, stripping www. prefix."""
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        u = url if "://" in url else f"https://{url}"
        h = urlparse(u).hostname or ""
        return h[4:].lower() if h.startswith("www.") else h.lower()
    except Exception:
        return ""


def _resolve_company_website(domain_guess, best_entry_url, source_platform):
    """Return a real company website URL, filtering out platform page URLs.

    Priority: domain_guess > best_entry_url (only if not a platform page).
    """
    platform_host = (source_platform[4:] if source_platform.startswith("www.") else source_platform).lower() if source_platform else ""

    if domain_guess and domain_guess != platform_host:
        return f"https://{domain_guess}"

    if best_entry_url:
        beu_host = _host_from_url(best_entry_url)
        if beu_host and beu_host != platform_host and platform_host not in beu_host:
            return best_entry_url

    return ""


def _map_source_type(raw):
    if raw in VALID_SOURCE_TYPES:
        return raw
    return SOURCE_TYPE_MAP.get(raw, "other")


def _map_buyer_type(raw):
    if raw in VALID_BUYER_TYPES:
        return raw
    return "unknown"


def _region_to_zh(code):
    return REGION_MAP_REV.get(code, code)


def _region_to_code(zh):
    return REGION_MAP.get(zh, zh)


# ── Platform readiness check ─────────────────────────

# Lifecycle + validation combos that select_drilldown_targets.py considers eligible
_DRILLABLE_LIFECYCLE = {"tested", "active", "confirmed_value", "trial_drilled"}
_DRILLABLE_VALIDATION = {"confirmed_value", "trial_drilled"}


def _has_drillable_platforms(ws):
    """Check if platform_master.tsv has at least one platform ready for drilldown."""
    pm_path = ws / "platform_master.tsv"
    rows = _read_tsv(pm_path)
    for row in rows:
        ls = row.get("lifecycle_status", "")
        vs = row.get("validation_status", "")
        if ls in _DRILLABLE_LIFECYCLE and vs in _DRILLABLE_VALIDATION:
            return True
    return False


_BOOTSTRAP_PROMOTE_TOP_K = 3
_BOOTSTRAP_FIT_THRESHOLD = 0.55
_BOOTSTRAP_FALLBACK_FIT = 0.35


def _promote_bootstrap_platforms(ws):
    """After bootstrap, promote qualifying platforms so company drilldown can use them.

    Promotion rules (aligned with workflow BOOTSTRAP_PARAMS_REDESIGN):
      1. Only action=promote_to_drilldown platforms are primary candidates
         (they already passed hard gates: trial≥3, detail_rate≥50%, website_rate≥20%)
      2. At most BOOTSTRAP_PROMOTE_TOP_K (3) platforms are promoted, sorted by fit desc
      3. Fallback: if zero primary candidates, promote the single best
         deeper_trial_drill platform with fit≥0.35 as a safety net
    """
    pm_path = ws / "platform_master.tsv"
    rows = _read_tsv(pm_path)
    if not rows:
        return 0

    primary = []   # promote_to_drilldown
    fallback = []  # deeper_trial_drill (safety net)

    for row in rows:
        action = (row.get("bootstrap_recommended_action") or "").strip()
        ls = row.get("lifecycle_status", "")
        if ls in _DRILLABLE_LIFECYCLE:
            continue
        access = (row.get("bootstrap_access_ok") or "").strip().lower() in ("true", "1", "yes")
        if not access:
            continue
        try:
            fit = float(row.get("bootstrap_fit_score", "0"))
        except (ValueError, TypeError):
            fit = 0.0

        if action == "promote_to_drilldown" and fit >= _BOOTSTRAP_FIT_THRESHOLD:
            primary.append((fit, row))
        elif action == "deeper_trial_drill" and fit >= _BOOTSTRAP_FALLBACK_FIT:
            fallback.append((fit, row))

    primary.sort(key=lambda x: -x[0])
    fallback.sort(key=lambda x: -x[0])

    to_promote = [row for _, row in primary[:_BOOTSTRAP_PROMOTE_TOP_K]]
    used_fallback = False
    if not to_promote and fallback:
        to_promote = [fallback[0][1]]
        used_fallback = True

    promoted = 0
    for row in to_promote:
        row["lifecycle_status"] = "tested"
        row["validation_status"] = "trial_drilled"
        if not (row.get("drill_strategy") or "").strip():
            row["drill_strategy"] = "directory_crawl"
        promoted += 1

    if promoted > 0:
        header = list(rows[0].keys())
        with open(pm_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=header, delimiter="\t",
                                    extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        if used_fallback:
            fb_name = to_promote[0].get("platform_domain", "?")
            print(f"  [platform] 无 promote_to_drilldown 平台，降级提升 1 个 deeper_trial_drill: {fb_name}")
        else:
            skipped_primary = len(primary) - promoted
            msg = f"  [platform] bootstrap 后提升 {promoted} 个平台为可下钻状态"
            if skipped_primary > 0:
                msg += f" (另 {skipped_primary} 个超出 TOP_K={_BOOTSTRAP_PROMOTE_TOP_K} 上限)"
            print(msg)

    return promoted


def _is_cold_workspace(ws):
    """A workspace is cold if it has no drillable platforms and few runs."""
    if _has_drillable_platforms(ws):
        return False
    runs_dir = ws / "runs"
    if not runs_dir.exists():
        return True
    return len(list(runs_dir.iterdir())) < 6


# ── Payload builder ──────────────────────────────────

def build_review_payload(
    run_id,
    summary_text,
    leads_data,
    source_summary="",
):
    """Build the review-ready payload from structured lead data."""
    rec = sum(1 for l in leads_data if l.get("current_tier") == "recommended")
    obs = sum(1 for l in leads_data if l.get("current_tier") == "observation")

    source_counts = {}
    for l in leads_data:
        st = l.get("source_type", "other")
        source_counts[st] = source_counts.get(st, 0) + 1

    return {
        "run_info": {
            "run_id": run_id,
            "summary_text": summary_text,
        },
        "batch_summary": {
            "recommended_count": rec,
            "observation_count": obs,
            "source_summary": source_summary or ", ".join(f"{k} {v}条" for k, v in source_counts.items()),
            "source_breakdown": [{"type": k, "count": v} for k, v in source_counts.items()],
        },
        "leads": leads_data,
    }


# ── Convert OpenClaw company_master rows to lead payload ─

def _score_to_tier(score_str, status):
    """Map company_master total_score / status to current_tier."""
    try:
        score = float(score_str) if score_str else 0
    except ValueError:
        score = 0
    if status in ("pass", "in_main_pool") or score >= 6:
        return "recommended"
    return "observation"


def _status_to_action(status):
    if status in ("pass", "in_main_pool"):
        return "contact_now"
    if status == "review":
        return "contact_if_fit"
    return "observe"


def convert_company_master_rows(rows, target_category, target_region):
    """Convert company_master.tsv rows to review-ready lead format."""
    leads = []
    region_code = _region_to_code(target_region) if target_region in REGION_MAP else target_region

    for row in rows:
        domain = row.get("root_domain", "")
        name = row.get("company_name_best", domain)
        website = row.get("best_entry_url", "")
        source_type = _map_source_type(row.get("source_type", "other"))
        source_platform = row.get("source_platform_domain", "")
        status = row.get("company_status", "new")
        score = row.get("total_score", "")
        region = row.get("region_hint", "") or region_code

        lead = {
            "company_name": name,
            "country_region": region,
            "buyer_type": "unknown",
            "source_type": source_type,
            "current_tier": _score_to_tier(score, status),
            "recommended_action": _status_to_action(status),
            "recommendation_reason": f"通过{source_platform or source_type}发现，{target_category}相关企业",
        }
        if website:
            lead["website"] = website
        if source_platform:
            lead["source_platform"] = source_platform

        leads.append(lead)
    return leads


def convert_review_queue_rows(rows, target_category, target_region):
    """Convert review_queue.tsv rows to review-ready lead format."""
    leads = []
    region_code = _region_to_code(target_region) if target_region in REGION_MAP else target_region

    for row in rows:
        name = row.get("company_name", row.get("root_domain", ""))
        website = row.get("best_entry_url", "")
        source_url = row.get("source_url", "")
        reason = row.get("queue_reason", "from_platform_drilldown")

        lead = {
            "company_name": name,
            "country_region": region_code,
            "buyer_type": "unknown",
            "source_type": "industry_directory",
            "current_tier": "recommended",
            "recommended_action": "contact_if_fit",
            "recommendation_reason": f"来源: {reason}，{target_category}相关",
        }
        if website:
            lead["website"] = website
        if source_url:
            lead["source_url"] = source_url

        leads.append(lead)
    return leads


# ── Read TSV helper ──────────────────────────────────

def _read_tsv(path):
    p = Path(path)
    if not p.exists():
        return []
    with p.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


# ── Real workflow execution ──────────────────────────


def _run_platform(ws, wf, mode, category, region,
                  run_id):
    """Run platform_workflow_controller.py with the given mode. Returns exit code."""
    p_cmd = [
        sys.executable, str(WORKFLOW_DIR / "platform_workflow_controller.py"),
        "run", "--mode", mode,
        "--workspace", ws, "--workflow-dir", wf,
        "--target-category", category, "--target-region", region,
    ]
    if run_id:
        p_cmd += ["--run-id", run_id]
    result = subprocess.run(p_cmd, cwd=wf, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    if result.returncode != 0:
        print("  ⚠ 平台 {} 异常 (exit={})".format(mode, result.returncode))
        if result.stderr:
            print("    {}".format(result.stderr[:400]))
    else:
        print(f"  ✓ 平台 {mode} 完成")
    return result.returncode


def run_openclaw_workflow(
    target_category,
    target_region_zh,
    run_id=None,
    mode="auto",
    skip_platform=False,
    workspace=None,
):
    """Run the full OpenClaw workflow (platform → company) and return (run_id, summary)."""
    ws = str(workspace or OPENCLAW_ROOT)
    wf = str(WORKFLOW_DIR)
    ws_path = Path(ws)

    # ── Pre-run: export feedback snapshot ──
    try:
        phone = ws_path.name if ws_path.parent.name == "users" else None
        if phone:
            from export_feedback import export_feedback_snapshot
            export_feedback_snapshot(phone)
    except Exception as e:
        print(f"  ⚠ 反馈导出失败 (非阻塞): {e}")

    # ── Phase 1: Platform ──
    if not skip_platform:
        cold = _is_cold_workspace(ws_path)

        if cold:
            print(f"  [1/2] 冷启动 — bootstrap 模式…")
            _run_platform(ws, wf, "bootstrap", target_category, target_region_zh,
                          f"{run_id}_platform" if run_id else None)
            # Bootstrap sets lifecycle=bootstrap_validated, but company drilldown
            # needs lifecycle in (tested, active). Promote qualified platforms.
            promoted = _promote_bootstrap_platforms(ws_path)
            if promoted == 0:
                print(f"  ⚠ bootstrap 未产出可提升平台")
        else:
            print(f"  [1/2] 执行平台发现 (mode={mode})…")
            _run_platform(ws, wf, mode, target_category, target_region_zh,
                          f"{run_id}_platform" if run_id else None)

        if _has_drillable_platforms(ws_path):
            print(f"  ✓ 已有可下钻平台")
        else:
            print(f"  ⚠ 仍无可下钻平台（需要更多轮次或人工检查）")
    else:
        print(f"  [1/2] 跳过平台发现")

    # ── Phase 2: Company drilldown ──
    print(f"  [2/2] 执行公司下钻…")
    c_cmd = [
        sys.executable, str(WORKFLOW_DIR / "company_workflow_controller.py"),
        "run", "--mode", "drilldown",
        "--workspace", ws, "--workflow-dir", wf,
        "--target-category", target_category, "--target-region", target_region_zh,
    ]
    if run_id:
        c_cmd += ["--run-id", run_id]
    result = subprocess.run(c_cmd, cwd=wf, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)

    if result.returncode != 0:
        raise RuntimeError("公司下钻失败 (exit={}): {}".format(result.returncode, result.stderr[:500]))

    print(f"  ✓ 公司下钻完成")

    # Read the summary
    actual_run_id = run_id or ""
    if result.stdout:
        for line in result.stdout.splitlines():
            if "run_id" in line and "=" in line:
                actual_run_id = line.split("=", 1)[-1].strip()

    summary_path = ws_path / "runs" / actual_run_id / "reports" / "company_drilldown_summary.json"
    summary = {}
    if summary_path.exists():
        summary = json.loads(summary_path.read_text())

    quality_file = ws_path / "runs" / actual_run_id / "run_quality.txt"
    if quality_file.exists():
        summary["run_quality"] = quality_file.read_text().strip()

    return actual_run_id or run_id or "unknown", summary


# ── From existing run ────────────────────────────────

def convert_company_candidates_rows(rows, target_category, target_region):
    """Convert company_candidates.tsv rows (new workflow output) to review-ready lead format.

    Handles both 'candidate' and 'verified' evidence levels.
    Also works with company_master.tsv rows (canonical_key + evidence_level)."""
    leads = []
    region_code = _region_to_code(target_region) if target_region in REGION_MAP else target_region

    for row in rows:
        name = row.get("company_name") or row.get("company_name_best") or row.get("domain_guess", "")
        if not name:
            continue

        best_entry = row.get("best_entry_url", "")
        domain_guess = row.get("domain_guess", "")
        source_platform = row.get("source_platform_domain", "")
        source_url = row.get("source_url", "")
        evidence = row.get("evidence_level", "candidate")

        # Determine real company website — never use platform page URLs
        website = _resolve_company_website(domain_guess, best_entry, source_platform)

        if evidence == "verified":
            tier = "recommended"
            action = "contact_if_fit"
        else:
            tier = "observation"
            action = "observe"

        try:
            fit = float(row.get("fit_score", "0"))
        except (ValueError, TypeError):
            fit = 0.0
        if fit >= 0.6:
            tier = "recommended"
            action = "contact_if_fit"

        lead = {
            "company_name": name,
            "country_region": row.get("region_hint", "") or region_code,
            "buyer_type": "unknown",
            "source_type": _map_source_type(row.get("source_type", "platform_drilldown")),
            "current_tier": tier,
            "recommended_action": action,
            "recommendation_reason": f"通过{source_platform}发现，{target_category}相关企业 (证据: {evidence})",
        }
        if website:
            lead["website"] = website
        if source_platform:
            lead["source_platform"] = source_platform
        if source_url:
            lead["source_url"] = source_url

        leads.append(lead)
    return leads


def load_platform_results(ws, run_id):
    """Read platform_results.json from the platform run directory."""
    for suffix in ("_platform", ""):
        p = ws / "runs" / f"{run_id}{suffix}" / "platform_results.json"
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return None


def load_from_run(run_id, target_category, target_region, workspace=None):
    """Load companies from a run, preferring new outputs over legacy.

    Priority:
      1. company_candidates.tsv (new emit_company_candidates output, two-tier)
      2. company_master.tsv rows with matching discovery_run_id (new canonical key model)
      3. review_queue.tsv rows with matching run_id (verified-only legacy)
    """
    ws = workspace or OPENCLAW_ROOT
    run_dir = ws / "runs" / run_id

    # Priority 1: company_candidates.tsv (new workflow output — both candidate + verified)
    for suffix in ("_platform", ""):
        cc_path = ws / "runs" / f"{run_id}{suffix}" / "company_candidates.tsv"
        if cc_path.exists():
            cc_rows = _read_tsv(cc_path)
            if cc_rows:
                print(f"  从 company_candidates.tsv 加载 {len(cc_rows)} 条 (run={run_id}{suffix})")
                return convert_company_candidates_rows(cc_rows, target_category, target_region)

    # Priority 2: company_master.tsv with new canonical key model
    # Each row has its own canonical_key — no more collapsing into platform domain
    cm_path = ws / "company_master.tsv"
    cm_rows = [r for r in _read_tsv(cm_path) if r.get("discovery_run_id") == run_id]
    if cm_rows:
        print(f"  从 company_master.tsv 加载 {len(cm_rows)} 条候选 (run={run_id})")
        return convert_company_candidates_rows(cm_rows, target_category, target_region)

    # Priority 3: review_queue.tsv (verified-only legacy output)
    rq_path = ws / "review_queue.tsv"
    rq_rows = [r for r in _read_tsv(rq_path) if r.get("run_id") == run_id]
    if rq_rows:
        print(f"  从 review_queue.tsv 加载 {len(rq_rows)} 条 (run={run_id})")
        return convert_review_queue_rows(rq_rows, target_category, target_region)

    summary_path = run_dir / "reports" / "company_drilldown_summary.json"
    if summary_path.exists():
        summary = json.loads(summary_path.read_text())
        extracted = summary.get("drilldown_health", {}).get("companies_extracted", 0)
        print(f"  ⚠ 找不到 run_id={run_id} 的具体公司数据 (summary 显示提取了 {extracted} 家)")
    else:
        print(f"  ⚠ 找不到 run {run_id} 的数据")

    return []


# ── From new companies in company_master (batch) ─────

def load_new_companies(target_category, target_region, limit=50, workspace=None):
    """Load companies with status=new from company_master as leads."""
    ws = workspace or OPENCLAW_ROOT
    cm_rows = _read_tsv(ws / "company_master.tsv")
    new_rows = [r for r in cm_rows if r.get("company_status") == "new"]
    print(f"  从 company_master.tsv 加载 {len(new_rows)} 条 new 公司 (限制 {limit})")
    return convert_company_master_rows(new_rows[:limit], target_category, target_region)


# ── Mock (kept for testing) ──────────────────────────

def mock_execute(payload):
    category = payload["request"]["productCategory"]
    regions = payload["request"]["targetRegions"]
    buyer_types = payload["request"]["buyerTypes"]
    region = regions[0] if regions else "US"
    bt = buyer_types[0] if buyer_types else "distributor"

    return [
        {
            "company_name": f"{category} Direct Inc.",
            "website": f"https://{category.lower().replace(' ', '')}-direct.com",
            "country_region": region, "buyer_type": bt,
            "source_type": "industry_directory", "source_platform": "Kompass",
            "recommendation_reason": f"主营{category}的{bt}，采购意向明确",
            "recommended_action": "contact_now", "current_tier": "recommended",
        },
        {
            "company_name": f"Global {category} Trading",
            "website": f"https://global-{category.lower().replace(' ', '')}.com",
            "country_region": region, "buyer_type": bt,
            "source_type": "customs_data",
            "recommendation_reason": f"海关数据显示近12个月频繁进口{category}相关产品",
            "recommended_action": "contact_if_fit", "current_tier": "recommended",
        },
        {
            "company_name": f"{region} {category} Corp",
            "country_region": region, "buyer_type": "trading_company",
            "source_type": "marketplace", "source_platform": "Alibaba",
            "recommendation_reason": f"{region}地区{category}贸易商，有持续采购记录",
            "recommended_action": "observe", "current_tier": "observation",
        },
    ]


# ── Main orchestration ───────────────────────────────

def _collect_quality_meta(ws, run_id, summary=None):
    """Read quality metrics from platform_results.json + company_drilldown_summary.json + bootstrap_scores.json."""
    qm = {}
    if not ws:
        return qm

    # --- Platform-level metrics ---
    platform_info = load_platform_results(ws, run_id)
    if platform_info:
        platforms = platform_info.get("platforms", [])
        qm["platform_count"] = len(platforms)
        qm["platform_accessible"] = sum(1 for p in platforms if p.get("access_ok"))
        qm["platform_verified_companies"] = sum(p.get("verified_company_count", 0) for p in platforms)

    # --- Bootstrap scoring metrics (from bootstrap_scores.json) ---
    for suffix in ("_platform", ""):
        bs_path = ws / "runs" / f"{run_id}{suffix}" / "bootstrap_scores.json"
        if bs_path.exists():
            bs = json.loads(bs_path.read_text(encoding="utf-8"))
            bp = bs.get("platforms", [])
            if bp:
                qm["bootstrap_platforms_scored"] = len(bp)
                qm["bootstrap_hard_gate_pass"] = sum(1 for p in bp if p.get("hard_gate_pass"))
                qm["bootstrap_promoted"] = sum(
                    1 for p in bp if p.get("recommended_next_action") == "promote_to_drilldown"
                )
                avg_conf = sum(p.get("sample_confidence", 0) for p in bp) / max(len(bp), 1)
                qm["bootstrap_avg_confidence"] = round(avg_conf, 3)
            break

    # --- Company drilldown metrics ---
    if summary is None:
        for suffix in ("", "_platform"):
            sp = ws / "runs" / f"{run_id}{suffix}" / "reports" / "company_drilldown_summary.json"
            if sp.exists():
                summary = json.loads(sp.read_text(encoding="utf-8"))
                break
    if summary:
        dh = summary.get("drilldown_health", {})
        qm["companies_extracted"] = dh.get("companies_extracted", 0)
        qm["companies_new"] = dh.get("companies_new", 0)
        qm["review_queue_rows"] = dh.get("review_queue_rows", 0)
        qm["candidate_total"] = dh.get("candidate_companies_total", 0)
        qm["candidate_no_domain"] = dh.get("candidate_without_domain_count", 0)
        qm["collapsed_by_dedupe"] = dh.get("collapsed_by_dedupe_count", 0)
        qm["platform_blocked"] = dh.get("platform_blocked_count", 0)
        qm["extract_timeout"] = dh.get("extract_stage_timeout_count", 0)
        if summary.get("run_quality"):
            qm["run_quality"] = summary["run_quality"]

    # --- Run quality from file (fallback if not in summary) ---
    if "run_quality" not in qm and run_id:
        for suffix in ("", "_platform"):
            qf = ws / "runs" / f"{run_id}{suffix}" / "run_quality.txt"
            if qf.exists():
                qm["run_quality"] = qf.read_text().strip()
                break

    # --- Bucket saturation signal ---
    sat_flag = ws / "bucket_saturation.flag"
    if sat_flag.exists():
        qm["bucket_saturated"] = True
        try:
            qm["bucket_saturation_info"] = json.loads(sat_flag.read_text())
        except (json.JSONDecodeError, OSError):
            pass

    return qm


def _resolve_workspace(job_payload):
    """Extract userPhone from payload and return the user's workspace, or None for shared."""
    phone = job_payload.get("userPhone")
    if phone:
        ws = user_workspace(phone)
        print(f"  用户工作空间: {ws}  (phone={phone})")

        # Ensure bucket registry is configured for this job's category/region
        category = job_payload.get("request", {}).get("productCategory", "")
        regions = job_payload.get("request", {}).get("targetRegions", [])
        region = regions[0] if regions else ""
        if category and region:
            ensure_bucket_registry(phone, category, region)

        return ws
    return None


def execute_and_build_payload(
    job_payload,
    run_id,
    source=None,
):
    """
    Execute workflow and build review-ready payload.

    source can be:
      - None or "mock"    → mock execution
      - "run"             → invoke real OpenClaw workflow
      - "run:<run_id>"    → load from existing OpenClaw run
      - "new"             → load all new companies from company_master
      - path to .tsv file → load from TSV
    """
    category = job_payload["request"]["productCategory"]
    regions = job_payload["request"].get("targetRegions", [])
    region = regions[0] if regions else "US"
    ws = _resolve_workspace(job_payload)
    quality_meta = {}

    if source and source.startswith("run:"):
        existing_run_id = source.split(":", 1)[1]
        print(f"  从已有 OpenClaw run 加载: {existing_run_id}")
        leads = load_from_run(existing_run_id, category, region, workspace=ws)
        quality_meta = _collect_quality_meta(ws, existing_run_id) if ws else {}

    elif source == "run":
        target_region_zh = _region_to_zh(region) if len(region) <= 3 else region
        print(f"  启动 OpenClaw 工作流: 品类={category} 地区={target_region_zh}")
        actual_run_id, summary = run_openclaw_workflow(category, target_region_zh, run_id, workspace=ws)
        run_id = actual_run_id
        leads = load_from_run(actual_run_id, category, region, workspace=ws)
        if not leads:
            leads = load_new_companies(category, region, workspace=ws)
        quality_meta = _collect_quality_meta(ws, actual_run_id, summary)

    elif source == "new":
        print(f"  加载 company_master 中所有 new 公司")
        leads = load_new_companies(category, region, workspace=ws)

    elif source and os.path.exists(source) and source.endswith(".tsv"):
        print(f"  从 TSV 文件加载: {source}")
        leads = convert_company_master_rows(_read_tsv(source), category, region)

    else:
        print(f"  使用 mock 执行（品类: {category}）")
        leads = mock_execute(job_payload)

    summary_text = f"本轮围绕{category}品类，共发现{len(leads)}条线索"
    payload = build_review_payload(run_id, summary_text, leads)
    if quality_meta:
        payload["quality_meta"] = quality_meta
    return payload


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("""用法: python execute.py <job_payload.json> <run_id> [source]

source 选项:
  (空)                使用 mock 数据
  run                 执行真实 OpenClaw 工作流
  run:<openclaw_id>   从已有 OpenClaw run 加载结果
  new                 加载 company_master 中所有 new 公司
  <path>.tsv          从 TSV 文件加载
""")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        job_payload = json.load(f)
    run_id = sys.argv[2]
    source = sys.argv[3] if len(sys.argv) > 3 else None

    result = execute_and_build_payload(job_payload, run_id, source)
    out_file = f"payload_{run_id}.json"
    with open(out_file, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"  ✓ Payload 已保存到 {out_file}")
    print(f"    {len(result['leads'])} 条线索 (推荐 {result['batch_summary']['recommended_count']} / 观察 {result['batch_summary']['observation_count']})")
