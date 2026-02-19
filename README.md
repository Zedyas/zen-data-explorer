# Zen Data Explorer

Zen Data Explorer is a local-first web app for exploratory data analysis and light data wrangling.

It is built to reduce repetitive notebook loops by giving you:
- a full `Overview` table for quick inspection,
- a per-dataset `Notebook` for saved investigation cells,
- lightweight compare workflows across datasets.

No cloud service. No multi-user complexity. Runs on your machine.

## Features

- Multi-format upload into DuckDB-backed local session (`.csv`, `.parquet`, `.xlsx`, `.sqlite`, `.db`)
- Multiple dataset instances in one local session
- Entity discovery + import selection for Excel sheets and SQLite tables
- Fast table browsing with server-side filtering, sorting, and keyset pagination
- Filter UX supports `in` / `not_in` operations with value suggestions
- Rich column headers (type, null %, unique count, distribution preview)
- Column profile popover (stats + distributions; full profile up to 1M rows, sampled above that with sample-labeled stats)
- Notebook cells:
  - Table cells (filter, group, aggregate, having, sort, limit)
  - Compare cells (left/right dataset builders with independent modifiers)
  - Code cells (SQL + Python execution)
- CSV export of filtered/sorted results

## Tech Stack

- Backend: FastAPI + DuckDB
- Frontend: React + TypeScript + Vite + Zustand + TanStack Table/Query

## Requirements

- Python `3.12.x` (minimum supported: `3.11`)
- Python package workflow: `pip` + virtualenv (`venv`), not `uv`
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

## Column Profiler Metrics

Canonical metric definitions now live in:

- `docs/PROFILING_METRICS.md`

This includes formulas and definitions for:

- universal metrics (`coverage`, `cardinality`, `keyHint`, dominant value)
- numeric metrics (`sum`, `IQR`, percentile/tail rates, outlier logic)
- string metrics (sentinels, blank/whitespace, pattern classes, length outliers)
- date metrics (missing periods, largest gap)
- boolean split metrics

## API Docs

- Endpoint naming and phase rollout: `docs/API_ENDPOINT_PLAN.md`
- Profiling metric glossary/source-of-truth: `docs/PROFILING_METRICS.md`
- Ongoing product idea log: `docs/FUTURE_IDEAS.md`

## Scalability Roadmap

- Post-core-feature phase targets scaling to **100s of millions of rows**.
- Planned optimization focus is tracked in `docs/FUTURE_IDEAS.md` (Scalability section).

## Notes

- This project is intentionally single-user and local-only.
- Notebook cells are designed to keep analysis reproducible without forcing code-first workflows.
- Planned Lab follow-up (when reintegrated): add a Python code reveal panel similar to table-cell generated code.
