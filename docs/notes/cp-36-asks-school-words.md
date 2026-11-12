# CP-36: four asks in the school's date and grade words

## Verified
- Live read-only, 12 Nov: the four live rows match the seed exactly (checked by md5 of each field); MD.A1 is answered, MD.A6/A7/A8 are not.
- Why a migration: `engine/core/asks.py` rewords only unanswered rows, and deploy runs `engine load --settings` only, so no reload reaches live.
- `pytest tests/test_asks_school_words.py tests/test_asks.py tests/test_rules.py tests/test_table_budget.py tests/test_data_register.py tests/test_layout.py tests/test_types.py`: 34 passed. The migration test fails when the guard is loosened, when the migration clears an answer, and when a row is wrongly matched. `engine load --check`: unchanged on a second run.
- `tests/test_asks.py` holds the asks word for word to the taxonomy document's table, so the same four table rows were reworded there.

## Handoff
- Migration `20270126140000`: data only. **Goes after #680's `20270126130000` is live** (one database change at a time). Needs Nimish's word at merge time (he gave it in the backend session on 12 Nov).
- Names still in two rows' text: MD.A1 ("Nimish") and MD.A6's why ("Achal"); left as they were, not part of this change.
- Correction to an earlier message to the frontend orchestrator: the asks loader does reword unanswered rows; a reload just never runs on live.
