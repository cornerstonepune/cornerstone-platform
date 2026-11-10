# The data model: the school's nouns, and the one home of each shared job

Read this before designing anything that touches the database (CLAUDE.md, "How work is done"). A new table must say,
in its spec, why it cannot be a column, a row in one of the shared tables below, a rule on a column, or a view.
`supabase/table-budget.json` holds the count; it may only fall. CP-27 (#534) brings the schema to this shape; the
full list of tables is `specs/CP-27/target-tables.md`.

## The nouns

| Area | Tables |
|---|---|
| School and people | `tenant`, `campus`, `academic_year`, `grade`, `school_class`, `child` (+ `pii.child`), `enrolment`, `staff` (+ `pii.staff`), `role`, `staff_role_grant` |
| Access and privacy | `access_reach`, `access_table`, `access_log`, `consent`, `data_register` |
| Curriculum | `subject`, `topic`, `registry_skill`, `skill`, `skill_level`, `skill_prerequisite`, `misconception`, `learning_objective`, `activity`, `report_item`, `question_type`, `taxonomy_case`, and the link tables between them |
| Time and plan | `fortnight` (with its state), `school_day`, `period`, `timetable_rule`, `timetable_run`, `session` (the timetable), `plan_entry` |
| Observation and the child's picture | `pii.educator_note`, `pii.note_claim`, `activity_observation`, `evidence_event`, `child_skill_state`, `child_state` |
| Papers | `item`, `sheet_template`, `sheet_instance`, `prescription`, `capture`, `item_result` |
| Reports and materials | `parent_note`, `material_item`, `activity_material`, `materials_list`, `materials_line` |

## One home for each shared job

| Job | The one home | Never |
|---|---|---|
| Who changed what, when, before and after, why | `change_log`, written by one trigger | a `*_edit`, `*_change`, `*_version` or `*_move` table per feature |
| A yes or no a person gives (approve, accept, go live, confirm) | `approval` | an approval table or `approved_by` stamp per feature |
| A model proposed something; a person decided | `curriculum_proposal` | a `*_proposal` or `*_decision` table per feature |
| Hand-checked truth used to score a model | `eval_case` | a `gold_*` or `*_review` table per feature |
| Every setting, threshold, date rule or word list a school may change | `config`, read only through `core/settings.py` | a settings table per feature, or a number in code |
| A short fixed list of states or kinds | a `check` rule on the column | a lookup table, unless people edit the list or code reads its attributes |
| Which class a child is in | `enrolment` | a class, section or roll number on `child` |
| The staff list | `pii.staff` | a staff list in `config` |
| Who did it | a `staff_id` column linking to `staff` | a free-text name or email |
| A date in the year | a `date`; the fortnight and week A/B are looked up | a text `week` |
| Every engine or model run, its cost | `flow_run` | a run table per feature |
| Questions of every subject (samples, passages, rubrics) | the shared tables (`english_sample` becomes the one sample table) | a table per subject |

Records that are never edited (a correction is a new row): `evidence_event`, `activity_observation`, `approval`,
`change_log`. Nothing else needs that guard.

**How `approval` is used (CP-27 group 3).** One row per decision: `kind` and `target` say what (a level is
`skill_code difficulty`, a way of asking its code, a report, a paper, a link or a question its id, a class card
`section week`, a level to review `skill difficulty scope_kind scope`), `decision` says which (`approved`, `sent_back`
with its reason, `withdrawn`; a question's `retire` or `keep`; a level to review `looked_at`; a class card `confirmed`),
`detail` what it was decided on (a card as seen, the counts a level was looked at on), `seq` the order. A paper is
drawn only of an approved way of asking (`drawable_item`); a report reaches a parent after two people approve it
(`approval_list`, `approval_checked`). Until group 4 a level's, a report's, a paper's and a link's approval are also a
stamp on their own row (`skill.level_approved` → `skill_level.confirmed_*`, `parent_note.approved_by`,
`sheet_instance.approved_*`, `skill_prerequisite.confirmed_*`); one trigger function, `internal.approval_from_stamp`,
writes the matching `approval` row, so new code reads `approval` or `approval_list`, never a stamp.

<!-- CP-27 group 5 (time): begin -->
**How time is kept (CP-27 group 5).** The timetable of a date is its `session` rows: one per lesson, with its `kind`
(`fixed`, `subject`, `specialist`); a period with no lesson is empty. `timetable_rule` holds the rules a timetable is made
from, told apart by `kind`: `frame` (the week A/B frame: a class's period on a weekday of week A or B, its cell and words,
from a date), `block` (a date, or a weekday of a week, or one period of either, on which nothing is placed, and why) and
`limit` (the fewest and most periods of a subject in a week or a fortnight). FET reads the frame from there; a draft
(`timetable_run`) put live and a lesson moved by hand change the sessions, never the frame. No table keeps a second copy
of a fortnight's periods. A fortnight's state is `fortnight.state`; each step taken (`freeze`, `align`, `approve`,
`list_sent`) is an `approval` row of kind `fortnight`. A class's fortnight approved (CP-7) is an `approval` row of kind
`timetable` (target `<class> <fortnight>`) carrying the signature of its lessons and the baseline it was given on; a
fortnight whose lessons say what the class's last settled fortnight said rolls forward with no row, and carries that
signature as the next one's baseline (`timetable_standing`). A draft put live is kind `timetable_live`, a clash accepted
kind `timetable_clash`, a week's declaration (N4) kind `week`. A lesson moved by hand, a change made after a fortnight
froze, a rule changed and a fortnight's state are `change_log` rows. Every `week` column is a `date`, the Monday of the
ISO week (`core/weeks.py`: `2026-W40` is 2026-09-28); an old paper's own label (`Sep W1`) stays in its key, with no date.
<!-- CP-27 group 5 (time): end -->
