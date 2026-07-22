from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import date, datetime, timedelta
from sqlalchemy import func, or_
from app import db
from app.activity import log_activity
from app.models.board import Board
from app.models.department import Department
from app.models.department_project import DepartmentProject
from app.models.sqdcp_row import SqdcpRow
from app.models.task import Task
from app.permissions import can_read_boards, can_update_task, can_write_boards, forbidden, get_current_user

boards_bp = Blueprint("boards", __name__, url_prefix="/api/boards")

SQDCP_COLUMNS = [
    {"key": "safety", "label": "Safety", "description": "безопасность"},
    {"key": "quality", "label": "Quality", "description": "качество"},
    {"key": "delivery", "label": "Delivery", "description": "сроки"},
    {"key": "cost", "label": "Cost", "description": "стоимость"},
    {"key": "people", "label": "People", "description": "персонал"},
]
VALID_COLUMN_KEYS = {column["key"] for column in SQDCP_COLUMNS}
TASK_STATUSES = {"not_started", "in_progress", "done"}
DEFAULT_TASK_STATUS = "not_started"
RUSSIAN_MONTHS_GENITIVE = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
]


def serialize_task(task):
    return {
        "id": task.id,
        "board_id": task.board_id,
        "row_id": task.row_id,
        "department_id": task.department_id,
        "project_id": task.project_id,
        "column_key": task.column_key or "",
        "name": task.name,
        "description": task.description or "",
        "assignees": task.assignees or "",
        "status": normalize_task_status(task.status),
        "due_date": task.due_date or "",
    }


def get_project_status(tasks):
    if not tasks:
        return DEFAULT_TASK_STATUS

    statuses = [normalize_task_status(task.status) for task in tasks]
    if all(status == "done" for status in statuses):
        return "done"
    if all(status == "not_started" for status in statuses):
        return "not_started"
    return "in_progress"


def serialize_project(project):
    tasks = Task.query.filter_by(project_id=project.id).order_by(Task.id.asc()).all()
    return {
        "id": project.id,
        "department_id": project.department_id,
        "name": project.name,
        "position": project.position,
        "status": get_project_status(tasks),
        "tasks": [serialize_task(task) for task in tasks],
    }


def serialize_row(row):
    data = {
        "id": row.id,
        "department_id": row.department_id,
        "team_name": row.team_name,
        "position": row.position,
        "safety": row.safety or "",
        "quality": row.quality or "",
        "delivery": row.delivery or "",
        "cost": row.cost or "",
        "people": row.people or "",
    }
    if row.department_id:
        projects = DepartmentProject.query.filter_by(department_id=row.department_id).order_by(
            DepartmentProject.position.asc(),
            DepartmentProject.id.asc(),
        ).all()
        data["projects"] = [serialize_project(project) for project in projects]
    else:
        data["projects"] = []
    return data


def get_board_project_stats(board):
    stats = {
        "not_started": 0,
        "in_progress": 0,
        "done": 0,
    }
    department_ids = {
        row.department_id
        for row in SqdcpRow.query.filter_by(board_id=board.id).filter(SqdcpRow.department_id.isnot(None)).all()
    }
    if not department_ids:
        return stats

    projects = (
        DepartmentProject.query
        .filter(DepartmentProject.department_id.in_(department_ids))
        .order_by(DepartmentProject.position.asc(), DepartmentProject.id.asc())
        .all()
    )
    for project in projects:
        tasks = Task.query.filter_by(project_id=project.id).all()
        stats[get_project_status(tasks)] += 1
    return stats


def get_board_rows(board):
    return board.sqdcp_rows.order_by(SqdcpRow.position.asc(), SqdcpRow.id.asc()).all()


def ensure_default_rows(board):
    if board.sqdcp_rows.count() > 0:
        return

    for idx in range(3):
        db.session.add(SqdcpRow(
            board_id=board.id,
            team_name=f"Команда {idx + 1}",
            position=idx,
        ))
    db.session.commit()


