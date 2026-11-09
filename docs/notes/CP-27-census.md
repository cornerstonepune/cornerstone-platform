# CP-27 census of live, 9 Nov 2026

Read-only, through the Supabase connector (direct database connections are refused from the cloud session). Counts and
dates only; no names. Source of every number: `pg_stat_user_tables` plus an exact `count(*)` and `max(created_at)` per
table, run once on 2026-11-09 about 13:30 UTC. 170 tables, the same 170 the migrations build.

## What it says

- **57 of 170 tables are empty.** Every materials table, every new timetable table (block, limit, run, live, move, clash, rule edits, the fortnight plan copy), the approval list, consent, observations and voice notes.
- **The assessment loop is the real data**, and it has been quiet since the Diwali break began: scans and answers stop after the week of 26 Oct.
- **The nightly picture rebuild has never run on live** (`graph_run` 0 rows; `child_skill_state` last written 2026-11-08 by hand or a deploy). The n8n schedule (F4) is not running. The voice clean-up flow (F5) has 0 runs in 7 days; no voice note exists yet, so nothing is at risk.
- **People:** 7 staff, 9 role grants, 22 open enrolments (the K2 class), 317 children of whom 51 are active (29 in G1-G3 plus the 22 K2); 266 inactive rows are the old test leftovers named in the 3 Nov census.

- **Every table has been read since the last statistics reset** (from 2 reads for the newest timetable tables to about 225 million for `item`), so "unused" here means empty, not unread.
- **48 tables that leave have rows**: their rows move to their destination with equal counts (Done when 6). Most are word lists and settings of a few rows; the large ones are history (`curriculum_edit` 4,232, `item_key_change` 4,170), feedback (`item_feedback` 7,728), corrections (`read_correction` 1,646) and derived copies (`item_registry_skill` 51,635, `item_exposure` 3,338).

## Papers per week (last 8 weeks)

| Week of | Copies made | Scans | Marked answers | Evidence rows |
|---|---|---|---|---|
| 2026-09-21 | 30 | 329 | 4,002 | 442 |
| 2026-09-28 | 22 | 31 | 354 | 1,080 |
| 2026-10-05 | 0 | 0 | 0 | 0 |
| 2026-10-12 | 81 | 16 | 291 | 0 |
| 2026-10-19 | 112 | 29 | 391 | 84 |
| 2026-10-26 | 52 | 32 | 489 | 14 |
| 2026-11-02 | 31 | 0 | 0 | 0 |
| 2026-11-09 | 0 | 0 | 0 | 0 |

Jobs in the last 7 days: picture rebuild 0, voice clean-up 0, all engine runs (`flow_run`) 1,465.

## Tables with rows

