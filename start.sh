#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PYTHON_BIN="${PYTHON_BIN:-python3}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "Stopping SQDCP Tracker..."
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

file_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    sha256sum "$1" | awk '{ print $1 }'
  fi
}

files_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    cat "$@" | shasum -a 256 | awk '{ print $1 }'
  else
    cat "$@" | sha256sum | awk '{ print $1 }'
  fi
}

trap cleanup EXIT INT TERM

echo "========================================"
echo "  SQDCP Tracker"
echo "========================================"
echo

require_command "$PYTHON_BIN"
require_command node
require_command npm

echo "[1/4] Preparing Python environment..."
cd "$BACKEND"
if [[ ! -d ".venv" ]]; then
  "$PYTHON_BIN" -m venv .venv
fi

source .venv/bin/activate

REQ_HASH="$(file_sha256 requirements.txt)"
REQ_MARKER=".venv/.requirements.sha256"

if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
  echo "  Skipped backend dependency install (SKIP_INSTALL=1)"
elif [[ ! -f "$REQ_MARKER" ]] || [[ "$(cat "$REQ_MARKER")" != "$REQ_HASH" ]]; then
  echo "  Installing backend dependencies..."
  python -m pip install --disable-pip-version-check --prefer-binary -r requirements.txt
  printf "%s\n" "$REQ_HASH" > "$REQ_MARKER"
else
  echo "  Backend dependencies are already installed"
fi
echo "  OK"

echo "[2/4] Starting backend (Flask)..."
python run.py &
BACKEND_PID=$!
echo "  OK - http://localhost:8000"

echo "[3/4] Checking frontend deps..."
cd "$FRONTEND"

FRONTEND_HASH_FILES=("package.json")
if [[ -f "package-lock.json" ]]; then
  FRONTEND_HASH_FILES+=("package-lock.json")
fi
FRONTEND_HASH="$(files_sha256 "${FRONTEND_HASH_FILES[@]}")"
FRONTEND_MARKER="node_modules/.frontend-deps.sha256"

if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
  echo "  Skipped frontend dependency install (SKIP_INSTALL=1)"
elif [[ ! -d "node_modules" ]] || [[ ! -f "$FRONTEND_MARKER" ]] || [[ "$(cat "$FRONTEND_MARKER")" != "$FRONTEND_HASH" ]]; then
  echo "  Installing frontend dependencies..."
  npm install --no-audit --no-fund --prefer-offline
  printf "%s\n" "$FRONTEND_HASH" > "$FRONTEND_MARKER"
else
  echo "  Frontend dependencies are already installed"
fi
echo "  OK"

echo "[4/4] Starting frontend (Vite)..."
npm run dev &
FRONTEND_PID=$!
echo "  OK - http://localhost:5173"

echo
echo "========================================"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo
echo "  Press Ctrl+C to stop both servers."
echo "========================================"
echo

wait "$BACKEND_PID" "$FRONTEND_PID"
