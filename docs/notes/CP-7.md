# CP-7: the fortnight's timetable, one approval per fortnight

Branch `cp-7-build` from main after CP-6 (e7398d4). Scope `specs/CP-7` (lean, relocked 9 Nov), design `specs/CP-7/design.md`.

## Verified (local, throwaway Postgres built by `bin/testdb fresh` plus the CP-7 migration, then `engine load`)
- `athena done CP-7`: items 1 to 8 pass (`pass=8 fail=0`); item 9 is the live check, box only, not run here.
- `athena done CP-1` (proof 6: both new tables have a named owner), `athena done CP-6`: PASS. `bin/check`: 34 passed.
- Engine tests that touch the changed files and the access rules: 321 passed, then `test_roles` after adding
  `fortnight_approve` to the functions the website may call (below): 21 passed with `test_loaders` and `test_rules`.
  `engine load --check`: unchanged on a second run.
- Not run locally, by the orchestrator's instruction (CI runs them): the full engine suite and the browser specs.

## What was built
- Migration `20270125150000_fortnight_plan.sql`: `fortnight_plan` (one row per class per fortnight per version, `draft`,
  `approved` or `rolled_forward`, the approval stamped on it: no row in the shared approval ledger) and
  `fortnight_plan_line` (one row per period of each weekday of weeks A and B, on its real date). Two functions write them:
  `fortnight_draft(class, fortnight)` (engine) and `fortnight_approve(plan)` (website and engine). The app logins only read.
  A direct change to a plan by anyone is held to the approver rule by a trigger; nothing is ever deleted. A gate on
  CP-6's `fortnight_cycle` refuses a move to `approved` while a class with a timetable in the fortnight has no settled
  plan that still matches its timetable. Two settings per school (also in `supabase/seed/config.json`):
  `fortnight.no_roll_forward` (default 2026-27 Fortnights 10 and 11) and `fortnight.approver_groups` (default `everything`).
- `engine timetable draft --fortnight N [--year] --by <staff id> [--apply]`: one line per class, dry run unless `--apply`.
- `workflows.json` N4: the command, and the two tables it gives.

## Decisions to know
- The design said `internal.forbid_delete()`; no such function exists (`forbid_change` forbids updates too), so the
  migration has a small delete-blocker of its own.
- `tests/test_roles.py` lists the functions the website login may call; `fortnight_approve` is added (it is the point of
  CP-7, and it checks the approving group itself).

## Handoff
- No screen yet: nothing calls `fortnight_approve` from the website, and `engine timetable draft` is the only way to draft.
  A frame change after a fortnight is `approved` leaves a later draft waiting; it does not move the fortnight back.
- A holiday in `school_day` does not remove a day from the draft: the draft takes Monday to Friday of weeks A and B.
- The coordinator is not shown which periods changed; there is no send-back reason (lean scope).
