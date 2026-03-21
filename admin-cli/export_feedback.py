"""Export user feedback from DB to workspace feedback_snapshot.json."""

import json
from pathlib import Path

import api
from workspace import user_workspace


def export_feedback_snapshot(phone):
    """Query DB via admin API and write feedback_snapshot.json to user workspace."""
    ws = user_workspace(phone)

    try:
        feedback = api.get_user_feedback_summary(phone)
    except Exception as e:
        print(f"  ⚠ 反馈快照获取失败: {e}")
        return None

    if feedback.get("overall", {}).get("total_leads_seen", 0) == 0:
        return None

    snapshot_path = ws / "feedback_snapshot.json"
    snapshot_path.write_text(json.dumps(feedback, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  [feedback] 已导出反馈快照 ({feedback['overall']['total_leads_seen']} 条反馈)")
    return snapshot_path
