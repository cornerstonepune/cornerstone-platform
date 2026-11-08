# CP-4: role rules on every other table

Branch `cp-4-build`, from main at CP-3 (750ec6f). Scope `specs/CP-4`, design `specs/CP-4/design.md`, ADR 0101 amended.

## Verified (local, on databases built by `bin/testdb fresh` plus this migration)
- `specs/CP-4/proofs`: 34 passed, 1 failed. The one failure is `test_6_engine_privileges_unchanged_by_the_cp4_migration`
  and it cannot pass as written: proofs 1 and 4 require `access_table` to gain `data_class` and `reason`, `app_engine` holds
  a table-level grant on `access_table` (CP-3), and the proof counts the two new columns as privileges "gained". Needs a
  one-line edit of the proof (compare only columns that existed before) which only Nimish's UNLOCK allows.
- Engine suite (4,140 tests, 3 local shards on separate databases): all pass but `test_spine_provenance` (2, downloads
  NCERT PDFs; this sandbox lacks the certificate) and `test_curriculum_versions` (deselected, fails before 9 Nov).
  Two engine tests changed (below). `bin/check`: 34 passed. `engine load --check`: unchanged on a second run.
- Browser suite, 3 shards in CI order, each on its own fresh database, the site as `app_web`: 194 + 194 + 194 passed, 0
  flaky, 0 skipped. Before the fix of `worksheets/[qr]` one test failed (see "What the rules broke").

## Speed (synthetic school: 150 children, 6 classes, 6,000 papers and scans, 120,000 answers, 30,000 evidence rows)
Best of 3, milliseconds, as `app_web`; "before" adds an allow-everyone rule beside the new ones. Educator of one class
(25 children, 1,000 papers, 20,000 answers), then a coordinator ("everything").

| Query | Before | Educator after | Coordinator after |
|---|---|---|---|
| answers of one scan | 1.5 | 18 | 5 |
| count of scans | 1.4 | 33 | 4.3 |
| count of papers | 1.4 | 31 | 4.1 |
| count of evidence rows | 3.4 | 15 | 6 |
| answers joined to scans and papers (one week) | 5 | 25 | 9 |
| top papers by wrong answers (join of three) | 51 | 105 | 134 |
| count of every answer (120,000 rows) | 12 | 427 | 14 |

The fixed cost of a statement for an educator is the 15 to 20 ms that builds the list of ids they may see (once per
statement). The one slow shape is a full scan of the answers table: the rule compares each row against a list of 1,000
scan ids, and Postgres does that list by list, not by hash. A page asks the answers through a scan, a paper or a child, which
use an index and cost the 18 ms. Two things found and fixed on the way: the scans' ids were found with an `or` that read all
6,000 scans (35 ms, now two key lookups, 4 ms); `staff_sees_capture` ran the scan rule on every call and now answers as the
owner like `staff_sees_sheet`. Fallback not needed: a trigger-kept `child_id` on `capture` and `item_result` would turn the
427 ms into about 15 ms if a real page ever needs it.

## What the rules broke, and what was done
- The paper page told a code no paper has ("not found") from another class's paper ("belongs to another class") by reading
  the paper; the rule now hides it from an educator of another class. A yes-or-no function `sheet_code_exists` answers it
  (`apps/web/app/(app)/worksheets/[qr]/page.tsx`); the test `u26-my-classes-first` passes unchanged.
- Engine tests changed, none weakened: `test_roles.py` (asserts `engine_all` and `web_rule` / `web_all`, in place of
  `app_all`; the new functions in `WEB_CALLS`); `test_access_rules.py` (the key-column check covers child data);
  `test_voice_tables.py` (the website, signed in as nobody, now sees no observation: asserts that and the privilege).
  `engine/checks/rules.json` regenerated (`engine live rules --write`).
- CP-3's triggers that keep `staff.signin_id` do not fire under `session_replication_role = replica` (how the proofs
  and bulk loaders write): nobody resolved. They are now `ENABLE ALWAYS`.

