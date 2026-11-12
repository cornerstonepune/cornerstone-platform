# CP-33: by_name on /k2/child-history

## Verified
- `pytest tests/test_notes_history_and_coordinator.py tests/api/test_k2_routes.py tests/test_types.py tests/test_layout.py` on a fresh local database: 32 passed.
- `tests/test_rules.py`, `test_table_budget.py`, `test_data_register.py` passed (before the final one-line type fix, which `test_types.py` then passed).
- No table, column, function or migration: budget stays 81 tables, 121 functions.

## Handoff
- Goes live with the next engine deploy; needs Nimish's own word in the session that merges it.
- Frontend (UI-3a) reads `by_name` in `apps/web/app/(app)/notes/peek.ts`. The route's answer is untyped in `engine-routes.ts` (requests only), so no contract change.
