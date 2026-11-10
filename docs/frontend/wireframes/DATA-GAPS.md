# Data gaps: what the screens asked for that the target tables did not have, and how the backend decided

For the backend orchestrator and the builders. Each row is a name in a screen's `data` field
(`docs/frontend/screens.json`) that is not one of the target tables in `specs/CP-27/target-tables.md`.

**Decided 9 Nov 2026 by the CP-27 orchestrator on Nimish's instruction** ("decide the gaps; add a new table only if
absolutely needed, but make sure the data is captured and part of the backend"), in issue #551, which this file mirrors.
**Result: 0 new tables.** The target stays at 77 (+4 for sign-in = a budget of 81). Every data point is kept as a column,
a row in a shared table, or a view. Nothing below is built yet; each decision is built in the CP-27 group named in the last
column. **Column and view names are proposals** that the group's builder confirms against the code: wireframes bind to the
provisional ones through `provisional.json` (a note from `check.mjs`, not an error), and the name may still change.

Legend: **derive** = a view or a computation, **column** = a new column on a kept table, **rows** = rows in a shared table.

Kept honest by a test: `node docs/frontend/wireframes/check.mjs --gaps` re-derives from `screens.json` and the migrations
the names that are still not tables, and fails if a row here does not name both the screen and the name. Rules for the
frontend (from #551): do not build a control that needs a table not named here; send new gaps as a list in a comment on #551.

## Decided in issue #551

| Screen | Needed name | Kind today | Decision | How | Group |
|---|---|---|---|---|---|
| `today-educator`, `children`, `picture`, `child`, `skill` | `child_observed_state` | table | **column** | Folds into `child_skill_state`: add `kind` (`written` or `observed`, default `written`) and nullable `named_days`, `adults`, `rechecked_on`. The K2 words (secure, practising, emerging) become rows in `child_state`. The written graph keeps reading `kind = 'written'` only, so written states do not change. | 6 |
| `picture` | `graph_run` | name | **rows** | A row in `flow_run` with `flow = 'graph_nightly'`; the evidence and state digests go in `result`. `engine live watch` reads it from there. | 6 |
| `child`, `skill` | `skill_link_confirmed` | view | **derive** | A view over `activity_skill` and `approval`. Survives CP-27. | 3 |
| `notes` | `note_status` | table | **rows** | A rule on `pii.educator_note.status`; the words are a `config` list. | 4 |
| `timetable` | `timetable_slot` | table | **rows** | `timetable_rule` rows with a `kind`. The `timetable` screen reads dated `session` rows. | 5 |
| `rules` | `timetable_block`, `timetable_limit` | table | **rows** | The same `timetable_rule` rows, with a `kind`. | 5 |
| `rules` | `timetable_rule_edit` | table | **rows** | `change_log`. | 2, 4, 5 |
| `activity` | `curriculum_edit` | table | **rows** | `change_log`. | 2, 4, 5 |
| `classes` | `child_move` | table | **rows** | `change_log`. A move is a closed enrolment plus a new one, plus a `change_log` row. | 2, 4, 5 |
| `fortnight` | `fortnight_cycle` | table | **column** | `fortnight.state`. Each step's yes is an `approval` row. | 5 |
| `paper` | `capture_page` | table | **column** | `capture.pages` (jsonb: file page, printed code, QR read), written once when the capture is made; a trigger refuses any later change, as `capture_page` does today. | 6 |
| `activity`, `curriculum` | `activity_part_source` | table | **derive** | A view over `change_log` (origin: upload = school, proposal = drafted, person = person) and `curriculum_proposal` (the `check_me` flag). Rows in `change_log` already tell school text from drafted text. | 2 and 6 |
| `skills-approve` | `calibration_review` | table | **rows** | `approval` rows, kind `calibration` (not `eval_case`). | 3 |
| `bank` | `bank_proposal` | table | **rows** | `curriculum_proposal`, and the decision as an `approval` row. | 3 |
| `question` | `key_correction`, `item_key_change` | table | **rows** | No new column (revised in #551 after the group 3 code map): `item.item_key` already is the current key; old keys are `change_log` rows. | 3 |
| `question` | `item_review` | table | **rows** | Rows in `eval_case` (revised in #551 after the group 3 code map: it also holds verdicts on whole levels, not only questions). It is a review queue, not gold. | 3 |
| `bank` | `item_stat` | table | **derive** | A view over `item_result`. The "mislevelled" flag is computed from `level_rule`, not stored. Kept as a view only if it returns the same numbers as the table on live-shaped rows. | 6 |

## Decided in issue #551: found while drawing the wireframes

| Screen | What was missing | Decision | How | Group |
|---|---|---|---|---|
| `picture`, `skill` | secure count per fortnight (the Spark) | **rows** | The nightly run records class-level counts (secure per skill per class, no child ids) in `flow_run.result`. History before today is rebuilt once by running the pure graph as of each past fortnight end. Depends on the nightly job running on live (a deferred fix that needs Nimish's yes). | 6 |
| `picture`, `skill`, `children` | "not seen" per child | **derive** | Computed: an open `enrolment` with no state row for the skill. No change. | none |
| `picture`, `skill` | `registry_skill.domain` vs `subject.name` | **derive** | Use `registry_skill.domain` through `skill.registry_codes`. Unverified for K2 skills; the seed loader fills it. | 6 |
| `record`, `confirm`, `notes` | which period a note belongs to | **column** | `pii.educator_note.session_id`. | 4 |
| `confirm` | the reader's flagged problems | **column** | `pii.note_claim.flag` (null = none; the words are in `config`). | 4 |
| `confirm` | each child's drafted mark before Confirm | **column** | `pii.note_claim.outcome` and `entry_mode`, set when the note is read, not parsed again on each view. | 4 |
| `children`, `notes` | notes waiting per child; the children a note names | **column** | `pii.note_claim.child_id` (null when no match). | 4 |
| `notes` | "by voice / form" | **column** | `pii.educator_note.route`. | 4 |
| `period`, `confirm` | the words above / as expected / below / not willing / absent; entry-mode and route words | **rows** | `config` word lists. | 2 (done for weights) and 4 |
| `child` | named days per skill | **column** | `child_skill_state.named_days` (part of the `child_observed_state` fold above). | 6 |
| `children` | attendance, last 7 school days | **derive** | No register exists, and none is built. An `absent` observation already records a child away. The strip shows **absences noted**, over school days that had a confirmed lesson for the class; a day with none shows blank, not "present". The agreed workflow (N4) lists attendance inside the week declaration, so a real register is a school decision, not a backend gap. See the open question below. | 4 |

## Still open (not decided in #551)

| Screen | What is open | Why | Who answers |
|---|---|---|---|
| `children` | **Is "absences noted" enough, or does the school want a real daily register?** | A register would be a new table (a column on `enrolment` per day does not fit). It was not added: the agreed workflow does not ask for one. | Nimish |
| `skill` | "Change a level's sentence" writes a `skill_level_version` row | `skill_level_version` is not a target table; `skill_level` has a `version` column. Does each save insert a new `skill_level` row with the next `version`? | backend |
| `activity` | a photo of the set-up attached to an activity | `capture` holds scanned sheets (`sheet_instance_id`), not photos of an activity, and nothing may attach a photo to a child. A target for activity photos, or the capture goes from this screen. | backend |
| (none yet) | `week_declaration` is not in the 77 | #551 did not check where it goes; group 5's mapping must place it. | group 5 |

## Added by wireframe revision 1 (issue #546, 9 Nov 2026)

New asks for the backend. None needs a new table, and none is built; the wireframes mark them with `data-gap`.

| Screen | What the screens ask | Why it is a gap | Backend must answer |
|---|---|---|---|
| `children`, `picture`, `skill`, `today-educator`, `period` | **Saved educator groups.** Groups are computed (by state on a skill, by skill and level, by class) and never stored. Does an educator keep a named group of her own ("the reading group") that stays when the numbers change? | Nothing in the 77 holds a named list of children owned by a person. The frontend draws no control for it. | A decision: no saved groups, or rows in a shared table (for example `config` or `staff_note`) keyed to the staff member. Out of scope for the frontend until answered. |
| `picture`, `skill` | **Clusters of children who share a place on a topic**, with counts (for example secure here and ready for the next skill; practising and one step from secure). | The tables hold each child's state per skill (`child_skill_state`) and the events behind it (`evidence_event`); nothing computes who shares a place. Code decides, not a model: a pure function, an engine endpoint the page calls. | Where the function lives (an engine endpoint over `child_skill_state` and `evidence_event`, or a view), its definition of "shares a place", and that a child may sit in several clusters. |
| `children`, `picture`, `skill`, `today-educator`, `notes`, `period`, `confirm` | **ChildPeek: a child's recent history in date order**, with who and when: notes (`pii.educator_note`), observations (`activity_observation`), papers (`item_result`), state changes (`evidence_event`), corrections (`change_log`). | Every source exists or is decided, but nothing merges them. `change_log` is not built yet, and a note's words are private-side data. | One engine query that merges the five by date and returns who and when; which role may see a note's words in a peek; the page size. |
| `today-educator`, `notes`, `assessments` | The boards need no new data: a lane is the table's rows in one state (`pii.educator_note.status`, `session`, the assessment's step). | none | none (noted so a builder does not look for a column). |

## Added by wireframe batch 3 (today-coordinator, assessments, assessment, paper)

| Screen | What the screens ask | Why it is a gap | Backend must answer |
|---|---|---|---|
| `assessments` | **The name an educator chose for an assessment.** The list shows the built name (topic · skill · level · kind · class · day) unless an educator named it. | Today an `assessment_name` table holds those rows (one per naming, never edited). It is not one of the 77. | Where the chosen name goes without a table: a `change_log` row keyed by `sheet_instance.key` (newest wins), as #551 did for other edits. |
| `assessments`, `assessment` | **An assessment's step** (Created, Approved, Printed, Uploaded, Read, Checked, Results in) and its counts per step. | Not a gap in tables: the step is derived (`apps/web/lib/assessment-steps.ts`) from `sheet_instance.approved_at`, `printed_at`, `capture.status`, `item_result.status`, `confirmed_at`. Noted so a builder does not look for a column. | none |
| `assessment` | **Two packs of one assessment** (a first pack, and later copies for absent or new children) each approved on its own. | `approval` rows (kind, target) can carry it; the wireframe assumes one `approval` row per pack, target = the pack's copies. | Confirm the `approval.target` shape for a pack. |
| `paper` | The wireframe uses `item_result.read_confidence` and `read_correction.human_read` for "the engine was 61% sure" and "your answer, beside the engine's read". | Both exist today. | none |

## Other things the frontend noticed (not table gaps)

- Decided 9 Nov 2026 (frontend orchestrator): the class grid is 8 columns at 1440 and 3 on a phone (SPEC §2 rule 10,
  §5). `picture.done_when`, `picture.phone` and `skill.phone` in `screens.json` say so.
- Revision 1's spacing scale lives in `docs/frontend/spacing.json`, not `tokens.json`, because the site's copy of
  `tokens.json` is held byte for byte by UI-14 and revision 1 changes no app code (DESIGN.md §1).
- `specs/CP-27/target-tables.md` says 77, and the first version of this file said 75: 77 is right.
