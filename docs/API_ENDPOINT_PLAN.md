# API Endpoint Plan

This document tracks endpoint naming and intent across current + upcoming phases.

## Current Endpoints

- `POST /api/datasets/upload`
- `POST /api/datasets/discover`
- `POST /api/datasets/import`
- `GET /api/datasets/{dataset_id}/schema`
- `GET /api/datasets/{dataset_id}/page`
- `GET /api/datasets/{dataset_id}/profile/{column}`
- `POST /api/datasets/{dataset_id}/query`
- `POST /api/datasets/{dataset_id}/table-query`
- `GET /api/datasets/{dataset_id}/export`

## Naming Conventions

- Keep names simple and resource-focused.
- Avoid hyphenated connection type names in payloads.
- Use `discover` for file introspection and `import` for materialization.

## File-Format Flow (Phase 2)

1. `POST /api/datasets/discover`
   - Upload file once
   - Returns `importId`, `format`, and available entities (sheets/tables/dataset)
2. `POST /api/datasets/import`
   - Body includes `importId` and selected entities
   - Creates one or more datasets

### Import body fields

- `importId`
- `selectedEntities` (for Excel/SQLite)
- `importMode`: `selected` | `all`
- `datasetNameMode`: `filename_entity` | `entity_only`

## Planned Endpoints (Upcoming Phases)

### Phase 3 (Code Cell)

- `POST /api/datasets/{dataset_id}/code`

### Phase 4 (Filter UX)

- `GET /api/datasets/{dataset_id}/columns/{column}/values`

### Phase 4.5 (Variables)

- `GET /api/variables`
- `PUT /api/variables/{name}`
- `GET /api/variables/{name}`
- `DELETE /api/variables/{name}`

### Phase 5 (Compare set ops)

- `POST /api/compare`

### Phase 6+ (Connections)

- `POST /api/connections/test`
- `POST /api/datasets/from-query`

## Connection Type IDs (payload enums)

- `mysql`
- `postgresql`
- `sqlite`
- `snowflake`
- `databricks`
- `teradata`
- `oracle`
