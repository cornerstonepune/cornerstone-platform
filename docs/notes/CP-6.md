# CP-6: the fortnight cycle

Branch `cp-6-build` from main after CP-3, CP-4 and CP-9. Scope `specs/CP-6` (lean, relocked 9 Nov), design `specs/CP-6/design.md`.

## Verified (local, throwaway Postgres built by `bin/testdb fresh` plus the CP-6 migration)
- `specs/CP-6/checks.sh`: items 1 to 6 pass (`pass=6 fail=0`); item 7 is the live check, box only.
- Engine tests that touch the changed files and the access rules: 289 passed (fortnight cycle, day/week/period, timetable
  rules and loader, access, roles, contract, layout, types, migration order, api). `bin/check`: 34 passed.
- Not run locally, by the orchestrator's instruction of 9 Nov (CI runs them): the full engine suite and the browser specs.
  The website reads one thing that changed, `frozen` on day, week and period; it is false until a fortnight is frozen.

## What was built
- Migration `20270125120000_fortnight_cycle.sql`: `fortnight_cycle` (state, who and when per step), `fortnight_edit`
  (history), four `fortnight.*` settings per school, a `planning` row for each teaching fortnight of a year not yet ended,
  both tables listed school-wide in `access_table`. No triggers.
- `w2_print/fortnight_cycle.py`: `move`, `is_frozen`, `ensure_editable`, `step_date` (and `fortnights_touched`).
- Wired: fixed-slot change in `tt_rules.change(..., reason=)` (route field `frozen_reason`), the loader's `apply(..., reason=)`
  (`engine timetable load --reason`), and `k2_day._who` reads `is_frozen`.

## Handoff
- **Placeholder step dates**: freeze 14 days before the fortnight starts, align 10, approve 7, list sent 3. The real
  roadmap dates are not in the repository; each is a `config` row to update.
- Known gaps (named in the design): hand-run SQL and seed files are not stopped; a new school gets no settings and a new
  year no cycle rows until the migration's inserts are rerun (`step_date` fails loudly meanwhile); no command or screen
  moves a fortnight yet (CP-12 calls `move(..., 'approved', actor)`; CP-7 adds its gate).
- "List sent" stays the fifth state on the fortnight unless Nimish says the materials list is monthly.
