from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.activity import log_activity
from app.models.board import Board
from app.models.department import Department
from app.models.department_project import DepartmentProject
from app.models.sqdcp_row import SqdcpRow
from app.models.task import Task
from app.models.user import User
from app.permissions import can_edit_department_canban, can_manage_departments, can_read_department, forbidden, get_current_user

departments_bp = Blueprint("departments", __name__, url_prefix="/api/departments")
TASK_STATUSES = {"not_started", "in_progress", "done"}
DEFAULT_TASK_STATUS = "not_started"


def normalize_task_status(status):
    return status if status in TASK_STATUSES else DEFAULT_TASK_STATUS


def serialize_assigned_task(task):
    board = Board.query.get(task.board_id)
    return {
        "id": task.id,
        "board_id": task.board_id,
        "board_title": board.title if board else "Доска удалена",
        "department_id": task.department_id,
        "project_id": task.project_id,
        "name": task.name,
        "description": task.description or "",
        "assignees": task.assignees or "",
        "column_key": task.column_key or "",
        "status": normalize_task_status(task.status),
        "due_date": task.due_date or "",
    }


def normalize_task_due_date(value):
    if not value:
        return ""
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return ""


def get_project_status(tasks):
    if not tasks:
        return DEFAULT_TASK_STATUS

    statuses = [normalize_task_status(task.status) for task in tasks]
    if all(status == "done" for status in statuses):
        return "done"
    if all(status == "not_started" for status in statuses):
        return "not_started"
    return "in_progress"


def serialize_department_project(project):
    tasks = Task.query.filter_by(project_id=project.id).order_by(Task.id.asc()).all()
    return {
        "id": project.id,
        "department_id": project.department_id,
        "name": project.name,
        "position": project.position,
        "status": get_project_status(tasks),
        "tasks": [serialize_assigned_task(task) for task in tasks],
    }


def serialize_department(department, include_participation=False):
    data = {
        "id": department.id,
        "name": department.name,
        "description": department.description or "",
        "head": department.head or "",
        "workers": department.workers or "",
    }
    if include_participation:
        boards = (
            Board.query
            .join(SqdcpRow, Board.id == SqdcpRow.board_id)
            .filter(SqdcpRow.department_id == department.id)
            .distinct()
            .order_by(Board.updated_at.desc(), Board.id.desc())
            .all()
        )
        data["participating_boards"] = [{
            "id": board.id,
            "title": board.title,
        } for board in boards]
        tasks = (
            Task.query
            .join(Board, Task.board_id == Board.id)
            .filter(Task.department_id == department.id)
            .order_by(Board.updated_at.desc(), Task.id.desc())
            .all()
        )
        data["assigned_tasks"] = [serialize_assigned_task(task) for task in tasks]
        projects = DepartmentProject.query.filter_by(department_id=department.id).order_by(
            DepartmentProject.position.asc(),
            DepartmentProject.id.asc(),
        ).all()
        data["projects"] = [serialize_department_project(project) for project in projects]
    return data


def normalize_department_payload(data):
    return {
        "name": (data.get("name") or "").strip(),
        "head": (data.get("head") or "").strip(),
        "workers": (data.get("workers") or "").strip(),
        "description": (data.get("description") or "").strip(),
    }


@departments_bp.route("", methods=["GET"])
@jwt_required()
def list_departments():
    departments = Department.query.order_by(Department.name.asc(), Department.id.asc()).all()
    return jsonify([serialize_department(department) for department in departments])


@departments_bp.route("", methods=["POST"])
@jwt_required()
def create_department():
    if not can_manage_departments(get_current_user()):
        return forbidden()

    data = normalize_department_payload(request.get_json() or {})
    if not data["name"]:
        return jsonify({"error": "Название отдела обязательно"}), 400

    if Department.query.filter_by(name=data["name"]).first():
        return jsonify({"error": "Отдел с таким названием уже существует"}), 400

    department = Department(
        name=data["name"],
        head=data["head"],
        workers=data["workers"],
        description=data["description"],
    )
    db.session.add(department)
    db.session.commit()
    return jsonify(serialize_department(department)), 201


@departments_bp.route("/<int:department_id>", methods=["GET"])
@jwt_required()
def get_department(department_id):
    if not can_read_department(get_current_user(), department_id):
        return forbidden()

    department = Department.query.get(department_id)
    if not department:
        return jsonify({"error": "Отдел не найден"}), 404

    return jsonify(serialize_department(department, include_participation=True))


@departments_bp.route("/<int:department_id>", methods=["PUT"])
@jwt_required()
def update_department(department_id):
    if not can_manage_departments(get_current_user()):
        return forbidden()

    department = Department.query.get(department_id)
    if not department:
        return jsonify({"error": "Отдел не найден"}), 404

    data = normalize_department_payload(request.get_json() or {})
    if not data["name"]:
        return jsonify({"error": "Название отдела обязательно"}), 400

    existing = Department.query.filter_by(name=data["name"]).first()
    if existing and existing.id != department.id:
        return jsonify({"error": "Отдел с таким названием уже существует"}), 400

    department.name = data["name"]
    department.head = data["head"]
    department.workers = data["workers"]
    department.description = data["description"]
    db.session.commit()
    return jsonify(serialize_department(department, include_participation=True))