def get_departments_with_projects(active_only=False):
    departments = (
        Department.query
        .join(DepartmentProject, Department.id == DepartmentProject.department_id)
        .distinct()
        .order_by(Department.name.asc(), Department.id.asc())
        .all()
    )
    if not active_only:
        return departments

    active_department_ids = set()
    projects = DepartmentProject.query.order_by(DepartmentProject.position.asc(), DepartmentProject.id.asc()).all()
    for project in projects:
        tasks = Task.query.filter_by(project_id=project.id).all()
        if get_project_status(tasks) in ("not_started", "in_progress"):
            active_department_ids.add(project.department_id)

    return [department for department in departments if department.id in active_department_ids]


def ensure_department_project_rows(board, commit=True, active_only=False):
    project_departments = get_departments_with_projects(active_only=active_only)
    if not project_departments:
        return

    existing_department_ids = {
        row.department_id
        for row in SqdcpRow.query.filter_by(board_id=board.id).filter(SqdcpRow.department_id.isnot(None)).all()
    }
    max_position = db.session.query(func.max(SqdcpRow.position)).filter_by(board_id=board.id).scalar()
    next_position = (max_position if max_position is not None else -1) + 1
    added_rows = False

    for department in project_departments:
        if department.id in existing_department_ids:
            continue
        db.session.add(SqdcpRow(
            board_id=board.id,
            department_id=department.id,
            team_name=department.name,
            position=next_position,
        ))
        existing_department_ids.add(department.id)
        next_position += 1
        added_rows = True

    if added_rows and commit:
        db.session.commit()


def get_next_monday(today=None):
    today = today or date.today()
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    return today + timedelta(days=days_until_monday)


def format_board_date_title(board_date):
    return f"{board_date.day} {RUSSIAN_MONTHS_GENITIVE[board_date.month - 1]}"


def is_weekly_auto_board(board):
    board_date = normalize_board_date(board.board_date)
    if not board_date:
        return False
    try:
        parsed_date = datetime.strptime(board_date, "%Y-%m-%d").date()
    except ValueError:
        return False
    return parsed_date.weekday() == 0 and board.title == format_board_date_title(parsed_date)


def ensure_next_monday_board(owner_id=None):
    next_monday = get_next_monday()
    board_date = next_monday.isoformat()
    existing_board = Board.query.filter_by(board_date=board_date).first()
    if existing_board:
        if is_weekly_auto_board(existing_board):
            ensure_department_project_rows(existing_board, active_only=True)
        return existing_board

    board = Board(
        title=format_board_date_title(next_monday),
        description="",
        owner_id=owner_id,
        department_id=None,
        board_date=board_date,
    )
    db.session.add(board)
    db.session.flush()
    ensure_department_project_rows(board, commit=False, active_only=True)
    db.session.commit()
    return board


def serialize_board(board, include_rows=False):
    board_date = board.board_date
    if not board_date and board.created_at:
        board_date = board.created_at.date().isoformat()

    data = {
        "id": board.id,
        "title": board.title,
        "description": board.description,
        "owner_id": board.owner_id,
        "board_date": board_date,
        "created_at": board.created_at.isoformat() if board.created_at else None,
        "updated_at": board.updated_at.isoformat() if board.updated_at else None,
        "project_stats": get_board_project_stats(board),
    }
    if include_rows:
        data["columns"] = SQDCP_COLUMNS
        data["rows"] = [serialize_row(row) for row in get_board_rows(board)]
        data["tasks"] = [serialize_task(task) for task in get_board_tasks(board)]
    return data


@boards_bp.route("", methods=["GET"])
@jwt_required()
def list_boards():
    current_user = get_current_user()
    if not can_read_boards(current_user):
        return forbidden()

    ensure_next_monday_board(owner_id=current_user.id)
    boards = Board.query.order_by(Board.updated_at.desc(), Board.id.desc()).all()
    return jsonify([serialize_board(board) for board in boards])


