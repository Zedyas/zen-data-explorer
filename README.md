# Zen Data Explorer

Local-first exploratory data analysis tool with FastAPI + DuckDB backend and React frontend.

## Runtime Requirements
- Python `3.12.x` (minimum supported: `3.11`)
- Node.js 20+
- npm 10+

## Quick Start
```bash
./run.sh
```

This starts:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## Manual Start
```bash
# Backend
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

## Tests (minimal backend regression suite)
```bash
cd backend
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

## Project Docs
- Plan: `/Users/zuyu/sandbox/zen-data-explorer/plans/PLAN.md`
- Progress: `/Users/zuyu/sandbox/zen-data-explorer/plans/PROGRESS.md`
- Architecture: `/Users/zuyu/sandbox/zen-data-explorer/plans/ARCHITECTURE.md`
- Agent notes: `/Users/zuyu/sandbox/zen-data-explorer/AGENTS.md`
