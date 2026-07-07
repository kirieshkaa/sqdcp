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
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///tbp.db"
    app.config["JWT_SECRET_KEY"] = "tbp-secret-key-change-in-production"
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)
    app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

    CORS(app)
    db.init_app(app)
    jwt.init_app(app)

    with app.app_context():
        from app.models import user, department, board, sqdcp_row, task
        db.create_all()
        ensure_department_columns()
        ensure_board_columns()
        ensure_sqdcp_row_columns()
        ensure_task_columns()

    from app.routers.auth import auth_bp
    from app.routers.boards import boards_bp
    from app.routers.departments import departments_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(boards_bp)
    app.register_blueprint(departments_bp)

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
        if "status" not in existing_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN status VARCHAR(20) DEFAULT 'not_started'"))