@boards_bp.route("", methods=["POST"])
@jwt_required()
def create_board():
    current_user = get_current_user()
    if not can_write_boards(current_user):
        return forbidden()

    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    title = (data.get("title") or "Новая SQDCP-доска").strip()
    board_date = normalize_board_date(data.get("board_date")) or date.today().isoformat()

    if not title:
        return jsonify({"error": "Название доски обязательно"}), 400

    board = Board(
        title=title,
        description=data.get("description", ""),
        owner_id=user_id,
        department_id=None,
        board_date=board_date,
    )
    db.session.add(board)
    db.session.flush()

    for idx in range(3):
        db.session.add(SqdcpRow(
            board_id=board.id,
            team_name=f"Команда {idx + 1}",
            position=idx,
        ))

    db.session.flush()
    ensure_department_project_rows(board, commit=False)
    log_activity(
        "board_created",
        "board",
        entity_id=board.id,
        user=current_user,
        board_id=board.id,
        summary=f"Создана доска «{board.title}»",
        details={"title": board.title, "board_date": board.board_date},
    )
    db.session.commit()
    return jsonify(serialize_board(board, include_rows=True)), 201


@boards_bp.route("/<int:board_id>", methods=["GET"])
@jwt_required()
def get_board(board_id):
    if not can_read_boards(get_current_user()):
        return forbidden()

    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    if is_weekly_auto_board(board):
        ensure_department_project_rows(board, active_only=True)
    else:
        ensure_default_rows(board)
        ensure_department_project_rows(board)
    return jsonify(serialize_board(board, include_rows=True))


@boards_bp.route("/<int:board_id>", methods=["DELETE"])
@jwt_required()
def delete_board(board_id):
    current_user = get_current_user()
    if not can_write_boards(current_user):
        return forbidden()

    board = Board.query.get(board_id)
    if not board:
        return jsonify({"ok": True})

    log_activity(
        "board_deleted",
        "board",
        entity_id=board.id,
        user=current_user,
        board_id=board.id,
        summary=f"Удалена доска «{board.title}»",
        details={"title": board.title, "board_date": board.board_date},
    )
    Task.query.filter_by(board_id=board.id).delete()
    db.session.delete(board)
    db.session.commit()
    return jsonify({"ok": True})


@boards_bp.route("/<int:board_id>", methods=["PUT"])
@jwt_required()
def update_board(board_id):
    current_user = get_current_user()
    if not can_write_boards(current_user):
        return forbidden()

    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    before_board = {
        "title": board.title,
        "description": board.description or "",
        "board_date": board.board_date or "",
        "rows": [
            serialize_row(row)
            for row in SqdcpRow.query.filter_by(board_id=board.id).order_by(SqdcpRow.position.asc(), SqdcpRow.id.asc()).all()
        ],
    }
    data = request.get_json() or {}
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Название доски обязательно"}), 400
        board.title = title

    if "description" in data:
        board.description = (data.get("description") or "").strip()

    if "board_date" in data:
        board.board_date = normalize_board_date(data.get("board_date")) or date.today().isoformat()

    incoming_rows = data.get("rows")
    if isinstance(incoming_rows, list):
        existing_rows = {
            row.id: row
            for row in SqdcpRow.query.filter_by(board_id=board.id).all()
        }
        kept_row_ids = set()
        for idx, row in enumerate(incoming_rows):
            team_name = (row.get("team_name") or "").strip()
            if not team_name:
                team_name = f"Команда {idx + 1}"
            row_id = normalize_int(row.get("id"))
            sqdcp_row = existing_rows.get(row_id)
            if not sqdcp_row:
                sqdcp_row = SqdcpRow(board_id=board.id)
                db.session.add(sqdcp_row)

            sqdcp_row.team_name = team_name
            sqdcp_row.department_id = normalize_department_id(row.get("department_id"))
            sqdcp_row.position = idx
            sqdcp_row.safety = row.get("safety") or ""
            sqdcp_row.quality = row.get("quality") or ""
            sqdcp_row.delivery = row.get("delivery") or ""
            sqdcp_row.cost = row.get("cost") or ""
            sqdcp_row.people = row.get("people") or ""
            if sqdcp_row.id is None:
                db.session.flush()
            kept_row_ids.add(sqdcp_row.id)
            Task.query.filter_by(row_id=sqdcp_row.id).update({"department_id": sqdcp_row.department_id})

        removed_row_ids = [row_id for row_id in existing_rows if row_id not in kept_row_ids]
        if removed_row_ids:
            Task.query.filter(Task.row_id.in_(removed_row_ids)).update(
                {"row_id": None, "column_key": "", "department_id": None},
                synchronize_session=False,
            )
            SqdcpRow.query.filter(SqdcpRow.id.in_(removed_row_ids)).delete(synchronize_session=False)

    log_activity(
        "board_updated",
        "board",
        entity_id=board.id,
        user=current_user,
        board_id=board.id,
        summary=f"Обновлена доска «{board.title}»",
        details={
            "before": before_board,
            "after": {
                "title": board.title,
                "description": board.description or "",
                "board_date": board.board_date or "",
                "rows_count": len(incoming_rows) if isinstance(incoming_rows, list) else len(before_board["rows"]),
            },
        },
    )
    db.session.commit()
    ensure_department_project_rows(board, active_only=is_weekly_auto_board(board))
    return jsonify(serialize_board(board, include_rows=True))


