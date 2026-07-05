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

trap cleanup EXIT INT TERM

echo "========================================"
echo "  SQDCP Tracker"
echo "========================================"
echo

echo "[1/4] Preparing Python environment..."
cd "$BACKEND"
if [[ ! -d ".venv" ]]; then
  "$PYTHON_BIN" -m venv .venv
fi
source .venv/bin/activate
python -m pip install -r requirements.txt -q
echo "  OK"

echo "[2/4] Starting backend (Flask)..."
python run.py &
BACKEND_PID=$!
echo "  OK - http://localhost:8000"

echo "[3/4] Checking frontend deps..."
cd "$FRONTEND"
if [[ ! -d "node_modules" ]]; then
  npm install --silent
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
