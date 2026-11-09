# CP-8 design review (light: 3 fresh reviewers)

Reviewers: egm-zoom-out, egm-design, egm-codebase-details. All three asked for changes; all blockers were applied in design.md.

| Finding (reviewer) | Applied |
|---|---|
| Undo leaves lines unlinked and unlisted (design, codebase) | Unmatched list is a view over `plan_entry`, so it cannot lose a line |
| Three new tables where columns would do; list goes stale (zoom-out) | Four columns + two views + two functions; no new base table |
| Design never shows rules can move the number (zoom-out) | Decision 3: box dry run first; stated honestly that the default can pass at 40 of 375 |
| Default target written as Nimish's decision (zoom-out, design) | Not written; an optional Target line is read if he writes one |
| Tie broken by a looser rule (design) | Best-rank rule: stop at the first rank with candidates |
| Item 3 defines its failures away (design) | A lesson period with no plan line fails item 3 and is counted by name |
| Rules of the 40 existing links; person's pick (design, zoom-out) | Migration tags the 40 `exact_name`; trigger records `person` |
| Races (design) | One transaction, advisory lock, `where activity_id is null` |
| `updated_at`/grants/rules.json/CLI placement/test_layout (codebase) | No new table, so first two fall away; rules.json and `cli_timetable.py` / N4 commands in the file list |
| Item 6 has no proof (design) | Existing suites run unchanged |

Not applied: dropping `previous_activity_id` is moot (column removed with the table).
