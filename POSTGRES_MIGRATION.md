# Migration to PostgreSQL

Backend now uses PostgreSQL when `DATABASE_URL` is set. If `DATABASE_URL` is not set, it falls back to the old local SQLite database at `backend/instance/tbp.db`.

## 1. Install dependencies

```bash
cd backend
python -m pip install -r requirements.txt
```

## 2. Create PostgreSQL database

Example:

```sql
CREATE DATABASE sqdcp;
CREATE USER sqdcp_user WITH PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE sqdcp TO sqdcp_user;
```

## 3. Set `DATABASE_URL`

Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql+psycopg://sqdcp_user:change_me@localhost:5432/sqdcp"
```

macOS/Linux:

```bash
export DATABASE_URL="postgresql+psycopg://sqdcp_user:change_me@localhost:5432/sqdcp"
```

The backend also accepts `postgresql://...` and `postgres://...`; it normalizes them to the `psycopg` driver automatically.

## 4. Migrate existing SQLite data

From the repository root:

Windows PowerShell:

```powershell
python tools\migrate_sqlite_to_postgres.py --database-url $env:DATABASE_URL
```

macOS/Linux:

```bash
python tools/migrate_sqlite_to_postgres.py --database-url "$DATABASE_URL"
```

If the PostgreSQL database already contains data and you want to replace it:

Windows PowerShell:

```powershell
python tools\migrate_sqlite_to_postgres.py --database-url $env:DATABASE_URL --clear
```

macOS/Linux:

```bash
python tools/migrate_sqlite_to_postgres.py --database-url "$DATABASE_URL" --clear
```

Default SQLite source:

```text
backend/instance/tbp.db
```

To use another SQLite file:

Windows PowerShell:

```powershell
python tools\migrate_sqlite_to_postgres.py --sqlite path\to\tbp.db --database-url $env:DATABASE_URL
```

macOS/Linux:

```bash
python tools/migrate_sqlite_to_postgres.py --sqlite path/to/tbp.db --database-url "$DATABASE_URL"
```

## 5. Start the project

Start scripts inherit environment variables, so set `DATABASE_URL` in the same terminal before running them.

Windows:

```powershell
$env:DATABASE_URL="postgresql+psycopg://sqdcp_user:change_me@localhost:5432/sqdcp"
.\start.bat
```

macOS/Linux:

```bash
export DATABASE_URL="postgresql+psycopg://sqdcp_user:change_me@localhost:5432/sqdcp"
./start.sh
```