@boards_bp.route("/<int:board_id>/tasks", methods=["GET"])
@jwt_required()
def list_board_tasks(board_id):
    if not can_read_boards(get_current_user()):
        return forbidden()

    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    return jsonify([serialize_task(task) for task in get_board_tasks(board)])


@boards_bp.route("/<int:board_id>/tasks", methods=["POST"])
@jwt_required()
def create_board_task(board_id):
    current_user = get_current_user()
    if not can_write_boards(current_user):
        return forbidden()

    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Имя задачи обязательно"}), 400

    task = Task(
        board_id=None,
        name=name,
        description=(data.get("description") or "").strip(),
        assignees=(data.get("assignees") or "").strip(),
        status=normalize_task_status(data.get("status")),
        due_date=normalize_task_due_date(data.get("due_date")),
    )
    apply_task_assignment(task, board.id, data.get("row_id"), data.get("column_key"))
    db.session.add(task)
    db.session.flush()
    log_activity(
        "task_created",
        "task",
        entity_id=task.id,
        user=current_user,
        board_id=board.id,
        task_id=task.id,
        department_id=task.department_id,
        column_key=task.column_key,
        summary=f"Создана задача «{task.name}»",
        details=serialize_task(task),
    )
    db.session.commit()
    return jsonify(serialize_task(task)), 201


@boards_bp.route("/<int:board_id>/tasks/<int:task_id>", methods=["PUT"])
@jwt_required()
def update_board_task(board_id, task_id):
    current_user = get_current_user()
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    task = Task.query.filter(Task.id == task_id).filter(
        or_(
            Task.board_id == board.id,
            Task.board_id.is_(None),
            Task.project_id.isnot(None),
        )
    ).first()
    if not task:
        return jsonify({"error": "Задача не найдена"}), 404

    if not can_update_task(current_user, task):
        return forbidden()

    before_task = serialize_task(task)
    data = request.get_json() or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Имя задачи обязательно"}), 400
        task.name = name
    if "description" in data:
        task.description = (data.get("description") or "").strip()
    if "assignees" in data:
        task.assignees = (data.get("assignees") or "").strip()
    if "due_date" in data:
        task.due_date = normalize_task_due_date(data.get("due_date"))
    if "status" in data:
        status = (data.get("status") or "").strip()
        if status not in TASK_STATUSES:
            return jsonify({"error": "Некорректный статус задачи"}), 400
        task.status = status
    if "row_id" in data or "column_key" in data:
        apply_task_assignment(task, board.id, data.get("row_id"), data.get("column_key"))
    if "project_id" in data:
        apply_task_project_assignment(task, board.id, data.get("project_id"), data.get("column_key"))

    action = "task_updated"
    if task.column_key and (
        before_task.get("column_key") != task.column_key
        or before_task.get("row_id") != task.row_id
        or before_task.get("project_id") != task.project_id
    ):
        action = "task_assigned"

    log_activity(
        action,
        "task",
        entity_id=task.id,
        user=current_user,
        board_id=board.id,
        task_id=task.id,
        project_id=task.project_id,
        department_id=task.department_id,
        column_key=task.column_key,
        summary=f"Обновлена задача «{task.name}»",
        details={"before": before_task, "after": serialize_task(task)},
    )
    db.session.commit()
    return jsonify(serialize_task(task))


