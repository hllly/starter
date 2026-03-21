#!/usr/bin/env python3
"""
Admin CLI for managing company profile build requests.

Usage:
  python profile_run.py                         # Interactive: list queued requests
  python profile_run.py <request_id>            # Process specific request
  python profile_run.py --list [status]         # List requests by status
  python profile_run.py --auto                  # Process ALL queued requests non-interactively

Workflow integration:
  When a company has no profile in company_profile.tsv, this script will
  automatically invoke the OpenClaw company profile workflow:
    python3 company_workflow_controller.py profile <domain> --target-category ... --target-region ...
  After the run, it re-reads company_profile.tsv to get the new data.
"""

import argparse
import csv
import os
import subprocess
import sys
import time
import uuid
import api
from workspace import OPENCLAW_ROOT, WORKFLOW_DIR, user_workspace, user_profile_tsv

COMPANY_WORKFLOW_CONTROLLER = str(WORKFLOW_DIR / "company_workflow_controller.py")


def _parse_profile_tsv(domain, tsv_path=None):
    """Find a company profile by root_domain in company_profile.tsv."""
    path = tsv_path or str(OPENCLAW_ROOT / "company_profile.tsv")
    if not os.path.exists(path):
        return None

    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            if row.get("root_domain", "").strip().lower() == domain.strip().lower():
                return row
    return None


def _tsv_row_to_profile_data(row):
    """Convert a TSV row into the API profile payload format."""
    return {
        "root_domain": row.get("root_domain"),
        "profile_quality": row.get("profile_quality", "medium"),
        "email_best": row.get("email_best") or None,
        "email_alt": row.get("email_alt") or None,
        "phone_best": row.get("phone_best") or None,
        "phone_alt": row.get("phone_alt") or None,
        "contact_page_url": row.get("contact_page_url") or None,
        "contact_form_url": row.get("contact_form_url") or None,
        "linkedin_company_url": row.get("linkedin_company_url") or None,
        "country": row.get("country") or None,
        "state_region": row.get("state_region") or None,
        "city": row.get("city") or None,
        "address_raw": row.get("address_raw") or None,
        "founded_year": row.get("founded_year") or None,
        "business_model": row.get("business_model") or None,
        "company_role": row.get("company_role") or None,
        "buyer_fit": row.get("buyer_fit") or None,
        "buyer_fit_reason": row.get("buyer_fit_reason") or None,
        "product_categories": row.get("product_categories") or None,
        "core_products": row.get("core_products") or None,
        "target_markets": row.get("target_markets") or None,
        "industry_focus": row.get("industry_focus") or None,
        "import_signal": row.get("import_signal") or None,
        "oem_odm_signal": row.get("oem_odm_signal") or None,
        "private_label_signal": row.get("private_label_signal") or None,
        "vendor_onboarding_signal": row.get("vendor_onboarding_signal") or None,
        "moq_sample_signal": row.get("moq_sample_signal") or None,
        "procurement_signal_notes": row.get("procurement_signal_notes") or None,
        "employee_range": row.get("employee_range") or None,
        "revenue_range": row.get("revenue_range") or None,
        "facility_signal": row.get("facility_signal") or None,
        "certifications": row.get("certifications") or None,
        "evidence_urls": None,
        "evidence_notes": row.get("evidence_notes") or None,
        "pages_visited_count": int(row["pages_visited_count"]) if row.get("pages_visited_count") else None,
        "raw_json": None,
    }


def cmd_list(status="queued"):
    """List profile requests by status."""
    requests = api.list_profile_requests(status)
    if not requests:
        print(f"\n没有 {status} 状态的画像请求。")
        return

    print(f"\n── {status} 画像请求 ({len(requests)}) ──")
    for i, r in enumerate(requests, 1):
        company = r["company"]
        domain = company.get("rootDomain") or company.get("website") or "—"
        print(f"  [{i}] {r['id'][:8]}… {company['companyName']} ({domain})")
        print(f"      请求时间: {r['requestedAt']}")


