"""DuckDB engine: load files, get schema, keyset pagination, sort/filter, profiling, SQL."""

from __future__ import annotations

import base64
import csv
import io
import json
import math
import threading
import time
import uuid
from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Any

import duckdb


class Engine(ABC):
    @abstractmethod
    def load_file(self, path: str, name: str) -> str:
        """Load a file into the engine. Returns dataset_id."""

    @abstractmethod
    def get_schema(self, dataset_id: str) -> dict:
        """Get column names, types, null counts, row count."""

    @abstractmethod
    def get_page(
        self,
        dataset_id: str,
        page: int,
        page_size: int,
        sort_column: str | None,
        sort_direction: str | None,
        filters: list[dict],
        cursor: str | None = None,
    ) -> dict:
        """Fetch a page of rows with keyset pagination, sort, and filters."""

    @abstractmethod
    def profile_column(
        self,
        dataset_id: str,
        column: str,
    ) -> dict:
        """Profile a single column (stats, histogram, top values)."""

    @abstractmethod
    def run_query(self, dataset_id: str, sql: str) -> dict:
        """Execute arbitrary SQL against a dataset. Returns columns + rows."""

    @abstractmethod
    def run_table_query(self, dataset_id: str, spec: dict[str, Any]) -> dict:
        """Execute structured table query spec and return rows + generated code."""

    @abstractmethod
    def export_csv(
        self,
        dataset_id: str,
        sort_column: str | None,
        sort_direction: str | None,
        filters: list[dict],
    ) -> bytes:
        """Export filtered/sorted data as CSV bytes."""

    @abstractmethod
    def close(self) -> None:
        pass


DUCKDB_TYPE_MAP: dict[str, str] = {
    "VARCHAR": "string",
    "BOOLEAN": "boolean",
    "BIGINT": "integer",
    "INTEGER": "integer",
    "SMALLINT": "integer",
    "TINYINT": "integer",
    "HUGEINT": "integer",
    "UBIGINT": "integer",
    "UINTEGER": "integer",
    "USMALLINT": "integer",
    "UTINYINT": "integer",
    "DOUBLE": "float",
    "FLOAT": "float",
    "DECIMAL": "float",
    "DATE": "date",
    "TIMESTAMP": "date",
    "TIMESTAMP WITH TIME ZONE": "date",
    "TIME": "string",
    "INTERVAL": "string",
    "BLOB": "string",
}

FILTER_OPERATORS_BY_TYPE: dict[str, set[str]] = {
    "string": {"=", "!=", "contains", "starts_with", "is_null", "is_not_null"},
    "integer": {"=", "!=", ">", "<", ">=", "<=", "is_null", "is_not_null"},
    "float": {"=", "!=", ">", "<", ">=", "<=", "is_null", "is_not_null"},
    "date": {"=", ">", "<", ">=", "<=", "is_null", "is_not_null"},
    "boolean": {"=", "!=", "is_null", "is_not_null"},
}

HAVING_OPERATORS = {"=", "!=", ">", "<", ">=", "<="}
PROFILE_FULL_ROW_LIMIT = 1_000_000


def map_duckdb_type(duckdb_type: str) -> str:
    """Map a DuckDB type string to our simplified type system."""
    upper = duckdb_type.upper()
    base = upper.split("(")[0].strip()
    return DUCKDB_TYPE_MAP.get(base, "string")


