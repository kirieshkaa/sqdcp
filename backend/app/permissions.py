from flask import jsonify
from flask_jwt_extended import get_jwt_identity

from app.models.user import User

ROLE_ADMIN = "admin"
ROLE_MINISTER = "minister"
ROLE_DEPARTMENT_HEAD = "department_head"

VALID_ROLES = [ROLE_ADMIN, ROLE_MINISTER, ROLE_DEPARTMENT_HEAD]
ROLE_ALIASES = {
    "manager": ROLE_MINISTER,
    "user": ROLE_DEPARTMENT_HEAD,
    "viewer": ROLE_DEPARTMENT_HEAD,
}


def normalize_role(role):
    return ROLE_ALIASES.get(role, role if role in VALID_ROLES else ROLE_DEPARTMENT_HEAD)


def serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": normalize_role(user.role),
        "department_id": user.department_id,
        "status": user.status,
    }


def get_current_user():
    user_id = int(get_jwt_identity())
    return User.query.get(user_id)


def forbidden(message="Доступ запрещен"):
    return jsonify({"error": message}), 403


def is_admin(user):
    return bool(user and normalize_role(user.role) == ROLE_ADMIN)


def is_minister(user):
    return bool(user and normalize_role(user.role) == ROLE_MINISTER)


def is_department_head(user):
    return bool(user and normalize_role(user.role) == ROLE_DEPARTMENT_HEAD)


def can_read_boards(user):
    return is_admin(user) or is_minister(user) or is_department_head(user)


def can_write_boards(user):
    return is_admin(user) or is_minister(user)


def can_manage_departments(user):
    return is_admin(user)


def can_read_department(user, department_id):
    return is_admin(user) or is_minister(user) or is_department_head(user)


def can_edit_department_canban(user, department_id):
    if is_admin(user):
        return True
    return is_department_head(user) and user.department_id == department_id


def can_update_task(user, task):
    if can_write_boards(user):
        return True
    return is_department_head(user) and task.department_id == user.department_id