def _run_openclaw_profile(domain, company_name, category="", region="", workspace=None):
    """
    Invoke the real OpenClaw company profile workflow for a single domain.
    Returns True if the run completed (profile may or may not have data).
    """
    if not os.path.exists(COMPANY_WORKFLOW_CONTROLLER):
        print(f"  ✗ workflow controller not found: {COMPANY_WORKFLOW_CONTROLLER}")
        return False

    ws = workspace or str(OPENCLAW_ROOT)
    cmd = [
        sys.executable,
        COMPANY_WORKFLOW_CONTROLLER,
        "profile",
        domain,
        "--workspace", ws,
        "--workflow-dir", str(WORKFLOW_DIR),
    ]
    if category:
        cmd += ["--target-category", category]
    if region:
        cmd += ["--target-region", region]

    print(f"  ▶ 运行: python3 company_workflow_controller.py profile {domain}")
    print(f"    workspace={ws}")
    print(f"    category={category or '—'}  region={region or '—'}")
    print(f"    (这会调用 OpenClaw agent，需要 browser + gateway 在运行...)")

    try:
        result = subprocess.run(
            cmd,
            cwd=str(WORKFLOW_DIR),
            timeout=600,
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print(f"  ✗ 超时（超过 10 分钟）")
        return False
    except Exception as e:
        print(f"  ✗ 执行出错: {e}")
        return False


def cmd_process(request_id=None, auto=False):
    """
    Process a profile request.
    Returns True on success, False on failure/skip.
    In auto mode, skips interactive prompts and runs the workflow automatically.
    """
    if not request_id:
        requests_list = api.list_profile_requests("queued")
        if not requests_list:
            print("\n没有待处理的画像请求。")
            return False

        cmd_list("queued")
        if auto:
            # In auto mode, just pick the first one
            request_id = requests_list[0]["id"]
            print(f"\n  自动模式: 处理 {request_id[:8]}…")
        else:
            choice = input("\n  选择序号 (1-N): ").strip()
            try:
                idx = int(choice) - 1
                request_id = requests_list[idx]["id"]
            except (ValueError, IndexError):
                print("  无效选择")
                return False

    # ── Step 1: Claim ─────────────────────────────────
    print(f"\n── Step 1: 领取请求 {request_id[:8]}… ──")
    try:
        api.claim_profile(request_id)
        print("  ✓ 已领取")
    except Exception as e:
        # May already be claimed (retry scenario), continue
        print(f"  ⚠ claim 失败（可能已领取）: {e}")

    # Get payload (includes userPhone for workspace isolation)
    payload = api.get_profile_payload(request_id)
    company = payload["company"]
    domain = company.get("rootDomain") or company.get("website") or ""
    company_name = company.get("companyName", "")
    user_phone = payload.get("userPhone", "")

    # Resolve user workspace
    if user_phone:
        u_ws = str(user_workspace(user_phone))
        u_tsv = str(user_profile_tsv(user_phone))
        print(f"  用户: {user_phone}  工作空间: {u_ws}")
    else:
        u_ws = str(OPENCLAW_ROOT)
        u_tsv = str(OPENCLAW_ROOT / "company_profile.tsv")
        print(f"  ⚠ payload 无 userPhone，使用共享工作空间")

    print(f"  公司: {company_name}")
    print(f"  域名: {domain}")

    # ── Step 2: Start ──────────────────────────────────
    print(f"\n── Step 2: 开始执行 ──")
    try:
        api.start_profile(request_id)
        print("  ✓ 已标记为 running")
    except Exception as e:
        print(f"  ⚠ start 失败（可能已 running）: {e}")

    # ── Step 3: Find or build profile data ───────────
    print(f"\n── Step 3: 查找/执行画像 ──")

    profile_data = None
    run_id = f"profile_{uuid.uuid4().hex[:8]}"

    if domain:
        row = _parse_profile_tsv(domain, tsv_path=u_tsv)
        if row:
            profile_data = _tsv_row_to_profile_data(row)
            print(f"  ✓ 从 {u_tsv} 找到已有画像（quality={row.get('profile_quality','?')}）")
        else:
            print(f"  ⚠ {u_tsv} 中暂无 {domain} 的画像")

    if not profile_data:
        if auto:
            print(f"\n  自动模式：调用 OpenClaw 工作流构建画像…")
            ok = _run_openclaw_profile(domain, company_name, workspace=u_ws)
            if ok:
                time.sleep(1)
                row = _parse_profile_tsv(domain, tsv_path=u_tsv)
                if row:
                    profile_data = _tsv_row_to_profile_data(row)
                    print(f"  ✓ 工作流完成，读取到画像数据")
                else:
                    print(f"  ⚠ 工作流完成但 company_profile.tsv 中仍无数据，标记失败")
                    api.fail_profile(request_id, f"Workflow completed but no profile data found for {domain}")
                    return False
            else:
                print(f"  ✗ 工作流执行失败，标记请求失败")
                api.fail_profile(request_id, f"OpenClaw workflow failed for {domain}")
                return False
        else:
            print(f"\n  没有现成画像数据，你可以：")
            print(f"  [1] 调用 OpenClaw 工作流构建（需要 browser + gateway 在运行）")
            print(f"  [2] 标记为失败")
            print(f"  [3] 从指定 TSV 文件加载")
            choice = input("  选择 (1/2/3): ").strip()

            if choice == "1":
                cat = input(f"  目标品类 (默认空): ").strip()
                reg = input(f"  目标地区 (默认空): ").strip()
                ok = _run_openclaw_profile(domain, company_name, cat, reg, workspace=u_ws)
                if ok:
                    time.sleep(1)
                    row = _parse_profile_tsv(domain, tsv_path=u_tsv)
                    if row:
                        profile_data = _tsv_row_to_profile_data(row)
                        print(f"  ✓ 工作流完成，读取到画像数据")
                    else:
                        print(f"  ⚠ 工作流完成但未找到数据")
                else:
                    print(f"  ✗ 工作流失败")

            elif choice == "3":
                tsv_path = input("  TSV 路径: ").strip()
                if tsv_path and os.path.exists(tsv_path):
                    with open(tsv_path, "r", encoding="utf-8") as f:
                        reader = csv.DictReader(f, delimiter="\t")
                        for row in reader:
                            if domain and row.get("root_domain", "").lower() == domain.lower():
                                profile_data = _tsv_row_to_profile_data(row)
                                break
                    if not profile_data:
                        print(f"  ⚠ 在指定 TSV 中未找到 {domain}")

            if not profile_data:
                api.fail_profile(request_id, f"No profile data found for {domain}")
                print(f"  已标记为失败")
                return False

    # ── Step 4: Submit ────────────────────────────────
    print(f"\n── Step 4: 回传画像 ──")
    print(f"  质量: {profile_data.get('profile_quality', 'medium')}")
    print(f"  邮箱: {profile_data.get('email_best', '—')}")
    print(f"  买家匹配: {profile_data.get('buyer_fit', '—')}")
    print(f"  商业模式: {profile_data.get('business_model', '—')}")
    print(f"  产品分类: {profile_data.get('product_categories', '—')}")

    if not auto:
        confirm = input("\n  确认提交? (Y/n): ").strip().lower()
        if confirm == "n":
            api.fail_profile(request_id, "Manually cancelled")
            print("  已取消")
            return False

    result = api.complete_profile(request_id, profile_data, run_id)
    print(f"  ✓ {result['message']}")
    print(f"\n── 完成 ──")
    return True


def cmd_auto_all():
    """Process ALL queued profile requests automatically."""
    requests_list = api.list_profile_requests("queued")
    if not requests_list:
        print("\n没有待处理的画像请求。")
        return

    print(f"\n自动模式：共 {len(requests_list)} 个待处理请求")
    ok = fail = 0
    for i, r in enumerate(requests_list, 1):
        company = r["company"]
        print(f"\n{'='*50}")
        print(f"[{i}/{len(requests_list)}] {company['companyName']} ({r['id'][:8]}…)")
        if cmd_process(r["id"], auto=True):
            ok += 1
        else:
            fail += 1

    print(f"\n{'='*50}")
    print(f"完成：成功 {ok}，失败 {fail}")


def main():
    parser = argparse.ArgumentParser(
        description="管理员画像请求处理",
        epilog="""
示例:
  python profile_run.py                    # 交互式处理
  python profile_run.py --auto             # 自动处理所有 queued 请求（调用 OpenClaw workflow）
  python profile_run.py --list             # 查看 queued 列表
  python profile_run.py --list completed   # 查看已完成列表
  python profile_run.py <request_id>       # 处理指定请求
        """,
    )
    parser.add_argument("request_id", nargs="?", help="Profile request ID")
    parser.add_argument("--list", nargs="?", const="queued", metavar="STATUS",
                        help="列出指定状态的画像请求")
    parser.add_argument("--auto", action="store_true",
                        help="自动模式：处理所有 queued 请求，遇到无数据自动调用 OpenClaw workflow")

    args = parser.parse_args()

    if args.list is not None:
        cmd_list(args.list)
    elif args.auto:
        cmd_auto_all()
    else:
        cmd_process(args.request_id)


if __name__ == "__main__":
    main()
