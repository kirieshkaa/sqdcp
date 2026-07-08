from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import date, datetime
from app import db
from app.models.board import Board
from app.models.department import Department
from app.models.sqdcp_row import SqdcpRow
from app.models.task import Task

boards_bp = Blueprint("boards", __name__, url_prefix="/api/boards")

SQDCP_COLUMNS = [
    {"key": "safety", "label": "Safety", "description": "безопасность"},
    {"key": "quality", "label": "Quality", "description": "качество"},
    {"key": "delivery", "label": "Delivery", "description": "сроки"},
    {"key": "cost", "label": "Cost", "description": "стоимость"},
]
VALID_COLUMN_KEYS = {column["key"] for column in SQDCP_COLUMNS}
TASK_STATUSES = {"not_started", "in_progress", "done"}
DEFAULT_TASK_STATUS = "not_started"


def serialize_task(task):
    return {
        "id": task.id,
        "board_id": task.board_id,
        "row_id": task.row_id,
        "department_id": task.department_id,
        "column_key": task.column_key or "",
        "name": task.name,
        "description": task.description or "",
        "assignees": task.assignees or "",
        "status": normalize_task_status(task.status),
    }


def serialize_row(row):
    return {
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
    }
    if include_rows:
        data["columns"] = SQDCP_COLUMNS
        data["rows"] = [serialize_row(row) for row in get_board_rows(board)]
        data["tasks"] = [
            serialize_task(task)
            for task in Task.query.filter_by(board_id=board.id).order_by(Task.id.asc()).all()
        ]
    return data


@boards_bp.route("", methods=["GET"])
@jwt_required()
def list_boards():
    boards = Board.query.order_by(Board.updated_at.desc(), Board.id.desc()).all()
    return jsonify([serialize_board(board) for board in boards])


@boards_bp.route("", methods=["POST"])
@jwt_required()
def create_board():
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

    db.session.commit()
    return jsonify(serialize_board(board, include_rows=True)), 201


@boards_bp.route("/<int:board_id>", methods=["GET"])
@jwt_required()
def get_board(board_id):
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    ensure_default_rows(board)
    return jsonify(serialize_board(board, include_rows=True))


@boards_bp.route("/<int:board_id>", methods=["DELETE"])
@jwt_required()
def delete_board(board_id):
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"ok": True})

    Task.query.filter_by(board_id=board.id).delete()
    db.session.delete(board)
    db.session.commit()
    return jsonify({"ok": True})


@boards_bp.route("/<int:board_id>", methods=["PUT"])
@jwt_required()
def update_board(board_id):
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

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

    db.session.commit()
    return jsonify(serialize_board(board, include_rows=True))


@boards_bp.route("/<int:board_id>/tasks", methods=["GET"])
@jwt_required()
def list_board_tasks(board_id):
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    tasks = Task.query.filter_by(board_id=board.id).order_by(Task.id.asc()).all()
    return jsonify([serialize_task(task) for task in tasks])


@boards_bp.route("/<int:board_id>/tasks", methods=["POST"])
@jwt_required()
def create_board_task(board_id):
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Имя задачи обязательно"}), 400

    task = Task(
        board_id=board.id,
        name=name,
        description=(data.get("description") or "").strip(),
        assignees=(data.get("assignees") or "").strip(),
        status=normalize_task_status(data.get("status")),
    )
    apply_task_assignment(task, board.id, data.get("row_id"), data.get("column_key"))
    db.session.add(task)
    db.session.commit()
    return jsonify(serialize_task(task)), 201


@boards_bp.route("/<int:board_id>/tasks/<int:task_id>", methods=["PUT"])
@jwt_required()
def update_board_task(board_id, task_id):
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Доска не найдена"}), 404

    task = Task.query.filter_by(id=task_id, board_id=board.id).first()
    if not task:
        return jsonify({"error": "Задача не найдена"}), 404

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
    if "status" in data:
        status = (data.get("status") or "").strip()
        if status not in TASK_STATUSES:
            return jsonify({"error": "Некорректный статус задачи"}), 400
        task.status = status
    if "row_id" in data or "column_key" in data:
        apply_task_assignment(task, board.id, data.get("row_id"), data.get("column_key"))

    db.session.commit()
    return jsonify(serialize_task(task))


@boards_bp.route("/<int:board_id>/tasks/<int:task_id>", methods=["DELETE"])
@jwt_required()
def delete_board_task(board_id, task_id):
    task = Task.query.filter_by(id=task_id, board_id=board_id).first()
    if not task:
        return jsonify({"ok": True})

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


def apply_task_assignment(task, board_id, row_id_value, column_key_value):
    row_id = normalize_int(row_id_value)
    column_key = (column_key_value or "").strip()
    if not row_id or column_key not in VALID_COLUMN_KEYS:
        task.row_id = None
        task.column_key = ""
        task.department_id = None
        return

    row = SqdcpRow.query.filter_by(id=row_id, board_id=board_id).first()
    if not row:
        task.row_id = None
        task.column_key = ""
        task.department_id = None
        return

    task.row_id = row.id
    task.column_key = column_key
    task.department_id = row.department_id


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
