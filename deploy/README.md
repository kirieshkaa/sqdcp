# SQLite deployment

This folder contains a simple deployment script for an Ubuntu/Debian server.
It keeps the current SQLite database approach and does not require PostgreSQL.

## What the script does

- Installs system packages: Python, nginx, rsync, curl, Node.js LTS.
- Copies the project to `/opt/sqdcp` by default.
- Creates a backend virtual environment.
- Installs Python dependencies, including `gunicorn`.
- Builds the React frontend with `VITE_API_URL=/api`.
- Runs the Flask backend as a `systemd` service.
- Serves the frontend through nginx.
- Proxies `/api/*` requests from nginx to the backend.

## First deploy

Run from the project root on the server:

```bash
chmod +x deploy/deploy_sqlite.sh
./deploy/deploy_sqlite.sh your-domain.ru
```

If there is no domain yet, run:

```bash
chmod +x deploy/deploy_sqlite.sh
./deploy/deploy_sqlite.sh
```

Then open the server IP address in a browser.

## Database behavior

The script uses:

```text
/opt/sqdcp/backend/instance/tbp.db
```

If `backend/instance/tbp.db` exists in the project during deploy, the script copies it only when the server database does not exist yet.

To intentionally replace the server database from the local project copy:

```bash
OVERWRITE_DB=1 ./deploy/deploy_sqlite.sh your-domain.ru
```

Before replacing it, the script creates a timestamped backup next to the old database.

## Useful commands

Check backend status:

```bash
sudo systemctl status sqdcp
```

Watch backend logs:

```bash
sudo journalctl -u sqdcp -f
```

Restart backend:

```bash
sudo systemctl restart sqdcp
```

Check nginx config:

```bash
sudo nginx -t
```

## Configuration variables

You can override defaults:

```bash
APP_DIR=/opt/my-sqdcp APP_USER=sqdcp BACKEND_PORT=8000 ./deploy/deploy_sqlite.sh your-domain.ru
```

To set a fixed JWT secret:

```bash
JWT_SECRET_KEY="replace-with-a-long-random-secret" ./deploy/deploy_sqlite.sh your-domain.ru
```
