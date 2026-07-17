import argparse
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app import create_app  # noqa: E402


TABLES = [
    ("departments", ["id", "name", "description", "head", "workers"]),
    ("users", ["id", "username", "email", "hashed_password", "role", "department_id", "status"]),
    ("boards", ["id", "title", "description", "owner_id", "department_id", "board_date", "created_at", "updated_at"]),
    ("sqdcp_rows", ["id", "board_id", "department_id", "team_name", "position", "safety", "quality", "delivery", "cost", "people"]),
    ("department_projects", ["id", "department_id", "name", "position"]),
    ("tasks", ["id", "board_id", "row_id", "department_id", "project_id", "column_key", "name", "description", "assignees", "status"]),
]

DEFAULTS = {
    "description": "",
    "head": "",
    "workers": "",
    "department_id": None,
    "owner_id": None,
    "board_date": "",
    "position": 0,
    "safety": "",
    "quality": "",
    "delivery": "",
    "cost": "",
    "people": "",
    "row_id": None,
    "project_id": None,
    "column_key": "",
    "assignees": "",
    "status": "not_started",
}

DATETIME_COLUMNS = {"created_at", "updated_at"}


def normalize_database_url(database_url):
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://") and "+psycopg" not in database_url:
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    normalized = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return value


def sqlite_tables(connection):
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {row[0] for row in rows}


def sqlite_columns(connection, table):
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}


def read_rows(connection, table, columns):
    if table not in sqlite_tables(connection):
        return []

    source_columns = sqlite_columns(connection, table)
    selected_columns = [column for column in columns if column in source_columns]
    if not selected_columns:
        return []

    query = f"SELECT {', '.join(selected_columns)} FROM {table} ORDER BY id ASC"
    rows = []
    for source_row in connection.execute(query).fetchall():
        row = dict(source_row)
        for column in columns:
            row.setdefault(column, DEFAULTS.get(column))
            if column in DATETIME_COLUMNS:
                row[column] = parse_datetime(row[column])
        rows.append(row)
    return rows


def target_has_data(connection):
    for table, _columns in TABLES:
        count = connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
        if count:
            return True
    return False


def clear_target(connection):
    table_names = ", ".join(table for table, _columns in reversed(TABLES))
    connection.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))


def insert_rows(connection, table, columns, rows):
    if not rows:
        return 0

    column_list = ", ".join(columns)
    value_list = ", ".join(f":{column}" for column in columns)
    statement = text(f"INSERT INTO {table} ({column_list}) VALUES ({value_list})")
    connection.execute(statement, rows)
    return len(rows)


def reset_sequences(connection):
    for table, _columns in TABLES:
        sequence_name = connection.execute(text("SELECT pg_get_serial_sequence(:table_name, 'id')"), {"table_name": table}).scalar()
        if not sequence_name:
            continue
        max_id = connection.execute(text(f"SELECT MAX(id) FROM {table}")).scalar()
        if max_id is None:
            connection.execute(text("SELECT setval(CAST(:sequence_name AS regclass), 1, false)"), {"sequence_name": sequence_name})
        else:
            connection.execute(text("SELECT setval(CAST(:sequence_name AS regclass), :max_id, true)"), {
                "sequence_name": sequence_name,
                "max_id": max_id,
            })


def migrate(sqlite_path, database_url, clear):
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite file not found: {sqlite_path}")

    os.environ["DATABASE_URL"] = database_url
    app = create_app()
    target_engine = create_engine(normalize_database_url(database_url), pool_pre_ping=True)

    source = sqlite3.connect(sqlite_path)
    source.row_factory = sqlite3.Row

    with app.app_context(), target_engine.begin() as target:
        if target_has_data(target):
            if not clear:
                raise RuntimeError("Target PostgreSQL database already contains data. Re-run with --clear to replace it.")
            clear_target(target)

        migrated = {}
        for table, columns in TABLES:
            rows = read_rows(source, table, columns)
            migrated[table] = insert_rows(target, table, columns, rows)
        reset_sequences(target)

    source.close()
    return migrated


def main():
    parser = argparse.ArgumentParser(description="Migrate SQDCP data from SQLite to PostgreSQL.")
    parser.add_argument(
        "--sqlite",
        default=str(ROOT / "backend" / "instance" / "tbp.db"),
        help="Path to source SQLite database. Default: backend/instance/tbp.db",
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL"),
        help="Target PostgreSQL SQLAlchemy URL. Defaults to DATABASE_URL env var.",
    )
    parser.add_argument("--clear", action="store_true", help="Clear target PostgreSQL tables before importing.")
    args = parser.parse_args()

    if not args.database_url:
        parser.error("Provide --database-url or set DATABASE_URL.")
    if "postgres" not in args.database_url:
        parser.error("Target database URL must be PostgreSQL.")

    migrated = migrate(Path(args.sqlite), args.database_url, args.clear)
    for table, count in migrated.items():
        print(f"{table}: {count}")
    print("Migration complete.")


if __name__ == "__main__":
    main()
