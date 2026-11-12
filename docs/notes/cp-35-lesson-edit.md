# CP-35: one lesson's topic and subject edited by hand (#692)

## Verified
- `pytest tests/test_tt_edit.py tests/api/test_timetable_hand_routes.py`: 16 passed (module tests: edit keeps the lesson's id, freeze needs a reason, 7 refusals write nothing, subject taught check, history row, group only; route test: key, stranger 403, educator 403, coordinator 200, bad subject 409).
- The tests fail when the group check, the freeze or the subject check is removed (three mutations tried).
- `tests/test_rules.py`, `test_table_budget.py`, `test_data_register.py`, `test_layout.py`, `test_types.py`: pass. No migration, no table, no function: budget stays 81 / 121. `bin/engine contract` regenerated `apps/web/lib/engine-routes.ts` (157 routes).
- 15 tests in `tests/api` (week, bank, maker, paper routes) fail identically on clean main on my local database: not from this change; CI's fresh database is the judge (unverified there).

## Handoff
- Route: `POST /timetable/lesson/edit {actor, session_id, text?, subject_code?, reason?}`. 403 if the actor is not in the go-live group; 409 for any other refusal; 200 returns `{session_id, on_date, text, subject_code}`.
- The route edits an existing `session` row. A fortnight whose lessons have not been made from the frame yet (they are made on the first move) has no row to edit: the Edit action there needs the lesson to exist first (unverified how the views handle it).
- No migration, nothing to deploy beyond the next engine deploy.
