#!/usr/bin/env python3
"""
One-click orchestration: claim → execute → review-ready → review → publish/reject.

Usage:
  python run.py                              # Interactive: pick job + choose execution mode
  python run.py <job_id>                     # Direct job, interactive execution mode
  python run.py <job_id> --mock              # Use mock data
  python run.py <job_id> --run               # Execute real OpenClaw workflow
  python run.py <job_id> --from <run_id>     # Load from existing OpenClaw run
  python run.py <job_id> --new               # Load new companies from company_master
  python run.py <job_id> --tsv <path>        # Load from TSV file
"""

from __future__ import annotations

import argparse
import sys
import json
import uuid
import api
import jobs as jobs_cli
import review as review_cli
from execute import execute_and_build_payload


def _pick_source_interactive() -> str:
    """Let the user pick execution source interactively."""
    print("\n  执行方式:")
    print("  [1] mock  — 使用模拟数据（测试用）")
    print("  [2] run   — 执行真实 OpenClaw 工作流")
    print("  [3] from  — 从已有 OpenClaw run 加载")
    print("  [4] new   — 加载 company_master 中所有 new 公司")
    print("  [5] tsv   — 从 TSV 文件加载")

    choice = input("  选择 (1-5, 默认 1): ").strip() or "1"

    if choice == "1":
        return "mock"
    elif choice == "2":
        return "run"
    elif choice == "3":
        oc_run_id = input("  OpenClaw run_id: ").strip()
        if not oc_run_id:
            print("  取消")
            sys.exit(0)
        return f"run:{oc_run_id}"
    elif choice == "4":
        return "new"
    elif choice == "5":
        tsv_path = input("  TSV 文件路径: ").strip()
        if not tsv_path:
            print("  取消")
            sys.exit(0)
        return tsv_path
    else:
        return "mock"


