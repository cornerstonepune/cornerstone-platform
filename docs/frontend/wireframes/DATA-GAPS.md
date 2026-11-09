# Data gaps: what the screens ask for that the target tables do not have

For the backend orchestrator. Each row is a name in a screen's `data` field (`docs/frontend/screens.json`) that is not
one of the 75 target tables in `specs/CP-27/target-tables.md`. "Replaced by" is this kit's reading of
`docs/data-model.md` ("one home for each shared job") and of what the migrations hold today; it is a proposal for the
backend to confirm, not a decision. "none: backend must answer" means no target table can carry it as far as the kit
can tell.

Kept honest by a test: `node docs/frontend/wireframes/check.mjs --gaps` re-derives the list from `screens.json` and the
migrations, and fails if a row here does not name both the screen and the missing name.

**Count: 25 gaps on 16 screens** (by `check.mjs --gaps`, 9 Nov 2026), plus 2 found while drawing the pilot (end of file).

| Screen | Missing name | Kind today | Replaced by (proposed) | Backend must answer |
|---|---|---|---|---|
| `today-educator` | `child_observed_state` | table | `child_skill_state` | Does the K2 observed state fold into `child_skill_state`? It has no `grade_code`, `named_days`, `adults`, `rechecked_on`, and its `state` check lacks the K2 words (secure / practising / emerging) as `child_observed_state` uses them. |
| `children` | `child_observed_state` | table | `child_skill_state` | As above (coverage per class). |
| `picture` | `child_observed_state` | table | `child_skill_state` | As above; the pilot wireframe binds the grid to `child_skill_state.state` + `child_state.words`. |
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

## Found while drawing the pilot (picture.html)

| Screen | What is missing | Why | Backend must answer |
|---|---|---|---|
| `picture` | secure count per fortnight (the Spark) | `child_skill_state` is Ring B: rebuilt, today only, no history | Keep a per-fortnight snapshot (a derived table or a view over `evidence_event` by date), or drop the Spark from the screen. |
| `picture` | "not seen" per child on a skill | computed: an open `enrolment` with no `child_skill_state` row for the skill | None; noted so a builder does not look for a column. |

## Other things the frontend noticed (not table gaps)

- Decided 9 Nov 2026 (frontend orchestrator): the class grid is 8 columns at 1440 and 3 on a phone (SPEC §2 rule 10,
  §5). `picture.done_when`, `picture.phone` and `skill.phone` in `screens.json` now say so.
- `skill.name` vs `registry_skill.domain`: the pilot's domain filter reads `registry_skill.domain` through
  `skill.registry_codes`; whether K2 domains (Number, Language, Arts) are that column or `subject.name` is for the backend.

## Found while drawing batch 1 (period, record, confirm, notes, children)

| Screen | What is missing | Why | Backend must answer |
|---|---|---|---|
| `record`, `confirm`, `notes` | which period or activity a note belongs to | `pii.educator_note` has no `session_id` (columns today: staff_id, class_id, audio_key, transcript, received_at, status, ...); only `activity_observation` carries `session_id`, and only after confirm | Add `session_id` to `pii.educator_note` (CP-10 Done-when says Send writes "this session's id"). |
| `confirm` | the reader's flagged problems | `pii.note_claim` has no column for a child it could not match or a line with no mark | Where does a flag live: a column on `pii.note_claim`, or a row in `flow_run.result`? |
| `confirm` | each child's drafted mark before Confirm | `pii.note_claim` holds `read_as` and `words` as text; `activity_observation` is written only at Confirm | Is the draft per-child mark parsed from `read_as`, or held in a new column? |
| `notes` | "by voice / form" of a waiting note | `route` exists only on `activity_observation`, written at confirm | A `route` column on `pii.educator_note`. |
| `period`, `confirm` | the words above / as expected / below / not willing / absent | `observation_outcome` is not a target table | Do the outcome words become a `config` word list? |
| `children` | live sittings and answers to check (Assessments card) | no target table says an answer is waiting for a check | Which table and state give these two counts? |
