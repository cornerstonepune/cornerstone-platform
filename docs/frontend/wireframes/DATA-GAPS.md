# Data gaps: what the screens ask for that the target tables do not have

For the backend orchestrator. Each row is a name in a screen's `data` field (`docs/frontend/screens.json`) that is not
one of the 75 target tables in `specs/CP-27/target-tables.md`. "Replaced by" is the frontend's reading of
`docs/data-model.md` ("one home for each shared job") and of what the migrations hold today; it is a proposal for the
backend to confirm, not a decision. "none: backend must answer" means no target table can carry it as far as the frontend
can tell.

How the list was made (9 Nov 2026): every snake_case name in each screen's `data` field was compared with the target
list, after replaying `supabase/migrations` in order (create, alter, rename, drop) to know each table's columns today;
that replay gives 170 tables, the count CP-27 cites. Names in the target list under `pii.` count as present. A name that
is only a column of a target table (`child_id`) is not a gap.

**Count: 25 gaps on 16 screens**, plus 2 found when binding the Class picture to the target tables (end of file).

| Screen | Missing name | Kind today | Replaced by (proposed) | Backend must answer |
|---|---|---|---|---|
| `today-educator` | `child_observed_state` | table | `child_skill_state` | Does the K2 observed state fold into `child_skill_state`? It has no `grade_code`, `named_days`, `adults`, `rechecked_on`, and its `state` check lacks the K2 words (secure / practising / emerging) as `child_observed_state` uses them. |
| `children` | `child_observed_state` | table | `child_skill_state` | As above (coverage per class). |
| `picture` | `child_observed_state` | table | `child_skill_state` | As above; the Class picture binds its grid to `child_skill_state.state` + `child_state.words`. |
| `child` | `child_observed_state` | table | `child_skill_state` | As above. |
| `skill` | `child_observed_state` | table | `child_skill_state` | As above. |
| `picture` | `graph_run` | name | `flow_run` (`flow` = the nightly picture rebuild, `finished_at`) | Which `flow_run.flow` value marks the nightly rebuild. |
| `child` | `skill_link_confirmed` | view | a view over `activity_skill` + `approval` | Does the view survive CP-27, and over which tables? |
| `skill` | `skill_link_confirmed` | view | a view over `activity_skill` + `approval` | As above. |
| `notes` | `note_status` | table | a check rule on `pii.educator_note.status` | Where do the status words live (a `config` word list, per data-model "a short fixed list")? |
| `timetable` | `timetable_slot` | table | `session` (the dated lessons; CP-27 Done-when 15) | None if sessions exist for every school day shown. |
| `fortnight` | `fortnight_cycle` | table | `fortnight` (with its state) | `fortnight` has no `state` column today; the cycle's dates and who-froze-it go to `approval` / `change_log`? |
| `rules` | `timetable_block` | table | `timetable_rule` | `timetable_rule` is not built yet: its columns. |
| `rules` | `timetable_limit` | table | `timetable_rule` | As above. |
| `rules` | `timetable_rule_edit` | table | `change_log` | None. |
| `paper` | `capture_page` | table | `capture` (+ `sheet_instance`) | Where a page's QR read per file page lives once `capture_page` goes (a jsonb on `capture`?). |
| `activity` | `activity_part_source` | table | none: backend must answer | Which source each part of an activity came from (school / draft / person): a column on `activity`, or `curriculum_proposal`? |
| `curriculum` | `activity_part_source` | table | none: backend must answer | As above. |
| `activity` | `curriculum_edit` | table | `change_log` | None. |
| `skills-approve` | `calibration_review` | table | `eval_case` | None if a calibration review is hand-checked truth. |
| `bank` | `item_stat` | table | none: backend must answer | `item_stat` is a Ring B table in CLAUDE.md but not a target table: a view over `item_result`, or kept? |
| `bank` | `bank_proposal` | table | `curriculum_proposal` (+ `approval` for the decision; `bank_decision` too) | None. |
| `question` | `key_correction` | table | `change_log` + `approval` | None. |
| `question` | `item_key_change` | table | `change_log` | None. |
| `question` | `item_review` | table | `eval_case` | None. |
| `classes` | `child_move` | table | `enrolment` (close one, open one) + `change_log` | None (CP-27 Done-when 12). |

## Found when binding the Class picture to the target tables

| Screen | What is missing | Why | Backend must answer |
|---|---|---|---|
| `picture` | secure count per fortnight (the Spark) | `child_skill_state` is Ring B: rebuilt, today only, no history | Keep a per-fortnight snapshot (a derived table or a view over `evidence_event` by date), or drop the Spark from the screen. |
| `picture` | "not seen" per child on a skill | computed: an open `enrolment` with no `child_skill_state` row for the skill | None; noted so a builder does not look for a column. |

## Other things the frontend noticed (not table gaps)

- `screens.json` `picture.done_when` says "10 per row at 1440, 8 at 400"; `picture.phone` says "6 columns"; SPEC §2 rule 10
  and §5 ClassGrid say 8 at 1440 and 3 on a phone. Three numbers for one grid. The rule that never bends says 8 / 3; the done_when line needs correcting before UI-3 writes its test.
- `skill.name` vs `registry_skill.domain`: the Class picture's domain filter reads `registry_skill.domain` through
  `skill.registry_codes`; whether K2 domains (Number, Language, Arts) are that column or `subject.name` is for the backend.