def run(job_id: str | None = None, source: str | None = None) -> None:
    # ── Step 1: Pick & claim ──────────────────────────
    if not job_id:
        queued = api.list_jobs("queued")
        if not queued:
            print("\n没有待处理的任务。")
            return
        print("\n── Step 1: 选择并领取任务 ──")
        result = jobs_cli.cmd_claim()
        if not result:
            return
        job_id = result["id"]
    else:
        current = api.get_payload(job_id)
        if current["status"] == "queued":
            print(f"\n── Step 1: 领取任务 {job_id[:8]}… ──")
            api.claim(job_id)
            print(f"  ✓ 已领取")
        elif current["status"] != "claimed":
            print(f"  任务状态为 {current['status']}，尝试继续…")

    # ── Step 2: Get payload & start ───────────────────
    print(f"\n── Step 2: 拉取参数并开始执行 ──")
    payload = api.get_payload(job_id)
    category = payload["request"]["productCategory"]
    regions = payload["request"].get("targetRegions", [])
    buyer_types = payload["request"].get("buyerTypes", [])
    print(f"  品类: {category}")
    print(f"  地区: {regions}")
    print(f"  客户类型: {buyer_types}")

    if payload["status"] in ("queued", "claimed"):
        api.start(job_id)
        print(f"  ✓ 已标记为 running")

    # ── Step 3: Choose source & execute ───────────────
    if source is None:
        source = _pick_source_interactive()

    print(f"\n── Step 3: 执行工作流 (source={source}) ──")
    run_id = f"run_{uuid.uuid4().hex[:8]}"

    try:
        review_payload = execute_and_build_payload(payload, run_id, source if source != "mock" else None)
    except Exception as e:
        print(f"\n  ✗ 执行失败: {e}")
        mark_fail = input("  是否标记任务为失败? (y/N): ").strip().lower()
        if mark_fail == "y":
            api.fail(job_id, error_summary=str(e)[:500])
            print(f"  已标记为 failed")
        return

    lead_count = len(review_payload["leads"])
    rec = review_payload["batch_summary"]["recommended_count"]
    obs = review_payload["batch_summary"]["observation_count"]
    print(f"  结果: {lead_count}条线索 (推荐{rec} / 观察{obs})")

    qm = review_payload.get("quality_meta", {})
    if qm:
        print(f"  质量指标: 平台{qm.get('platform_count', '?')}个"
              f" (可访问{qm.get('platform_accessible', '?')})"
              f" / 候选{qm.get('candidate_total', '?')}"
              f" / 提取{qm.get('companies_extracted', '?')}"
              f" / 新公司{qm.get('companies_new', '?')}")

        # Quality alerts
        alerts = []
        cand = qm.get("candidate_total", 0)
        new = qm.get("companies_new", 0)
        no_dom = qm.get("candidate_no_domain", 0)
        collapsed = qm.get("collapsed_by_dedupe", 0)
        blocked = qm.get("platform_blocked", 0)
        timeout = qm.get("extract_timeout", 0)

        if cand >= 10 and new <= 2:
            alerts.append(f"候选{cand}条但仅{new}条入库，可能存在候选归并异常")
        if cand > 0 and no_dom / max(cand, 1) > 0.7:
            alerts.append(f"候选无官网率 {no_dom}/{cand} ({no_dom*100//max(cand,1)}%)，M1a 详情页补官网不足")
        if collapsed > 5:
            alerts.append(f"去重折叠 {collapsed} 条，检查 canonical_key 是否正常")
        if blocked > 0:
            alerts.append(f"{blocked} 个平台被阻断")
        if timeout > 3:
            alerts.append(f"extract 阶段超时 {timeout} 次，浏览器链路不稳定")

        plat_as_web = sum(
            1 for l in review_payload["leads"]
            if l.get("website") and l.get("source_platform")
            and l["source_platform"].replace("www.", "").lower()
            in l["website"].replace("www.", "").lower()
        )
        if plat_as_web > 2:
            alerts.append(f"{plat_as_web} 条线索的 website 实际是平台页 URL，入库可能被误合并")

        bs_scored = qm.get("bootstrap_platforms_scored", 0)
        bs_gate = qm.get("bootstrap_hard_gate_pass", 0)
        bs_promoted = qm.get("bootstrap_promoted", 0)
        if bs_scored > 0 and bs_promoted == 0:
            alerts.append(f"bootstrap 评估了 {bs_scored} 个平台但无一达到晋级标准 (硬门槛通过={bs_gate})")
        if bs_scored > 0 and bs_gate == 0:
            alerts.append("所有平台均未通过硬门槛 (trial≥3 + detail_rate≥50% + website_rate≥20%)")

        for a in alerts:
            print(f"  ⚠ {a}")

    run_quality = qm.get("run_quality", "ok") if qm else "ok"
    if run_quality == "empty" or lead_count == 0:
        print(f"\n  ⚠ 本轮完全无产出 (run_quality={run_quality})")
        if lead_count == 0:
            api.fail(job_id, error_summary=f"工作流无产出 (run_quality={run_quality})")
            print(f"  已自动标记为 failed")
            return
        action = input("  回传空结果 (y) / 标记失败 (f) / 取消 (n): ").strip().lower()
        if action == "f":
            api.fail(job_id, error_summary=f"工作流无产出 (run_quality={run_quality})")
            print(f"  已标记为 failed")
            return
        elif action != "y":
            print(f"  跳过，任务保持 running 状态。")
            return
    elif run_quality == "low_yield":
        print(f"\n  ⚠ 本轮产出极低 (run_quality=low_yield)，建议检查平台质量")

    # ── Step 4: Submit results ────────────────────────
    print(f"\n── Step 4: 回传结果 ──")
    submit_result = api.review_ready(job_id, review_payload)
    print(f"  ✓ 回传成功: companies_new={submit_result['companiesCreated']} reused={submit_result['companiesReused']}")

    # ── Step 5: Review ────────────────────────────────
    print(f"\n── Step 5: 审核 ──")
    review_cli.cmd_review(job_id)

    # ── Step 6: Decide ────────────────────────────────
    print(f"\n── Step 6: 确认发布 ──")
    decision = input("  发布 (y) / 拒绝 (n) / 跳过 (s): ").strip().lower()

    if decision == "y":
        api.publish(job_id)
        print(f"  ✓ 已发布！用户现在可以看到线索。")
    elif decision == "n":
        note = input("  拒绝原因: ").strip()
        api.reject(job_id, review_note=note)
        print(f"  ✗ 已拒绝。")
    else:
        print(f"  跳过，任务保持 awaiting_review 状态。")

    print(f"\n── 完成 ──")


def main():
    parser = argparse.ArgumentParser(description="管理员一键执行流程")
    parser.add_argument("job_id", nargs="?", help="Job ID (留空进入交互选择)")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--mock", action="store_true", help="使用模拟数据")
    group.add_argument("--run", action="store_true", help="执行真实 OpenClaw 工作流")
    group.add_argument("--from", dest="from_run", metavar="RUN_ID", help="从已有 OpenClaw run 加载")
    group.add_argument("--new", action="store_true", help="加载 company_master 中 new 公司")
    group.add_argument("--tsv", metavar="PATH", help="从 TSV 文件加载")

    args = parser.parse_args()

    source = None
    if args.mock:
        source = "mock"
    elif args.run:
        source = "run"
    elif args.from_run:
        source = f"run:{args.from_run}"
    elif args.new:
        source = "new"
    elif args.tsv:
        source = args.tsv

    run(args.job_id, source)


if __name__ == "__main__":
    main()
