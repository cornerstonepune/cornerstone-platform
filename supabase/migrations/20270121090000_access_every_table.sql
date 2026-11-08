-- CP-4: every table is child data or school-wide, and no child-data table lets everyone through.
--
-- CP-3 gave three groups and ruled the tables of children, enrolment, staff and notes; every other table kept `app_all`
-- (allow the website login everything). Here each of the other tables is listed in `access_table` as `child_data`
-- (a kind of data, the column that ties a row to a class, child, paper, scan, answer or class label, and the same three
-- groups as CP-3) or `school_wide` (the skill registry, curriculum, question bank, plan, timetable, the tool's own records;
-- one line of reason each; open to the website login as before, because sign-in itself reads some of them before anyone
-- is signed in). The list is made by packages/engine/tests/support/access_list.py and is the only place this is decided.
-- A table with no row makes `internal.apply_conventions()` raise, naming it: a new table fails in its own migration.
-- The engine keeps full access to every table (`engine_all`). No privilege is granted or taken away here.

-- 1. The list: class of data, reason --------------------------------------------------------------------------------------

alter table access_table add column if not exists data_class text;
alter table access_table add column if not exists reason text;
update access_table set data_class = 'child_data' where data_class is null;  -- CP-3's rows: children, enrolment, staff, notes
alter table access_table alter column data_class set not null;
alter table access_table alter column kind_code drop not null;
alter table access_table alter column key_column drop not null;
alter table access_table alter column key_type drop not null;

-- a paper (sheet), a scan (capture), an answer (item_result), and the legacy class label (section) join CP-3's key types
alter table access_table drop constraint if exists access_table_key_type_check;
alter table access_table add constraint access_table_key_type_check
  check (key_type in ('class', 'child', 'note', 'staff', 'sheet', 'capture', 'item_result', 'section'));
alter table access_table drop constraint if exists access_table_data_class_check;
alter table access_table add constraint access_table_data_class_check check (data_class in ('child_data', 'school_wide'));
-- child data names its kind and key and has no reason; school-wide names a one-line reason and no kind or key
alter table access_table drop constraint if exists access_table_shape_check;
alter table access_table add constraint access_table_shape_check check (
  (data_class = 'child_data' and kind_code is not null and key_column is not null and key_type is not null
     and reason is null)
  or (data_class = 'school_wide' and kind_code is null and key_column is null and key_type is null
     and reason is not null and btrim(reason) <> '' and reason !~ '[\r\n]'));

