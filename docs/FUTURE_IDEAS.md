# Future Ideas Log

This file tracks product ideas discussed during implementation so they are not lost between phases.

## Profiling / Explainability

- Add profiler metric drilldowns that auto-create filters in Overview/Table Cell.
  - Examples: outlier lengths, min-length rows, max-length rows, distinct pattern classes.
  - Reuse existing filter-chip system (append by default, optional replace).
- Add a user-facing About/Help section that renders metric definitions from `frontend/src/content/metricGlossary.ts`.

## Data Typing / Conversions

- Add post-import type conversion suggestions for string-like date/numeric columns.
  - Common case: Excel/SQLite date columns read as strings.
  - Show confidence-based suggestions (`Convert to date`, `Convert to numeric`).
  - Prefer non-destructive workflow (reversible conversion or explicit apply action).
- Improve profile quality by applying inferred types before profiling when confidence is high.

## Variables / Cross-Cell Workflows

- Keep variables global by default for cross-dataset compare/filter workflows.
- Extend variable model beyond `value_list` to `dataframe` and scalar variables after MVP.
- Add dependency graph + stale indicators for variables sourced from code/table cells.

## UX / Navigation

- Keep recent sessions on landing page only (not in workspace sidebar) for now.
