import json

from app import db
from app.models.activity_log import ActivityLog


def log_activity(
    action,
    entity_type,
    entity_id=None,
    user=None,
    summary="",
    board_id=None,
    task_id=None,
    project_id=None,
    department_id=None,
    column_key="",
    details=None,
):
    details_json = ""
    if details:
        details_json = json.dumps(details, ensure_ascii=False, default=str)

    db.session.add(ActivityLog(
        user_id=user.id if user else None,
        username=user.username if user else "",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        board_id=board_id,
        task_id=task_id,
        project_id=project_id,
        department_id=department_id,
        column_key=column_key or "",
        summary=summary,
        details=details_json,
    ))
