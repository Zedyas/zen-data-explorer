# Zen Data Explorer

Zen Data Explorer is a local-first web app for exploratory data analysis and light data wrangling.

It is built to reduce repetitive notebook loops by giving you:
- a full `Overview` table for quick inspection,
- a per-dataset `Notebook` for saved investigation cells,
- optional SQL/Python-friendly views when needed.

No cloud service. No multi-user complexity. Runs on your machine.

## Features

- CSV upload into DuckDB-backed local session
- Multiple dataset instances in one local session
- Fast table browsing with server-side filtering, sorting, and keyset pagination
- Rich column headers (type, null %, unique count, distribution preview)
- Column profile popover (stats + distributions; full profile up to 1M rows, sampled above that with sample-labeled stats)
- Notebook cells:
  - Table cells (filter, group, aggregate, having, sort, limit)
  - SQL cells
  - Python text cells (display/edit)
  - Compare cells (left/right dataset builders with independent modifiers)
  - Lab cells (scaffold on `master`; full Lab implementation is parked in branch `5-lab-feature-full`)
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

Column profiling runs against the profiled dataset context (not just the visible paginated rows).

- For datasets with `<= 1,000,000` rows, profiling uses full rows.
- For datasets with `> 1,000,000` rows, profiling samples `1,000,000` rows.
- When sampled, profiler labels values with `(sample)` and shows sampled-row messaging.

### Base metrics (all column types)

- `Non-null vals`: `COUNT(column)`
- `Unique Vals`: `COUNT(DISTINCT column)`
- `Null count`: count and share over profiled rows (`COUNT(*) - COUNT(column)`)
- `Coverage`: `(non_null_count / profiled_rows) * 100`
- `Cardinality`: `(unique_vals / non_null_vals) * 100`
  - `low`: `< 20%`
  - `medium`: `>= 20% and < 80%`
  - `high`: `>= 80%`
- `Rows in dataset` / `Rows sampled`: number of rows used for profile metrics
- `Key hint` (heuristic, not a DB constraint):
  - `strong`: all profiled rows are non-null and unique
  - `possible`: no nulls and cardinality `>= 98%`
  - `unlikely`: otherwise
- `Dominant`: most frequent non-null value + share
  - share formula: `(dominant_value_count / non_null_count) * 100`
  - if the highest frequency is tied across multiple values, dominant is shown as `none`

### Numeric (`integer`, `float`)

- Distribution stats: `min`, `max`, `mean`, `median`, `stddev`, `p25`, `p75`, `p95`, `p99`
- `Zero rate`: `% of non-null rows where value = 0`
- `Neg rate`: `% of non-null rows where value < 0`
- `Outlier rate`: `% of non-null rows outside IQR fences
  - lower fence: `p25 - 1.5 * IQR`
  - upper fence: `p75 + 1.5 * IQR`
  - `IQR = p75 - p25`
- Histogram: bucketed counts over profiled rows

### Date

- `Min` / `Max`: earliest/latest non-null date
- `Missing days`: days missing between min/max date span
  - `(date_diff(min, max) + 1) - distinct_date_count`
- `Largest gap`: largest day gap between consecutive observed dates
- Distribution by month histogram

### String

- `Min Len`, `Max Len`, `Median Len` over non-null values
- `Blank/WS count`: count and share over non-null rows where `TRIM(value)` is empty
- `Distinct patterns`: count of distinct normalized string shapes
  - normalization maps letters to `A` and digits to `9`
- `Pattern classes`: top classes by share (`uuid`, `email`, `numeric-only`, `code-like`, `free-text`)
- `Top values`: highest-frequency values and shares
- `Top 10 coverage`: `% of non-null values covered by the top 10 most frequent categories`
- `Tail profile`: compact concentration indicator derived from top-10 coverage
  - `low`: top-10 coverage `>= 70%`
  - `medium`: top-10 coverage `>= 40% and < 70%`
  - `high`: top-10 coverage `< 40%`

Why tail profile exists:

- It gives a compact summary of how concentrated vs diffuse a categorical distribution is.
- It helps analysts decide whether top-k is sufficient or whether grouping/bucketing is needed.

### Boolean

- `True %`, `False %` over profiled rows, plus `Null` card (null count + null share)

## Notes

- This project is intentionally single-user and local-only.
- Notebook cells are designed to keep analysis reproducible without forcing code-first workflows.
