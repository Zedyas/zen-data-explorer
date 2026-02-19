# Zen Data Explorer Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 frontend for the local-first data explorer.

## Requirements
- Node.js 20+
- npm 10+

## Install
```bash
cd frontend
npm install
```

## Development
Run backend first on `http://localhost:8000`, then:

```bash
cd frontend
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to backend.

## Build
```bash
cd frontend
npm run build
```

Artifacts are generated in `frontend/dist/` and are served by FastAPI in production.

## Current Features (through Phase 3)
- Multi-format upload and import flow (`.csv`, `.parquet`, `.xlsx`, `.sqlite`, `.db`)
- Discover/import selection dialogs for Excel sheets and SQLite tables
- Dataset workspace with table, filter toolbar, sidebar, top/status bars
- Server-side sorting and filtering
- Keyset cursor pagination
- Virtualized table rows
- Column visibility toggles
- Column resize handles
- Column header metadata (type badge, null %, sparkline)
- Expanded column profile metrics (sentinels, outlier lengths, numeric sum/IQR/tail rates)
- Unified Code Cell (`SQL`/`Python`) in Notebook
- Backend code endpoint: `POST /api/datasets/{dataset_id}/code`

## API Flow (Phase 2)
- `POST /api/datasets/discover` to inspect uploaded file entities
- `POST /api/datasets/import` to import selected entities as datasets
- `POST /api/datasets/upload` remains for direct single-entity imports (`csv`, `parquet`)
