"""FastAPI app: all routes + static serving + CORS."""

from __future__ import annotations

import json
from uuid import uuid4
from pathlib import Path
from typing import Literal

import duckdb
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from engine import DuckDBEngine

app = FastAPI(title="Zen Data Explorer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = DuckDBEngine()

# ── Data directory for uploaded files ──
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

SUPPORTED_UPLOAD_SUFFIX: dict[str, str] = {
    ".csv": "csv",
    ".parquet": "parquet",
    ".xlsx": "excel",
    ".sqlite": "sqlite",
    ".db": "sqlite",
}

IMPORT_SESSIONS: dict[str, dict] = {}


def _parse_filters(filters: str | None) -> list[dict]:
    if not filters:
        return []

    try:
        parsed = json.loads(filters)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid filters JSON")

    if not isinstance(parsed, list):
        raise HTTPException(400, "Filters must be a JSON array")
    if not all(isinstance(item, dict) for item in parsed):
        raise HTTPException(400, "Each filter must be an object")

    return parsed


async def _store_upload_file(file: UploadFile) -> tuple[str, str, str, Path]:
    if not file.filename:
        raise HTTPException(400, "No file provided")

    original_name = file.filename
    safe_name = Path(original_name).name
    if safe_name != original_name or safe_name in {"", ".", ".."}:
        raise HTTPException(400, "Invalid filename")

    suffix = Path(safe_name).suffix.lower()
    file_format = SUPPORTED_UPLOAD_SUFFIX.get(suffix)
    if not file_format:
        raise HTTPException(400, f"Unsupported file format: {suffix}")

    save_path = DATA_DIR / f"{uuid4().hex}_{safe_name}"
    content = await file.read()
    save_path.write_bytes(content)
    return safe_name, suffix, file_format, save_path


# ── Upload ──


@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)):
    safe_name, _, file_format, save_path = await _store_upload_file(file)

    if file_format not in {"csv", "parquet"}:
        raise HTTPException(
            400,
            "Use /api/datasets/discover and /api/datasets/import for multi-entity formats",
        )

    try:
        dataset_id = engine.load_file(
            str(save_path), safe_name, file_format=file_format
        )
        schema = engine.get_schema(dataset_id)
    except (ValueError, duckdb.Error) as e:
        raise HTTPException(400, f"Failed to load file: {e}")

    return {
        "id": dataset_id,
        "name": safe_name,
        "rowCount": schema["rowCount"],
        "columns": schema["columns"],
    }


class ImportRequest(BaseModel):
    importId: str
    selectedEntities: list[str] = Field(default_factory=list)
    importMode: Literal["selected", "all"] = "selected"
    datasetNameMode: Literal["filename_entity", "entity_only"] = "filename_entity"


@app.post("/api/datasets/discover")
async def discover_dataset(file: UploadFile = File(...)):
    safe_name, _, file_format, save_path = await _store_upload_file(file)

    try:
        entities = engine.discover_file_entities(str(save_path), file_format)
    except (ValueError, duckdb.Error) as e:
        raise HTTPException(400, f"Failed to discover file entities: {e}")

    import_id = uuid4().hex
    IMPORT_SESSIONS[import_id] = {
        "path": str(save_path),
        "name": safe_name,
        "format": file_format,
        "entities": [str(e["name"]) for e in entities],
    }

    return {
        "importId": import_id,
        "name": safe_name,
        "format": file_format,
        "entities": entities,
        "requiresSelection": file_format in {"excel", "sqlite"},
    }


@app.post("/api/datasets/import")
async def import_dataset(body: ImportRequest):
    session = IMPORT_SESSIONS.get(body.importId)
    if not session:
        raise HTTPException(404, "Import session not found")

    file_path = str(session["path"])
    original_name = str(session["name"])
    file_format = str(session["format"])
    available_entities = [str(v) for v in session.get("entities", [])]

    if file_format in {"csv", "parquet"}:
        selected_entities = ["data"]
    else:
        if body.importMode == "all":
            selected_entities = available_entities
        else:
            selected_entities = body.selectedEntities

        if not selected_entities:
            raise HTTPException(400, "No entities selected for import")
        unknown = [e for e in selected_entities if e not in available_entities]
        if unknown:
            raise HTTPException(400, f"Unknown entities selected: {', '.join(unknown)}")

    base_name = Path(original_name).stem
    imported: list[dict] = []

    try:
        for entity in selected_entities:
            if file_format in {"csv", "parquet"}:
                dataset_name = original_name
                dataset_id = engine.load_file(
                    file_path,
                    dataset_name,
                    file_format=file_format,
                )
            else:
                if body.datasetNameMode == "entity_only":
                    dataset_name = entity
                else:
                    dataset_name = f"{base_name}_{entity}"
                dataset_id = engine.load_file(
                    file_path,
                    dataset_name,
                    file_format=file_format,
                    entity=entity,
                )

            schema = engine.get_schema(dataset_id)
            imported.append(
                {
                    "id": dataset_id,
                    "name": dataset_name,
                    "rowCount": schema["rowCount"],
                    "columns": schema["columns"],
                    "sourceType": "file",
                }
            )
    except (ValueError, duckdb.Error) as e:
        raise HTTPException(400, f"Failed to import dataset entities: {e}")

    IMPORT_SESSIONS.pop(body.importId, None)
    return {
        "importId": body.importId,
        "datasets": imported,
    }


