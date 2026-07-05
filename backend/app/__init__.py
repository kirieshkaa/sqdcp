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
        from app.models import user, department, board, sqdcp_row
        db.create_all()
        ensure_sqdcp_row_columns()

    from app.routers.auth import auth_bp
    from app.routers.boards import boards_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(boards_bp)

    return app


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
