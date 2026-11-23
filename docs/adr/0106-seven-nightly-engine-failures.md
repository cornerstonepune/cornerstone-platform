# 0106: The seven nightly engine failures — which side was wrong

Date: 2026-11-23. Status: accepted (Plan, M1 G1.1).
Goal: none — this records verdicts; M1 G1.1 (nightly engine suite green) is checked by the nightly run, not a command.

## Decision
Each failure was traced to the commit that caused it and judged "code broke a rule" or "a deliberate change made the test's
expectation out of date". Only the second kind changes a test.

| Test | Verdict | Fix |
|---|---|---|
| `test_bars` — statement_match bars had no source | seed text missing | the three `eval.statement_match.*` descriptions cite DECISIONS-LOG 2026-11-17 |
| `test_bars` — a ceiling must be a count | test too narrow | `bars.short` compares any ceiling the same way, and the 0.02 refused ceiling is a share by decision (DECISIONS-LOG 2026-11-17); a ceiling may now be a count or a proportion |
| `test_k2_upload` ×2 — `band` kept | test stale | CP-70 (`20270203090000_cp70_objective_in_more_grades.sql`) made `band` a watched field on purpose; the expectations gain `band` |
| `test_k2_upload` ×2 — `also_bands = []` kept | code wrong | `internal.change_kept` counted `''` as empty but not `[]`/`{}`; migration `20270216090000_history_skips_empty_lists.sql` |
| `test_materials_list` — heads `{math, NUM}` | test stale | CP-71 (`specs/CP-71/spec.md:46`) made each subject code a timetable head; the expectation is `{math, NUM}`, the materials are unchanged |
| `test_settings` — `core/people.py` reads `config` in SQL | code wrong | builder ticket: read `school.campus_grades` through `settings.config` |
| `test_states_and_subject` — `icons.tsx` names `Music` | test too broad | `Music` there is the icon library's component name; `lib/icons.tsx` joins `EXEMPT` |
| `test_states_and_subject` — `fortnight-grid.tsx` names `Music` | code wrong | ticket, waits for wireframe approval (frontend): labels from the subject rows, not words in code |
| `test_gates` — `u107-my-day.spec.ts:250` skips itself | code wrong | ticket, waits for wireframe approval (the loop blocks `apps/web` edits): remove the "pictures" test; the pictures it made are already in `docs/notes/img/` |

## Rejected
- Exempting `fortnight-grid.tsx` too: its map puts subject words on screen, which is what the rule forbids.
- Changing the 0.02 refused bar to a count to fit the test: the bar was set as a share before the run and the eval reports a share.
