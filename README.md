# Zen Data Explorer

Zen Data Explorer is a local-first web app for exploratory data analysis and light data wrangling.

It is built to reduce repetitive notebook loops by giving you:
- a full `Overview` table for quick inspection,
- `Dynamic Views` with no-code table cells,
- optional SQL/Python-friendly views when needed.

No cloud service. No multi-user complexity. Runs on your machine.

## Features

- CSV upload into DuckDB-backed local session
- Fast table browsing with server-side filtering, sorting, and keyset pagination
- Rich column headers (type, null %, unique count, distribution preview)
- Column profile popover (stats + distributions)
- Dynamic cells:
  - Table cells (filter, group, aggregate, sort, limit)
  - SQL cells
  - Python text cells (display/edit)
  - Compare cells (side-by-side result comparison)
- CSV export of filtered/sorted results

## Tech Stack

- Backend: FastAPI + DuckDB
- Frontend: React + TypeScript + Vite + Zustand + TanStack Table/Query

## Requirements

- Python `3.12.x` (minimum supported: `3.11`)
- Node.js 20+
- npm 10+

## Quick Start

```bash
bash run.sh
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

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## Run Tests

```bash
cd backend
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

## Notes

- This project is intentionally single-user and local-only.
- Dynamic cells are designed to keep analysis reproducible without forcing code-first workflows.
