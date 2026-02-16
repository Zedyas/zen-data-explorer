#!/bin/bash
# Start both backend and frontend dev servers
# Stop with: Ctrl+C

set -e

trap 'kill 0; exit' SIGINT SIGTERM

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

if command -v python3.12 >/dev/null 2>&1; then
  PYTHON_BIN="python3.12"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "Error: Python 3 is not installed or not on PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: 'npm' is not installed or not on PATH."
  exit 1
fi

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "Creating backend virtual environment..."
  "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
fi

BACKEND_PYTHON="$BACKEND_DIR/.venv/bin/python"

if ! "$BACKEND_PYTHON" -m pip --version >/dev/null 2>&1; then
  echo "Bootstrapping pip in backend virtual environment..."
  "$BACKEND_PYTHON" -m ensurepip --upgrade
fi

if ! "$BACKEND_PYTHON" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  "$BACKEND_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt"
fi

echo "Starting Zen Data Explorer..."
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  Press Ctrl+C to stop both"
echo ""

cd "$BACKEND_DIR" && "$BACKEND_PYTHON" -m uvicorn app:app --reload --port 8000 &
cd "$FRONTEND_DIR" && npm run dev &

wait
