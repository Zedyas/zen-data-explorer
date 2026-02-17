from __future__ import annotations

import json
from pathlib import Path
import sys

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
