from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import sys

import duckdb


from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app as app_module

client = TestClient(app_module.app)
DATA_FILE = BACKEND_DIR / "data" / "sales_sample.csv"


def _dataset_id() -> str:
    return app_module.engine.load_file(str(DATA_FILE), "sales_sample.csv")


def test_upload_rejects_unsafe_filename() -> None:
    csv_bytes = b"a,b\n1,2\n"
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("../evil.csv", csv_bytes, "text/csv")},
    )
    assert resp.status_code == 400
    assert "Invalid filename" in resp.text


def test_upload_accepts_parquet(tmp_path: Path) -> None:
    parquet_path = tmp_path / "tiny.parquet"
    conn = duckdb.connect()
    conn.execute(
        "COPY (SELECT 1 AS id, 'a' AS label UNION ALL SELECT 2 AS id, 'b' AS label) TO ? (FORMAT PARQUET)",
        [str(parquet_path)],
    )
    conn.close()

    resp = client.post(
        "/api/datasets/upload",
        files={
            "file": (
                "tiny.parquet",
                parquet_path.read_bytes(),
                "application/octet-stream",
            )
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["name"] == "tiny.parquet"
    assert payload["rowCount"] == 2


def test_discover_and_import_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "tiny.csv"
    csv_path.write_text("id,name\n1,a\n2,b\n", encoding="utf-8")

    discover_resp = client.post(
        "/api/datasets/discover",
        files={"file": ("tiny.csv", csv_path.read_bytes(), "text/csv")},
    )
    assert discover_resp.status_code == 200
    discover_payload = discover_resp.json()
    assert discover_payload["format"] == "csv"
    assert discover_payload["requiresSelection"] is False
    assert len(discover_payload["entities"]) == 1

    import_resp = client.post(
        "/api/datasets/import",
        json={
            "importId": discover_payload["importId"],
            "importMode": "all",
        },
    )
    assert import_resp.status_code == 200
    import_payload = import_resp.json()
    assert len(import_payload["datasets"]) == 1
    assert import_payload["datasets"][0]["name"] == "tiny.csv"
    assert import_payload["datasets"][0]["rowCount"] == 2


def test_discover_and_import_parquet(tmp_path: Path) -> None:
    parquet_path = tmp_path / "batch.parquet"
    conn = duckdb.connect()
    conn.execute(
        "COPY (SELECT 101 AS id, 'x' AS label UNION ALL SELECT 102 AS id, 'y' AS label) TO ? (FORMAT PARQUET)",
        [str(parquet_path)],
    )
    conn.close()

    discover_resp = client.post(
        "/api/datasets/discover",
        files={
            "file": (
                "batch.parquet",
                parquet_path.read_bytes(),
                "application/octet-stream",
            )
        },
    )
    assert discover_resp.status_code == 200
    discover_payload = discover_resp.json()
    assert discover_payload["format"] == "parquet"
    assert discover_payload["requiresSelection"] is False

    import_resp = client.post(
        "/api/datasets/import",
        json={
            "importId": discover_payload["importId"],
            "importMode": "all",
        },
    )
    assert import_resp.status_code == 200
    import_payload = import_resp.json()
    assert len(import_payload["datasets"]) == 1
    assert import_payload["datasets"][0]["name"] == "batch.parquet"
    assert import_payload["datasets"][0]["rowCount"] == 2


def test_discover_and_import_sqlite_selected_table(tmp_path: Path) -> None:
    sqlite_path = tmp_path / "mini.sqlite"
    conn = sqlite3.connect(sqlite_path)
    conn.execute("CREATE TABLE members(id INTEGER, name TEXT)")
    conn.execute("CREATE TABLE claims(id INTEGER, amount REAL)")
    conn.executemany(
        "INSERT INTO members(id, name) VALUES (?, ?)",
        [(1, "a"), (2, "b"), (3, "c")],
    )
    conn.executemany(
        "INSERT INTO claims(id, amount) VALUES (?, ?)",
        [(10, 100.0), (11, 250.5)],
    )
    conn.commit()
    conn.close()

    discover_resp = client.post(
        "/api/datasets/discover",
        files={
            "file": (
                "mini.sqlite",
                sqlite_path.read_bytes(),
                "application/octet-stream",
            )
        },
    )
    assert discover_resp.status_code == 200
    discover_payload = discover_resp.json()
    assert discover_payload["format"] == "sqlite"
    assert discover_payload["requiresSelection"] is True
    names = {e["name"] for e in discover_payload["entities"]}
    assert {"members", "claims"}.issubset(names)

    import_resp = client.post(
        "/api/datasets/import",
        json={
            "importId": discover_payload["importId"],
            "importMode": "selected",
            "selectedEntities": ["members"],
            "datasetNameMode": "filename_entity",
        },
    )
    assert import_resp.status_code == 200
    import_payload = import_resp.json()
    assert len(import_payload["datasets"]) == 1
    dataset = import_payload["datasets"][0]
    assert dataset["name"] == "mini_members"
    assert dataset["rowCount"] == 3


def test_page_rejects_invalid_sort_column() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/page",
        params={"sort_column": "missing_column", "sort_direction": "asc"},
    )
    assert resp.status_code == 400
    assert "Invalid sort column" in resp.text


def test_page_rejects_unsupported_operator() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/page",
        params={
            "filters": json.dumps(
                [{"column": "region", "operator": "bogus", "value": "West"}]
            )
        },
    )
    assert resp.status_code == 400
    assert "Unsupported operator" in resp.text


def test_page_rejects_string_comparison_operators() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/page",
        params={
            "filters": json.dumps(
                [{"column": "region", "operator": ">", "value": "West"}]
            )
        },
    )
    assert resp.status_code == 400
    assert "Unsupported operator" in resp.text


