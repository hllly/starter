#!/usr/bin/env python3
"""Review & publish CLI."""

import sys
import json
import api


def cmd_review_ready(job_id: str, payload_file: str) -> dict:
    """回传执行结果。payload_file 为 JSON 文件路径。"""
    with open(payload_file) as f:
        payload = json.load(f)
    result = api.review_ready(job_id, payload)
    print(f"  ✓ 回传成功: status={result['status']}")
    print(f"    leads={result['leadsCreated']}  companies_new={result['companiesCreated']}  reused={result['companiesReused']}")
    return result


def cmd_review(job_id: str) -> dict:
    """查看审核详情。"""
    data = api.get_review(job_id)
    job = data["job"]
    summary = data.get("resultSummary") or {}
    stats = data.get("stats", {})
    leads = data.get("leadsPreview", [])

    print(f"\n── 审核详情 ──")
    print(f"  Job:     {job['id'][:8]}…  status={job['status']}")
    print(f"  Run ID:  {job.get('runId', '-')}")
    print(f"  摘要:    {summary.get('summaryText', '-')}")
    print(f"  推荐 {summary.get('recommendedCount', 0)} / 观察 {summary.get('observationCount', 0)}")
    print(f"  质量:    {summary.get('resultQuality', '-')}")
    print(f"  统计:    leads={stats.get('totalLeads', 0)}  companies={stats.get('companiesCreated', 0)}")
    print(f"\n  前 {min(5, len(leads))} 条线索预览:")
    for l in leads[:5]:
        print(f"    - {l['companyName']}  ({l.get('countryRegion', '?')})  tier={l['currentTier']}  {l.get('recommendationReason', '')[:40]}")
    return data


def cmd_publish(job_id: str) -> dict:
    """发布。"""
    result = api.publish(job_id)
    print(f"  ✓ 已发布: status={result['status']}  publishedAt={result.get('publishedAt')}")
    return result


def cmd_reject(job_id: str, note: str = "") -> dict:
    """拒绝。"""
    result = api.reject(job_id, review_note=note)
    print(f"  ✓ 已拒绝: status={result['status']}  failureType={result.get('failureType')}")
    return result


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python review.py <review-ready|review|publish|reject> <job_id> [payload_file|note]")
        sys.exit(1)

    cmd = sys.argv[1]
    job_id = sys.argv[2]
    extra = sys.argv[3] if len(sys.argv) > 3 else ""

    if cmd == "review-ready":
        if not extra:
            print("需要 payload JSON 文件路径")
            sys.exit(1)
        cmd_review_ready(job_id, extra)
    elif cmd == "review":
        cmd_review(job_id)
    elif cmd == "publish":
        cmd_publish(job_id)
    elif cmd == "reject":
        cmd_reject(job_id, extra)
    else:
        print(f"未知命令: {cmd}")
