# CP-27 plan: groups 2 to 5

Written 9 Nov 2026 from two read-only maps of origin/main:
- `g2-g3-map.md` (settings, history, approvals, proposals, evals);
- `g4-g5-map.md` (people, who-did-it, a child's class, time).

Both maps give file:line for every reader and writer. Group 1 (word lists and unused tables) is being built.
Group 6 (materials, derived tables, cleanup) is planned after group 5.

## Rules every group follows

1. **One group, one pull request, one migration**, numbered after main's newest. Groups run one at a time.
2. **A table with rows is never dropped.** The migration:
   - copies its rows to their new home;
   - checks the counts inside the migration, and rolls the whole change back if they differ;
   - then moves the old table to schema `retired`.

   Empty tables (census) may be dropped.
3. **Before merge:**
   - the full suite passes on the *ready* pull request;
   - the old spec proofs keep their behaviour;
   - `supabase/table-budget.json` goes down.
4. **Rehearsed on a copy of live** before merge for every group that moves rows (groups 2 to 5). The rehearsal workflow is started by hand. `engine past` fingerprints must be equal before and after.
5. **Where a history table also holds the current value,** the current value becomes a column on the owning row and the history goes to `change_log`. "Latest row wins" never lives in a log alone.
6. **Tests check behaviour** through engine functions, routes or views. Shared test fixtures come first (one for staff, one for settings), so later groups change one helper, not 50 files.

## Changes to the CP-27 scope these maps force (need Nimish's OK)

| # | Spec says | Change | Why |
|---|---|---|---|
| A | 75 target tables | **77**: keep `read_correction` and `item_exposure` | `read_correction` (1,646 live rows) is the standing of every answer and feeds the reader's trust (about 30 readers). It is core assessment truth, not history. `item_exposure` rows are written when questions are chosen, before any paper exists, so a view cannot rebuild them |
| B | Table budget at most 79 | **81** | follows from A (77 + the 4 sign-in tables) |
| C | Exactly 4 tables refuse edits | **6**: add `curriculum_proposal` and `timetable_run` | a model's proposal and a kept FET draft are records that must never change (CP-11 item 5) |
| D | Item 8: role grants unchanged | **unchanged, kept** | the role, classes and subjects the website shows go into columns on `staff`, not into grants, so grants stay exactly 9 |

## Group 2: one settings table, one history log

**Tables leaving:**
- Settings: `threshold` (101 rows) merges into `config`. `observed_rule` (1 row) becomes columns on `grade`. `observed_weight` (2 rows) moves to `config`.
- Dropped outright: `validation_rule` and `validation_stage` (no production reader). `approval_kind` becomes a rule on `approval.kind`, keeping `reaches_parent`.
- History moving to `change_log`:

  | Table | Live rows |
  |---|---|
  | `curriculum_edit` | 4,232 |
  | `skill_set_version` | 93 |
  | `skill_level_version` | 76 |
  | `english_sample_edit`, `paper_edit`, `fortnight_edit`, `timetable_rule_edit`, `materials_line_edit`, `materials_consolidated_change` | 0 each |

**New:** `change_log(table_name, row_id, op, before jsonb, after jsonb, staff_id, origin, reason, at)`. One trigger writes it on every table that had history. `origin` tells a person from an upload or script, which `curriculum_edit.changed_by` does today. CP-1 item 5 (a who-and-when row for every activity and link edit) is the test.

**Behaviour to keep:**
- Every `config` and `threshold` read returns the same value and type. Six SQL objects do arithmetic on threshold values. The website reads them in three places: `lib/guide.ts:62` (casts every row), `lib/auth.ts:65`, `lib/password-links.ts:94,97`.
- `child_state.why` keeps its `{threshold.key}` tokens.
- Editing a level still withdraws only that level's approval (`skill_set_version_on_change`).
- K2 uploads still tell school text from drafted text.

**Engine:** one reader, `core/settings.py`. The 7 settings readers and about 20 direct `from config` sites move to it. 18 `*_on_new_school` functions become one.

**Tests:** CP-1 item 5; CP-13 items 2 and 3 (minimum adults per grade from `grade`); `test_table_budget`; the full suite.

**Size (estimate):** 60 to 90 files.

## Group 3: one approval list, one proposal list, one eval set

**Into `approval`:**
- `question_type_approval` (74);
- `class_card_confirmation` (0), `bank_decision` (0), `calibration_review` (0);
- `item_feedback` (7,728): the verdict becomes an approval row. The trigger that retires a flagged item stays, re-pointed.

**Approval stamps on owning rows:**
- `sheet_instance.approved_by`, `parent_note.approved_by`, `skill.level_approved`, `skill_level.confirmed_by`, `skill_prerequisite.confirmed_by` become approval rows.
- The owning row keeps a plain state column where a page reads it fast. `drawable_item` still requires a confirmed level and an approved question type.
- `approval_checked` becomes kind-aware: a second approval must come from a different person, for the kinds that need two.

**Into `curriculum_proposal` (the one proposal list):**
- `bank_proposal` (3);
- `material_item_proposal` (0);
- `learned_mistake` (0): becomes a column on `misconception`.

**Into `eval_case`:** `gold` (0), `gold_finding` (24), `hand_check` (0), `item_review` (10, the reviewer model's verdicts).

**Current state that needs a column plus the log:**

| Table | Live rows | Becomes |
|---|---|---|
| `item_key_change` | 4,170 | `item.key` current, history in `change_log`; `current_item_key()` reads the column |
| `key_correction` | 0 | the same column; `keys.reapply` on deploy keeps working |
| `page_choice` | 0 | a column on `capture`; `may_confirm` keeps its gate |
| `mistake_named` | 0 | a column on `item_result` |
| `skill_level_kind_change`, `skill_level_kind_stop` | 0 | columns on `skill_level_question_type` |

**Behaviour to keep:**
- A parent note is sent only after two different people approve it (`parent_note_sent_when_approved_twice`).
- A flagged item is retired.
- `drawable_item`, `answer_standing` and `resolve_result` give identical results. `engine past` must be equal, which is the assessment guarantee.

**Tests:** `test_parent_report.py` unchanged; `test_calibration.py`; the question-bank and drawable tests; `engine past` on the rehearsal.

**Before merge:** Nimish's Mac copy, or confirmed daily backups. This is the first group that moves assessment rows.

**Size (estimate):** 80 to 120 files.

## Group 4: one staff list, real "who did it", a child's class in one place

**Staff:**
- `pii.staff` becomes the only list. A password-hash column is added there, so the hash never sits in `public`.
- `staff` gains `role_code`, `classes` and `subjects` (the website shows these; educators hold no grants).
- `config` key `app.staff` goes.
- Sign-in (`auth.ts` `verifyStaff`), the staff page actions and `password.ts` read and write `pii.staff`.
- `current_staff()` and `app.staff_id` move from the sign-in entry id to `staff.id`. The four access rules that compare `capture.uploaded_by` and `flow_run.uploaded_by` are re-keyed first.
- Removing staff marks them inactive and clears the hash. It never deletes.
- One fixture helper per language replaces the about 57 tests that write `app.staff` JSON by hand.

**Who did it:**

| Today | Columns | Change |
|---|---|---|
| a staff id stored as text | `enrolment.recorded_by`, `staff_role_grant.granted_by` | cast to uuid |
| an email | `approved_by`, `override_by` | match to `staff.id` |
| a name, or "Name (role)" | `ask.answered_by`, `skill.level_band_by`, `ratified_by` | match to `staff.id` |
| an HMAC of the email | `staff_note.reporter` | match by HMAC |
| a script label | "seed load", "loader", `session_user` | `staff_id` null and `origin` set (a fake staff row would break "staff = 7") |

Values that cannot be matched go to `legacy_by`, counted.

**A child's class:**
- G1 to G3 children have no enrolment rows yet; only K2's 22 do. Create them first from `child.section` and `roll_no`, mapping each section label to its `school_class`. Note that K2 children say `K2` while their class says `A`. Then add the `child_now` view with the columns pages read, move readers, and drop `child.section` and `roll_no`.
- `child.band` (the grade) **stays**: a child's grade can differ from the class's majority.
- The text `section` keys on `class_card`, `class_skill`, `sheet_instance` and `week_declaration` become `school_class_id` where the table stays.

**Behaviour to keep:**
- Every staff member signs in.
- Adding and removing staff work.
- The CP-3 and CP-4 access tests pass with the restricted login.
- A child moves class in one step.
- Open enrolments per class are equal before and after.

**Size (estimate):** 90 to 130 files, about half of them tests.

## Group 5: the timetable is the dated lessons; weeks become dates

The website never touches these tables, so the work is engine, SQL and tests.

**Leaving:**
- Rules: `timetable_block`, `timetable_limit` and the week A/B frame `timetable_slot` (150 rows) become `timetable_rule` rows with a `kind` column. FET reads the frame from there, so demand and pinned lessons are unchanged.
- `fortnight_cycle` (8 rows): its state becomes `fortnight.state`, and each step's yes becomes an `approval` row.
- `fortnight_plan` and `fortnight_plan_line` (0 rows): "unchanged since the last approved" becomes a signature of the fortnight's sessions, stored on the approval row. `fortnight_approve`, its guard and the cycle gate move with it.
- `timetable_live` and `timetable_clash_accept` (0 rows): become `approval` rows.
- `timetable_move` (0 rows): becomes `change_log`. A swap is a delete and re-insert, so the move function writes its log row itself and does not rely on the trigger. This keeps CP-12's "an accepted clash lapses when its lesson moves".
- Text `week` columns become dates. Labels that don't convert (`Sep W1`, `Baseline`, `Jul 24` on old templates) keep their text in `sheet_template.key`; the date stays empty for those.

**Behaviour to keep:** the Done-when lines of CP-6, CP-7, CP-11, CP-12 and CP-22. Their proofs are rewritten to call engine functions. The hard ones are:
- a 15-day fortnight's signature;
- a rolled-forward fortnight writes no approval yet still has a baseline. The baseline is the last approval's signature, carried forward.

**LIVE check:** sessions per date for the current and next fortnight are equal before and after.

**Size (estimate):** 70 to 100 files.

## Order and timing

1. Group 1, then 2, 3, 4 and 5, each merged before the next starts.
2. Groups 1 and 2 can merge any day.
3. Groups 3 to 5 move live rows. Before 16 Nov, any time. After school opens, merge in the evening, with the K2 educator told the day before for group 5 (her timetable).
4. Not before group 3: the Mac copy or confirmed backups.
