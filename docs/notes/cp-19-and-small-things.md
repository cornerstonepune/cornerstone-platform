# CP-19 (report lines) and the small things the frontend asked for

One migration, `20270126100000_cp19_report_lines_and_small_things.sql`. No new table; no new function (the existing
send guard, `internal.parent_note_sent_when_approved_twice`, now also checks a report's lines): 81 tables, 121 functions.

## Report lines (CP-19, #467; the Reports screen is #594)
- `parent_note.lines` ([{id, words, evidence: [evidence ids]}]). The database refuses a line that rests on evidence that is not this child's, not confirmed (`confirmed_by` set), or dated after the report's week plus `report.period_days` (14), and refuses any change to the lines of a sent report.
- A line's approvals are `approval` rows of kind `report_line`, target `<report id>:<line id>`. The first is an educator of the child's class, the second a coordinator and someone else (the database refuses the same person twice; who may give which is `w4_close/report_lines.py`). Changing a line's words or evidence withdraws its approvals.
- A line is thin when it rests on fewer pieces than the row `report.seen_enough` (2).
- A report is marked sent only with consent on record for the child, the register unchanged since it was given, and both approvals on every line (a report with no lines keeps the old rule: two approvals of the report). It is a trigger, so any route is held to it; the engine's send is coordinator-only. **Nothing is delivered**: no message leaves the system.
- Routes: `/reports/lines`, `/reports/lines/set`, `/reports/lines/approve`, `/reports/send`, `/reports/counts`.
- The counts are whole numbers per class (notes confirmed, notes late, lines at each stage, reports sent) and per educator (staff id, in id order: notes confirmed, notes late, lines accepted / changed / removed). No score, rate, rank or ordering of a person.
- **Not built (needs a decision or a design):** the parent's-copy PDF; "children without notes", "class days without notes" and "unplanned sessions" per class (the coordinator page `/k2/coordinator` already has them, as one list for the campus).
- One existing test changed: `test_approval_list.py::test_a_second_approval_before_anything_reaches_a_parent` now records consent before the report is sent (a report is sent only with consent).

## The small things
- `role.label` for `class_teacher` is "Class educator" (the school's words); a test holds that no role label says "teacher".
- `educator_note.photo_keys`: keys into the private store of photos of a lesson's work or board, never a child. `POST /voice/notes/photo` (upload token, like a recording), `POST /voice/notes/photo/get`, `POST /voice/session-note` (her note for a lesson, made empty if she has none). At most `voice.max_photos_per_note` (6); images only (checked by their first bytes); cleared on the same clock as recordings (`voice_intake.cleanup`). Said in the data register in a parent's words; the guard's list holds it.
- **Fixed, found on the way:** a note she typed has no recording key (#569), and `voice_intake.cleanup` and `/voice/notes/audio` assumed every note had one. The clean-up would have failed on the first typed note past 48 hours. Both now handle it (tested).
- Settings seeded: `report.seen_enough`, `report.period_days`, `timetable.subject_looks`.

## Verified
`tests/test_report_lines.py` (10), `tests/test_photos_and_session_note.py` (4), the register, approval-list, table-budget, access, layout and contract tests, `bin/check`, on a fresh Postgres 16. Not verified: CI's full suite; the rehearsal on a copy of live; live.