-- 2. More kinds of data for the same three groups -------------------------------------------------------------------------
-- The data register's words for what a school keeps about a child. Observation notes stay the CP-3 kind `notes`. An
-- educator reaches own classes' papers, answers, learning and reports; the register says the coordinator alone sees who
-- looked and what was consented to, so those two are `none` for own_classes.
create or replace function internal.access_vocabulary(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into access_group (tenant_id, code, label, by_role, ord) values
    (p_tenant, 'everything', 'Everything', true, 0),
    (p_tenant, 'own_classes', 'Own classes', true, 1),
    (p_tenant, 'signed_in', 'Everyone signed in', false, 2)
  on conflict do nothing;
  insert into access_kind (tenant_id, code, label, ord) values
    (p_tenant, 'children', 'Children', 0), (p_tenant, 'enrolment', 'Enrolment', 1),
    (p_tenant, 'staff', 'Staff', 2), (p_tenant, 'notes', 'Observation notes', 3),
    (p_tenant, 'papers', 'Papers and scans', 4), (p_tenant, 'answers', 'Answers', 5),
    (p_tenant, 'learning', 'What a child can do', 6), (p_tenant, 'reports', 'Reports for parents', 7),
    (p_tenant, 'who_looked', 'Who looked', 8), (p_tenant, 'consent', 'Consent', 9)
  on conflict do nothing;
  insert into access_role_group (tenant_id, role_code, group_code)
  select p_tenant, v.role_code, v.group_code
  from (values
    ('coordinator', 'everything'), ('deputy_coordinator', 'everything'), ('mentor', 'everything'),
    ('head', 'everything'), ('curriculum_team', 'everything'), ('ops', 'everything'),
    ('special_educator', 'everything'),  -- in neither list Nimish gave; here until he says otherwise
    ('educator', 'own_classes'), ('class_teacher', 'own_classes'), ('subject_educator', 'own_classes'),
    ('cover_educator', 'own_classes'), ('specialist', 'own_classes'), ('assistant', 'own_classes')
  ) v (role_code, group_code)
  where exists (select from role r where r.tenant_id = p_tenant and r.code = v.role_code)
  on conflict do nothing;
  insert into access_reach (tenant_id, group_code, kind_code, reach)
  select p_tenant, g.code, k.code,
         case when g.code = 'everything' then 'all'
              when g.code = 'own_classes' and k.code not in ('who_looked', 'consent') then 'own'
              else 'none' end
  from access_group g join access_kind k on k.tenant_id = g.tenant_id
  where g.tenant_id = p_tenant
  on conflict do nothing;
end $$;

select internal.access_vocabulary(id) from tenant;  -- every school there is gets the new kinds and their reach

-- 3. Every table, listed ----------------------------------------------------------------------------------------------------

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('pii', 'child', 'children', 'child_id', 'child', 'child_data', null),
  ('pii', 'educator_note', 'notes', 'class_id', 'class', 'child_data', null),
  ('pii', 'note_claim', 'notes', 'note_id', 'note', 'child_data', null),
  ('pii', 'staff', 'staff', 'staff_id', 'staff', 'child_data', null),
  ('public', 'access_log', 'who_looked', 'child_id', 'child', 'child_data', null),
  ('public', 'activity_observation', 'notes', 'child_id', 'child', 'child_data', null),
  ('public', 'capture', 'papers', 'id', 'capture', 'child_data', null),
  ('public', 'capture_page', 'papers', 'capture_id', 'capture', 'child_data', null),
  ('public', 'child', 'children', 'id', 'child', 'child_data', null),
  ('public', 'child_move', 'children', 'child_id', 'child', 'child_data', null),
  ('public', 'child_observed_state', 'learning', 'child_id', 'child', 'child_data', null),
  ('public', 'child_reading_profile', 'answers', 'child_id', 'child', 'child_data', null),
  ('public', 'child_skill_state', 'learning', 'child_id', 'child', 'child_data', null),
  ('public', 'class_card', 'learning', 'section', 'section', 'child_data', null),
  ('public', 'class_card_confirmation', 'learning', 'section', 'section', 'child_data', null),
  ('public', 'consent', 'consent', 'child_id', 'child', 'child_data', null),
  ('public', 'enrolment', 'enrolment', 'class_id', 'class', 'child_data', null),
  ('public', 'evidence_event', 'learning', 'child_id', 'child', 'child_data', null),
  ('public', 'gold', 'answers', 'capture_id', 'capture', 'child_data', null),
  ('public', 'gold_finding', 'answers', 'child_id', 'child', 'child_data', null),
  ('public', 'home_sheet', 'papers', 'child_id', 'child', 'child_data', null),
  ('public', 'item_exposure', 'papers', 'child_id', 'child', 'child_data', null),
  ('public', 'item_result', 'answers', 'capture_id', 'capture', 'child_data', null),
  ('public', 'mistake_named', 'answers', 'item_result_id', 'item_result', 'child_data', null),
  ('public', 'narrative_observation', 'answers', 'capture_id', 'capture', 'child_data', null),
  ('public', 'page_choice', 'papers', 'capture_id', 'capture', 'child_data', null),
  ('public', 'paper_edit', 'papers', 'child_id', 'child', 'child_data', null),
  ('public', 'parent_note', 'reports', 'child_id', 'child', 'child_data', null),
  ('public', 'prescription', 'papers', 'child_id', 'child', 'child_data', null),
  ('public', 'read_correction', 'answers', 'child_id', 'child', 'child_data', null),
  ('public', 'sheet_instance', 'papers', 'id', 'sheet', 'child_data', null),
  ('public', 'staff', 'staff', 'id', 'staff', 'child_data', null),
  ('public', 'staff_role_grant', 'staff', 'staff_id', 'staff', 'child_data', null),
  ('public', 'academic_year', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'access_group', null, null, null, 'school_wide', 'the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children'),
  ('public', 'access_kind', null, null, null, 'school_wide', 'the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children'),
  ('public', 'access_reach', null, null, null, 'school_wide', 'the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children'),
  ('public', 'access_role_group', null, null, null, 'school_wide', 'the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children'),
  ('public', 'access_table', null, null, null, 'school_wide', 'the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children'),
  ('public', 'activity', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'activity_material', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'activity_objective', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'activity_part_source', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'activity_skill', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'approval', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'approval_kind', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'approval_state', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'ask', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'assessment_name', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'bank_decision', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'bank_proposal', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'blueprint', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'calibration_review', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'campus', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'case_dimension', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'child_state', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'claim_decision', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'class_skill', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)'),
  ('public', 'config', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'curriculum_edit', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'curriculum_proposal', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'curriculum_version', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'curriculum_version_skill', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'data_register', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'difficulty', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'domain', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'english_sample', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'english_sample_edit', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'english_sample_wrong', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'evidence_kind', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'evidence_mark', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'evidence_scale', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'flow_run', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'fortnight', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'grade', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'item', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'item_feedback', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'item_key_change', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'item_registry_skill', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'item_review', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'item_stat', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'key_correction', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'learned_mistake', null, null, null, 'school_wide', 'the question bank: questions, their keys, checks, statistics and reviews; no child'),
  ('public', 'learning_objective', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'learning_objective_skill', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'level_rule', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'link_status', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'link_strength', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'material_alias', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'material_item', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'material_item_proposal', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'material_unit_conversion', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_consolidated', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_consolidated_change', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_consolidated_line', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_consolidated_send', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_consolidated_source', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_line', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_line_edit', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_line_source', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_list', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_note_review', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_send', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'materials_send_ack', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'maths_sample', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'milestone', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'misconception', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'note_status', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'observation_entry_mode', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'observation_outcome', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'observation_route', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'observed_rule', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'observed_weight', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'passage', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'password_ask', null, null, null, 'school_wide', 'sign-in before anyone is known: the website reads and writes these as the login itself, so they stay open to it'),
  ('public', 'password_link', null, null, null, 'school_wide', 'sign-in before anyone is known: the website reads and writes these as the login itself, so they stay open to it'),
  ('public', 'period', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'plan_entry', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)'),
  ('public', 'prompt', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'question_format', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'question_type', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'question_type_approval', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'registry_skill', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'reminder', null, null, null, 'school_wide', 'materials lists for the activities of a class and their shopping; by class id; no child'),
  ('public', 'report_item', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'role', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'rubric', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'school_class', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'school_day', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'session', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)'),
  ('public', 'sheet_template', null, null, null, 'school_wide', 'a blueprint of a paper (its questions and layout), made before any child is named; the register lists it as a paper but it holds no answer'),
  ('public', 'sign_in_failure', null, null, null, 'school_wide', 'sign-in before anyone is known: the website reads and writes these as the login itself, so they stay open to it'),
  ('public', 'skill', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_level', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_level_kind_change', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_level_kind_stop', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_level_question_type', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_level_sample', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_level_version', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_link', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_mistake', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_prerequisite', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_registry_link', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'skill_set_version', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'staff_note', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'state_colour', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'subject', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'taxonomy_case', null, null, null, 'school_wide', 'activities and sample material the school wrote or approved for its curriculum; no child'),
  ('public', 'tenant', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'threshold', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'timetable_block', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)'),
  ('public', 'timetable_limit', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)'),
  ('public', 'timetable_rule_edit', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)'),
  ('public', 'timetable_slot', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)'),
  ('public', 'topic', null, null, null, 'school_wide', 'the school''s structure (years, campuses, classes, days, periods, grades, subjects, roles); no child'),
  ('public', 'trait', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'validation_rule', null, null, null, 'school_wide', 'skill registry and curriculum: the school''s own teaching content, open to every educator; no child'),
  ('public', 'validation_stage', null, null, null, 'school_wide', 'a word list the screens read (names, order, colour of states, marks, routes); no child'),
  ('public', 'web_error', null, null, null, 'school_wide', 'the tool''s own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child'),
  ('public', 'week_declaration', null, null, null, 'school_wide', 'plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code,
  key_column = excluded.key_column, key_type = excluded.key_type, data_class = excluded.data_class,
  reason = excluded.reason;

-- 4. More ids a person may see ----------------------------------------------------------------------------------------------

-- CP-3's function, with three more key types. sheet: the papers of the children they may see, a paper with no child named
-- yet in one of their classes (its `section`), and a paper a scan they uploaded was read as. capture: the scans of those
-- papers and every scan they uploaded (an unmatched scan stays visible to whoever put it in). item_result: the answers
-- read from those scans. Where a row carries no such key it is visible to `everything` and not to anyone else.
create or replace function public.my_ids(p_kind text, p_key_type text) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (
    select m.staff_id, m.tenant_id, internal.school_day(m.tenant_id, now()) as d from internal.resolve_staff() m
  ), cls as (
    select distinct g.school_class_id as id, me.tenant_id, me.d
    from me
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= me.d and (g.valid_to is null or g.valid_to > me.d)
    join access_role_group rg on rg.tenant_id = g.tenant_id and rg.role_code = g.role_code
    join access_reach r on r.tenant_id = rg.tenant_id and r.group_code = rg.group_code
      and r.kind_code = p_kind and r.reach = 'own'
    where g.school_class_id is not null
  ), kids as (
    -- the children enrolled in those classes now, and (Nimish, 27 Oct 2026: "Achal should only see the papers he has
    -- uploaded") the children whose papers this person put in, whatever their class
    select e.child_id from enrolment e join cls on e.tenant_id = cls.tenant_id and e.class_id = cls.id
    where e.from_date <= cls.d and (e.to_date is null or e.to_date > cls.d)
    union
    select si.child_id from capture c
      join sheet_instance si on si.id = c.sheet_instance_id and si.child_id is not null
    where c.uploaded_by = public.current_staff() and c.superseded_by is null  -- uploaded_by is the sign-in entry id, as current_staff() is
      and c.tenant_id = (select tenant_id from me)
  ), sheets as (
    select si.id from sheet_instance si
    where si.tenant_id = (select tenant_id from me)
      and (si.child_id in (select child_id from kids)
           or (si.child_id is null and si.section in (select sc.section from school_class sc join cls on sc.id = cls.id))
           or exists (select 1 from capture c where c.sheet_instance_id = si.id and c.superseded_by is null
                        and c.uploaded_by = public.current_staff()))
  ), caps as (
    -- two lookups by key, not one scan with an OR: the scan cost 35 ms against 4 ms on 6,000 scans
    select c.id from capture c join sheets s on s.id = c.sheet_instance_id
    union
    select c.id from capture c
    where c.uploaded_by = public.current_staff() and c.tenant_id = (select tenant_id from me)
  )
  select coalesce(case p_key_type
    when 'class' then (select array_agg(id) from cls)
    when 'child' then (select array_agg(child_id) from kids)
    when 'note' then (select array_agg(n.id) from pii.educator_note n join cls
                        on n.tenant_id = cls.tenant_id and n.class_id = cls.id)
    when 'sheet' then (select array_agg(id) from sheets)
    when 'capture' then (select array_agg(id) from caps)
    when 'item_result' then (select array_agg(r.id) from item_result r where r.capture_id in (select id from caps))
  end, '{}'::uuid[])
$$;

-- the class labels (child.section, class_card.section) of the classes a person may see: a label is the class's `section`
-- in `school_class`, as move_child and the engine's class card read it
create or replace function public.my_sections(p_kind text) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct sc.section), '{}'::text[])
  from school_class sc where sc.id = any (public.my_ids(p_kind, 'class'))
$$;

-- `staff_sees_capture` answers yes or no for one scan and the papers lists ask it once per scan: it reads as the owner so the
-- rule on `capture` is not worked out again per call (as CP-3 did for `staff_sees_sheet`)
alter function public.staff_sees_capture(text, text[], text[], uuid, uuid) security definer set search_path = public, pg_temp;

-- "Is there a paper with this printed code?" The paper page tells a code no paper has ("not found") from a paper that is
-- another class's ("belongs to another class"). The second answer needs to know the paper exists, which the rule now
-- hides from an educator of another class. One yes or no, no row, class or child.
create or replace function public.sheet_code_exists(p_qr text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.my_tenant() is not null
     and exists (select 1 from sheet_instance where tenant_id = public.my_tenant() and qr_code = p_qr)
$$;

do $$
declare f text;
begin
  foreach f in array array['public.my_sections(text)', 'public.sheet_code_exists(text)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select from pg_roles where rolname = 'app_web') then
      execute format('grant execute on function %s to app_web', f);
    end if;
    if exists (select from pg_roles where rolname = 'app_engine') then
      execute format('grant execute on function %s to app_engine', f);
    end if;
  end loop;
end $$;

-- CP-3's triggers keep `staff.signin_id` in step with the sign-in list and the staff emails. They did not fire while a
-- loader or a test wrote rows with session_replication_role = replica, which left the key empty and so nobody resolved:
-- every rule above would show that person nothing. ENABLE ALWAYS makes the key follow the list however the rows arrive.
alter table config enable always trigger staff_signin_from_list;
alter table config enable always trigger staff_signin_from_list_gone;
alter table pii.staff enable always trigger staff_signin_from_email;

-- 5. The rule, generated ----------------------------------------------------------------------------------------------------

-- CP-3's body (row security, service_role_all, touch_updated_at, the ledger revoke) with two changes: there is no
-- `app_all` branch any more, and a table in no access_table row raises, naming it. Every policy but service_role_all is
-- dropped (a stray permissive policy would widen the rule), then `engine_all` (the engine's full access) and, for the
-- website, `web_rule` (child data, by group) or `web_all` (school-wide: open to the website login as before).
create or replace function internal.apply_conventions() returns void
language plpgsql set search_path = public as $$
declare t record; a record; p record; cond text; rule text;
begin
  for t in
    select n.nspname as s, c.relname as r
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname in ('public', 'pii')
  loop
    select * into a from access_table x where x.schema_name = t.s and x.table_name = t.r;
    if not found then
      raise exception 'table %.% is in no access_table row: list it as child_data or school_wide in the migration that creates it (CP-4)',
        t.s, t.r;
    end if;
    execute format('alter table %I.%I enable row level security', t.s, t.r);
    execute format('alter table %I.%I force row level security', t.s, t.r);
    execute format('drop policy if exists service_role_all on %I.%I', t.s, t.r);
    execute format(
      'create policy service_role_all on %I.%I for all to service_role using (true) with check (true)',
      t.s, t.r);
    for p in select policyname from pg_policies
             where schemaname = t.s and tablename = t.r and policyname <> 'service_role_all' loop
      execute format('drop policy %I on %I.%I', p.policyname, t.s, t.r);
    end loop;
    if exists (select from pg_roles where rolname = 'app_engine') then
      execute format('create policy engine_all on %I.%I for all to app_engine using (true) with check (true)',
        t.s, t.r);
    end if;
    if exists (select from pg_roles where rolname = 'app_web') then
      if a.data_class = 'school_wide' then
        execute format('create policy web_all on %I.%I as permissive for all to app_web using (true) with check (true)',
          t.s, t.r);
      else
        cond := case a.key_type
          when 'staff' then format('%I = (select public.signed_in_staff())', a.key_column)
          when 'section' then format('%I = any ((select public.my_sections(%L))::text[])', a.key_column, a.kind_code)
          else format('%I = any ((select public.my_ids(%L, %L))::uuid[])', a.key_column, a.kind_code, a.key_type)
        end;
        rule := format('tenant_id = (select public.my_tenant()) and ((select public.my_reach(%1$L)) = ''all'' '
                       'or ((select public.my_reach(%1$L)) = ''own'' and %2$s))', a.kind_code, cond);
        execute format('create policy web_rule on %I.%I as permissive for all to app_web using (%s) with check (%s)',
          t.s, t.r, rule, rule);
      end if;
    end if;
    execute format('drop trigger if exists touch_updated_at on %I.%I', t.s, t.r);
    execute format(
      'create trigger touch_updated_at before update on %I.%I '
      'for each row execute function internal.touch_updated_at()',
      t.s, t.r);
  end loop;
  if exists (select from pg_roles where rolname = 'app_engine') then
    for t in
      select distinct tgrelid::regclass as ledger from pg_trigger where tgfoid = 'internal.forbid_change'::regproc
    loop
      execute format('revoke update, delete, truncate on %s from app_web, app_engine', t.ledger);
    end loop;
  end if;
end $$;

select internal.apply_conventions();
