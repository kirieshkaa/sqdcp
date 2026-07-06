from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import date, datetime
from app import db
from app.models.board import Board
from app.models.department import Department
from app.models.sqdcp_row import SqdcpRow

boards_bp = Blueprint("boards", __name__, url_prefix="/api/boards")

SQDCP_COLUMNS = [
    {"key": "safety", "label": "Safety", "description": "безопасность"},
    {"key": "quality", "label": "Quality", "description": "качество"},
    {"key": "delivery", "label": "Delivery", "description": "сроки"},
    {"key": "cost", "label": "Cost", "description": "стоимость"},
    {"key": "people", "label": "People", "description": "персонал"},
]


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
        SqdcpRow.query.filter_by(board_id=board.id).delete()
        for idx, row in enumerate(incoming_rows):
            team_name = (row.get("team_name") or "").strip()
            if not team_name:
                team_name = f"Команда {idx + 1}"
            db.session.add(SqdcpRow(
                board_id=board.id,
                team_name=team_name,
                department_id=normalize_department_id(row.get("department_id")),
                position=idx,
                safety=row.get("safety") or "",
                quality=row.get("quality") or "",
                delivery=row.get("delivery") or "",
                cost=row.get("cost") or "",
                people=row.get("people") or "",
            ))

    db.session.commit()
    return jsonify(serialize_board(board, include_rows=True))


def normalize_board_date(value):
    if not value:
        return ""
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return ""


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
