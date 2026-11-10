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
`change_log`, and, among the cases of `eval_case`, a hand check (CP-9 item 7: a guard on that kind's rows alone).
Nothing else needs that guard.

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

**How `curriculum_proposal` and `eval_case` are used (CP-27 group 3).** A proposal is a row with `about` empty, its
`kind` saying whose: the curriculum mapping's (`skill`, `objective`, `levels`, `lo_skill`, `page_part`, `material`,
`skill_offer`, the only kinds `engine curriculum` reads, `map_ledger.MAPPING`) or the question bank's (`mislevelled`: a
question far off its level; `new_mistake`: a rule children's answers point to; direction and evidence in `proposal`).
What a person or a run did with it is a later row naming it (`about`): a person's answer carries their `staff_id`; a
bank proposal removed or adopted is `applied`, kept or rejected `rejected`, the note its `reason`. An adopted mistake
keeps its rule on the named mistake (`misconception.learned_rule`, `learned_from`). An item an educator adds to the
materials catalogue is not a proposal: it names who and when on the item (`material_item.proposed_by`, `proposed_at`).
`eval_case` holds one case per row, `kind` saying which: `report_finding` (an educator's report transcribed, for one
child; confirmed by a person), `hand_check` (a hand calculation of a child's state, never changed, dated by the school's
day) and `item_review` (a reviewer model's verdict on a question or a level's rule, `ref` = `template:<skill>:<level>`).
What every kind names is a column (child, skill, level, `ref`, `verdict`, `source`, `confirmed_by`, `checked_on`), the
rest is `detail`.

**Current values, and how they came to be (CP-27 group 3, step 3C).** Where a history table also held the value that
stands, the value is on its own row and each change a row of `change_log`, which nothing reads back as the value:
- a question's key is `item.item_key`; each re-key is a `change_log` row of `item` (row: the question's id, op
  `rekey`, before/after `{item_key}`), and `current_item_key()` follows them from any key it had (a unique index: a key
  is left once);
- a paper question's right answer is on the question (`spec`, `responses`); each correction is a row of `item` (row:
  its key `legacy/<paper>/<question>`, op `correct_key`, before/after `{answer}`, origin who), which every entry of the
  paper on deploy puts back over its file (`keys.reapply`);
- a person's choice on a doubtful page is `capture.page_choices` (by file page), a named mistake
  `item_result.named_mistakes` (by the reading it was named on): maps, so each page and each reading keeps its own;
- a kind stopped at a level is `skill_level_question_type.stopped_at`/`stopped_by` (the view `kind_stopped`), a kind
  taken from an English level `removed_at`/`removed_by`; the bank's links keep a row that carries either. Each stop,
  restart, addition and removal is a row (row: `skill level kind`).

**How the staff list and a child's class are kept (CP-27 group 4).** The staff list is `staff` (active, `role_code`,
the `classes` and `subjects` the website shows; never a grant) with its `pii.staff` row (name, email, the password hash
and `password_set_at`). The website signs a person in as their `staff.id` (`app.staff_id`, `current_staff()`), reads the
list through `staff_list(slug)` and writes it through `staff_set_password` and `staff_add` (it has no right on
`pii.staff`); taking a person off makes them inactive with no password, never a delete. A child's class and roll number
are their open `enrolment` in a `school_class` of the year; `school_class.label` is what pages, URLs and `staff.classes`
call the class (K2's class is section A, label K2), and the view `child_now` gives a child with their class label (as
`section`) and roll number. A move closes one enrolment and opens one, and writes one `change_log` row (table `child`,
op `move`). A class's word that a skill is taught is `school_class.taught` ({skill: {taught, by, at}}); the class card
is built from the graph when asked, never stored.
