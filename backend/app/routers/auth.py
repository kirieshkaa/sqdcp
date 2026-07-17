import re

import bcrypt
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required

from app import db
from app.models.department import Department
from app.models.user import User
from app.permissions import VALID_ROLES, forbidden, get_current_user, normalize_role, serialize_user

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def validate_registration(data):
    data = data or {}
    errors = []
    username = data.get("username", "")
    email = data.get("email", "")
    password = data.get("password", "")

    if len(username) < 3:
        errors.append("Имя пользователя должно быть минимум 3 символа")
    if len(username) > 40:
        errors.append("Имя пользователя не более 40 символов")
    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        errors.append("Имя пользователя может содержать только латиницу, цифры и _")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        errors.append("Некорректный email")
    if len(password) < 6:
        errors.append("Пароль должен быть минимум 6 символов")
    if not re.search(r"[A-Za-z]", password):
        errors.append("Пароль должен содержать хотя бы одну букву")
    if not re.search(r"[0-9]", password):
        errors.append("Пароль должен содержать хотя бы одну цифру")
    if User.query.filter_by(username=username).first():
        errors.append("Пользователь с таким именем уже существует")
    if User.query.filter_by(email=email).first():
        errors.append("Пользователь с таким email уже существует")

    return errors


def get_valid_department_id(value):
    if value in (None, ""):
        return None
    try:
        department_id = int(value)
    except (TypeError, ValueError):
        return None
    return department_id if Department.query.get(department_id) else None


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    errors = validate_registration(data)
    if errors:
        return jsonify({"errors": errors}), 400

    hashed = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()
    user = User(
        username=data["username"],
        email=data["email"],
        hashed_password=hashed,
        role="department_head",
        department_id=get_valid_department_id(data.get("department_id")),
        status="pending",
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({
        **serialize_user(user),
        "message": "Регистрация успешна. Ожидайте подтверждения администратором.",
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    user = User.query.filter_by(username=data.get("username", "")).first()
    password = data.get("password", "")
    if not user or not bcrypt.checkpw(password.encode(), user.hashed_password.encode()):
        return jsonify({"error": "Неверное имя пользователя или пароль"}), 401

    if user.status == "pending":
        return jsonify({"error": "Ваша учетная запись еще не подтверждена администратором"}), 403
    if user.status == "rejected":
        return jsonify({"error": "Ваша учетная запись отклонена администратором"}), 403
    if user.status == "blocked":
        return jsonify({"error": "Ваша учетная запись заблокирована администратором"}), 403

    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token, "token_type": "bearer"})


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def get_me():
    user = get_current_user()
    if not user or user.status != "active":
        return jsonify({"error": "Пользователь не активен"}), 403
    return jsonify(serialize_user(user))


@auth_bp.route("/pending", methods=["GET"])
@jwt_required()
def list_pending():
    current_user = get_current_user()
    if normalize_role(current_user.role) != "admin":
        return forbidden()

    users = User.query.filter_by(status="pending").order_by(User.id.asc()).all()
    return jsonify([serialize_user(user) for user in users])


@auth_bp.route("/approve/<int:target_id>", methods=["POST"])
@jwt_required()
def approve_user(target_id):
    current_user = get_current_user()
    if normalize_role(current_user.role) != "admin":
        return forbidden()

    target = User.query.get(target_id)
    if not target:
        return jsonify({"error": "Пользователь не найден"}), 404

    data = request.get_json() or {}
    role = normalize_role(data.get("role", "department_head"))
    if role not in VALID_ROLES:
        return jsonify({"error": f"Недопустимая роль. Доступны: {', '.join(VALID_ROLES)}"}), 400

    target.role = role
    target.status = "active"
    if "department_id" in data:
        target.department_id = get_valid_department_id(data.get("department_id"))
    db.session.commit()
    return jsonify(serialize_user(target))


@auth_bp.route("/reject/<int:target_id>", methods=["POST"])
@jwt_required()
def reject_user(target_id):
    current_user = get_current_user()
    if normalize_role(current_user.role) != "admin":
        return forbidden()

    target = User.query.get(target_id)
    if not target:
        return jsonify({"error": "Пользователь не найден"}), 404

    target.status = "rejected"
    db.session.commit()
    return jsonify(serialize_user(target))


@auth_bp.route("/users", methods=["GET"])
@jwt_required()
def list_users():
    current_user = get_current_user()
    if normalize_role(current_user.role) != "admin":
        return forbidden()

    users = User.query.order_by(User.id.asc()).all()
    return jsonify([serialize_user(user) for user in users])


@auth_bp.route("/users/<int:target_id>", methods=["PUT"])
@jwt_required()
def update_user(target_id):
    current_user = get_current_user()
    if normalize_role(current_user.role) != "admin":
        return forbidden("Только администратор может изменять пользователей")

    target = User.query.get(target_id)
    if not target:
        return jsonify({"error": "Пользователь не найден"}), 404
    if target.id == current_user.id:
        return jsonify({"error": "Нельзя редактировать себя через этот endpoint"}), 400

    data = request.get_json() or {}
    if "role" in data:
        role = normalize_role(data["role"])
        if role not in VALID_ROLES:
            return jsonify({"error": f"Недопустимая роль. Доступны: {', '.join(VALID_ROLES)}"}), 400
        target.role = role
    if "department_id" in data:
        target.department_id = get_valid_department_id(data.get("department_id"))
    if "status" in data:
        if data["status"] not in ("active", "blocked", "rejected", "pending"):
            return jsonify({"error": "Недопустимый статус"}), 400
        target.status = data["status"]
    if "email" in data:
        target.email = data["email"]

    db.session.commit()
    return jsonify(serialize_user(target))


@auth_bp.route("/users/<int:target_id>", methods=["DELETE"])
@jwt_required()
def delete_user(target_id):
    current_user = get_current_user()
    if normalize_role(current_user.role) != "admin":
        return forbidden("Только администратор может удалять пользователей")

    target = User.query.get(target_id)
    if not target:
        return jsonify({"ok": True})
    if target.id == current_user.id:
        return jsonify({"error": "Нельзя удалить самого себя"}), 400

    db.session.delete(target)
    db.session.commit()
    return jsonify({"ok": True})


@auth_bp.route("/block/<int:target_id>", methods=["POST"])
@jwt_required()
def block_user(target_id):
    current_user = get_current_user()
    if normalize_role(current_user.role) != "admin":
        return forbidden()

    target = User.query.get(target_id)
    if not target:
        return jsonify({"error": "Пользователь не найден"}), 404
    if target.id == current_user.id:
        return jsonify({"error": "Нельзя заблокировать самого себя"}), 400

    target.status = "blocked" if target.status != "blocked" else "active"
    db.session.commit()
    return jsonify(serialize_user(target))


@auth_bp.route("/seed", methods=["POST"])
def seed_test_users():
    data = request.get_json() or {}
    password = data.get("password", "test123")
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    created = []

    head_department_name = "Руководитель цифровой трансформации"
    dept_names = [head_department_name, "Разработка", "Маркетинг", "HR", "Финансы"]
    departments = []
    for dept_name in dept_names:
        department = Department.query.filter_by(name=dept_name).first()
        if not department:
            department = Department(name=dept_name, description=f"Отдел {dept_name}")
            db.session.add(department)
            db.session.flush()
        departments.append(department)

    head_department = Department.query.filter_by(name=head_department_name).first()
    head_department_id = head_department.id if head_department else None
    test_users = [
        {"username": "admin", "email": "admin@tbp.local", "role": "admin", "department_id": None},
        {"username": "minister", "email": "minister@tbp.local", "role": "minister", "department_id": None},
        {
            "username": "department_head",
            "email": "department_head@tbp.local",
            "role": "department_head",
            "department_id": head_department_id,
        },
    ]

    for test_user in test_users:
        user = User.query.filter_by(username=test_user["username"]).first()
        if not user:
            db.session.add(User(
                username=test_user["username"],
                email=test_user["email"],
                hashed_password=hashed,
                role=test_user["role"],
                department_id=test_user["department_id"],
                status="active",
            ))
            created.append(test_user["username"])
        else:
            user.role = test_user["role"]
            user.department_id = test_user["department_id"]
            user.status = "active"

    db.session.commit()
    return jsonify({"created_users": created, "note": f"Пароль для всех: {password}"}), 201