@boards_bp.route("/<int:board_id>/tasks/<int:task_id>", methods=["DELETE"])
@jwt_required()
def delete_board_task(board_id, task_id):
    current_user = get_current_user()
    task = Task.query.filter(Task.id == task_id).filter(
        or_(
            Task.board_id == board_id,
            Task.board_id.is_(None),
            Task.project_id.isnot(None),
        )
    ).first()
    if not task:
        return jsonify({"ok": True})
    if not can_update_task(current_user, task):
        return forbidden()

    log_activity(
        "task_deleted",
        "task",
        entity_id=task.id,
        user=current_user,
        board_id=board_id,
        task_id=task.id,
        project_id=task.project_id,
        department_id=task.department_id,
        column_key=task.column_key,
        summary=f"Удалена задача «{task.name}»",
        details=serialize_task(task),
    )
    db.session.delete(task)
    db.session.commit()
    return jsonify({"ok": True})


def normalize_board_date(value):
    if not value:
        return ""
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return ""


def normalize_task_status(value):
    status = (value or DEFAULT_TASK_STATUS).strip()
    if status in TASK_STATUSES:
        return status
    return DEFAULT_TASK_STATUS


def normalize_task_due_date(value):
    if not value:
        return ""
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return ""


def get_board_tasks(board):
    tasks_by_id = {
        task.id: task
        for task in Task.query.filter_by(board_id=board.id).order_by(Task.id.asc()).all()
    }
    global_tasks = Task.query.filter(
        Task.board_id.is_(None),
        Task.row_id.is_(None),
        Task.project_id.is_(None),
        or_(Task.column_key.is_(None), Task.column_key == ""),
    ).order_by(Task.id.asc()).all()
    for task in global_tasks:
        tasks_by_id[task.id] = task
    return list(tasks_by_id.values())


def apply_task_assignment(task, board_id, row_id_value, column_key_value):
    row_id = normalize_int(row_id_value)
    column_key = (column_key_value or "").strip()
    if not row_id or column_key not in VALID_COLUMN_KEYS:
        task.board_id = None
        task.row_id = None
        task.column_key = ""
        task.department_id = None
        task.project_id = None
        return

    row = SqdcpRow.query.filter_by(id=row_id, board_id=board_id).first()
    if not row:
        task.board_id = None
        task.row_id = None
        task.column_key = ""
        task.department_id = None
        task.project_id = None
        return

    task.board_id = board_id
    task.row_id = row.id
    task.column_key = column_key
    task.department_id = row.department_id
    task.project_id = None


def apply_task_project_assignment(task, board_id, project_id_value, column_key_value):
    project_id = normalize_int(project_id_value)
    column_key = (column_key_value or "").strip()
    if not project_id or column_key not in VALID_COLUMN_KEYS:
        task.board_id = None
        task.project_id = None
        task.column_key = ""
        return

    project = DepartmentProject.query.get(project_id)
    if not project:
        task.board_id = None
        task.project_id = None
        task.column_key = ""
        return

    task.board_id = board_id
    task.project_id = project.id
    task.row_id = None
    task.department_id = project.department_id
    task.column_key = column_key


def normalize_int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_department_id(value):
    if not value:
        return None
    try:
        department_id = int(value)
    except (TypeError, ValueError):
        return None
    if Department.query.get(department_id):
        return department_id
    return None
