import argparse
import sqlite3
from datetime import date, datetime
from pathlib import Path


TASK_STATUSES = {"not_started", "in_progress", "done"}
USER_STATUSES = {"active", "blocked", "rejected", "pending"}
BOARD_COLUMNS = ("id", "title", "description", "owner_id", "department_id", "created_at", "updated_at", "board_date")
DEPARTMENT_COLUMNS = ("id", "name", "description", "head", "workers")
USER_COLUMNS = ("id", "username", "email", "hashed_password", "role", "department_id", "status")
ROW_COLUMNS = ("id", "board_id", "team_name", "position", "safety", "quality", "delivery", "cost", "people", "department_id")
PROJECT_COLUMNS = ("id", "department_id", "name", "position")
TASK_COLUMNS = ("id", "board_id", "row_id", "department_id", "project_id", "column_key", "name", "description", "assignees", "status", "due_date")
SQDCP_COLUMNS = ("safety", "quality", "delivery", "cost", "people")


def get_tables(connection):
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def get_columns(connection, table):
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}


def row_dicts(connection, table):
    if table not in get_tables(connection):
        return []
    connection.row_factory = sqlite3.Row
    rows = [dict(row) for row in connection.execute(f"SELECT * FROM {table}")]
    connection.row_factory = None
    return rows


def first_present(row, names, default=""):
    for name in names:
        value = row.get(name)
        if value not in (None, ""):
            return value
    return default


def normalize_date(value):
    if not value:
        return date.today().isoformat()
    value = str(value)
    if len(value) >= 10:
        return value[:10]
    return date.today().isoformat()


def normalize_datetime(value):
    if value:
        return value
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def normalize_user_status(value):
    return value if value in USER_STATUSES else "active"


def normalize_task_status(value):
    return value if value in TASK_STATUSES else "not_started"


def create_schema(connection):
    connection.executescript(
        """
        CREATE TABLE departments (
            id INTEGER NOT NULL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description VARCHAR(500),
            head VARCHAR(150) DEFAULT '',
            workers TEXT DEFAULT ''
        );

        CREATE TABLE users (
            id INTEGER NOT NULL PRIMARY KEY,
            username VARCHAR(80) NOT NULL,
            email VARCHAR(120) NOT NULL,
            hashed_password VARCHAR(256) NOT NULL,
            role VARCHAR(20),
            department_id INTEGER,
            status VARCHAR(20)
        );

        CREATE TABLE boards (
            id INTEGER NOT NULL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description VARCHAR(500),
            owner_id INTEGER,
            department_id INTEGER,
            created_at DATETIME,
            updated_at DATETIME,
            board_date TEXT DEFAULT ''
        );

        CREATE TABLE sqdcp_rows (
            id INTEGER NOT NULL PRIMARY KEY,
            board_id INTEGER NOT NULL,
            team_name VARCHAR(200) NOT NULL,
            position INTEGER,
            safety TEXT DEFAULT '',
            quality TEXT DEFAULT '',
            delivery TEXT DEFAULT '',
            cost TEXT DEFAULT '',
            people TEXT DEFAULT '',
            department_id INTEGER
        );

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
        );

        CREATE TABLE department_projects (
            id INTEGER NOT NULL PRIMARY KEY,
            department_id INTEGER NOT NULL,
            name VARCHAR(200) NOT NULL,
            position INTEGER
        );
        """
    )


def insert_row(connection, table, columns, row):
    placeholders = ", ".join("?" for _ in columns)
    column_list = ", ".join(columns)
    values = [row.get(column) for column in columns]
    connection.execute(f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})", values)


def migrate_departments(source, target):
    for index, row in enumerate(row_dicts(source, "departments"), start=1):
        insert_row(target, "departments", DEPARTMENT_COLUMNS, {
            "id": row.get("id") or index,
            "name": first_present(row, ("name",), f"Отдел {index}"),
            "description": row.get("description") or "",
            "head": first_present(row, ("head", "head_name", "manager", "manager_name"), ""),
            "workers": first_present(row, ("workers", "employees", "members"), ""),
        })


def migrate_projects(source, target):
    for index, row in enumerate(row_dicts(source, "department_projects"), start=1):
        department_id = row.get("department_id")
        if department_id is None:
            continue

        insert_row(target, "department_projects", PROJECT_COLUMNS, {
            "id": row.get("id") or index,
            "department_id": department_id,
            "name": first_present(row, ("name", "title"), f"Проект {index}"),
            "position": row.get("position") if row.get("position") is not None else index - 1,
        })


