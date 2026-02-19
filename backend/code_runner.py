from __future__ import annotations

import ast
import io
import math
import time
from contextlib import redirect_stdout
from datetime import date, datetime
from typing import Any

import pandas as pd

MAX_PREVIEW_ROWS = 1000


def _normalize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return _normalize_value(value.item())
        except Exception:
            pass
    return value


def _rows_from_df(
    df: pd.DataFrame, limit: int = MAX_PREVIEW_ROWS
) -> list[dict[str, Any]]:
    head = df.head(limit).copy()
    if head.empty:
        return []
    rows = head.to_dict(orient="records")
    return [{k: _normalize_value(v) for k, v in row.items()} for row in rows]


def _safe_builtins() -> dict[str, Any]:
    return {
        "abs": abs,
        "all": all,
        "any": any,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "float": float,
        "int": int,
        "len": len,
        "list": list,
        "max": max,
        "min": min,
        "print": print,
        "range": range,
        "round": round,
        "set": set,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "zip": zip,
    }


def execute_python_code(code: str, df: pd.DataFrame) -> dict[str, Any]:
    trimmed = code.strip()
    if not trimmed:
        raise ValueError("Python code is empty")

    started = time.time()
    stdout_buffer = io.StringIO()
    env: dict[str, Any] = {
        "__builtins__": _safe_builtins(),
        "pd": pd,
        "df": df.copy(),
    }

    tree = ast.parse(trimmed, mode="exec")
    body = tree.body
    final_expr = body[-1] if body and isinstance(body[-1], ast.Expr) else None
    exec_body = body[:-1] if final_expr is not None else body

    with redirect_stdout(stdout_buffer):
        if exec_body:
            exec(
                compile(
                    ast.Module(body=exec_body, type_ignores=[]), "<code-cell>", "exec"
                ),
                env,
                env,
            )

        result = None
        if final_expr is not None:
            result = eval(
                compile(ast.Expression(final_expr.value), "<code-cell>", "eval"),
                env,
                env,
            )

    stdout_text = stdout_buffer.getvalue().strip()
    elapsed_ms = round((time.time() - started) * 1000, 2)

    if isinstance(result, pd.DataFrame):
        out_rows = _rows_from_df(result)
        payload = {
            "columns": list(result.columns),
            "rows": out_rows,
            "rowCount": int(len(result)),
            "executionTime": elapsed_ms,
        }
        if stdout_text:
            payload["textOutput"] = stdout_text
        return payload

    if isinstance(result, pd.Series):
        series_df = result.to_frame(name=result.name or "value").reset_index(drop=False)
        out_rows = _rows_from_df(series_df)
        payload = {
            "columns": list(series_df.columns),
            "rows": out_rows,
            "rowCount": int(len(series_df)),
            "executionTime": elapsed_ms,
        }
        if stdout_text:
            payload["textOutput"] = stdout_text
        return payload

    text_output = stdout_text
    if result is not None:
        rendered = str(_normalize_value(result))
        text_output = f"{stdout_text}\n{rendered}".strip() if stdout_text else rendered

    return {
        "columns": [],
        "rows": [],
        "rowCount": 0,
        "executionTime": elapsed_ms,
        "textOutput": text_output,
    }
