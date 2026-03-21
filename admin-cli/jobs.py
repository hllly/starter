#!/usr/bin/env python3
"""Interactive job management CLI."""

import sys
import json
import api


def _print_jobs(jobs: list[dict]) -> None:
    if not jobs:
        print("  （空）")
        return
    for i, j in enumerate(jobs, 1):
        req = j.get("request", {})
        print(f"  [{i}] {j['id'][:8]}…  {req.get('productCategory', '?')}  "
              f"地区={req.get('targetRegions', [])}  用户={req.get('userName', '?')}")


def cmd_list(status: str = "queued") -> None:
    """列出指定状态的任务。"""
    jobs = api.list_jobs(status)
    print(f"\n── {status} 任务 ({len(jobs)}) ──")
    _print_jobs(jobs)
    return jobs


def cmd_claim(job_id: str | None = None) -> dict | None:
    """领取任务。若 job_id 为空，显示列表让用户选择。"""
    if not job_id:
        jobs = api.list_jobs("queued")
        if not jobs:
            print("没有待领取的任务。")
            return None
        print("\n── 待领取任务 ──")
        _print_jobs(jobs)
        choice = input("选择序号 (Enter 取消): ").strip()
        if not choice:
            return None
        idx = int(choice) - 1
        job_id = jobs[idx]["id"]

    result = api.claim(job_id)
    print(f"  ✓ 已领取: {result['id'][:8]}…  status={result['status']}")
    return result


def cmd_start(job_id: str) -> dict:
    """开始执行。"""
    result = api.start(job_id)
    print(f"  ✓ 已开始: {result['id'][:8]}…  status={result['status']}")
    return result


def cmd_fail(job_id: str, reason: str = "") -> dict:
    """标记失败。"""
    result = api.fail(job_id, error_summary=reason)
    print(f"  ✓ 已失败: {result['id'][:8]}…  status={result['status']}")
    return result


def cmd_cancel(job_id: str) -> dict:
    """取消任务。"""
    result = api.cancel(job_id)
    print(f"  ✓ 已取消: {result['id'][:8]}…  status={result['status']}")
    return result


def cmd_payload(job_id: str) -> dict:
    """拉取任务执行参数。"""
    data = api.get_payload(job_id)
    print(f"\n── Job Payload ──")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return data


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python jobs.py <list|claim|start|fail|cancel|payload> [job_id] [status]")
        sys.exit(1)

    cmd = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else None

    if cmd == "list":
        cmd_list(arg or "queued")
    elif cmd == "claim":
        cmd_claim(arg)
    elif cmd == "start":
        cmd_start(arg)
    elif cmd == "fail":
        reason = sys.argv[3] if len(sys.argv) > 3 else ""
        cmd_fail(arg, reason)
    elif cmd == "cancel":
        cmd_cancel(arg)
    elif cmd == "payload":
        cmd_payload(arg)
    else:
        print(f"未知命令: {cmd}")