# ── Schema ──


@app.get("/api/datasets/{dataset_id}/schema")
async def get_schema(dataset_id: str):
    try:
        return engine.get_schema(dataset_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except duckdb.Error as e:
        raise HTTPException(400, f"Schema query failed: {e}")


# ── Page ──


@app.get("/api/datasets/{dataset_id}/page")
async def get_page(
    dataset_id: str,
    page: int = Query(0, ge=0),
    page_size: int = Query(200, ge=1, le=10000),
    sort_column: str | None = Query(None),
    sort_direction: str | None = Query(None),
    filters: str | None = Query(None),
    cursor: str | None = Query(None),
):
    parsed_filters = _parse_filters(filters)

    try:
        return engine.get_page(
            dataset_id=dataset_id,
            page=page,
            page_size=page_size,
            sort_column=sort_column,
            sort_direction=sort_direction,
            filters=parsed_filters,
            cursor=cursor,
        )
    except ValueError as e:
        if str(e).startswith("Dataset not found"):
            raise HTTPException(404, str(e))
        raise HTTPException(400, str(e))
    except duckdb.Error as e:
        raise HTTPException(400, f"Invalid query input: {e}")


# ── Profile ──


@app.get("/api/datasets/{dataset_id}/profile/{column:path}")
async def profile_column(
    dataset_id: str,
    column: str,
):
    try:
        return engine.profile_column(dataset_id, column)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(404, str(e))
        raise HTTPException(400, str(e))
    except duckdb.Error as e:
        raise HTTPException(400, f"Profile query failed: {e}")


# ── SQL Query ──


class QueryRequest(BaseModel):
    sql: str


class TableQueryRequest(BaseModel):
    filters: list[dict] = Field(default_factory=list)
    groupBy: list[str] = Field(default_factory=list)
    aggregations: list[dict] = Field(default_factory=list)
    having: list[dict] = Field(default_factory=list)
    sort: list[dict] = Field(default_factory=list)
    limit: int = 200


@app.post("/api/datasets/{dataset_id}/query")
async def run_query(dataset_id: str, body: QueryRequest):
    if not body.sql.strip():
        raise HTTPException(400, "SQL query is empty")
    try:
        return engine.run_query(dataset_id, body.sql)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(404, str(e))
        raise HTTPException(400, str(e))
    except duckdb.Error as e:
        raise HTTPException(400, f"Query failed: {e}")


@app.post("/api/datasets/{dataset_id}/table-query")
async def run_table_query(dataset_id: str, body: TableQueryRequest):
    try:
        payload = body.model_dump()
        return engine.run_table_query(dataset_id, payload)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(404, str(e))
        raise HTTPException(400, str(e))
    except duckdb.Error as e:
        raise HTTPException(400, f"Table query failed: {e}")


# ── Export ──


@app.get("/api/datasets/{dataset_id}/export")
async def export_dataset(
    dataset_id: str,
    sort_column: str | None = Query(None),
    sort_direction: str | None = Query(None),
    filters: str | None = Query(None),
):
    parsed_filters = _parse_filters(filters)

    try:
        csv_bytes = engine.export_csv(
            dataset_id=dataset_id,
            sort_column=sort_column,
            sort_direction=sort_direction,
            filters=parsed_filters,
        )
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(404, str(e))
        raise HTTPException(400, str(e))
    except duckdb.Error as e:
        raise HTTPException(400, f"Export failed: {e}")

    # Get dataset name for filename
    table = engine.datasets.get(dataset_id, "export")
    filename = f"{table}.csv"

    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Serve frontend static files in production ──

DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