class DuckDBEngine(Engine):
    def __init__(self) -> None:
        self.conn = duckdb.connect()
        self.datasets: dict[str, str] = {}  # id -> table_name
        self._query_lock = threading.Lock()

    def load_file(self, path: str, name: str) -> str:
        dataset_id = uuid.uuid4().hex[:12]
        table_name = f"ds_{dataset_id}"
        table_sql = self._quote_ident(table_name)

        self.conn.execute(
            f"CREATE TABLE {table_sql} AS SELECT * FROM read_csv_auto(?, header=true, all_varchar=false)",
            [path],
        )
        self.datasets[dataset_id] = table_name
        return dataset_id

    def get_schema(self, dataset_id: str) -> dict:
        table = self._get_table(dataset_id)
        table_sql = self._quote_ident(table)

        cols_result = self.conn.execute(f"PRAGMA table_info({table_sql})").fetchall()
        row_count = self.conn.execute(f"SELECT COUNT(*) FROM {table_sql}").fetchone()[0]

        col_type_map: dict[str, str] = {
            col_name: map_duckdb_type(col_type)
            for _, col_name, col_type, *_ in cols_result
        }
        sparkline_map = self._build_schema_sparklines(
            table_sql, col_type_map, row_count
        )

        columns = []
        for _, col_name, col_type, *_ in cols_result:
            col_sql = self._quote_ident(col_name)
            stats = self.conn.execute(
                f"SELECT COUNT(*) FILTER (WHERE {col_sql} IS NULL), COUNT(DISTINCT {col_sql}) FROM {table_sql}"
            ).fetchone()

            columns.append(
                {
                    "name": col_name,
                    "type": map_duckdb_type(col_type),
                    "nullCount": stats[0],
                    "totalCount": row_count,
                    "uniqueCount": stats[1],
                    "sparkline": sparkline_map.get(col_name, []),
                }
            )

        return {"columns": columns, "rowCount": row_count}

    def _build_schema_sparklines(
        self,
        table_sql: str,
        col_type_map: dict[str, str],
        row_count: int,
    ) -> dict[str, list[int]]:
        if row_count <= 0 or not col_type_map:
            return {name: [] for name in col_type_map}

        sample_size = min(2000, row_count)
        if row_count > sample_size:
            sample_sql = f"SELECT * FROM {table_sql} USING SAMPLE {sample_size} ROWS"
        else:
            sample_sql = f"SELECT * FROM {table_sql} LIMIT {sample_size}"

        result = self.conn.execute(sample_sql)
        sample_rows = result.fetchall()
        if not sample_rows:
            return {name: [] for name in col_type_map}

        col_names = [desc[0] for desc in result.description]
        values_by_col: dict[str, list[Any]] = {name: [] for name in col_names}
        for row in sample_rows:
            for i, col_name in enumerate(col_names):
                values_by_col[col_name].append(row[i])

        sparklines: dict[str, list[int]] = {}
        for col_name, col_type in col_type_map.items():
            values = values_by_col.get(col_name, [])
            sparklines[col_name] = self._compute_sparkline(values, col_type)
        return sparklines

    def _compute_sparkline(
        self, values: list[Any], col_type: str, bins: int = 8
    ) -> list[int]:
        non_null = [v for v in values if v is not None]
        if not non_null:
            return []

        if col_type in {"integer", "float"}:
            numeric = [
                float(v)
                for v in non_null
                if isinstance(v, (int, float)) and not isinstance(v, bool)
            ]
            if not numeric:
                return []
            unique_vals = sorted(set(numeric))
            if len(unique_vals) <= bins:
                freq: dict[float, int] = {}
                for v in numeric:
                    freq[v] = freq.get(v, 0) + 1
                return [freq[v] for v in unique_vals]
            return self._bin_numeric(numeric, bins)

        if col_type == "date":
            dates: list[float] = []
            for v in non_null:
                if isinstance(v, datetime):
                    dates.append(v.timestamp())
                elif isinstance(v, date):
                    dates.append(datetime(v.year, v.month, v.day).timestamp())
                else:
                    try:
                        dates.append(datetime.fromisoformat(str(v)).timestamp())
                    except ValueError:
                        continue
            if not dates:
                return []
            unique_dates = sorted(set(dates))
            if len(unique_dates) <= bins:
                freq: dict[float, int] = {}
                for v in dates:
                    freq[v] = freq.get(v, 0) + 1
                return [freq[v] for v in unique_dates]
            return self._bin_numeric(dates, bins)

        if col_type == "boolean":
            true_count = sum(1 for v in non_null if bool(v))
            false_count = len(non_null) - true_count
            return [false_count, true_count]

        counts: dict[str, int] = {}
        for v in non_null:
            key = str(v)
            counts[key] = counts.get(key, 0) + 1
        if len(counts) <= bins:
            ordered_keys = sorted(counts.keys())
            return [counts[k] for k in ordered_keys]
        return sorted(counts.values(), reverse=True)[:bins]

    def _bin_numeric(self, values: list[float], bins: int) -> list[int]:
        if not values:
            return []
        lo = min(values)
        hi = max(values)
        if lo == hi:
            out = [0] * bins
            out[bins // 2] = len(values)
            return out

        width = (hi - lo) / bins
        out = [0] * bins
        for v in values:
            idx = int((v - lo) / width)
            if idx >= bins:
                idx = bins - 1
            if idx < 0:
                idx = 0
            out[idx] += 1
        return out

    def get_page(
        self,
        dataset_id: str,
        page: int,
        page_size: int,
        sort_column: str | None,
        sort_direction: str | None,
        filters: list[dict],
        cursor: str | None = None,
    ) -> dict:
        table = self._get_table(dataset_id)
        table_sql = self._quote_ident(table)
        col_meta = self._get_column_meta(table)

        if sort_column is not None and sort_column not in col_meta:
            raise ValueError(f"Invalid sort column: {sort_column}")

        sort_dir = "DESC" if sort_direction == "desc" else "ASC"

        filter_clauses: list[str] = []
        filter_params: list[Any] = []
        for f in filters:
            clause, p = self._build_filter_clause(f, col_meta)
            filter_clauses.append(clause)
            filter_params.extend(p)

        where_filter_sql = (
            f"WHERE {' AND '.join(filter_clauses)}" if filter_clauses else ""
        )
        filtered_rows = self.conn.execute(
            f"SELECT COUNT(*) FROM {table_sql} {where_filter_sql}",
            filter_params,
        ).fetchone()[0]
        total_rows = self.conn.execute(f"SELECT COUNT(*) FROM {table_sql}").fetchone()[
            0
        ]

        keyset_clause = ""
        keyset_params: list[Any] = []
        if cursor:
            keyset_clause, keyset_params = self._build_cursor_predicate(
                cursor=cursor,
                sort_column=sort_column,
                sort_dir=sort_dir,
                col_meta=col_meta,
            )

        query_clauses = list(filter_clauses)
        if keyset_clause:
            query_clauses.append(keyset_clause)
        where_query_sql = (
            f"WHERE {' AND '.join(query_clauses)}" if query_clauses else ""
        )

        if sort_column:
            sort_col_sql = self._quote_ident(sort_column)
            order_sql = (
                f"ORDER BY {sort_col_sql} {sort_dir} NULLS LAST, rowid {sort_dir}"
            )
        else:
            order_sql = "ORDER BY rowid ASC"

        sql = (
            f'SELECT *, rowid AS "__rowid__" FROM {table_sql} '
            f"{where_query_sql} {order_sql} LIMIT ?"
        )
        params = [*filter_params, *keyset_params, page_size + 1]
        result = self.conn.execute(sql, params)
        col_names = [desc[0] for desc in result.description]
        raw_rows = result.fetchall()

        has_more = len(raw_rows) > page_size
        page_rows = raw_rows[:page_size]

        rows: list[dict[str, Any]] = []
        rowid_idx = col_names.index("__rowid__")
        for row in page_rows:
            row_dict: dict[str, Any] = {}
            for idx, col in enumerate(col_names):
                if col == "__rowid__":
                    continue
                val = row[idx]
                if val is not None and not isinstance(val, (str, int, float, bool)):
                    val = str(val)
                row_dict[col] = val
            rows.append(row_dict)

        next_cursor: str | None = None
        if has_more and page_rows:
            last_row = page_rows[-1]
            cursor_payload: dict[str, Any] = {
                "v": 1,
                "s": sort_column,
                "d": sort_dir,
                "r": int(last_row[rowid_idx]),
            }
            if sort_column:
                sort_idx = col_names.index(sort_column)
                sort_val = last_row[sort_idx]
                cursor_payload["n"] = sort_val is None
                cursor_payload["k"] = self._serialize_cursor_value(sort_val)
            next_cursor = self._encode_cursor(cursor_payload)

        total_pages = max(1, (filtered_rows + page_size - 1) // page_size)
        return {
            "rows": rows,
            "columns": [c for c in col_names if c != "__rowid__"],
            "totalRows": total_rows,
            "filteredRows": filtered_rows,
            "page": page,
            "pageSize": page_size,
            "totalPages": total_pages,
            "nextCursor": next_cursor,
            "prevCursor": cursor,
        }

    def profile_column(
        self,
        dataset_id: str,
        column: str,
    ) -> dict:
        table = self._get_table(dataset_id)
        table_sql = self._quote_ident(table)
        col_meta = self._get_column_meta(table)

        if column not in col_meta:
            raise ValueError(f"Column not found: {column}")

        col_sql = self._quote_ident(column)
        app_type = col_meta[column]["app_type"]
        total_rows = self.conn.execute(f"SELECT COUNT(*) FROM {table_sql}").fetchone()[
            0
        ]

        # Auto-profile full data up to the configured limit.
        sampled = total_rows > PROFILE_FULL_ROW_LIMIT
        profile_size = PROFILE_FULL_ROW_LIMIT if sampled else total_rows
        if sampled:
            sample_sql = f"(SELECT * FROM {table_sql} USING SAMPLE {profile_size} ROWS)"
        else:
            sample_sql = table_sql

        # Base stats (all types)
        base = self.conn.execute(
            f"SELECT COUNT(*) AS total, "
            f"COUNT({col_sql}) AS non_null, "
            f"COUNT(*) - COUNT({col_sql}) AS null_count, "
            f"COUNT(DISTINCT {col_sql}) AS unique_count "
            f"FROM {sample_sql}"
        ).fetchone()
        result: dict[str, Any] = {
            "column": column,
            "type": app_type,
            "totalRows": total_rows,
            "sampled": sampled,
            "sampleSize": profile_size,
            "nonNullCount": base[1],
            "nullCount": base[2],
            "uniqueCount": base[3],
        }

        dominant_value: str | None = None
        dominant_count = 0

        if app_type in ("integer", "float"):
            numeric_stats = self._profile_numeric(sample_sql, col_sql)
            if numeric_stats:
                numeric_stats.update(
                    self._profile_numeric_quality(
                        sample_sql, col_sql, base[1], numeric_stats
                    )
                )
            result["stats"] = numeric_stats
            result["histogram"] = self._profile_histogram_numeric(sample_sql, col_sql)
            dom = self._profile_dominant_value(sample_sql, col_sql)
            if dom:
                dominant_value = dom["value"]
                dominant_count = dom["count"]
        elif app_type == "string":
            top_values = self._profile_top_values(sample_sql, col_sql)
            result["topValues"] = top_values
            dom = self._profile_dominant_value(sample_sql, col_sql)
            if dom:
                dominant_value = dom["value"]
                dominant_count = dom["count"]

            lengths = self.conn.execute(
                f"SELECT MIN(LENGTH({col_sql})), MAX(LENGTH({col_sql})), "
                f"MEDIAN(LENGTH({col_sql})) "
                f"FROM {sample_sql} WHERE {col_sql} IS NOT NULL"
            ).fetchone()
            string_quality = self._profile_string_quality(sample_sql, col_sql, base[1])
            if lengths and lengths[0] is not None:
                result["stats"] = {
                    "minLength": int(lengths[0]),
                    "maxLength": int(lengths[1]),
                    "medianLength": self._safe_number(lengths[2]),
                }
                result["stats"].update(string_quality)
            elif string_quality:
                result["stats"] = string_quality

            pattern_classes, distinct_pattern_count = self._profile_string_patterns(
                sample_sql, col_sql
            )
            result["patternClasses"] = pattern_classes
            if "stats" not in result:
                result["stats"] = {}
            result["stats"]["distinctPatternCount"] = distinct_pattern_count

            top_10_share_pct = 0.0
            if base[1] > 0 and top_values:
                top_10_total = sum(v["count"] for v in top_values)
                top_10_share_pct = (top_10_total / base[1]) * 100
            result["top10CoveragePct"] = round(top_10_share_pct, 2)
            if top_10_share_pct >= 70:
                result["tailProfile"] = "low"
            elif top_10_share_pct >= 40:
                result["tailProfile"] = "medium"
            else:
                result["tailProfile"] = "high"
        elif app_type == "date":
            date_stats = self.conn.execute(
                f"SELECT MIN({col_sql}), MAX({col_sql}) "
                f"FROM {sample_sql} WHERE {col_sql} IS NOT NULL"
            ).fetchone()
            if date_stats and date_stats[0] is not None:
                result["stats"] = {
                    "min": str(date_stats[0]),
                    "max": str(date_stats[1]),
                }
                result["stats"].update(self._profile_date_gaps(sample_sql, col_sql))
            result["histogram"] = self._profile_histogram_date(sample_sql, col_sql)
            dom = self._profile_dominant_value(sample_sql, col_sql)
            if dom:
                dominant_value = dom["value"]
                dominant_count = dom["count"]
        elif app_type == "boolean":
            bool_stats = self._profile_boolean_split(sample_sql, col_sql, profile_size)
            result["stats"] = bool_stats
            true_count = int(bool_stats.get("trueCount") or 0)
            false_count = int(bool_stats.get("falseCount") or 0)
            if true_count == false_count:
                dominant_value = None
                dominant_count = true_count
            elif true_count > false_count:
                dominant_value = "true"
                dominant_count = true_count
            else:
                dominant_value = "false"
                dominant_count = false_count

        if base[1] > 0 and dominant_count > 0:
            if dominant_value is None:
                result["dominantValue"] = "none"
                result["dominantValueCount"] = dominant_count
            else:
                result["dominantValue"] = dominant_value
                result["dominantValueCount"] = dominant_count
                result["dominantValueSharePct"] = round(
                    (dominant_count / base[1]) * 100, 2
                )

        return result

    def _profile_numeric(self, source_sql: str, col_sql: str) -> dict:
        row = self.conn.execute(
            f"SELECT MIN({col_sql}), MAX({col_sql}), "
            f"ROUND(AVG({col_sql})::DOUBLE, 4), "
            f"ROUND(MEDIAN({col_sql})::DOUBLE, 4), "
            f"ROUND(STDDEV({col_sql})::DOUBLE, 4), "
            f"ROUND(QUANTILE_CONT({col_sql}, 0.25)::DOUBLE, 4), "
            f"ROUND(QUANTILE_CONT({col_sql}, 0.75)::DOUBLE, 4), "
            f"ROUND(QUANTILE_CONT({col_sql}, 0.95)::DOUBLE, 4), "
            f"ROUND(QUANTILE_CONT({col_sql}, 0.99)::DOUBLE, 4) "
            f"FROM {source_sql} WHERE {col_sql} IS NOT NULL"
        ).fetchone()
        if not row or row[0] is None:
            return {}
        return {
            "min": self._safe_number(row[0]),
            "max": self._safe_number(row[1]),
            "mean": self._safe_number(row[2]),
            "median": self._safe_number(row[3]),
            "stddev": self._safe_number(row[4]),
            "p25": self._safe_number(row[5]),
            "p75": self._safe_number(row[6]),
            "p95": self._safe_number(row[7]),
            "p99": self._safe_number(row[8]),
        }

    def _profile_histogram_numeric(
        self, source_sql: str, col_sql: str, bins: int = 20
    ) -> list[dict]:
        bounds = self.conn.execute(
            f"SELECT MIN({col_sql})::DOUBLE, MAX({col_sql})::DOUBLE "
            f"FROM {source_sql} WHERE {col_sql} IS NOT NULL"
        ).fetchone()
        if not bounds or bounds[0] is None or bounds[0] == bounds[1]:
            return []

        lo, hi = float(bounds[0]), float(bounds[1])
        bin_width = (hi - lo) / bins
        rows = self.conn.execute(
            f"SELECT FLOOR(({col_sql}::DOUBLE - ?) / ?)::INTEGER AS bin, COUNT(*) "
            f"FROM {source_sql} WHERE {col_sql} IS NOT NULL "
            f"GROUP BY bin ORDER BY bin",
            [lo, bin_width],
        ).fetchall()

        histogram = []
        for bin_idx, count in rows:
            idx = max(0, min(int(bin_idx), bins - 1))
            edge = lo + idx * bin_width
            histogram.append(
                {
                    "bin": idx,
                    "low": round(edge, 4),
                    "high": round(edge + bin_width, 4),
                    "count": count,
                }
            )
        return histogram

    def _profile_histogram_date(self, source_sql: str, col_sql: str) -> list[dict]:
        rows = self.conn.execute(
            f"SELECT DATE_TRUNC('month', {col_sql}::TIMESTAMP) AS month, COUNT(*) "
            f"FROM {source_sql} WHERE {col_sql} IS NOT NULL "
            f"GROUP BY month ORDER BY month"
        ).fetchall()
        return [{"label": str(r[0])[:7], "count": r[1]} for r in rows]

    def _profile_top_values(
        self, source_sql: str, col_sql: str, limit: int = 10
    ) -> list[dict]:
        rows = self.conn.execute(
            f"SELECT {col_sql}, COUNT(*) AS cnt FROM {source_sql} "
            f"WHERE {col_sql} IS NOT NULL GROUP BY {col_sql} "
            f"ORDER BY cnt DESC LIMIT ?",
            [limit],
        ).fetchall()
        return [{"value": str(r[0]), "count": r[1]} for r in rows]

    def _profile_dominant_value(self, source_sql: str, col_sql: str) -> dict | None:
        count_rows = self.conn.execute(
            f"SELECT COUNT(*) AS cnt FROM {source_sql} "
            f"WHERE {col_sql} IS NOT NULL GROUP BY {col_sql} "
            f"ORDER BY cnt DESC LIMIT 2"
        ).fetchall()
        if not count_rows:
            return None
        if len(count_rows) > 1 and int(count_rows[0][0]) == int(count_rows[1][0]):
            return {"value": None, "count": int(count_rows[0][0])}

        row = self.conn.execute(
            f"SELECT {col_sql}, COUNT(*) AS cnt FROM {source_sql} "
            f"WHERE {col_sql} IS NOT NULL GROUP BY {col_sql} "
            f"ORDER BY cnt DESC, {col_sql} ASC LIMIT 1"
        ).fetchone()
        if not row:
            return None
        return {"value": str(row[0]), "count": int(row[1])}

    def _profile_numeric_quality(
        self,
        source_sql: str,
        col_sql: str,
        non_null_count: int,
        numeric_stats: dict[str, Any],
    ) -> dict[str, Any]:
        if non_null_count <= 0:
            return {}

        counts = self.conn.execute(
            f"SELECT "
            f"COUNT(*) FILTER (WHERE {col_sql} = 0), "
            f"COUNT(*) FILTER (WHERE {col_sql} < 0) "
            f"FROM {source_sql} WHERE {col_sql} IS NOT NULL"
        ).fetchone()
        zero_count = int(counts[0]) if counts else 0
        neg_count = int(counts[1]) if counts else 0

        p25 = numeric_stats.get("p25")
        p75 = numeric_stats.get("p75")
        outlier_rate_pct: float | None = None
        if isinstance(p25, (int, float)) and isinstance(p75, (int, float)):
            iqr = float(p75) - float(p25)
            low = float(p25) - 1.5 * iqr
            high = float(p75) + 1.5 * iqr
            outlier_row = self.conn.execute(
                f"SELECT COUNT(*) FROM {source_sql} "
                f"WHERE {col_sql} IS NOT NULL AND ({col_sql} < ? OR {col_sql} > ?)",
                [low, high],
            ).fetchone()
            outlier_count = int(outlier_row[0]) if outlier_row else 0
            outlier_rate_pct = round((outlier_count / non_null_count) * 100, 2)

        return {
            "zeroRatePct": round((zero_count / non_null_count) * 100, 2),
            "negativeRatePct": round((neg_count / non_null_count) * 100, 2),
            "outlierRatePct": outlier_rate_pct,
        }

    def _profile_date_gaps(self, source_sql: str, col_sql: str) -> dict[str, Any]:
        span_row = self.conn.execute(
            f"SELECT "
            f"DATEDIFF('day', MIN({col_sql}::DATE), MAX({col_sql}::DATE)) + 1, "
            f"COUNT(DISTINCT {col_sql}::DATE) "
            f"FROM {source_sql} WHERE {col_sql} IS NOT NULL"
        ).fetchone()
        if not span_row or span_row[0] is None:
            return {}

        span_days = int(span_row[0])
        distinct_days = int(span_row[1])
        missing_days = max(0, span_days - distinct_days)

        gap_row = self.conn.execute(
            f"WITH ordered_days AS ("
            f"  SELECT DISTINCT {col_sql}::DATE AS d "
            f"  FROM {source_sql} WHERE {col_sql} IS NOT NULL"
            f"), gaps AS ("
            f"  SELECT DATEDIFF('day', LAG(d) OVER (ORDER BY d), d) - 1 AS gap_days "
            f"  FROM ordered_days"
            f") "
            f"SELECT COALESCE(MAX(gap_days), 0) FROM gaps"
        ).fetchone()
        largest_gap_days = int(gap_row[0]) if gap_row else 0

        return {
            "missingPeriodDays": missing_days,
            "largestGapDays": max(0, largest_gap_days),
        }

    def _profile_string_quality(
        self, source_sql: str, col_sql: str, non_null_count: int
    ) -> dict[str, Any]:
        if non_null_count <= 0:
            return {}

        row = self.conn.execute(
            f"SELECT COUNT(*) "
            f"FROM {source_sql} "
            f"WHERE {col_sql} IS NOT NULL AND LENGTH(TRIM(CAST({col_sql} AS VARCHAR))) = 0"
        ).fetchone()
        blank_count = int(row[0]) if row else 0
        return {
            "blankWhitespaceCount": blank_count,
            "blankWhitespacePct": round((blank_count / non_null_count) * 100, 2),
        }

    def _profile_string_patterns(
        self, source_sql: str, col_sql: str
    ) -> tuple[list[dict[str, Any]], int]:
        class_rows = self.conn.execute(
            f"WITH vals AS ("
            f"  SELECT TRIM(CAST({col_sql} AS VARCHAR)) AS v "
            f"  FROM {source_sql} "
            f"  WHERE {col_sql} IS NOT NULL AND LENGTH(TRIM(CAST({col_sql} AS VARCHAR))) > 0"
            f"), classes AS ("
            f"  SELECT CASE "
            f"    WHEN REGEXP_MATCHES(LOWER(v), '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN 'uuid' "
            f"    WHEN REGEXP_MATCHES(v, '^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{(2,)}$') THEN 'email' "
            f"    WHEN REGEXP_MATCHES(v, '^[0-9]+$') THEN 'numeric-only' "
            f"    WHEN REGEXP_MATCHES(v, '[0-9]') AND REGEXP_MATCHES(v, '[A-Za-z]') AND REGEXP_MATCHES(v, '^[A-Za-z0-9_\\-]+$') THEN 'code-like' "
            f"    ELSE 'free-text' "
            f"  END AS cls "
            f"  FROM vals"
            f") "
            f"SELECT cls, COUNT(*) AS cnt FROM classes GROUP BY cls ORDER BY cnt DESC LIMIT 5"
        ).fetchall()

        total = sum(int(r[1]) for r in class_rows)
        classes = [
            {
                "label": str(r[0]),
                "count": int(r[1]),
                "sharePct": round((int(r[1]) / total) * 100, 2) if total > 0 else 0.0,
            }
            for r in class_rows
        ]

        pattern_count_row = self.conn.execute(
            f"WITH vals AS ("
            f"  SELECT TRIM(CAST({col_sql} AS VARCHAR)) AS v "
            f"  FROM {source_sql} "
            f"  WHERE {col_sql} IS NOT NULL AND LENGTH(TRIM(CAST({col_sql} AS VARCHAR))) > 0"
            f") "
            f"SELECT COUNT(DISTINCT REGEXP_REPLACE(REGEXP_REPLACE(v, '[A-Za-z]', 'A', 'g'), '[0-9]', '9', 'g')) "
            f"FROM vals"
        ).fetchone()
        distinct_pattern_count = int(pattern_count_row[0]) if pattern_count_row else 0

        return classes, distinct_pattern_count

    def _profile_boolean_split(
        self, source_sql: str, col_sql: str, total_profiled_rows: int
    ) -> dict[str, Any]:
        row = self.conn.execute(
            f"SELECT "
            f"COUNT(*) FILTER (WHERE {col_sql} = TRUE), "
            f"COUNT(*) FILTER (WHERE {col_sql} = FALSE), "
            f"COUNT(*) FILTER (WHERE {col_sql} IS NULL) "
            f"FROM {source_sql}"
        ).fetchone()
        true_count = int(row[0]) if row else 0
        false_count = int(row[1]) if row else 0
        null_count = int(row[2]) if row else 0
        denom = max(1, int(total_profiled_rows))
        return {
            "trueCount": true_count,
            "falseCount": false_count,
            "nullCount": null_count,
            "trueSharePct": round((true_count / denom) * 100, 2),
            "falseSharePct": round((false_count / denom) * 100, 2),
            "nullSharePct": round((null_count / denom) * 100, 2),
        }

    def _safe_number(self, val: Any) -> float | int | None:
        if val is None:
            return None
        n = float(val)
        if math.isnan(n) or math.isinf(n):
            return None
        if n == int(n) and abs(n) < 2**53:
            return int(n)
        return n

    def export_csv(
        self,
        dataset_id: str,
        sort_column: str | None,
        sort_direction: str | None,
        filters: list[dict],
    ) -> bytes:
        table = self._get_table(dataset_id)
        table_sql = self._quote_ident(table)
        col_meta = self._get_column_meta(table)

        if sort_column is not None and sort_column not in col_meta:
            raise ValueError(f"Invalid sort column: {sort_column}")

        sort_dir = "DESC" if sort_direction == "desc" else "ASC"

        filter_clauses: list[str] = []
        filter_params: list[Any] = []
        for f in filters:
            clause, p = self._build_filter_clause(f, col_meta)
            filter_clauses.append(clause)
            filter_params.extend(p)

        where_sql = f"WHERE {' AND '.join(filter_clauses)}" if filter_clauses else ""

        if sort_column:
            sort_col_sql = self._quote_ident(sort_column)
            order_sql = f"ORDER BY {sort_col_sql} {sort_dir} NULLS LAST"
        else:
            order_sql = "ORDER BY rowid ASC"

        sql = f"SELECT * FROM {table_sql} {where_sql} {order_sql}"
        result = self.conn.execute(sql, filter_params)
        col_names = [desc[0] for desc in result.description]
        rows = result.fetchall()

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(col_names)
        for row in rows:
            writer.writerow(str(v) if v is not None else "" for v in row)
        return buf.getvalue().encode("utf-8")

    def run_query(self, dataset_id: str, sql: str) -> dict:
        table = self._get_table(dataset_id)
        table_sql = self._quote_ident(table)

        start = time.time()
        with self._query_lock:
            self.conn.execute(
                f"CREATE OR REPLACE VIEW data AS SELECT * FROM {table_sql}"
            )
            try:
                result = self.conn.execute(sql)
                if result.description is None:
                    cols: list[str] = []
                    raw_rows: list[Any] = []
                else:
                    cols = [desc[0] for desc in result.description]
                    raw_rows = result.fetchall()
            finally:
                self.conn.execute("DROP VIEW IF EXISTS data")

        elapsed = round(time.time() - start, 4)

        rows: list[dict[str, Any]] = []
        for raw in raw_rows:
            row: dict[str, Any] = {}
            for i, col in enumerate(cols):
                val = raw[i]
                if val is not None and not isinstance(val, (str, int, float, bool)):
                    val = str(val)
                row[col] = val
            rows.append(row)

        return {
            "columns": cols,
            "rows": rows,
            "rowCount": len(rows),
            "executionTime": elapsed,
        }

    def run_table_query(self, dataset_id: str, spec: dict[str, Any]) -> dict:
        table = self._get_table(dataset_id)
        table_sql = self._quote_ident(table)
        col_meta = self._get_column_meta(table)

        filters = spec.get("filters") or []
        if not isinstance(filters, list) or not all(
            isinstance(f, dict) for f in filters
        ):
            raise ValueError("filters must be an array of objects")

        group_by = spec.get("groupBy") or []
        if not isinstance(group_by, list) or not all(
            isinstance(c, str) and c for c in group_by
        ):
            raise ValueError("groupBy must be an array of column names")
        for col in group_by:
            if col not in col_meta:
                raise ValueError(f"Invalid groupBy column: {col}")

        aggregations = spec.get("aggregations") or []
        if not isinstance(aggregations, list) or not all(
            isinstance(a, dict) for a in aggregations
        ):
            raise ValueError("aggregations must be an array of objects")

        having_items = spec.get("having") or []
        if not isinstance(having_items, list) or not all(
            isinstance(h, dict) for h in having_items
        ):
            raise ValueError("having must be an array of objects")

        sort_items = spec.get("sort") or []
        if not isinstance(sort_items, list) or not all(
            isinstance(s, dict) for s in sort_items
        ):
            raise ValueError("sort must be an array of sort objects")

        limit = spec.get("limit", 200)
        if not isinstance(limit, int) or limit < 1 or limit > 10000:
            raise ValueError("limit must be an integer between 1 and 10000")

        filter_clauses: list[str] = []
        filter_params: list[Any] = []
        for f in filters:
            clause, p = self._build_filter_clause(f, col_meta)
            filter_clauses.append(clause)
            filter_params.extend(p)
        where_sql = f"WHERE {' AND '.join(filter_clauses)}" if filter_clauses else ""

        select_parts: list[str] = []
        for col in group_by:
            select_parts.append(self._quote_ident(col))

        agg_alias_types: dict[str, str] = {}
        agg_ops = {
            "count": "COUNT",
            "sum": "SUM",
            "avg": "AVG",
            "min": "MIN",
            "max": "MAX",
        }
        for agg in aggregations:
            op = agg.get("op")
            col = agg.get("column")
            alias = agg.get("as")
            if op not in agg_ops:
                raise ValueError(f"Unsupported aggregation op: {op}")
            if not isinstance(col, str) or not col:
                raise ValueError("Aggregation column is required")
            if col != "*" and col not in col_meta:
                raise ValueError(f"Invalid aggregation column: {col}")

            if op in {"sum", "avg"} and col != "*":
                app_type = col_meta[col]["app_type"]
                if app_type not in {"integer", "float"}:
                    raise ValueError(f"Aggregation {op} requires numeric column: {col}")

            target = "*" if col == "*" else self._quote_ident(col)
            safe_alias = (
                alias
                if isinstance(alias, str) and alias.strip()
                else f"{op}_{col.replace('*', 'all')}"
            )
            select_parts.append(
                f"{agg_ops[op]}({target}) AS {self._quote_ident(safe_alias)}"
            )

            if op == "count":
                agg_alias_types[safe_alias] = "integer"
            elif op == "avg":
                agg_alias_types[safe_alias] = "float"
            elif col == "*":
                agg_alias_types[safe_alias] = "float"
            else:
                agg_alias_types[safe_alias] = col_meta[col]["app_type"]

        has_agg = len(aggregations) > 0
        if not select_parts:
            select_sql = "*"
        else:
            select_sql = ", ".join(select_parts)

        group_sql = ""
        if has_agg and group_by:
            group_sql = "GROUP BY " + ", ".join(self._quote_ident(c) for c in group_by)
        elif has_agg and not group_by:
            pass
        elif group_by and not has_agg:
            # Treat groupBy without aggregations as distinct projection
            select_sql = ", ".join(self._quote_ident(c) for c in group_by)
            group_sql = "GROUP BY " + ", ".join(self._quote_ident(c) for c in group_by)

        having_clauses: list[str] = []
        having_params: list[Any] = []
        if having_items:
            if not has_agg:
                raise ValueError("HAVING requires at least one aggregation")
            if not group_by:
                raise ValueError("HAVING requires groupBy with aggregations")

            for h in having_items:
                metric = h.get("metric")
                op = h.get("operator")
                raw_value = h.get("value")

                if not isinstance(metric, str) or not metric:
                    raise ValueError("HAVING metric is required")
                if metric not in agg_alias_types:
                    raise ValueError(f"Invalid HAVING metric: {metric}")
                if not isinstance(op, str) or op not in HAVING_OPERATORS:
                    raise ValueError(
                        f"Unsupported HAVING operator '{op}' for metric '{metric}'"
                    )

                metric_type = agg_alias_types[metric]
                value = self._coerce_value(raw_value, metric_type, metric, op)
                having_clauses.append(f"{self._quote_ident(metric)} {op} ?")
                having_params.append(value)

        having_sql = f"HAVING {' AND '.join(having_clauses)}" if having_clauses else ""

        order_parts: list[str] = []
        for s in sort_items:
            col = s.get("column")
            direction = "DESC" if s.get("direction") == "desc" else "ASC"
            if not isinstance(col, str) or not col:
                raise ValueError("Sort column is required")

            valid_aliases = {
                (
                    a.get("as")
                    if isinstance(a.get("as"), str) and a.get("as").strip()
                    else f"{a.get('op')}_{str(a.get('column')).replace('*', 'all')}"
                )
                for a in aggregations
            }
            if col in col_meta or col in valid_aliases:
                order_parts.append(f"{self._quote_ident(col)} {direction} NULLS LAST")
                continue
            raise ValueError(f"Invalid sort column: {col}")

        order_sql = f"ORDER BY {', '.join(order_parts)}" if order_parts else ""

        sql = f"SELECT {select_sql} FROM {table_sql} {where_sql} {group_sql} {having_sql} {order_sql} LIMIT ?"
        params = [*filter_params, *having_params, limit]

        result = self.conn.execute(sql, params)
        col_names = [desc[0] for desc in result.description]
        raw_rows = result.fetchall()

        rows: list[dict[str, Any]] = []
        for raw in raw_rows:
            row: dict[str, Any] = {}
            for idx, col in enumerate(col_names):
                val = raw[idx]
                if val is not None and not isinstance(val, (str, int, float, bool)):
                    val = str(val)
                row[col] = val
            rows.append(row)

        generated_sql = sql
        generated_python = self._to_python_query_repr(
            filters, group_by, aggregations, having_items, sort_items, limit
        )

        return {
            "columns": col_names,
            "rows": rows,
            "rowCount": len(rows),
            "generatedSql": generated_sql,
            "generatedPython": generated_python,
        }

    def _to_python_query_repr(
        self,
        filters: list[dict],
        group_by: list[str],
        aggregations: list[dict],
        having_items: list[dict],
        sort_items: list[dict],
        limit: int,
    ) -> str:
        parts: list[str] = ["df"]
        for f in filters:
            col = f.get("column")
            op = f.get("operator")
            val = repr(f.get("value"))
            if op == "is_null":
                parts.append(f"[df[{col!r}].isna()]")
            elif op == "is_not_null":
                parts.append(f"[df[{col!r}].notna()]")
            elif op in {"=", "!=", ">", "<", ">=", "<="}:
                py_op = "==" if op == "=" else op
                parts.append(f"[df[{col!r}] {py_op} {val}]")
            elif op == "contains":
                parts.append(
                    f"[df[{col!r}].astype(str).str.contains({val}, case=False, na=False)]"
                )
            elif op == "starts_with":
                parts.append(
                    f"[df[{col!r}].astype(str).str.startswith({val}, na=False)]"
                )

        if aggregations:
            agg_map = {
                "count": "count",
                "sum": "sum",
                "avg": "mean",
                "min": "min",
                "max": "max",
            }
            if group_by:
                agg_chunks: list[str] = []
                for agg in aggregations:
                    alias = (
                        agg.get("as")
                        or f"{agg.get('op')}_{str(agg.get('column')).replace('*', 'all')}"
                    )
                    op = agg_map[str(agg.get("op"))]
                    col = agg.get("column")
                    if col == "*":
                        agg_chunks.append(f"{alias!r}: ({group_by[0]!r}, {op!r})")
                    else:
                        agg_chunks.append(f"{alias!r}: ({col!r}, {op!r})")
                parts.append(
                    f".groupby({group_by!r}, dropna=False).agg({{{', '.join(agg_chunks)}}}).reset_index()"
                )

                if having_items:
                    query_parts: list[str] = []
                    for h in having_items:
                        metric = str(h.get("metric"))
                        op = str(h.get("operator"))
                        value = h.get("value")
                        py_op = "==" if op == "=" else op
                        query_parts.append(f"(`{metric}` {py_op} {repr(value)})")
                    if query_parts:
                        parts.append(f".query({(' and '.join(query_parts))!r})")
            else:
                if len(aggregations) == 1:
                    agg = aggregations[0]
                    op = agg_map[str(agg.get("op"))]
                    col = agg.get("column")
                    if col == "*" and op == "count":
                        parts.append(".shape[0]")
                    else:
                        parts.append(f"[{col!r}].{op}()")

        if sort_items:
            cols = [str(s.get("column")) for s in sort_items]
            ascending = [s.get("direction") != "desc" for s in sort_items]
            parts.append(f".sort_values({cols!r}, ascending={ascending!r})")

        parts.append(f".head({limit})")
        return "".join(parts)

    def close(self) -> None:
        self.conn.close()

    def _get_table(self, dataset_id: str) -> str:
        table = self.datasets.get(dataset_id)
        if not table:
            raise ValueError(f"Dataset not found: {dataset_id}")
        return table

    def _quote_ident(self, ident: str) -> str:
        return '"' + ident.replace('"', '""') + '"'

    def _get_column_meta(self, table: str) -> dict[str, dict[str, str]]:
        table_sql = self._quote_ident(table)
        rows = self.conn.execute(f"PRAGMA table_info({table_sql})").fetchall()
        meta: dict[str, dict[str, str]] = {}
        for _, name, duck_type, *_ in rows:
            meta[name] = {
                "duck_type": duck_type,
                "app_type": map_duckdb_type(duck_type),
            }
        return meta

    def _build_filter_clause(
        self,
        f: dict,
        col_meta: dict[str, dict[str, str]],
    ) -> tuple[str, list[Any]]:
        col = f.get("column")
        op = f.get("operator")
        raw_val = f.get("value")

        if not isinstance(col, str) or not col:
            raise ValueError("Filter column is required")
        if col not in col_meta:
            raise ValueError(f"Invalid filter column: {col}")
        if not isinstance(op, str) or not op:
            raise ValueError(f"Filter operator is required for column: {col}")

        app_type = col_meta[col]["app_type"]
        allowed_ops = FILTER_OPERATORS_BY_TYPE.get(
            app_type, FILTER_OPERATORS_BY_TYPE["string"]
        )
        if op not in allowed_ops:
            raise ValueError(
                f"Unsupported operator '{op}' for column '{col}' ({app_type})"
            )

        col_sql = self._quote_ident(col)
        if op == "is_null":
            return f"{col_sql} IS NULL", []
        if op == "is_not_null":
            return f"{col_sql} IS NOT NULL", []

        value = self._coerce_value(raw_val, app_type, col, op)

        if op == "=":
            return f"{col_sql} = ?", [value]
        if op == "!=":
            return f"{col_sql} != ?", [value]
        if op == ">":
            return f"{col_sql} > ?", [value]
        if op == "<":
            return f"{col_sql} < ?", [value]
        if op == ">=":
            return f"{col_sql} >= ?", [value]
        if op == "<=":
            return f"{col_sql} <= ?", [value]
        if op == "contains":
            return f"{col_sql} ILIKE ?", [f"%{value}%"]
        if op == "starts_with":
            return f"{col_sql} ILIKE ?", [f"{value}%"]

        raise ValueError(f"Unsupported operator '{op}'")

    def _coerce_value(self, value: Any, app_type: str, col: str, op: str) -> Any:
        if value is None:
            raise ValueError(
                f"Filter value is required for column '{col}' and operator '{op}'"
            )

        if app_type == "integer":
            try:
                return int(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"Invalid integer value for column '{col}': {value}"
                ) from exc

        if app_type == "float":
            try:
                return float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"Invalid float value for column '{col}': {value}"
                ) from exc

        if app_type == "boolean":
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                lowered = value.strip().lower()
                if lowered in {"1", "true", "t", "yes", "y"}:
                    return True
                if lowered in {"0", "false", "f", "no", "n"}:
                    return False
            raise ValueError(f"Invalid boolean value for column '{col}': {value}")

        if app_type == "date":
            if isinstance(value, (date, datetime)):
                return value.isoformat()
            if isinstance(value, str):
                try:
                    return date.fromisoformat(value).isoformat()
                except ValueError as exc:
                    raise ValueError(
                        f"Invalid date value for column '{col}': {value}. Expected YYYY-MM-DD."
                    ) from exc
            raise ValueError(f"Invalid date value for column '{col}': {value}")

        return str(value)

    def _build_cursor_predicate(
        self,
        cursor: str,
        sort_column: str | None,
        sort_dir: str,
        col_meta: dict[str, dict[str, str]],
    ) -> tuple[str, list[Any]]:
        payload = self._decode_cursor(cursor)

        if payload.get("v") != 1:
            raise ValueError("Invalid cursor version")
        if payload.get("s") != sort_column:
            raise ValueError("Cursor does not match current sort column")
        if payload.get("d") != sort_dir:
            raise ValueError("Cursor does not match current sort direction")
        if "r" not in payload:
            raise ValueError("Cursor is missing row anchor")

        anchor_rowid = int(payload["r"])

        if not sort_column:
            return "rowid > ?", [anchor_rowid]

        sort_sql = self._quote_ident(sort_column)
        app_type = col_meta[sort_column]["app_type"]
        is_null = bool(payload.get("n", False))

        if is_null:
            if sort_dir == "ASC":
                return f"({sort_sql} IS NULL AND rowid > ?)", [anchor_rowid]
            return f"({sort_sql} IS NULL AND rowid < ?)", [anchor_rowid]

        if "k" not in payload:
            raise ValueError("Cursor is missing sort key")
        anchor_value = self._deserialize_cursor_value(payload["k"], app_type)

        if sort_dir == "ASC":
            return (
                f"(({sort_sql} > ?) OR ({sort_sql} = ? AND rowid > ?) OR {sort_sql} IS NULL)",
                [anchor_value, anchor_value, anchor_rowid],
            )

        return (
            f"(({sort_sql} < ?) OR ({sort_sql} = ? AND rowid < ?) OR {sort_sql} IS NULL)",
            [anchor_value, anchor_value, anchor_rowid],
        )

    def _serialize_cursor_value(self, value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        return str(value)

    def _deserialize_cursor_value(self, value: Any, app_type: str) -> Any:
        if value is None:
            return None
        if app_type == "integer":
            return int(value)
        if app_type == "float":
            return float(value)
        if app_type == "boolean":
            if isinstance(value, bool):
                return value
            lowered = str(value).strip().lower()
            return lowered in {"1", "true", "t", "yes", "y"}
        if app_type == "date":
            return str(value)
        return str(value)

    def _encode_cursor(self, payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")

    def _decode_cursor(self, token: str) -> dict[str, Any]:
        try:
            padded = token + "=" * (-len(token) % 4)
            raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("Cursor payload must be an object")
            return payload
        except Exception as exc:
            raise ValueError("Invalid cursor") from exc