def test_page_rejects_invalid_filter_value_type() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/page",
        params={
            "filters": json.dumps(
                [{"column": "quantity", "operator": ">", "value": "abc"}]
            )
        },
    )
    assert resp.status_code == 400
    assert "Invalid integer value" in resp.text


def test_page_accepts_is_not_null_filter() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/page",
        params={
            "filters": json.dumps(
                [{"column": "region", "operator": "is_not_null", "value": ""}]
            )
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert "rows" in payload


def test_page_accepts_ends_with_filter() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/page",
        params={
            "filters": json.dumps(
                [{"column": "region", "operator": "ends_with", "value": "st"}]
            )
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert all(str(row["region"]).lower().endswith("st") for row in payload["rows"])


def test_schema_includes_column_sparklines() -> None:
    dataset_id = _dataset_id()
    resp = client.get(f"/api/datasets/{dataset_id}/schema")
    assert resp.status_code == 200
    payload = resp.json()
    assert "columns" in payload
    assert len(payload["columns"]) > 0
    for col in payload["columns"]:
        assert "sparkline" in col
        assert isinstance(col["sparkline"], list)
        assert len(col["sparkline"]) <= 8


def test_profile_string_includes_sentinel_and_outlier_metrics(tmp_path: Path) -> None:
    csv_path = tmp_path / "sentinel_profile.csv"
    csv_path.write_text(
        "value\n"
        "NA\n"
        "n/a\n"
        "NULL\n"
        "-\n"
        '" "\n'
        '""\n'
        "ok\n"
        "THIS_IS_A_VERY_LONG_STRING_VALUE_FOR_OUTLIER_CHECKING_123456789\n",
        encoding="utf-8",
    )
    dataset_id = app_module.engine.load_file(str(csv_path), "sentinel_profile.csv")

    resp = client.get(f"/api/datasets/{dataset_id}/profile/value")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["type"] == "string"
    assert "sentinelCount" in payload
    assert payload["sentinelCount"] >= 4
    assert "sentinelTokens" in payload
    assert isinstance(payload["sentinelTokens"], list)
    assert "stats" in payload
    assert "outlierLengthCount" in payload["stats"]


def test_profile_numeric_includes_phase1_metrics() -> None:
    dataset_id = _dataset_id()
    resp = client.get(f"/api/datasets/{dataset_id}/profile/amount")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["type"] in {"integer", "float"}
    stats = payload.get("stats") or {}
    for key in [
        "sum",
        "iqr",
        "distinctCount",
        "uniquenessRatePct",
        "duplicateRatePct",
        "lowTailRatePct",
        "highTailRatePct",
    ]:
        assert key in stats


def test_page_rejects_non_array_filters_payload() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/page",
        params={
            "filters": json.dumps(
                {"column": "region", "operator": "=", "value": "West"}
            )
        },
    )
    assert resp.status_code == 400
    assert "Filters must be a JSON array" in resp.text


def test_export_rejects_non_object_filters() -> None:
    dataset_id = _dataset_id()
    resp = client.get(
        f"/api/datasets/{dataset_id}/export",
        params={"filters": json.dumps(["bad-filter"])},
    )
    assert resp.status_code == 400
    assert "Each filter must be an object" in resp.text


def test_query_non_select_statement_returns_success() -> None:
    dataset_id = _dataset_id()
    resp = client.post(
        f"/api/datasets/{dataset_id}/query",
        json={"sql": "CREATE OR REPLACE TEMP TABLE tmp_nonselect AS SELECT 1 AS n"},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert isinstance(payload["columns"], list)
    assert isinstance(payload["rows"], list)
    assert payload["rowCount"] == len(payload["rows"])


def test_table_query_returns_rows_and_generated_code() -> None:
    dataset_id = _dataset_id()
    resp = client.post(
        f"/api/datasets/{dataset_id}/table-query",
        json={
            "filters": [{"column": "region", "operator": "=", "value": "West"}],
            "groupBy": ["region"],
            "aggregations": [{"op": "sum", "column": "amount", "as": "amount_total"}],
            "sort": [{"column": "amount_total", "direction": "desc"}],
            "limit": 50,
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert "generatedSql" in payload
    assert "generatedPython" in payload
    assert isinstance(payload["rows"], list)


def test_table_query_rejects_invalid_aggregation_column() -> None:
    dataset_id = _dataset_id()
    resp = client.post(
        f"/api/datasets/{dataset_id}/table-query",
        json={
            "aggregations": [{"op": "sum", "column": "missing_col"}],
        },
    )
    assert resp.status_code == 400
    assert "Invalid aggregation column" in resp.text


def test_table_query_supports_having() -> None:
    dataset_id = _dataset_id()
    resp = client.post(
        f"/api/datasets/{dataset_id}/table-query",
        json={
            "groupBy": ["region"],
            "aggregations": [{"op": "sum", "column": "amount", "as": "amount_total"}],
            "having": [{"metric": "amount_total", "operator": ">", "value": 1000}],
            "sort": [{"column": "amount_total", "direction": "desc"}],
            "limit": 50,
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert "HAVING" in payload["generatedSql"]
    assert isinstance(payload["rows"], list)


def test_table_query_rejects_having_without_aggregations() -> None:
    dataset_id = _dataset_id()
    resp = client.post(
        f"/api/datasets/{dataset_id}/table-query",
        json={
            "groupBy": ["region"],
            "having": [{"metric": "amount_total", "operator": ">", "value": 1000}],
        },
    )
    assert resp.status_code == 400
    assert "HAVING requires at least one aggregation" in resp.text