| Table | Rows | Last insert | In the target |
|---|---|---|---|
| `pii.child` | 317 | 2026-11-04 | stays |
| `pii.staff` | 7 | 2026-11-08 | stays |
| `academic_year` | 1 | 2026-11-04 | stays |
| `access_group` | 3 | 2026-11-09 | goes |
| `access_kind` | 10 | 2026-11-09 | goes |
| `access_log` | 96,151 | 2026-11-08 | stays |
| `access_reach` | 30 | 2026-11-09 | stays |
| `access_role_group` | 13 | 2026-11-09 | goes |
| `access_table` | 170 | 2026-11-09 | stays |
| `activity` | 2,497 | 2026-11-03 | stays |
| `activity_objective` | 746 | 2026-11-03 | stays |
| `activity_part_source` | 2,369 | 2026-11-07 | goes |
| `activity_skill` | 3,711 | 2026-09-19 | stays |
| `approval_kind` | 3 | 2026-10-23 | goes |
| `approval_state` | 4 | 2026-10-23 | goes |
| `ask` | 30 | 2026-10-12 | stays |
| `bank_proposal` | 3 | 2026-10-01 | goes |
| `campus` | 1 | 2026-11-03 | stays |
| `capture` | 1,066 | 2026-10-30 | stays |
| `capture_page` | 77 | 2026-10-30 | goes |
| `case_dimension` | 69 | 2026-10-12 | stays |
| `child` | 317 | 2026-11-04 | stays |
| `child_reading_profile` | 26 | - | goes |
| `child_skill_state` | 283 | 2026-11-08 | stays |
| `child_state` | 7 | 2026-11-03 | stays |
| `claim_decision` | 3 | 2026-11-03 | goes |
| `class_card` | 32 | 2026-09-29 | goes |
| `class_skill` | 4 | 2026-10-23 | goes |
| `config` | 69 | 2026-11-09 | stays |
| `curriculum_edit` | 4,232 | 2026-11-07 | goes |
| `curriculum_proposal` | 2,450 | 2026-11-07 | stays |
| `curriculum_version` | 1 | 2026-10-23 | stays |
| `curriculum_version_skill` | 155 | 2026-10-23 | goes |
| `data_register` | 9 | 2026-11-08 | stays |
| `difficulty` | 4 | 2026-10-20 | stays |
| `domain` | 14 | 2026-09-19 | goes |
| `english_sample` | 2,499 | 2026-10-24 | stays |
| `english_sample_wrong` | 4,366 | 2026-10-24 | goes |
| `enrolment` | 22 | 2026-11-04 | stays |
| `evidence_event` | 1,838 | 2026-10-26 | stays |
| `evidence_kind` | 5 | 2026-10-23 | goes |
| `evidence_mark` | 6 | 2026-10-23 | goes |
| `evidence_scale` | 2 | 2026-10-23 | goes |
| `flow_run` | 4,560 | 2026-11-07 | stays |
| `fortnight` | 8 | 2026-11-04 | stays |
| `fortnight_cycle` | 8 | 2026-11-09 | goes |
| `gold_finding` | 24 | 2026-09-21 | goes |
| `grade` | 14 | 2026-10-20 | stays |
| `item` | 51,635 | 2026-11-03 | stays |
| `item_exposure` | 3,338 | 2026-11-03 | goes |
| `item_feedback` | 7,728 | 2026-10-15 | goes |
| `item_key_change` | 4,170 | 2026-10-12 | goes |
| `item_registry_skill` | 51,635 | 2026-11-03 | goes |
| `item_result` | 13,425 | 2026-10-30 | stays |
| `item_review` | 10 | 2026-09-19 | goes |
| `item_stat` | 486 | 2026-11-08 | goes |
| `learning_objective` | 2,496 | 2026-11-03 | stays |
| `learning_objective_skill` | 2,012 | 2026-09-19 | stays |
| `level_rule` | 12 | 2026-09-17 | stays |
| `link_status` | 2 | 2026-11-04 | goes |
| `link_strength` | 2 | 2026-11-04 | goes |
| `milestone` | 849 | 2026-09-19 | goes |
| `misconception` | 486 | 2026-10-23 | stays |
| `note_status` | 4 | 2026-11-03 | goes |
| `observation_entry_mode` | 2 | 2026-11-03 | goes |
| `observation_outcome` | 5 | 2026-11-03 | goes |
| `observation_route` | 2 | 2026-11-03 | goes |
| `observed_rule` | 1 | 2026-11-04 | goes |
| `observed_weight` | 2 | 2026-11-04 | goes |
| `parent_note` | 42 | 2026-10-02 | stays |
| `passage` | 253 | 2026-10-24 | stays |
| `password_ask` | 4 | 2026-10-29 | stays |
| `password_link` | 4 | 2026-10-29 | stays |
| `period` | 15 | 2026-11-04 | stays |
| `plan_entry` | 375 | 2026-11-04 | stays |
| `prescription` | 5 | 2026-09-18 | stays |
| `prompt` | 66 | 2026-11-05 | stays |
| `question_format` | 6 | 2026-10-15 | goes |
| `question_type` | 89 | 2026-10-23 | stays |
| `question_type_approval` | 74 | 2026-10-22 | goes |
| `read_correction` | 1,646 | 2026-10-28 | goes |
| `registry_skill` | 244 | 2026-09-19 | stays |
| `report_item` | 885 | 2026-09-19 | stays |
| `role` | 13 | 2026-11-03 | stays |
| `rubric` | 7 | 2026-10-24 | stays |
| `school_class` | 1 | 2026-11-04 | stays |
| `school_day` | 80 | 2026-11-04 | stays |
| `session` | 1,049 | 2026-11-04 | stays |
| `sheet_instance` | 387 | 2026-11-03 | stays |
| `sheet_template` | 8,123 | 2026-11-03 | stays |
| `sign_in_failure` | 15 | 2026-10-28 | stays |
| `skill` | 155 | 2026-10-23 | stays |
| `skill_level` | 614 | 2026-10-23 | stays |
| `skill_level_question_type` | 1,227 | 2026-10-23 | stays |
| `skill_level_sample` | 251 | 2026-10-22 | goes |
| `skill_level_version` | 76 | 2026-10-22 | goes |
| `skill_mistake` | 1,128 | 2026-10-23 | stays |
| `skill_prerequisite` | 282 | 2026-10-23 | stays |
| `skill_registry_link` | 61 | 2026-10-22 | stays |
| `skill_set_version` | 93 | 2026-10-22 | goes |
| `staff` | 7 | 2026-11-08 | stays |
| `staff_role_grant` | 9 | 2026-11-08 | stays |
| `state_colour` | 4 | 2026-10-21 | goes |
| `subject` | 2 | 2026-10-23 | stays |
| `taxonomy_case` | 522 | 2026-10-12 | stays |
| `tenant` | 1 | 2026-09-17 | stays |
| `threshold` | 101 | 2026-11-05 | goes |
| `timetable_slot` | 150 | 2026-11-04 | goes |
| `topic` | 14 | 2026-10-23 | stays |
| `trait` | 56 | 2026-09-19 | goes |
| `validation_rule` | 2 | 2026-10-23 | goes |
| `validation_stage` | 4 | 2026-10-23 | goes |
| `web_error` | 99 | 2026-11-08 | stays |

## Empty tables

`pii.educator_note`, `pii.note_claim`, `activity_material`, `activity_observation`, `approval`, `assessment_name`, `bank_decision`, `blueprint`, `calibration_review`, `child_move`, `child_observed_state`, `class_card_confirmation`, `consent`, `english_sample_edit`, `fortnight_edit`, `fortnight_plan`, `fortnight_plan_line`, `gold`, `graph_run`, `hand_check`, `home_sheet`, `key_correction`, `learned_mistake`, `material_alias`, `material_item`, `material_item_proposal`, `material_unit_conversion`, `materials_consolidated`, `materials_consolidated_change`, `materials_consolidated_line`, `materials_consolidated_send`, `materials_consolidated_source`, `materials_line`, `materials_line_edit`, `materials_line_source`, `materials_list`, `materials_note_review`, `materials_send`, `materials_send_ack`, `maths_sample`, `mistake_named`, `narrative_observation`, `page_choice`, `paper_edit`, `reminder`, `skill_level_kind_change`, `skill_level_kind_stop`, `skill_link`, `staff_note`, `timetable_block`, `timetable_clash_accept`, `timetable_limit`, `timetable_live`, `timetable_move`, `timetable_rule_edit`, `timetable_run`, `week_declaration`

Of the empty ones, 11 are in the target (they are kept, still empty): `pii.educator_note`, `pii.note_claim`, `activity_material`, `activity_observation`, `approval`, `consent`, `material_item`, `materials_line`, `materials_list`, `staff_note`, `timetable_run`.
