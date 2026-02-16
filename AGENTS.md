# Zen Data Explorer — Agent Notes

## Runtime
- Python target: `3.12.x` (minimum supported: `3.11`).
- Use standard `pip` + virtualenv for backend commands.
- Root `.python-version` is pinned to `3.12`.

## Dev Commands
- Backend: `cd backend && source .venv/bin/activate && python -m uvicorn app:app --reload --port 8000`
- Frontend: `cd frontend && npm run dev`
- Full stack: `./run.sh`

## Backend Safety/Validation Rules
- Never write uploads using raw client filenames.
- Reject unsafe filenames (path traversal / path separators).
- Validate sort/filter columns against dataset schema before SQL.
- Reject unsupported operators with `400`.
- Coerce filter values by column type and return `400` for invalid values.
- Return `404` for unknown dataset IDs.

## Pagination
- API uses keyset cursor pagination via `cursor` query param.
- Response includes `nextCursor` and `prevCursor`.
- Frontend tracks cursor history for previous-page navigation.

## Phase 1 Scope (must stay implemented)
- Server-side filtering + sorting.
- Keyset cursor pagination.
- Column visibility toggle UI.
- Column resize handles in table header.
- Column header metadata: name, type badge, null%, sparkline.

## Minimal Regression Tests
- Unsafe upload filename rejection.
- Invalid sort/filter input returns `400`.
- Invalid filter value coercion returns `400`.