def migrate_users(source, target):
    for index, row in enumerate(row_dicts(source, "users"), start=1):
        username = first_present(row, ("username", "login", "name"), f"user{index}")
        insert_row(target, "users", USER_COLUMNS, {
            "id": row.get("id") or index,
            "username": username,
            "email": first_present(row, ("email",), f"{username}@example.local"),
            "hashed_password": first_present(row, ("hashed_password", "password_hash", "password"), ""),
            "role": row.get("role") or "user",
            "department_id": row.get("department_id"),
            "status": normalize_user_status(row.get("status")),
        })


def migrate_boards(source, target):
    for index, row in enumerate(row_dicts(source, "boards"), start=1):
        created_at = normalize_datetime(row.get("created_at"))
        insert_row(target, "boards", BOARD_COLUMNS, {
            "id": row.get("id") or index,
            "title": first_present(row, ("title", "name"), f"SQDCP-доска {index}"),
            "description": row.get("description") or "",
            "owner_id": row.get("owner_id") or row.get("user_id"),
            "department_id": row.get("department_id"),
            "created_at": created_at,
            "updated_at": normalize_datetime(row.get("updated_at") or created_at),
            "board_date": normalize_date(first_present(row, ("board_date", "date", "created_at"), "")),
        })


def migrate_rows(source, target):
    for index, row in enumerate(row_dicts(source, "sqdcp_rows"), start=1):
        mapped = {
            "id": row.get("id") or index,
            "board_id": row.get("board_id"),
            "team_name": first_present(row, ("team_name", "team", "department_name", "name"), f"Команда {index}"),
            "position": row.get("position") if row.get("position") is not None else index - 1,
            "department_id": row.get("department_id"),
        }
        for column in SQDCP_COLUMNS:
            mapped[column] = first_present(row, (column, column[0], column.upper()[0], f"{column}_text"), "")
        if mapped["board_id"] is not None:
            insert_row(target, "sqdcp_rows", ROW_COLUMNS, mapped)


def migrate_tasks(source, target):
    for index, row in enumerate(row_dicts(source, "tasks"), start=1):
        column_key = row.get("column_key") or ""
        if column_key not in (*SQDCP_COLUMNS, ""):
            column_key = ""
        insert_row(target, "tasks", TASK_COLUMNS, {
            "id": row.get("id") or index,
            "board_id": row.get("board_id"),
            "row_id": row.get("row_id"),
            "department_id": row.get("department_id"),
            "project_id": row.get("project_id"),
            "column_key": column_key,
            "name": first_present(row, ("name", "title"), f"Задача {index}"),
            "description": row.get("description") or "",
            "assignees": first_present(row, ("assignees", "responsible", "owner"), ""),
            "status": normalize_task_status(row.get("status")),
            "due_date": first_present(row, ("due_date", "deadline", "finish_date", "date"), ""),
        })


def add_default_rows_for_empty_boards(target):
    board_ids = [row[0] for row in target.execute("SELECT id FROM boards ORDER BY id")]
    for board_id in board_ids:
        count = target.execute("SELECT COUNT(*) FROM sqdcp_rows WHERE board_id=?", (board_id,)).fetchone()[0]
        if count:
            continue
        for position in range(3):
            target.execute(
                """
                INSERT INTO sqdcp_rows
                    (board_id, team_name, position, safety, quality, delivery, cost, people, department_id)
                VALUES (?, ?, ?, '', '', '', '', '', NULL)
                """,
                (board_id, f"Команда {position + 1}", position),
            )


def summarize(connection):
    tables = sorted(get_tables(connection))
    return {
        table: {
            "rows": connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0],
            "columns": [row[1] for row in connection.execute(f"PRAGMA table_info({table})")],
        }
        for table in tables
    }


def convert_database(source_path, output_path):
    source_path = Path(source_path)
    output_path = Path(output_path)
    if not source_path.exists():
        raise FileNotFoundError(source_path)
    if output_path.exists():
        output_path.unlink()

    source = sqlite3.connect(source_path)
    target = sqlite3.connect(output_path)
    try:
        create_schema(target)
        migrate_departments(source, target)
        migrate_projects(source, target)
        migrate_users(source, target)
        migrate_boards(source, target)
        migrate_rows(source, target)
        migrate_tasks(source, target)
        add_default_rows_for_empty_boards(target)
        target.commit()
        return summarize(target)
    finally:
        source.close()
        target.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    args = parser.parse_args()
    summary = convert_database(args.source, args.output)
    for table, info in summary.items():
        print(f"{table}: {info['rows']} rows; columns={', '.join(info['columns'])}")


if __name__ == "__main__":
    main()
