import os
from datetime import timedelta

from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

db = SQLAlchemy()
jwt = JWTManager()

DIGITAL_TRANSFORMATION_DEPARTMENT = "\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u0446\u0438\u0444\u0440\u043e\u0432\u043e\u0439 \u0442\u0440\u0430\u043d\u0441\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u0438"


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///tbp.db"))
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "tbp-secret-key-change-in-production")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)
    app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

    CORS(app)
    db.init_app(app)
    jwt.init_app(app)

    with app.app_context():
        from app.models import board, department, department_project, sqdcp_row, task, user  # noqa: F401

        db.create_all()
        ensure_department_columns()
        ensure_board_columns()
        ensure_sqdcp_row_columns()
        ensure_task_columns()
        ensure_user_roles()

    from app.routers.auth import auth_bp
    from app.routers.boards import boards_bp
    from app.routers.departments import departments_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(boards_bp)
    app.register_blueprint(departments_bp)

    return app


def normalize_database_url(database_url):
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://") and "+psycopg" not in database_url:
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def is_sqlite():
    return db.engine.dialect.name == "sqlite"


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

    board_column = next((column for column in inspect(db.engine).get_columns("tasks") if column["name"] == "board_id"), None)
    if board_column and not board_column["nullable"] and is_sqlite():
        rebuild_tasks_nullable_board_id()
    elif board_column and not board_column["nullable"]:
        with db.engine.begin() as connection:
            connection.execute(text("ALTER TABLE tasks ALTER COLUMN board_id DROP NOT NULL"))


def ensure_user_roles():
    inspector = inspect(db.engine)
    if "users" not in inspector.get_table_names():
        return

    with db.engine.begin() as connection:
        connection.execute(text("UPDATE users SET role = 'minister' WHERE role = 'manager'"))
        connection.execute(text("UPDATE users SET role = 'department_head' WHERE role IN ('user', 'viewer')"))

    ensure_department_head_department()


def ensure_department_head_department():
    from app.models.department import Department
    from app.models.user import User

    user = User.query.filter_by(username="department_head").first()
    if not user:
        return

    department = Department.query.filter_by(name=DIGITAL_TRANSFORMATION_DEPARTMENT).first()
    if not department:
        department = Department(
            name=DIGITAL_TRANSFORMATION_DEPARTMENT,
            description=f"\u041e\u0442\u0434\u0435\u043b {DIGITAL_TRANSFORMATION_DEPARTMENT}",
        )
        db.session.add(department)
        db.session.flush()

    user.department_id = department.id
    db.session.commit()


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
                status VARCHAR(20) DEFAULT 'not_started'
            )
        """))
        connection.execute(text("""
            INSERT INTO tasks (
                id, board_id, row_id, department_id, project_id,
                column_key, name, description, assignees, status
            )
            SELECT
                id, board_id, row_id, department_id, project_id,
                column_key, name, description, assignees, COALESCE(status, 'not_started')
            FROM tasks_old_board_nullable
        """))
        connection.execute(text("DROP TABLE tasks_old_board_nullable"))
