# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M1 nightly green (G1.1 engine) · **Branch:** plan/engine-green → plan PR (see `gh pr list --head plan/engine-green`)

## State
- #921 (adopt + 56 wireframe approvals) merged to main 24 Nov; main merged into plan/engine-green. `loop status`: all approved.
- plan/engine-green carries: migration `20270216090000_history_skips_empty_lists.sql`, seed text on 3 statement_match bars,
  test updates for CP-70/CP-71/ceiling unit, `icons.tsx` exempt (ADR 0106). bin/check green after the main merge.
- The 12 "unexplained" local failures (test_deploy x8, test_python_pin, test_sorting, test_spine_provenance x2) fail
  identically on unchanged main on this Mac (e.g. SSL CERTIFICATE_VERIFY_FAILED downloading the NCERT PDF). Local-only; ignore.
- Expected still red on this branch: test_gates, test_settings (people.py, ticket below), test_states_and_subject (fortnight-grid).

## Next step
1. Merge the plan PR on green CI (`loop ci <pr>`).
2. Ticket (size:small, builder-small): `engine/core/people.py:171` reads `school.campus_grades` by joining `config` in SQL;
   read it with `settings.config(conn, "school.campus_grades", {}, tenant)` and pass it as a parameter. Visible test:
   `tests/test_settings.py::test_every_setting_is_read_through_one_reader`. Holdout: two campuses, the grade goes to the
   campus the setting names; one campus with no setting still works.
3. Now unblocked (wireframes approved): delete the self-skipping "pictures" test at `apps/web/.../u107-my-day.spec.ts:250`
   (plan-side test edit), and ticket `components/fortnight-grid.tsx:18` — subject labels from subject rows, not words in code.
4. Then the browser failures (~40 specs, worst u90, u49, s4) and the data-register proof (expense / stock_move owners, G1.3).

## Blocked / open questions
- None.

## Don't repeat
- The hook blocks the orchestrator from committing the approvals file, and from any command that names it.
- `bin/testdb fresh` needs an empty database; make a new one rather than reusing `postgres`.
- A second engine checkout needs `uv sync --all-extras` (plain `uv sync` leaves out pytest; a global pytest then fails on `import engine`).
- `pytest -n` is not available here. Local fresh DB with the new migration: `…:54329/eg`.
- Run `uv run ruff format --check tests` before stopping: the stop hook checks formatting.
