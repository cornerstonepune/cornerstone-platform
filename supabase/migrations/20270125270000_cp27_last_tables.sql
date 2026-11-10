-- CP-27, group 6 (specs/CP-27/spec.md; the map of the last 30 tables; #551): the last tables the target list does not
-- name leave. Each one's rows go to a home that stays, a column, a row of a shared table, or nothing at all where the
-- rows were only ever worked out from others (docs/data-model.md):
--
--   english_sample_wrong (4,366)    -> english_sample.wrong [{answer, mistake_code}] by answer (the shape the samples
--                                      view always returned); the key to `misconception` is `engine load --check`'s.
--                                      Rows: copied, then `retired`
--   activity_part_source (2,369)    -> one `change_log` row per mark (table `activity`, the page's code, op
--                                      `part_source`, after {part, source, proposal_id, staff_id, check_me}); a view
--                                      of the same name reads the newest mark of each part. Rows: copied, `retired`
--   milestone (849)                 -> registry_skill.milestones {band: {descriptor, scale, source}}. Copied, `retired`
--   item_stat (486)                 -> a view of the same name over the confirmed answers (count and share right); a
--                                      question far off its level is worked out by `learn` from the settings. The view
--                                      must give the table's numbers here (run `engine graph` before). `retired`
--   skill_level_sample (251)        -> nothing: the rows were only ever `internal.skill_level_sample_sync`'s output,
--                                      checked equal here; its 2 triggers and 4 functions go. `retired`
--   curriculum_version_skill (155)  -> curriculum_version.skills {skill: version}, written in the version's own insert.
--                                      Copied (the version's guard off for the copy alone), `retired`
--   capture_page (77)               -> capture.page_prints {file page: {print, code}}; a page may be added, never
--                                      changed or taken away (as the table's guard kept it). Copied, `retired`
--   trait (56)                      -> the setting `report.traits` (a list of the 56). Copied, `retired`
--   child_reading_profile (26)      -> nothing: a child's notebook is built from the checks whenever it is read (it was
--                                      written again before every read anyway). `retired`
--   question_format (6)             -> skill.question_kinds {code: kind} on the skill set; `kinds.of` gives the same
--                                      {code: kind}, checked here. Copied, `retired`
--   child_observed_state (0)        -> child_skill_state rows of kind `observed` (with grade_code, named_days, adults,
--                                      first_named_yes, rechecked_on; no rung); every written reader reads `written`
--   graph_run (0)                   -> flow_run rows, flow `graph_nightly`, the digests in `result`
--   maths_sample (0)                -> a flow_run row, flow `maths_sample`
--   english_sample_edit (0)         -> the sample changed on its own row (english_sample.removed_at, made_from), what it
--                                      replaced a `change_log` row
--   paper_edit (0)                  -> sheet_instance.replaced_by and a `change_log` row
--   assessment_name (0)             -> a `change_log` row (table `assessment`, the website's key, op `name`), written
--                                      through the engine
--   skill_link (0)                  -> skill_prerequisite rows naming registry skills (registry_code,
--                                      before_registry_code); `skill_link_confirmed` and `skill_link_audit` read them
--   reminder (0)                    -> nothing: worked out from the list's dates and the settings when asked
--   material_alias, material_unit_conversion (0)  -> material_item.aliases, conversions, each change a log row
--   materials_consolidated, _line, _source, _change (0)  -> the school's list of a range: a flow_run row (flow
--                                      `materials_consolidate`) keeping its latest build and what it changed
--   materials_consolidated_send, materials_send (0)  -> flow_run rows (`materials_school_send`, `materials_send`)
--   materials_send_ack (0)          -> an `approval` row, kind `materials_ack`
--   materials_note_review (0)       -> curriculum_proposal rows, kind `materials_note`; a person's answer a later row
--   materials_line_edit (0)         -> a `change_log` row of `materials_line`
--   materials_line_source (0)       -> materials_line.sources [{session_id, activity_code, on_date, quantity}]; a view of
--                                      the same name reads them; a lesson removed takes its entries with it
--
-- A table with rows on live is never dropped: its rows are copied, a block raises unless every row is in its new home
-- with the same values (and what reads them answers as before), and the table moves to the schema `retired`. An empty
-- table is checked empty inside the migration, then dropped. One transaction under `db push`: any raise leaves the
-- database as it was.

-- 1. Refused first; then a notice of the counts. -------------------------------------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(format('%s: %s', t, v), '; ') into bad from (
    select 'english_sample_wrong.op not any' as t, count(*)::text as v from english_sample_wrong where op <> 'any'
      having count(*) > 0
    union all select 'english_sample_wrong answered twice', count(*)::text from (
      select 1 from english_sample_wrong group by sample_id, answer having count(*) > 1) x having count(*) > 0
    union all select 'change_log already holds', 'part_source ' || count(*) from change_log
      where table_name = 'activity' and op = 'part_source' having count(*) > 0
    union all select 'config already holds', 'report.traits' from config where key = 'report.traits'
    -- empty on live (census): checked here, in this transaction, so none written before this runs is lost
    union all select 'not empty', 'child_observed_state ' || count(*) from child_observed_state having count(*) > 0
    union all select 'not empty', 'graph_run ' || count(*) from graph_run having count(*) > 0
    union all select 'not empty', 'maths_sample ' || count(*) from maths_sample having count(*) > 0
    union all select 'not empty', 'english_sample_edit ' || count(*) from english_sample_edit having count(*) > 0
    union all select 'not empty', 'paper_edit ' || count(*) from paper_edit having count(*) > 0
    union all select 'not empty', 'assessment_name ' || count(*) from assessment_name having count(*) > 0
    union all select 'not empty', 'skill_link ' || count(*) from skill_link having count(*) > 0
    union all select 'not empty', 'reminder ' || count(*) from reminder having count(*) > 0
    union all select 'not empty', 'material_alias ' || count(*) from material_alias having count(*) > 0
    union all select 'not empty', 'material_unit_conversion ' || count(*) from material_unit_conversion
      having count(*) > 0
    union all select 'not empty', 'materials_consolidated ' || count(*) from materials_consolidated having count(*) > 0
    union all select 'not empty', 'materials_consolidated_line ' || count(*) from materials_consolidated_line
      having count(*) > 0
    union all select 'not empty', 'materials_consolidated_source ' || count(*) from materials_consolidated_source
      having count(*) > 0
    union all select 'not empty', 'materials_consolidated_change ' || count(*) from materials_consolidated_change
      having count(*) > 0
    union all select 'not empty', 'materials_consolidated_send ' || count(*) from materials_consolidated_send
      having count(*) > 0
    union all select 'not empty', 'materials_send ' || count(*) from materials_send having count(*) > 0
    union all select 'not empty', 'materials_send_ack ' || count(*) from materials_send_ack having count(*) > 0
    union all select 'not empty', 'materials_note_review ' || count(*) from materials_note_review having count(*) > 0
    union all select 'not empty', 'materials_line_edit ' || count(*) from materials_line_edit having count(*) > 0
    union all select 'not empty', 'materials_line_source ' || count(*) from materials_line_source having count(*) > 0
  ) x;
  if bad is not null then
    raise exception 'CP-27 group 6 refused: %', bad;
  end if;
  -- the samples' rows are what the sync makes of the levels' words and the card kinds' examples, and nothing else
  if exists (
    with made as (
      select l.tenant_id, l.skill_code, l.difficulty, null::text as question_format, x.ord::integer as ord, x.sample
      from skill_level l cross join lateral internal.level_samples(l.looks_like) x
      union all
      select f.tenant_id, f.skill_set_code, e.key, f.code, x.ord::integer, x.sample
      from question_format f
      cross join jsonb_each(case when jsonb_typeof(f.kind -> 'examples') = 'object' then f.kind -> 'examples'
                                 else '{}' end) e
      cross join jsonb_array_elements_text(e.value) with ordinality x(sample, ord)
      join skill_level l on l.tenant_id = f.tenant_id and l.skill_code = f.skill_set_code and l.difficulty = e.key
    ), kept as (
      select tenant_id, skill_code, difficulty, question_format, ord::integer, sample from skill_level_sample
    )
    (select * from made except all select * from kept) union all (select * from kept except all select * from made)
  ) then
    raise exception 'CP-27 group 6: skill_level_sample holds rows its sync would not make; its rows are not only derived';
  end if;
  -- the stored numbers are the answers' numbers (a table left stale since the last `engine graph`: run it first)
  if exists (
    with v as (
      select r.tenant_id, r.item_id, count(*)::integer as n, avg((r.status = 'correct')::int)::numeric(5, 4) as p
      from item_result r join capture c on c.id = r.capture_id
      where r.state = 'confirmed' and r.status in ('correct', 'wrong', 'blank') and c.superseded_by is null
      group by r.tenant_id, r.item_id
    ), t as (select tenant_id, item_id, n, p_correct::numeric(5, 4) as p from item_stat)
    (select * from v except select * from t) union all (select * from t except select * from v)
  ) then
    raise exception 'CP-27 group 6: item_stat is not what the confirmed answers say; run engine graph, then this again';
  end if;
  raise notice 'CP-27 group 6: % wrong answers, % part marks, % milestones, % question stats, % samples, % version skills, % pages, % traits, % notebooks, % kinds',
    (select count(*) from english_sample_wrong), (select count(*) from activity_part_source),
    (select count(*) from milestone), (select count(*) from item_stat), (select count(*) from skill_level_sample),
    (select count(*) from curriculum_version_skill), (select count(*) from capture_page), (select count(*) from trait),
    (select count(*) from child_reading_profile), (select count(*) from question_format);
end $$;

-- what reads a kind of question, before (compared in step 4)
create temp table cp27_kinds as select tenant_id, code, kind from question_format;

-- 2. The new homes. ------------------------------------------------------------------------------------------------

alter table english_sample add column wrong jsonb not null default '[]'::jsonb
  check (jsonb_typeof(wrong) = 'array');
alter table english_sample add column removed_at timestamptz;
alter table english_sample add column made_from smallint check (made_from >= 1);
alter table english_sample drop constraint english_sample_ord_check;
alter table english_sample add constraint english_sample_ord_check check (ord >= 1);
comment on column english_sample.wrong is
  'The likely wrong answers, [{answer, mistake_code}] by answer (CP-27 group 6: once the table english_sample_wrong); a code is a misconception''s (engine load --check).';
comment on column english_sample.removed_at is
  'When an educator took the sample off its level; what each change replaced is a change_log row (table english_sample, row `skill level kind ord`).';

alter table registry_skill add column milestones jsonb not null default '{}'::jsonb
  check (jsonb_typeof(milestones) = 'object');
comment on column registry_skill.milestones is
  'The skill''s milestones by band: {band: {descriptor, scale, source}} (CP-27 group 6: once the table milestone); a band is a grade''s code (engine load --check).';

alter table curriculum_version add column skills jsonb not null default '{}'::jsonb
  check (jsonb_typeof(skills) = 'object');
comment on column curriculum_version.skills is
  'Every skill at its version when this version was published: {skill: version} (CP-27 group 6: once the table curriculum_version_skill).';

alter table capture add column page_prints jsonb not null default '{}'::jsonb
  check (jsonb_typeof(page_prints) = 'object');
comment on column capture.page_prints is
  'Each page of the scan file told once: {file page: {print, code}}, the page picture''s fingerprint and the code printed on it (CP-27 group 6: once the table capture_page). A page may be added; never changed or taken away.';
create function internal.capture_page_kept() returns trigger
language plpgsql set search_path = public as $$
begin
  if not new.page_prints @> old.page_prints then
    raise exception 'a page of a scan, once told, is never changed or taken away' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger capture_page_kept before update of page_prints on capture
  for each row when (old.page_prints is distinct from new.page_prints) execute function internal.capture_page_kept();

alter table skill add column question_kinds jsonb not null default '{}'::jsonb
  check (jsonb_typeof(question_kinds) = 'object');
comment on column skill.question_kinds is
  'The kinds of question the skill set''s card levels draw: {code: kind} (ADR 0075; CP-27 group 6: once the table question_format). A code names one kind in the school (the loader refuses a second).';

alter table child_skill_state add column kind text not null default 'written'
  check (kind in ('written', 'observed'));
alter table child_skill_state add column grade_code text;
alter table child_skill_state add column named_days integer;
alter table child_skill_state add column adults integer;
alter table child_skill_state add column first_named_yes date;
alter table child_skill_state add column rechecked_on date;
alter table child_skill_state alter column rung_code drop not null;
alter table child_skill_state add constraint child_skill_state_tenant_id_grade_code_fkey
  foreign key (tenant_id, grade_code) references grade (tenant_id, code);
alter table child_skill_state add constraint child_skill_state_kind_fits check (case kind
  when 'written' then rung_code is not null and grade_code is null and named_days is null and adults is null
  else rung_code is null and grade_code is not null and named_days is not null and adults is not null
       and last_seen is not null end);
create unique index child_skill_state_one on child_skill_state
  (tenant_id, child_id, skill_code, kind, coalesce(rung_code, grade_code));
comment on column child_skill_state.kind is
  'written: from a child''s answers (by rung); observed: from what educators confirmed seeing (by grade; CP-27 group 6, once the table child_observed_state). The written graph, its readers and engine past read written only.';

alter table skill_prerequisite alter column skill_code drop not null;
alter table skill_prerequisite alter column before_code drop not null;
alter table skill_prerequisite add column registry_code text;
alter table skill_prerequisite add column before_registry_code text;
alter table skill_prerequisite add constraint skill_prerequisite_registry_fkey
  foreign key (tenant_id, registry_code) references registry_skill (tenant_id, code) on update cascade;
alter table skill_prerequisite add constraint skill_prerequisite_before_registry_fkey
  foreign key (tenant_id, before_registry_code) references registry_skill (tenant_id, code) on update cascade;
alter table skill_prerequisite add constraint skill_prerequisite_one_pair check (
  (skill_code is not null and before_code is not null and registry_code is null and before_registry_code is null)
  or (skill_code is null and before_code is null and registry_code is not null and before_registry_code is not null));
alter table skill_prerequisite add constraint skill_prerequisite_registry_not_itself
  check (registry_code <> before_registry_code);
alter table skill_prerequisite add constraint skill_prerequisite_registry_pair_key
  unique (tenant_id, registry_code, before_registry_code);
comment on column skill_prerequisite.registry_code is
  'A link between broad registry skills (K2''s "ready next") names them here, and no skill set (CP-27 group 6: once the table skill_link).';

alter table material_item add column aliases text[] not null default '{}';
alter table material_item add column conversions jsonb not null default '{}'::jsonb
  check (jsonb_typeof(conversions) = 'object');
comment on column material_item.aliases is
  'Words a person approved for the item (CP-27 group 6: once the table material_alias); a word means one item in the school. Each approval a change_log row.';
comment on column material_item.conversions is
  'How many of the item''s own unit make one of another: {unit: factor} (CP-27 group 6: once the table material_unit_conversion). Each approval a change_log row.';

alter table materials_line add column sources jsonb not null default '[]'::jsonb
  check (jsonb_typeof(sources) = 'array');
comment on column materials_line.sources is
  'The planned lessons the line comes from: [{session_id, activity_code, on_date, quantity}] (CP-27 group 6: once the table materials_line_source); a lesson removed takes its entries with it.';
create function internal.session_leaves_materials() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update materials_line set sources = coalesce((
    select jsonb_agg(e order by o) from jsonb_array_elements(sources) with ordinality x(e, o)
    where e ->> 'session_id' <> old.id::text), '[]'::jsonb)
  where tenant_id = old.tenant_id and sources @> jsonb_build_array(jsonb_build_object('session_id', old.id::text));
  return null;
end $$;
create trigger session_leaves_materials after delete on session
  for each row execute function internal.session_leaves_materials();

alter table sheet_instance add column replaced_by uuid references sheet_instance (id);
comment on column sheet_instance.replaced_by is
  'The copy an edit made of this paper (CP-27 group 6: once the table paper_edit); the edit is a change_log row.';

alter table approval drop constraint approval_kind_check;
alter table approval add constraint approval_kind_check check (kind = any (array['skill_level', 'question_type',
  'parent_note', 'sheet', 'skill_prerequisite', 'item', 'calibration', 'class_card', 'materials_ack']));
alter table curriculum_proposal drop constraint curriculum_proposal_kind_check;
alter table curriculum_proposal add constraint curriculum_proposal_kind_check check (kind = any (array['skill',
  'objective', 'levels', 'lo_skill', 'page_part', 'material', 'skill_offer', 'mislevelled', 'new_mistake',
  'materials_note']));

-- the team saying they have a materials list is its own first approval (as a way of asking's is)
create or replace function internal.approval_checked() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_by text;
  stamp text;
begin
  if new.decision <> 'approved' then
    return new;
  end if;
  select a."by" into first_by from approval a
  where a.tenant_id = new.tenant_id and a.kind = new.kind and a.target = new.target and a.decision = 'approved'
    and a.seq > coalesce((select max(w.seq) from approval w
                          where w.tenant_id = new.tenant_id and w.kind = new.kind and w.target = new.target
                            and w.decision = 'withdrawn'), 0)
  order by a.seq limit 1;
  if first_by is not null then
    if first_by = new."by" then
      raise exception 'a second approval is someone else''s: % approved % first', new."by", new.target
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  stamp := case new.kind
    when 'question_type' then new."by"
    when 'materials_ack' then new."by"
    when 'parent_note' then (select approved_by from parent_note where tenant_id = new.tenant_id and id = new.target::uuid)
    when 'sheet' then (select approved_by from sheet_instance where tenant_id = new.tenant_id and id = new.target::uuid)
    when 'skill_prerequisite' then (select confirmed_by::text from skill_prerequisite
                                    where tenant_id = new.tenant_id and id = new.target::uuid)
    when 'skill_level' then (select confirmed_by from skill_level
                             where tenant_id = new.tenant_id and skill_code = split_part(new.target, ' ', 1)
                               and skill_code || ' ' || difficulty = new.target)
  end;
  if stamp is distinct from new."by" then
    raise exception 'nothing to approve a second time: % % has no first approval', new.kind, new.target
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- 3. The rows copied, each to its new home; the clocks of the rows that receive them are left as they were. ---------

alter table english_sample disable trigger touch_updated_at;
update english_sample e set wrong = w.wrong
from (select sample_id, jsonb_agg(jsonb_build_object('answer', answer, 'mistake_code', mistake_code) order by answer)
        as wrong from english_sample_wrong group by sample_id) w
where w.sample_id = e.id;
alter table english_sample enable trigger touch_updated_at;

insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason, at)
select tenant_id, 'activity', activity_code, 'part_source', null,
       jsonb_build_object('part', part, 'source', source, 'proposal_id', proposal_id, 'staff_id', staff_id,
                          'check_me', check_me),
       staff_id, 'CP-27: kept in activity_part_source until 2026-11', 'the part''s mark as it stood', updated_at
from activity_part_source;

alter table registry_skill disable trigger touch_updated_at;
update registry_skill r set milestones = m.ms
from (select tenant_id, skill_code, jsonb_object_agg(band, jsonb_build_object('descriptor', descriptor, 'scale', scale,
        'source', source)) as ms from milestone group by tenant_id, skill_code) m
where m.tenant_id = r.tenant_id and m.skill_code = r.code;
alter table registry_skill enable trigger touch_updated_at;

-- a published version is never changed: its guard is off for this copy alone
alter table curriculum_version disable trigger curriculum_version_kept;
alter table curriculum_version disable trigger touch_updated_at;
update curriculum_version v set skills = s.skills
from (select curriculum_version_id, jsonb_object_agg(skill_code, skill_version) as skills
      from curriculum_version_skill group by curriculum_version_id) s
where s.curriculum_version_id = v.id;
alter table curriculum_version enable trigger touch_updated_at;
alter table curriculum_version enable trigger curriculum_version_kept;

alter table capture disable trigger touch_updated_at;
update capture c set page_prints = p.pages
from (select capture_id, jsonb_object_agg(file_page::text, jsonb_build_object('print', print, 'code', code)) as pages
      from capture_page group by capture_id) p
where p.capture_id = c.id;
alter table capture enable trigger touch_updated_at;

insert into config (tenant_id, key, value, description)
select t.tenant_id, 'report.traits', t.traits,
       'The traits a report may speak of, one per code and band (label, what shows it, what is a concern, an expected and an exceeding example, the registry skills it links to, who drafted it and from what). A school''s own list after its first load (CP-27 group 6: once the table `trait`).'
from (select tenant_id, jsonb_agg(jsonb_build_object('code', code, 'band', band, 'label', label, 'positive', positive,
        'concern', concern, 'expected', expected, 'exceeding', exceeding, 'linked', to_jsonb(linked::text[]),
        'authored_by', authored_by, 'source', source) order by code, band) as traits
      from trait group by tenant_id) t;

-- the skill set's row gains its kinds and nothing else: its version, status and history stay as they are
alter table skill disable trigger user;
update skill s set question_kinds = f.kinds
from (select tenant_id, skill_set_code, jsonb_object_agg(code, kind) as kinds from question_format
      group by tenant_id, skill_set_code) f
where f.tenant_id = s.tenant_id and f.skill_set_code = s.code;
alter table skill enable trigger user;

analyze english_sample;
analyze change_log;

-- 4. Every row is in its new home with the same values; what reads them answers as before. ------------------------

do $$
declare
  n bigint;
begin
  select count(*) into n from english_sample e
    cross join jsonb_to_recordset(e.wrong) x(answer text, mistake_code text)
    join english_sample_wrong w on w.sample_id = e.id and w.answer = x.answer and w.mistake_code = x.mistake_code
                              and w.tenant_id = e.tenant_id;
  if n <> (select count(*) from english_sample_wrong)
     or n <> (select coalesce(sum(jsonb_array_length(wrong)), 0) from english_sample) then
    raise exception 'CP-27: % of % wrong answers are on their sample', n, (select count(*) from english_sample_wrong);
  end if;

  if exists (select tenant_id, activity_code, part, source, proposal_id, staff_id, check_me, updated_at
             from activity_part_source
             except select tenant_id, activity_code, part, source, proposal_id, staff_id, check_me, updated_at
             from (select distinct on (k.tenant_id, k.row_id, k.after ->> 'part') k.tenant_id,
                     k.row_id as activity_code, k.after ->> 'part' as part, k.after ->> 'source' as source,
                     (k.after ->> 'proposal_id')::uuid as proposal_id, (k.after ->> 'staff_id')::uuid as staff_id,
                     (k.after ->> 'check_me')::boolean as check_me, k.at as updated_at
                   from change_log k where k.table_name = 'activity' and k.op = 'part_source'
                   order by k.tenant_id, k.row_id, k.after ->> 'part', k.at desc, k.id desc) m)
     or (select count(*) from change_log where origin = 'CP-27: kept in activity_part_source until 2026-11')
        <> (select count(*) from activity_part_source) then
    raise exception 'CP-27: the part marks are not what they were';
  end if;

  select count(*) into n from registry_skill r cross join jsonb_each(r.milestones) e
    join milestone m on m.tenant_id = r.tenant_id and m.skill_code = r.code and m.band = e.key
                    and m.descriptor = e.value ->> 'descriptor' and m.scale = e.value ->> 'scale'
                    and m.source = e.value ->> 'source';
  if n <> (select count(*) from milestone)
     or n <> (select count(*) from registry_skill r cross join jsonb_each(r.milestones) e) then
    raise exception 'CP-27: % of % milestones are on their skill', n, (select count(*) from milestone);
  end if;

  select count(*) into n from curriculum_version v cross join jsonb_each(v.skills) e
    join curriculum_version_skill s on s.curriculum_version_id = v.id and s.skill_code = e.key
                                   and s.skill_version = (e.value #>> '{}')::integer and s.tenant_id = v.tenant_id;
  if n <> (select count(*) from curriculum_version_skill)
     or n <> (select count(*) from curriculum_version v cross join jsonb_each(v.skills) e) then
    raise exception 'CP-27: % of % versions'' skills are on their version', n,
      (select count(*) from curriculum_version_skill);
  end if;

  select count(*) into n from capture c cross join jsonb_each(c.page_prints) e
    join capture_page p on p.capture_id = c.id and p.file_page = e.key::integer and p.tenant_id = c.tenant_id
                       and p.print = e.value ->> 'print' and p.code is not distinct from e.value ->> 'code';
  if n <> (select count(*) from capture_page)
     or n <> (select count(*) from capture c cross join jsonb_each(c.page_prints) e) then
    raise exception 'CP-27: % of % pages are on their scan', n, (select count(*) from capture_page);
  end if;

  select count(*) into n from config c cross join jsonb_array_elements(c.value) x
    join trait t on t.tenant_id = c.tenant_id and t.code = x ->> 'code' and t.band = x ->> 'band'
                and t.label = x ->> 'label' and t.positive is not distinct from x ->> 'positive'
                and t.concern is not distinct from x ->> 'concern' and t.expected is not distinct from x ->> 'expected'
                and t.exceeding is not distinct from x ->> 'exceeding'
                and to_jsonb(t.linked::text[]) is not distinct from x -> 'linked'
                and t.authored_by is not distinct from x ->> 'authored_by' and t.source is not distinct from x ->> 'source'
    where c.key = 'report.traits';
  if n <> (select count(*) from trait) then
    raise exception 'CP-27: % of % traits are in the setting', n, (select count(*) from trait);
  end if;

  -- `kinds.of`: {code: kind} for every kind, exactly as before
  if exists (select * from cp27_kinds except select s.tenant_id, k.key, k.value from skill s
             cross join jsonb_each(s.question_kinds) k)
     or exists (select s.tenant_id, k.key, k.value from skill s cross join jsonb_each(s.question_kinds) k
                except select * from cp27_kinds) then
    raise exception 'CP-27: the kinds of question are not what they were';
  end if;
end $$;

drop table cp27_kinds;

-- 5. What reads and writes the new homes. ------------------------------------------------------------------------

-- the samples as they stand: each sample's own row, unless taken off its level; who changed it last, when, and how
-- many times before, from the history log
create or replace view english_sample_now with (security_invoker = true) as
select e.tenant_id, e.skill_code, e.difficulty, e.question_type, e.ord, e.ask, e.passage_code, e.text, e.options,
       e.answer, e.accept, e.rubric_code, e.key_points, e.not_words, e.wrong,
       h.edited_by, h.edited_at, greatest(h.n - 1, 0)::bigint as earlier, e.made_from
from english_sample e
cross join lateral (
  select (array_agg(k.origin order by k.at desc, k.id desc))[1] as edited_by, max(k.at) as edited_at, count(*) as n
  from change_log k
  where k.tenant_id = e.tenant_id and k.table_name = 'english_sample'
    and k.row_id = concat_ws(' ', e.skill_code, e.difficulty, e.question_type, e.ord)
) h
where e.removed_at is null;

-- a version keeps every skill at its version, in its own row
create or replace function public.publish_curriculum(p_tenant uuid, p_by text, p_note text default '',
                                                     p_at timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('publish_curriculum'), hashtext(p_tenant::text));
  select coalesce(max(number), 0) + 1 into n from curriculum_version where tenant_id = p_tenant;
  insert into curriculum_version (tenant_id, number, published_by, published_at, takes_effect, note, skills)
  values (p_tenant, n, p_by, p_at, date_trunc('week', internal.school_day(p_tenant, p_at))::date + 7, p_note,
          (select coalesce(jsonb_object_agg(s.code, s.version), '{}'::jsonb) from skill s where s.tenant_id = p_tenant));
  return n;
end $$;

create or replace function public.curriculum_begins(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into config (tenant_id, key, value, description)
  values (p_tenant, 'school.time_zone', '"Asia/Kolkata"',
          'The school''s own clock: its day and its week, which a published curriculum takes effect from (C3).')
  on conflict (tenant_id, key) do nothing;
  -- a school with no skill yet (one just added, a database just built) begins at its first load (`engine load`)
  if exists (select 1 from curriculum_version where tenant_id = p_tenant)
     or not exists (select 1 from skill where tenant_id = p_tenant) then
    return;
  end if;
  insert into curriculum_version (tenant_id, number, published_by, takes_effect, note, skills)
  values (p_tenant, 1, 'the curriculum as it stood (C3)', date_trunc('week', internal.school_day(p_tenant, now()))::date,
          'Every skill as it stood when versions began.',
          (select coalesce(jsonb_object_agg(s.code, s.version), '{}'::jsonb) from skill s where s.tenant_id = p_tenant));
end $$;

-- a child's written states are rebuilt from their answers, their observed states from what educators saw: each
-- rebuild touches its own kind alone
create or replace function public.rebuild_child_skill_state(p_child_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  -- one rebuild of a child at a time: two at once each deleted what the other had not yet written, and the second
  -- insert failed on the first's rows (code review, 2026-09-30)
  perform pg_advisory_xact_lock(hashtext('rebuild_child_skill_state'), hashtext(p_child_id::text));
  delete from child_skill_state where child_id = p_child_id and kind = 'written';
  insert into child_skill_state
    (tenant_id, child_id, skill_code, rung_code, difficulty, state, n_events, n_correct, repeating_misconception,
     last_seen)
  select g.tenant_id, g.child_id, g.skill_code, g.rung_code, g.difficulty, g.state, g.n_events, g.n_correct,
         g.repeating_misconception, g.last_seen
  from public.graph_skill_states(p_child_id) g;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.rebuild_child_observed_state(p_child_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  -- one rebuild of a child at a time, as rebuild_child_skill_state
  perform pg_advisory_xact_lock(hashtext('rebuild_child_observed_state'), hashtext(p_child_id::text));
  delete from child_skill_state where child_id = p_child_id and kind = 'observed';
  insert into child_skill_state (tenant_id, child_id, skill_code, kind, grade_code, state, named_days, adults,
                                 first_named_yes, rechecked_on, last_seen)
  select g.tenant_id, g.child_id, g.skill_code, 'observed', g.grade_code, g.state, g.named_days, g.adults,
         g.first_named_yes, g.rechecked_on, g.last_seen
  from public.graph_observed_states(p_child_id) g;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.graph_numbers(p_before timestamptz)
returns table (children integer, evidence_rows integer, evidence_digest text, skill_states integer,
               observed_states integer, states_digest text)
language sql stable set search_path = public as $$
  select
    (select count(distinct child_id)::int from evidence_event where confirmed_by is not null),
    (select count(*)::int from evidence_event where created_at < p_before),
    (select md5(coalesce(string_agg(to_jsonb(e)::text, '' order by e.id), '')) from evidence_event e
      where e.created_at < p_before),
    (select count(*)::int from child_skill_state where kind = 'written'),
    (select count(*)::int from child_skill_state where kind = 'observed'),
    md5(coalesce((select string_agg(t, '' order by t) from (
        select (to_jsonb(s) - 'id' - 'computed_at' - 'created_at' - 'updated_at')::text as t from child_skill_state s
      ) x), ''))
$$;

create or replace function public.graph_state_changes(p_child uuid default null)
returns table (grade_code text, old_state text, new_state text, skills integer, children integer)
language sql stable set search_path = public as $$
  select c.band, coalesce(s.state, 'none'), g.state, count(*)::int, count(distinct g.child_id)::int
  from public.graph_skill_states(p_child) g
  join child c on c.id = g.child_id
  left join child_skill_state s on s.kind = 'written' and s.child_id = g.child_id and s.skill_code = g.skill_code
                               and s.rung_code is not distinct from g.rung_code
  where coalesce(s.state, 'none') is distinct from g.state
  group by c.band, coalesce(s.state, 'none'), g.state
$$;

-- links between skill sets and links between broad registry skills are rows of one table; each kind walks its own
create or replace function internal.skill_prerequisite_no_circle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    with recursive before(code) as (
      select coalesce(new.before_code, new.before_registry_code)
      union
      select coalesce(p.before_code, p.before_registry_code) from skill_prerequisite p join before b
        on p.tenant_id = new.tenant_id
       and ((new.skill_code is not null and p.skill_code = b.code)
            or (new.registry_code is not null and p.registry_code = b.code))
    ) select 1 from before where code = coalesce(new.skill_code, new.registry_code)
  ) then
    raise exception 'skill % would come before itself through %', coalesce(new.skill_code, new.registry_code),
      coalesce(new.before_code, new.before_registry_code) using errcode = 'check_violation';
  end if;
  return null;
end $$;

create or replace view skill_prerequisite_confirmed with (security_invoker = true) as
select id, tenant_id, skill_code, before_code, strength, reason, source, confirmed_by, confirmed_at
from skill_prerequisite p where status = 'confirmed' and skill_code is not null;

create or replace view skill_prerequisite_audit with (security_invoker = true) as
select id, tenant_id, skill_code, before_code, strength, reason, source, status, confirmed_by, confirmed_at, created_at
from skill_prerequisite where skill_code is not null;

create or replace view skill_link_confirmed with (security_invoker = true) as
select id, tenant_id, registry_code as skill_code, before_registry_code as before_code, strength, reason, source,
       confirmed_by, confirmed_at
from skill_prerequisite l where status = 'confirmed' and registry_code is not null;

create or replace view skill_link_audit with (security_invoker = true) as
select id, tenant_id, registry_code as skill_code, before_registry_code as before_code, strength, reason, source,
       status, confirmed_by, confirmed_at, created_at
from skill_prerequisite where registry_code is not null;

create or replace function public.propose_skill_link(p_tenant uuid, p_before text, p_after text, p_reason text,
                                                     p_source text, p_strength text default 'hard') returns text
language plpgsql set search_path = public as $$
declare
  made integer;
begin
  insert into skill_prerequisite (tenant_id, registry_code, before_registry_code, strength, reason, source)
  values (p_tenant, p_after, p_before, p_strength, p_reason, p_source)
  on conflict (tenant_id, registry_code, before_registry_code) do nothing;
  get diagnostics made = row_count;
  return case when made = 1 then 'added' else 'there' end;
end $$;

create or replace function public.confirm_skill_link(p_id uuid, p_staff uuid) returns text
language plpgsql set search_path = public as $$
declare
  school uuid;
  found boolean;
begin
  select tenant_id into school from staff where id = p_staff and active;
  if school is null then
    return 'not staff';
  end if;
  if not exists (select 1 from skill_prerequisite where id = p_id and tenant_id = school) then
    return 'no link';
  end if;
  update skill_prerequisite set status = 'confirmed', confirmed_by = p_staff, confirmed_at = now()
  where id = p_id and status <> 'confirmed';
  get diagnostics found = row_count;
  return case when found then 'confirmed' else 'already' end;
end $$;

-- the samples are worked out from the levels' words and the kinds' examples when asked (`engine links`)
drop trigger skill_level_sample_on_level on skill_level;
drop trigger skill_level_sample_on_card on question_format;
drop function internal.skill_level_sample_from_level();
drop function internal.skill_level_sample_from_card();
drop function internal.skill_level_sample_sync(uuid, text);
drop function internal.level_samples(text);
drop trigger skill_link_no_circle on skill_link;
drop function internal.skill_link_no_circle();

-- 6. The tables that leave. ---------------------------------------------------------------------------------------

do $$
declare
  t text;
  k record;
  moved constant text[] := array['english_sample_wrong', 'activity_part_source', 'milestone', 'item_stat',
    'skill_level_sample', 'curriculum_version_skill', 'capture_page', 'trait', 'child_reading_profile',
    'question_format'];
  emptied constant text[] := array['child_observed_state', 'graph_run', 'maths_sample', 'english_sample_edit',
    'paper_edit', 'assessment_name', 'skill_link', 'reminder', 'material_alias', 'material_unit_conversion',
    'materials_consolidated', 'materials_consolidated_line', 'materials_consolidated_source',
    'materials_consolidated_change', 'materials_consolidated_send', 'materials_send', 'materials_send_ack',
    'materials_note_review', 'materials_line_edit', 'materials_line_source'];
begin
  delete from access_table where schema_name = 'public' and table_name = any(moved || emptied);
  foreach t in array moved || emptied loop
    update data_register set tables = array_remove(tables, 'public.' || t) where 'public.' || t = any(tables);
  end loop;
  -- no table that stays still points at one that goes
  if exists (select 1 from pg_constraint c where c.contype = 'f'
             and c.confrelid in (select ('public.' || x)::regclass from unnest(moved || emptied) x)
             and c.conrelid not in (select ('public.' || x)::regclass from unnest(moved || emptied) x)) then
    raise exception 'CP-27: a table that stays still has a key into one that leaves';
  end if;
  foreach t in array moved loop
    for k in select conname from pg_constraint where contype = 'f' and conrelid = ('public.' || t)::regclass loop
      execute format('alter table public.%I drop constraint %I', t, k.conname);
    end loop;
    for k in select tgname from pg_trigger where not tgisinternal and tgrelid = ('public.' || t)::regclass loop
      execute format('drop trigger %I on public.%I', k.tgname, t);
    end loop;
    for k in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', k.policyname, t);
    end loop;
  end loop;
end $$;

-- the emptied ones (step 1: empty, in this transaction), those a key points at last
drop table public.child_observed_state;
drop table public.graph_run;
drop table public.maths_sample;
drop table public.english_sample_edit;
drop table public.paper_edit;
drop table public.assessment_name;
drop table public.skill_link;
drop table public.reminder;
drop table public.material_alias;
drop table public.material_unit_conversion;
drop table public.materials_consolidated_source;
drop table public.materials_consolidated_line;
drop table public.materials_consolidated_change;
drop table public.materials_consolidated_send;
drop table public.materials_consolidated;
drop table public.materials_send_ack;
drop table public.materials_send;
drop table public.materials_note_review;
drop table public.materials_line_edit;
drop table public.materials_line_source;

alter table public.english_sample_wrong set schema retired;
alter table public.activity_part_source set schema retired;
alter table public.milestone set schema retired;
alter table public.item_stat set schema retired;
alter table public.skill_level_sample set schema retired;
alter table public.curriculum_version_skill set schema retired;
alter table public.capture_page set schema retired;
alter table public.trait set schema retired;
alter table public.child_reading_profile set schema retired;
alter table public.question_format set schema retired;

-- two names stay, as views: whose words each part of a K2 page is, and each question's attempts and share right
create view activity_part_source with (security_invoker = true) as
select m.tenant_id, m.activity_code, m.part, m.source, m.proposal_id, m.staff_id, m.check_me,
       m.created_at, m.updated_at
from (select distinct on (k.tenant_id, k.row_id, k.after ->> 'part') k.tenant_id, k.row_id as activity_code,
             k.after ->> 'part' as part, k.after ->> 'source' as source,
             (k.after ->> 'proposal_id')::uuid as proposal_id, (k.after ->> 'staff_id')::uuid as staff_id,
             coalesce((k.after ->> 'check_me')::boolean, false) as check_me,
             min(k.at) over (partition by k.tenant_id, k.row_id, k.after ->> 'part') as created_at, k.at as updated_at
      from change_log k where k.table_name = 'activity' and k.op = 'part_source'
      order by k.tenant_id, k.row_id, k.after ->> 'part', k.at desc, k.id desc) m
where m.source is not null
  and exists (select 1 from activity a where a.tenant_id = m.tenant_id and a.code = m.activity_code);
comment on view activity_part_source is
  'Whose words each part of a K2 activity page is: the newest part_source mark in change_log (CP-27 group 6: once a table).';

create view item_stat with (security_invoker = true) as
select r.tenant_id, r.item_id, count(*)::integer as n, avg((r.status = 'correct')::int)::numeric(5, 4) as p_correct
from item_result r join capture c on c.id = r.capture_id
where r.state = 'confirmed' and r.status in ('correct', 'wrong', 'blank') and c.superseded_by is null
group by r.tenant_id, r.item_id;
comment on view item_stat is
  'Each question''s confirmed answers and share right (CP-27 group 6: once a table rebuilt by engine graph); a question far off its level is learn''s, from the settings.';

create view materials_line_source with (security_invoker = true) as
select l.id as line_id, (x ->> 'session_id')::uuid as session_id, x ->> 'activity_code' as activity_code,
       (x ->> 'on_date')::date as on_date, (x ->> 'quantity')::numeric as quantity
from materials_line l cross join jsonb_array_elements(l.sources) x;
comment on view materials_line_source is
  'The planned lessons each materials line comes from, read from materials_line.sources (CP-27 group 6: once a table).';

do $$
declare
  t record;
  r text;
begin
  for t in select tablename from pg_tables where schemaname = 'retired' loop
    execute format('revoke all on retired.%I from public', t.tablename);
    foreach r in array array['app_web', 'app_engine', 'anon', 'authenticated'] loop
      if exists (select from pg_roles where rolname = r) then
        execute format('revoke all on retired.%I from %I', t.tablename, r);
      end if;
    end loop;
  end loop;
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select on activity_part_source, item_stat, materials_line_source to app_engine;
    -- a link is never deleted by the engine or the site, whichever skills it joins (as `skill_link` was kept)
    revoke delete, truncate on skill_prerequisite from app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant select on activity_part_source, item_stat, materials_line_source to app_web;
  end if;
end $$;

select internal.apply_conventions();
