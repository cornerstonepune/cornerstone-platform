# CP-37: MD.A4's date in the school form

## Verified
- Cause: main's u43 "a date is one format on every page" fails on MD.A4's "why" ("24 Jul"), reported by the frontend orchestrator; I had seen the row during CP-36 and wrongly judged it tolerated.
- `pytest tests/test_ask_a4_date.py tests/test_asks.py tests/test_asks_school_words.py tests/test_rules.py tests/test_table_budget.py tests/test_data_register.py tests/test_layout.py tests/test_types.py`: 36 passed. No table, column or function.

## Handoff
- Migration `20270126150000`: data only, after `130000` and `140000` (neither applied on live at 04:35 UTC; main's CI red). Needs Nimish's own word at merge (his 12 Nov yes named four rows).
- The year (2026) is an assumption, unverified.