## Decisions for Nimish, in plain words
1. School-wide data (the skill registry, curriculum, question bank, plan, timetable, materials and the tool's own records:
   127 tables) stays open to the website login, as today, not "signed-in staff only": the sign-in page reads seven of them
   before anyone is signed in, and a rule needing a person there would switch off the brute-force wait. Nothing is opened
   that was not open. Narrowing it needs sign-in moved behind a function (separate scope). `config` holds the sign-in
   list's password hashes and `password_link` token hashes, readable by the website login as today.
2. Plan, timetable and materials tables name classes but hold no child, so they are school-wide (the scope names plan
   and timetable as school-wide); design rule 2 would have made them child data.
3. A child who moves class takes their history with them out of the old class's view; a child who has left is seen by the
   "everything" group only (access is by open enrolment, as CP-3).
4. The class card (`class_card`, `class_card_confirmation`) is keyed by the class label, which is `school_class.section`
   (how `move_child` and the engine read it). If two grades shared a section label both classes' educators would see both
   cards; today only K2-A exists. Switch-on gate: an educator with no class grant sees no class card.
5. `who_looked` and `consent`: the register says the coordinator alone sees them, so educators see none. Nothing in the
   website reads them.
6. Papers with no child named yet are seen by educators of the paper's class label and by whoever uploaded a scan of it;
   an unmatched scan only by its uploader and the "everything" group.
Known gaps, named: `pii.read_child` and the security-definer functions `resolve_result`, `confirm_results`, `move_child`,
`say_taught` take any id and run as their owner (proposed follow-up); the rules guard against a page's mistake, not
someone holding the `app_web` password.

## Handoff
- Not live: both services still connect as the owner; nothing changes on the live site until the roles are switched on.
  Before that, run CP-3's switch-on gate and, per class, check the class card and papers pages as an educator.
- A new table now needs its `access_table` row in the migration that creates it, else that migration fails by name.

