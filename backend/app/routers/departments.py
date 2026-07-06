from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models.board import Board
from app.models.department import Department
from app.models.sqdcp_row import SqdcpRow
from app.models.user import User

departments_bp = Blueprint("departments", __name__, url_prefix="/api/departments")


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
    return data


def normalize_department_payload(data):
    return {
        "name": (data.get("name") or "").strip(),
        "head": (data.get("head") or "").strip(),
        "workers": (data.get("workers") or "").strip(),
        "description": (data.get("description") or "").strip(),
    }


@departments_bp.route("", methods=["GET"])
def list_departments():
    departments = Department.query.order_by(Department.name.asc(), Department.id.asc()).all()
    return jsonify([serialize_department(department) for department in departments])


@departments_bp.route("", methods=["POST"])
@jwt_required()
def create_department():
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
    department = Department.query.get(department_id)
    if not department:
        return jsonify({"error": "Отдел не найден"}), 404

    return jsonify(serialize_department(department, include_participation=True))


@departments_bp.route("/<int:department_id>", methods=["PUT"])
@jwt_required()
def update_department(department_id):
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


@departments_bp.route("/<int:department_id>", methods=["DELETE"])
@jwt_required()
def delete_department(department_id):
    department = Department.query.get(department_id)
    if not department:
        return jsonify({"ok": True})

    User.query.filter_by(department_id=department.id).update({"department_id": None})
    Board.query.filter_by(department_id=department.id).update({"department_id": None})
    SqdcpRow.query.filter_by(department_id=department.id).update({"department_id": None})
    db.session.delete(department)
    db.session.commit()
    return jsonify({"ok": True})
