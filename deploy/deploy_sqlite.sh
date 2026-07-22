#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-sqdcp}"
APP_USER="${APP_USER:-sqdcp}"
APP_DIR="${APP_DIR:-/opt/sqdcp}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
DOMAIN="${1:-${DOMAIN:-_}}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="$APP_NAME.service"
NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
NGINX_ENABLED="/etc/nginx/sites-enabled/$APP_NAME"
JWT_SECRET_KEY="${JWT_SECRET_KEY:-}"
OVERWRITE_DB="${OVERWRITE_DB:-0}"

log() {
  printf "\n[%s] %s\n" "$APP_NAME" "$1"
}

require_root_tools() {
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required to run this deployment script."
    exit 1
  fi
}

install_system_packages() {
  log "Installing system packages"
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg nginx python3 python3-venv python3-pip rsync
}

node_major_version() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi
  node -v | sed -E 's/^v([0-9]+).*/\1/'
}

install_node_if_needed() {
  local major
  major="$(node_major_version)"
  if [[ "$major" -ge 20 ]] && command -v npm >/dev/null 2>&1; then
    log "Node.js $(node -v) is already installed"
    return
  fi

  log "Installing Node.js LTS"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

ensure_user_and_dirs() {
  log "Preparing application user and directories"
  if ! id "$APP_USER" >/dev/null 2>&1; then
    sudo useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
  fi

  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
}

sync_source() {
  log "Copying project files"
  rsync -a --delete \
    --exclude ".git" \
    --exclude ".agents" \
    --exclude ".codex" \
    --exclude "backend/.venv" \
    --exclude "backend/instance" \
    --exclude "backend/__pycache__" \
    --exclude "backend/app/__pycache__" \
    --exclude "frontend/node_modules" \
    --exclude "frontend/dist" \
    --exclude "*.pyc" \
    "$REPO_ROOT/" "$APP_DIR/"

  sudo mkdir -p "$APP_DIR/backend/instance"

  if [[ -f "$REPO_ROOT/backend/instance/tbp.db" ]]; then
    if [[ ! -f "$APP_DIR/backend/instance/tbp.db" || "$OVERWRITE_DB" == "1" ]]; then
      if [[ -f "$APP_DIR/backend/instance/tbp.db" ]]; then
        sudo cp "$APP_DIR/backend/instance/tbp.db" "$APP_DIR/backend/instance/tbp.db.backup.$(date +%Y%m%d%H%M%S)"
      fi
      sudo cp "$REPO_ROOT/backend/instance/tbp.db" "$APP_DIR/backend/instance/tbp.db"
    fi
  fi

  sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

create_backend_env() {
  log "Writing backend environment"
  if [[ -z "$JWT_SECRET_KEY" ]]; then
    if [[ -f "$APP_DIR/backend/.env" ]] && grep -q "^JWT_SECRET_KEY=" "$APP_DIR/backend/.env"; then
      JWT_SECRET_KEY="$(grep "^JWT_SECRET_KEY=" "$APP_DIR/backend/.env" | cut -d= -f2-)"
    else
      JWT_SECRET_KEY="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)"
    fi
  fi

  sudo tee "$APP_DIR/backend/.env" >/dev/null <<EOF
FLASK_ENV=production
DATABASE_URL=sqlite:///$APP_DIR/backend/instance/tbp.db
JWT_SECRET_KEY=$JWT_SECRET_KEY
EOF
  sudo chown "$APP_USER:$APP_USER" "$APP_DIR/backend/.env"
  sudo chmod 600 "$APP_DIR/backend/.env"
}

install_backend() {
  log "Installing backend dependencies"
  sudo -u "$APP_USER" python3 -m venv "$APP_DIR/backend/.venv"
  sudo -u "$APP_USER" "$APP_DIR/backend/.venv/bin/python" -m pip install --upgrade pip
  sudo -u "$APP_USER" "$APP_DIR/backend/.venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt"
}

build_frontend() {
  log "Building frontend"
  if [[ -f "$APP_DIR/frontend/package-lock.json" ]]; then
    sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/frontend' && npm ci"
  else
    sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/frontend' && npm install"
  fi
  sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/frontend' && VITE_API_URL=/api npm run build"
}

write_systemd_service() {
  log "Writing systemd service"
  sudo tee "/etc/systemd/system/$SERVICE_NAME" >/dev/null <<EOF
[Unit]
Description=SQDCP Flask backend
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_DIR/backend/.venv/bin/gunicorn --workers 1 --threads 4 --timeout 120 --bind 127.0.0.1:$BACKEND_PORT run:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"
}

write_nginx_config() {
  log "Writing nginx config"
  sudo tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/frontend/dist;
    index index.html;

    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  sudo ln -sf "$NGINX_SITE" "$NGINX_ENABLED"
  sudo nginx -t
  sudo systemctl reload nginx
}

print_result() {
  log "Deployment finished"
  echo "Application directory: $APP_DIR"
  echo "SQLite database:       $APP_DIR/backend/instance/tbp.db"
  echo "Backend service:       sudo systemctl status $SERVICE_NAME"
  echo "Backend logs:          sudo journalctl -u $SERVICE_NAME -f"
  if [[ "$DOMAIN" == "_" ]]; then
    echo "Open the server IP address in a browser."
  else
    echo "Open:                  http://$DOMAIN"
  fi
}

require_root_tools
install_system_packages
install_node_if_needed
ensure_user_and_dirs
sync_source
create_backend_env
install_backend
build_frontend
write_systemd_service
write_nginx_config
print_result
