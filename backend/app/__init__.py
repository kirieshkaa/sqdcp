import os
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from sqlalchemy import inspect, text
from datetime import timedelta

db = SQLAlchemy()
jwt = JWTManager()


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///tbp.db")
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "tbp-secret-key-change-in-production")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)
    app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

    CORS(app)
    db.init_app(app)
    jwt.init_app(app)

    with app.app_context():
        from app.models import user, department, board, sqdcp_row, task, department_project, activity_log
        db.create_all()
        ensure_department_columns()
        ensure_board_columns()
        ensure_sqdcp_row_columns()
        ensure_task_columns()
        ensure_user_roles()

    from app.routers.auth import auth_bp
    from app.routers.boards import boards_bp
    from app.routers.departments import departments_bp
    from app.routers.admin import admin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(boards_bp)
    app.register_blueprint(departments_bp)
    app.register_blueprint(admin_bp)

    return app


def ensure_department_columns():
    inspector = inspect(db.engine)
    if "departments" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("departments")}
    with db.engine.begin() as connection:
        if "head" not in existing_columns:
            connection.execute(text("ALTER TABLE departments ADD COLUMN head VARCHAR(150) DEFAULT ''"))
        if "workers" not in existing_columns:
            connection.execute(text("ALTER TABLE departments ADD COLUMN workers TEXT DEFAULT ''"))


def ensure_board_columns():
    inspector = inspect(db.engine)
    if "boards" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("boards")}
    with db.engine.begin() as connection:
        if "board_date" not in existing_columns:
            connection.execute(text("ALTER TABLE boards ADD COLUMN board_date TEXT DEFAULT ''"))


def ensure_sqdcp_row_columns():
    inspector = inspect(db.engine)
    if "sqdcp_rows" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("sqdcp_rows")}
    required_columns = ["safety", "quality", "delivery", "cost", "people"]
    with db.engine.begin() as connection:
        for column in required_columns:
            if column not in existing_columns:
                connection.execute(text(f"ALTER TABLE sqdcp_rows ADD COLUMN {column} TEXT DEFAULT ''"))
        if "department_id" not in existing_columns:
            connection.execute(text("ALTER TABLE sqdcp_rows ADD COLUMN department_id INTEGER"))


def ensure_task_columns():
    inspector = inspect(db.engine)
    if "tasks" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("tasks")}
    with db.engine.begin() as connection:
        if "department_id" not in existing_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN department_id INTEGER"))
        if "project_id" not in existing_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN project_id INTEGER"))
        if "status" not in existing_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN status VARCHAR(20) DEFAULT 'not_started'"))
        if "due_date" not in existing_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN due_date VARCHAR(10) DEFAULT ''"))

    board_column = next((column for column in inspect(db.engine).get_columns("tasks") if column["name"] == "board_id"), None)
    if board_column and not board_column["nullable"]:
        rebuild_tasks_nullable_board_id()


def ensure_user_roles():
    inspector = inspect(db.engine)
    if "users" not in inspector.get_table_names():
        return

    with db.engine.begin() as connection:
        connection.execute(text("UPDATE users SET role = 'minister' WHERE role = 'manager'"))
        connection.execute(text("UPDATE users SET role = 'department_head' WHERE role IN ('user', 'viewer')"))
        department_id = connection.execute(
            text("SELECT id FROM departments WHERE name = :name"),
            {"name": "Руководитель цифровой трансформации"},
        ).scalar()
        if department_id is None:
            result = connection.execute(
                text("INSERT INTO departments (name, description, head, workers) VALUES (:name, :description, '', '')"),
                {
                    "name": "Руководитель цифровой трансформации",
                    "description": "Отдел Руководитель цифровой трансформации",
                },
            )
            department_id = result.lastrowid
        connection.execute(
            text("UPDATE users SET department_id = :department_id WHERE username = 'department_head'"),
            {"department_id": department_id},
        )


def rebuild_tasks_nullable_board_id():
    with db.engine.begin() as connection:
        connection.execute(text("ALTER TABLE tasks RENAME TO tasks_old_board_nullable"))
        connection.execute(text("""
            CREATE TABLE tasks (
                id INTEGER NOT NULL PRIMARY KEY,
                board_id INTEGER,
                row_id INTEGER,
                department_id INTEGER,
                project_id INTEGER,
                column_key VARCHAR(20),
                name VARCHAR(200) NOT NULL,
                description TEXT,
                assignees TEXT,
                status VARCHAR(20) DEFAULT 'not_started',
                due_date VARCHAR(10) DEFAULT ''
            )
        """))
        connection.execute(text("""
            INSERT INTO tasks (
                id, board_id, row_id, department_id, project_id,
                column_key, name, description, assignees, status, due_date
            )
            SELECT
                id, board_id, row_id, department_id, project_id,
                column_key, name, description, assignees, COALESCE(status, 'not_started'), ''
            FROM tasks_old_board_nullable
        """))
        connection.execute(text("DROP TABLE tasks_old_board_nullable"))