## The list (phase 1; `packages/engine/tests/support/access_list.py note <database url>`)
| Table | Class | Kind | Key | Reason |
|---|---|---|---|---|
| `pii.child` | child data | children | `child_id` (child) | |
| `pii.educator_note` | child data | notes | `class_id` (class) | |
| `pii.note_claim` | child data | notes | `note_id` (note) | |
| `pii.staff` | child data | staff | `staff_id` (staff) | |
| `public.access_log` | child data | who_looked | `child_id` (child) | |
| `public.activity_observation` | child data | notes | `child_id` (child) | |
| `public.capture` | child data | papers | `id` (capture) | |
| `public.capture_page` | child data | papers | `capture_id` (capture) | |
| `public.child` | child data | children | `id` (child) | |
| `public.child_move` | child data | children | `child_id` (child) | |
| `public.child_observed_state` | child data | learning | `child_id` (child) | |
| `public.child_reading_profile` | child data | answers | `child_id` (child) | |
| `public.child_skill_state` | child data | learning | `child_id` (child) | |
| `public.class_card` | child data | learning | `section` (section) | |
| `public.class_card_confirmation` | child data | learning | `section` (section) | |
| `public.consent` | child data | consent | `child_id` (child) | |
| `public.enrolment` | child data | enrolment | `class_id` (class) | |
| `public.evidence_event` | child data | learning | `child_id` (child) | |
| `public.gold` | child data | answers | `capture_id` (capture) | |
| `public.gold_finding` | child data | answers | `child_id` (child) | |
| `public.home_sheet` | child data | papers | `child_id` (child) | |
| `public.item_exposure` | child data | papers | `child_id` (child) | |
| `public.item_result` | child data | answers | `capture_id` (capture) | |
| `public.mistake_named` | child data | answers | `item_result_id` (item_result) | |
| `public.narrative_observation` | child data | answers | `capture_id` (capture) | |
| `public.page_choice` | child data | papers | `capture_id` (capture) | |
| `public.paper_edit` | child data | papers | `child_id` (child) | |
| `public.parent_note` | child data | reports | `child_id` (child) | |
| `public.prescription` | child data | papers | `child_id` (child) | |
| `public.read_correction` | child data | answers | `child_id` (child) | |
| `public.sheet_instance` | child data | papers | `id` (sheet) | |
| `public.staff` | child data | staff | `id` (staff) | |
| `public.staff_role_grant` | child data | staff | `staff_id` (staff) | |
| `public.academic_year` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.access_group` | school-wide | | | the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children |
| `public.access_kind` | school-wide | | | the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children |
| `public.access_reach` | school-wide | | | the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children |
| `public.access_role_group` | school-wide | | | the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children |
| `public.access_table` | school-wide | | | the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children |
| `public.activity` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.activity_material` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.activity_objective` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.activity_part_source` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.activity_skill` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.approval` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.approval_kind` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.approval_state` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.ask` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.assessment_name` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.bank_decision` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.bank_proposal` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.blueprint` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.calibration_review` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.campus` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.case_dimension` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.child_state` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.claim_decision` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.class_skill` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
| `public.config` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.curriculum_edit` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.curriculum_proposal` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.curriculum_version` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.curriculum_version_skill` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.data_register` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.difficulty` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.domain` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.english_sample` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.english_sample_edit` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.english_sample_wrong` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.evidence_kind` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.evidence_mark` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.evidence_scale` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.flow_run` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.fortnight` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.grade` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.item` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.item_feedback` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.item_key_change` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.item_registry_skill` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.item_review` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.item_stat` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.key_correction` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.learned_mistake` | school-wide | | | the question bank: questions, their keys, checks, statistics and reviews; no child |
| `public.learning_objective` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.learning_objective_skill` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.level_rule` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.link_status` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.link_strength` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.material_alias` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.material_item` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.material_item_proposal` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.material_unit_conversion` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_consolidated` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_consolidated_change` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_consolidated_line` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_consolidated_send` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_consolidated_source` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_line` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_line_edit` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_line_source` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_list` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_note_review` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_send` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.materials_send_ack` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.maths_sample` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.milestone` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.misconception` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.note_status` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.observation_entry_mode` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.observation_outcome` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.observation_route` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.observed_rule` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.observed_weight` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.passage` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.password_ask` | school-wide | | | sign-in before anyone is known: the website reads and writes these as the login itself, so they stay open to it |
| `public.password_link` | school-wide | | | sign-in before anyone is known: the website reads and writes these as the login itself, so they stay open to it |
| `public.period` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.plan_entry` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
| `public.prompt` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.question_format` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.question_type` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.question_type_approval` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.registry_skill` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.reminder` | school-wide | | | materials lists for the activities of a class and their shopping; by class id; no child |
| `public.report_item` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.role` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.rubric` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.school_class` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.school_day` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.session` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
| `public.sheet_template` | school-wide | | | a blueprint of a paper (its questions and layout), made before any child is named; the register lists it as a paper but it holds no answer |
| `public.sign_in_failure` | school-wide | | | sign-in before anyone is known: the website reads and writes these as the login itself, so they stay open to it |
| `public.skill` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_level` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_level_kind_change` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_level_kind_stop` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_level_question_type` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_level_sample` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_level_version` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_link` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_mistake` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_prerequisite` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_registry_link` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.skill_set_version` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.staff_note` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.state_colour` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.subject` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.taxonomy_case` | school-wide | | | activities and sample material the school wrote or approved for its curriculum; no child |
| `public.tenant` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.threshold` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.timetable_block` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
| `public.timetable_limit` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
| `public.timetable_rule_edit` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
| `public.timetable_slot` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
| `public.topic` | school-wide | | | the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child |
| `public.trait` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.validation_rule` | school-wide | | | skill registry and curriculum: the school's own teaching content, open to every educator; no child |
| `public.validation_stage` | school-wide | | | a word list the screens read (names, order, colour of states, marks, routes); no child |
| `public.web_error` | school-wide | | | the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child |
| `public.week_declaration` | school-wide | | | plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide) |
