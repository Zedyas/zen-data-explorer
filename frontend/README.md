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

## Current Phase 1 Features
- CSV upload landing flow (via backend API)
- Dataset workspace with table, filter toolbar, sidebar, top/status bars
- Server-side sorting and filtering
- Keyset cursor pagination
- Virtualized table rows
- Column visibility toggles
- Column resize handles
- Column header metadata (type badge, null %, sparkline)
