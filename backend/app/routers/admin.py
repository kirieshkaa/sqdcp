import json
from collections import defaultdict

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.models.activity_log import ActivityLog
from app.permissions import forbidden, get_current_user, is_admin

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

SQDCP_COLUMNS = ["safety", "quality", "delivery", "cost", "people"]


def serialize_log(log):
    try:
        details = json.loads(log.details) if log.details else None
    except json.JSONDecodeError:
        details = log.details

    return {
        "id": log.id,
        "user_id": log.user_id,
        "username": log.username or "",
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "board_id": log.board_id,
        "task_id": log.task_id,
        "project_id": log.project_id,
        "department_id": log.department_id,
        "column_key": log.column_key or "",
        "summary": log.summary or "",
        "details": details,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def require_admin():
    current_user = get_current_user()
    if not is_admin(current_user):
        return None, forbidden()
    return current_user, None


@admin_bp.route("/logs", methods=["GET"])
@jwt_required()
def list_logs():
    _current_user, error = require_admin()
    if error:
        return error

    logs = ActivityLog.query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(500).all()
    return jsonify([serialize_log(log) for log in logs])


@admin_bp.route("/sqdcp-stats", methods=["GET"])
@jwt_required()
def sqdcp_stats():
    _current_user, error = require_admin()
    if error:
        return error

    stats = defaultdict(lambda: {column: 0 for column in SQDCP_COLUMNS})
    logs = (
        ActivityLog.query
        .filter(ActivityLog.entity_type == "task")
        .filter(ActivityLog.action.in_(("task_created", "task_assigned")))
        .filter(ActivityLog.column_key.in_(SQDCP_COLUMNS))
        .order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc())
        .all()
    )

    for log in logs:
        if not log.created_at:
            continue
        day = log.created_at.date().isoformat()
        stats[day][log.column_key] += 1

    return jsonify([
        {"date": day, **columns}
        for day, columns in sorted(stats.items(), reverse=True)
    ])