@departments_bp.route("/<int:department_id>/tasks", methods=["POST"])
@jwt_required()
def create_department_task(department_id):
    current_user = get_current_user()
    if not can_edit_department_canban(current_user, department_id):
        return forbidden()

    department = Department.query.get(department_id)
    if not department:
        return jsonify({"error": "Отдел не найден"}), 404

    sqdcp_row = (
        SqdcpRow.query
        .join(Board, SqdcpRow.board_id == Board.id)
        .filter(SqdcpRow.department_id == department.id)
        .order_by(Board.updated_at.desc(), SqdcpRow.id.asc())
        .first()
    )
    if not sqdcp_row:
        return jsonify({"error": "Сначала добавьте этот отдел в SQDCP-доску."}), 400

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Имя задачи обязательно"}), 400

    task = Task(
        board_id=sqdcp_row.board_id,
        row_id=sqdcp_row.id,
        department_id=department.id,
        column_key="",
        name=name,
        description=(data.get("description") or "").strip(),
        assignees=(data.get("assignees") or "").strip(),
        status="not_started",
        due_date=normalize_task_due_date(data.get("due_date")),
    )
    db.session.add(task)
    db.session.flush()
    log_activity(
        "task_created",
        "task",
        entity_id=task.id,
        user=current_user,
        board_id=task.board_id,
        task_id=task.id,
        department_id=department.id,
        column_key=task.column_key,
        summary=f"Создана задача «{task.name}»",
        details=serialize_assigned_task(task),
    )
    db.session.commit()
    return jsonify(serialize_assigned_task(task)), 201


@departments_bp.route("/<int:department_id>/tasks/<int:task_id>", methods=["DELETE"])
@jwt_required()
def delete_department_task(department_id, task_id):
    current_user = get_current_user()
    if not can_edit_department_canban(current_user, department_id):
        return forbidden()

    task = Task.query.filter_by(id=task_id, department_id=department_id).first()
    if not task:
        return jsonify({"ok": True})

    log_activity(
        "task_deleted",
        "task",
        entity_id=task.id,
        user=current_user,
        board_id=task.board_id,
        task_id=task.id,
        project_id=task.project_id,
        department_id=task.department_id,
        column_key=task.column_key,
        summary=f"Удалена задача «{task.name}»",
        details=serialize_assigned_task(task),
    )
    db.session.delete(task)
    db.session.commit()
    return jsonify({"ok": True})


@departments_bp.route("/<int:department_id>/projects", methods=["POST"])
@jwt_required()
def create_department_project(department_id):
    current_user = get_current_user()
    if not can_edit_department_canban(current_user, department_id):
        return forbidden()

    department = Department.query.get(department_id)
    if not department:
        return jsonify({"error": "Отдел не найден"}), 404

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        count = DepartmentProject.query.filter_by(department_id=department.id).count()
        name = f"Проект {count + 1}"

    position = DepartmentProject.query.filter_by(department_id=department.id).count()
    project = DepartmentProject(
        department_id=department.id,
        name=name,
        position=position,
    )
    db.session.add(project)
    db.session.flush()
    log_activity(
        "project_created",
        "project",
        entity_id=project.id,
        user=current_user,
        project_id=project.id,
        department_id=department.id,
        summary=f"Создан проект «{project.name}»",
        details=serialize_department_project(project),
    )
    db.session.commit()
    return jsonify(serialize_department_project(project)), 201


@departments_bp.route("/<int:department_id>/projects/<int:project_id>", methods=["PUT"])
@jwt_required()
def update_department_project(department_id, project_id):
    current_user = get_current_user()
    if not can_edit_department_canban(current_user, department_id):
        return forbidden()

    project = DepartmentProject.query.filter_by(id=project_id, department_id=department_id).first()
    if not project:
        return jsonify({"error": "Проект не найден"}), 404

    data = request.get_json() or {}
    name = (data.get("name") or project.name).strip()
    if not name:
        return jsonify({"error": "Название проекта обязательно"}), 400

    before = serialize_department_project(project)
    project.name = name
    if "position" in data:
        try:
            project.position = max(0, int(data.get("position")))
        except (TypeError, ValueError):
            return jsonify({"error": "Некорректная позиция проекта"}), 400
    log_activity(
        "project_updated",
        "project",
        entity_id=project.id,
        user=current_user,
        project_id=project.id,
        department_id=department_id,
        summary=f"Обновлен проект «{project.name}»",
        details={"before": before, "after": serialize_department_project(project)},
    )
    db.session.commit()
    return jsonify(serialize_department_project(project))


@departments_bp.route("/<int:department_id>/projects/<int:project_id>", methods=["DELETE"])
@jwt_required()
def delete_department_project(department_id, project_id):
    current_user = get_current_user()
    if not can_edit_department_canban(current_user, department_id):
        return forbidden()

    project = DepartmentProject.query.filter_by(id=project_id, department_id=department_id).first()
    if not project:
        return jsonify({"ok": True})

    project_snapshot = serialize_department_project(project)
    log_activity(
        "project_deleted",
        "project",
        entity_id=project.id,
        user=current_user,
        project_id=project.id,
        department_id=department_id,
        summary=f"Удален проект «{project.name}»",
        details=project_snapshot,
    )
    Task.query.filter_by(project_id=project.id).update({"project_id": None, "column_key": ""})
    db.session.delete(project)
    db.session.commit()
    return jsonify({"ok": True})


@departments_bp.route("/<int:department_id>", methods=["DELETE"])
@jwt_required()
def delete_department(department_id):
    if not can_manage_departments(get_current_user()):
        return forbidden()

    department = Department.query.get(department_id)
    if not department:
        return jsonify({"ok": True})

    User.query.filter_by(department_id=department.id).update({"department_id": None})
    Board.query.filter_by(department_id=department.id).update({"department_id": None})
    SqdcpRow.query.filter_by(department_id=department.id).update({"department_id": None})
    Task.query.filter_by(department_id=department.id).update({"department_id": None, "project_id": None})
    DepartmentProject.query.filter_by(department_id=department.id).delete()
    db.session.delete(department)
    db.session.commit()
    return jsonify({"ok": True})
