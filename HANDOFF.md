# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-23 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M1 nightly green (G1.1 engine) · **Branch:** plan/engine-green (pushed, no PR yet) · **Adopt PR:** #921 still waits for Nimish

## State
- Nightly 45093926102: 7 engine failures, all reproduced locally in 6 s. Each traced and judged in ADR 0106.
- On plan/engine-green (from main): migration `20270216090000_history_skips_empty_lists.sql` ([] / {} count as empty in
  `internal.change_kept`), seed text on 3 statement_match bars, test updates for CP-70 `band`, CP-71 `{math, NUM}` heads,
  ceiling unit, `icons.tsx` exempt. Proven: bin/check green; test_k2_upload + test_materials_list 39 passed, test_bars 4 passed.
- Local fresh DB for this work: `postgresql://postgres:postgres@127.0.0.1:54329/eg` (built by `bin/testdb fresh`; the
  shared `postgres` DB is older and lacks the new migration).
- Whole engine suite on `eg` (43 min, serial): 15 failed / 5118 passed. Expected red: test_gates, test_settings,
  test_states_and_subject. UNEXPLAINED 12 (green in nightly 45093926102): test_deploy x8, test_python_pin, test_sorting,
  test_spine_provenance x2 — likely this Mac's environment, not the migration (none touch history). Not proven.

## Next step
1. Confirm the 12 unexplained failures also fail on main locally (`git stash`/checkout main, same command, those 4 files only);
   if yes, they are local-only. Then open the plan PR; CI is the proof. Whole suite command for reference: on `eg` (`cd packages/engine && TEST_DATABASE_URL=…/eg uv run pytest -q -p no:cacheprovider tests`, no xdist installed). Expect only test_settings, test_gates, test_states_and_subject (fortnight-grid) red. Then open the plan PR and merge on green.
2. Ticket (size:small, builder-small): `engine/core/people.py:171` reads `school.campus_grades` by joining `config` in SQL;
   read it with `settings.config(conn, "school.campus_grades", {}, tenant)` and pass it as a parameter. Visible test:
   `tests/test_settings.py::test_every_setting_is_read_through_one_reader`. Add a holdout test: two campuses, the grade
   goes to the campus the setting names; one campus with no setting still works.
3. Then the browser failures (~40 specs, worst u90, u49, s4) and the data-register proof (expense / stock_move owners, G1.3).

## Blocked / open questions
- `apps/web` is blocked by the loop until wireframes are approved (`loop status`: none approved). Two engine failures wait on it:
  `u107-my-day.spec.ts:250` self-skipping "pictures" test (delete it), and `components/fortnight-grid.tsx:18` subject words
  in code (labels from subject rows). Nimish: run `loop approve --all` (or per screen) after reading #921.

## Don't repeat
- `bin/testdb fresh` needs an empty database; make a new one rather than reusing `postgres`.
- `pytest -n` is not available here.
- Run `uv run ruff format --check tests` before stopping: the stop hook checks formatting, bin/check output alone does not show it.
