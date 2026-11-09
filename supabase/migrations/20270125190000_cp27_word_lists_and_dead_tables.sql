-- CP-27, group 1 (specs/CP-27/spec.md, docs/data-model.md): short word lists become rules on the columns that use them,
-- and tables nothing real uses leave.
--
--   * Word lists -> a check on each column that named a row of them (docs/data-model.md: "a short fixed list of states
--     or kinds is a check rule on the column"). What code read from a list moves with it:
--       evidence_kind.scale and evidence_mark.correct     -> internal.evidence_event_record() (written and voice are
--                                                            marked right / wrong / blank; observed, project and
--                                                            performance yes / sometimes / not yet)
--       note_status.ord (a note never goes back)           -> internal.note_received_now(), the statuses in order
--       link_status.confirmed                              -> the status 'confirmed' (views, trigger, confirm function)
--       state_colour.words, count_words                    -> the setting `state.colours` (config), the school's own words
--       access_role_group (a role's group)                 -> a column `role.access_group`
--     note_status, claim_decision, observation_entry_mode, observation_outcome, observation_route, evidence_kind,
--     evidence_mark, evidence_scale, link_status, link_strength, approval_state, state_colour, access_group, access_kind,
--     access_role_group.
--   * Tables nothing reads: domain (registry_skill carries its code; its name becomes `registry_skill.domain_name`),
--     item_registry_skill (a copy of each question's own skill, kept by a trigger), blueprint, narrative_observation,
--     home_sheet (empty on live, census of 9 Nov 2026).
--
-- A table with rows on live is never dropped: what is needed is copied to its new home, a block below raises unless
-- every value is there, and the table moves to the schema `retired` (no grants, no keys, no triggers). An empty one is
-- dropped, after a block raises unless it is empty. One transaction: any raise leaves the database as it was.
-- Runs once, on live and on a fresh database; `db push` runs it in one transaction.

create schema if not exists retired;
revoke all on schema retired from public;
do $$ begin
  if exists (select from pg_roles where rolname = 'app_web') then revoke all on schema retired from app_web; end if;
  if exists (select from pg_roles where rolname = 'app_engine') then revoke all on schema retired from app_engine; end if;
  if exists (select from pg_roles where rolname = 'anon') then revoke all on schema retired from anon; end if;
  if exists (select from pg_roles where rolname = 'authenticated') then revoke all on schema retired from authenticated; end if;
end $$;

-- 1. Every word in use, and every word in a list, is one the new rule allows; every attribute code read is as below. ---

do $$
declare bad text;
begin
  select string_agg(format('%s: %s', t, v), '; ') into bad from (
    select 'evidence_kind' t, code v from evidence_kind
      where (code, scale) not in (('written', 'answer'), ('observed', 'seen'), ('voice', 'answer'),
                                  ('project', 'seen'), ('performance', 'seen'))
    union all select 'evidence_mark', scale || '/' || code || '/' || coalesce(correct::text, 'null') from evidence_mark
      where (scale, code, coalesce(correct::text, 'null')) not in
            (('answer', 'right', 'true'), ('answer', 'wrong', 'false'), ('answer', 'blank', 'null'),
             ('seen', 'yes', 'null'), ('seen', 'sometimes', 'null'), ('seen', 'not_yet', 'null'))
    union all select 'evidence_scale', code from evidence_scale where code not in ('answer', 'seen')
    union all select 'evidence_event.kind', kind from evidence_event
      where kind not in ('written', 'observed', 'voice', 'project', 'performance')
    union all select 'observed_weight.kind', kind from observed_weight
      where kind not in ('written', 'observed', 'voice', 'project', 'performance')
    union all select 'observed_weight.entry_mode', entry_mode from observed_weight
      where entry_mode not in ('individual', 'group_as_expected')
    union all select 'observation_entry_mode', code from observation_entry_mode
      where code not in ('individual', 'group_as_expected')
    union all select 'observation_outcome', code from observation_outcome
      where code not in ('above', 'as_expected', 'below', 'not_willing', 'absent')
    union all select 'observation_route', code from observation_route where code not in ('voice', 'form')
    union all select 'activity_observation', outcome || '/' || entry_mode || '/' || route from activity_observation
      where outcome not in ('above', 'as_expected', 'below', 'not_willing', 'absent')
         or entry_mode not in ('individual', 'group_as_expected') or route not in ('voice', 'form')
    union all select 'note_status', code || '@' || ord from note_status
      where (code, ord) not in (('received', 0), ('drafted', 1), ('confirmed', 2), ('left_unconfirmed', 3))
    union all select 'pii.educator_note.status', status from pii.educator_note
      where status not in ('received', 'drafted', 'confirmed', 'left_unconfirmed')
    union all select 'claim_decision', code from claim_decision where code not in ('accepted', 'changed', 'removed')
    union all select 'pii.note_claim.decision', decision from pii.note_claim
      where decision not in ('accepted', 'changed', 'removed')
    union all select 'link_strength', code from link_strength where code not in ('hard', 'soft')
    union all select 'link_status', code || '/' || confirmed from link_status
      where (code, confirmed) not in (('proposed', false), ('confirmed', true))
    union all select 'skill_prerequisite', strength || '/' || status from skill_prerequisite
      where strength not in ('hard', 'soft') or status not in ('proposed', 'confirmed')
    union all select 'skill_link', strength || '/' || status from skill_link
      where strength not in ('hard', 'soft') or status not in ('proposed', 'confirmed')
    union all select 'approval_state', code from approval_state
      where code not in ('draft', 'sent_back', 'waiting_second', 'approved')
    union all select 'state_colour', code from state_colour where code not in ('red', 'amber', 'green', 'grey')
    union all select 'child_state.colour', colour from child_state where colour not in ('red', 'amber', 'green', 'grey')
    union all select 'access_group', code || '/' || by_role from access_group
      where (code, by_role) not in (('everything', true), ('own_classes', true), ('signed_in', false))
    union all select 'access_kind', code from access_kind
      where code not in ('children', 'enrolment', 'staff', 'notes', 'papers', 'answers', 'learning', 'reports',
                         'who_looked', 'consent')
    union all select 'access_reach', group_code || '/' || kind_code from access_reach
      where group_code not in ('everything', 'own_classes', 'signed_in')
         or kind_code not in ('children', 'enrolment', 'staff', 'notes', 'papers', 'answers', 'learning', 'reports',
                              'who_looked', 'consent')
    union all select 'access_role_group', role_code || '/' || group_code from access_role_group
      where group_code not in ('everything', 'own_classes')
  ) x;
  if bad is not null then
    raise exception 'CP-27: a word the new rules would not keep: %', bad;
  end if;
  if exists (select 1 from blueprint) or exists (select 1 from narrative_observation) or exists (select 1 from home_sheet)
     or exists (select 1 from sheet_template where blueprint_id is not null) then
    raise exception 'CP-27: blueprint, narrative_observation or home_sheet holds a row; it was empty in the census';
  end if;
end $$;

-- 2. Copies to the new homes. -------------------------------------------------------------------------------------

-- a role's access group
alter table role add column access_group text check (access_group in ('everything', 'own_classes'));
comment on column role.access_group is
  'The access group a person holding this role is in (CP-3): everything or own_classes; none: no reach by this role.';
update role r set access_group = g.group_code
from access_role_group g where g.tenant_id = r.tenant_id and g.role_code = r.code;

-- a domain's name, on each skill of it
alter table registry_skill add column domain_name text;
update registry_skill s set domain_name = d.name from domain d where d.tenant_id = s.tenant_id and d.code = s.domain;

-- each colour's words, the school's setting
insert into config (tenant_id, key, value, description)
select tenant_id, 'state.colours',
       jsonb_agg(jsonb_build_object('code', code, 'words', words, 'count_words', count_words) order by ord),
       'The words each colour of a child''s map is said in, weakest first: `words` in a key or a legend, `count_words` in a count ("3 secure"). The four colours are fixed (a check on child_state.colour); their words are the school''s (CP-27: they were the table state_colour).'
from state_colour group by tenant_id
on conflict (tenant_id, key) do nothing;

do $$
declare n_old int; n_new int;
begin
  -- the 13 role -> group rows, each now on its role, and no role in a group it was not in
  select count(*) into n_old from access_role_group;
  select count(*) into n_new from role r
    join access_role_group g on g.tenant_id = r.tenant_id and g.role_code = r.code and g.group_code = r.access_group;
  if n_old <> n_new or (select count(*) from role where access_group is not null) <> n_old then
    raise exception 'CP-27: % role-group rows, % roles carry theirs', n_old, n_new;
  end if;
  -- every domain's name is on a skill of it, and every skill of a named domain carries the name
  if exists (select 1 from domain d where not exists (
               select 1 from registry_skill s where s.tenant_id = d.tenant_id and s.domain = d.code and s.domain_name = d.name))
     or exists (select 1 from registry_skill s join domain d on d.tenant_id = s.tenant_id and d.code = s.domain
                where s.domain_name is distinct from d.name) then
    raise exception 'CP-27: a domain''s name did not reach its skills';
  end if;
  -- every school's colours, in order, with both words
  if exists (
    select 1 from (
      select tenant_id, jsonb_agg(jsonb_build_object('code', code, 'words', words, 'count_words', count_words) order by ord) v
      from state_colour group by tenant_id
    ) s left join config c on c.tenant_id = s.tenant_id and c.key = 'state.colours'
    where c.value is distinct from s.v
  ) then
    raise exception 'CP-27: a school''s colour words are not its setting state.colours';
  end if;
  -- item_registry_skill is a copy: one row per question, its own skill, no step a person wrote
  if exists (select 1 from item_registry_skill x where x.step is not null)
     or exists (select 1 from item_registry_skill x join item i on i.id = x.item_id
                where x.registry_skill is distinct from internal.item_own_registry_skill(i.spec, i.skill_codes))
     or (select count(*) from item_registry_skill) <> (select count(*) from item) then
    raise exception 'CP-27: item_registry_skill holds something its questions do not';
  end if;
end $$;

-- 3. The rules, in place of the keys. ------------------------------------------------------------------------------

alter table evidence_event drop constraint evidence_event_tenant_id_kind_fkey;
alter table evidence_event add constraint evidence_event_kind_check
  check (kind in ('written', 'observed', 'voice', 'project', 'performance'));

alter table observed_weight drop constraint observed_weight_tenant_id_kind_fkey;
alter table observed_weight drop constraint observed_weight_tenant_id_entry_mode_fkey;
alter table observed_weight add constraint observed_weight_kind_check
  check (kind in ('written', 'observed', 'voice', 'project', 'performance'));
alter table observed_weight add constraint observed_weight_entry_mode_check
  check (entry_mode in ('individual', 'group_as_expected'));

alter table activity_observation drop constraint activity_observation_tenant_id_outcome_fkey;
alter table activity_observation drop constraint activity_observation_tenant_id_entry_mode_fkey;
alter table activity_observation drop constraint activity_observation_tenant_id_route_fkey;
alter table activity_observation add constraint activity_observation_outcome_check
  check (outcome in ('above', 'as_expected', 'below', 'not_willing', 'absent'));
alter table activity_observation add constraint activity_observation_entry_mode_check
  check (entry_mode in ('individual', 'group_as_expected'));
alter table activity_observation add constraint activity_observation_route_check check (route in ('voice', 'form'));

alter table pii.educator_note drop constraint educator_note_tenant_id_status_fkey;
alter table pii.educator_note add constraint educator_note_status_check
  check (status in ('received', 'drafted', 'confirmed', 'left_unconfirmed'));
alter table pii.note_claim drop constraint note_claim_tenant_id_decision_fkey;
alter table pii.note_claim add constraint note_claim_decision_check check (decision in ('accepted', 'changed', 'removed'));

alter table skill_prerequisite drop constraint skill_prerequisite_tenant_id_strength_fkey;
alter table skill_prerequisite drop constraint skill_prerequisite_tenant_id_status_fkey;
alter table skill_prerequisite add constraint skill_prerequisite_strength_check check (strength in ('hard', 'soft'));
alter table skill_prerequisite add constraint skill_prerequisite_status_check check (status in ('proposed', 'confirmed'));
alter table skill_link drop constraint skill_link_tenant_id_strength_fkey;
alter table skill_link drop constraint skill_link_tenant_id_status_fkey;
alter table skill_link add constraint skill_link_strength_check check (strength in ('hard', 'soft'));
alter table skill_link add constraint skill_link_status_check check (status in ('proposed', 'confirmed'));

alter table child_state drop constraint child_state_tenant_id_colour_fkey;
alter table child_state add constraint child_state_colour_check check (colour in ('red', 'amber', 'green', 'grey'));

alter table access_reach drop constraint access_reach_tenant_id_group_code_fkey;
alter table access_reach drop constraint access_reach_tenant_id_kind_code_fkey;
alter table access_reach add constraint access_reach_group_code_check
  check (group_code in ('everything', 'own_classes', 'signed_in'));
alter table access_reach add constraint access_reach_kind_code_check
  check (kind_code in ('children', 'enrolment', 'staff', 'notes', 'papers', 'answers', 'learning', 'reports',
                       'who_looked', 'consent'));

alter table sheet_template drop column blueprint_id;

-- 4. What read a list reads the rule. ------------------------------------------------------------------------------

-- A record is marked on its kind's scale: written and voice right, wrong or blank (`correct` true, false, none: three
-- signals, never two); observed, project and performance yes, sometimes or not yet, never right or wrong.
create or replace function internal.evidence_event_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  answer boolean := new.kind in ('written', 'voice');
begin
  if new.mark is null and new.kind = 'written' then
    new.mark := case new.correct when true then 'right' when false then 'wrong' else 'blank' end;
  end if;
  if new.mark is null or not (case when answer then new.mark in ('right', 'wrong', 'blank')
                                   else new.mark in ('yes', 'sometimes', 'not_yet') end) then
    raise exception 'a % record is marked on its scale (%), not %', new.kind,
      case when answer then 'answer' else 'seen' end, coalesce(new.mark, 'nothing')
      using errcode = 'check_violation';
  end if;
  if answer then
    if new.correct is not null and new.correct is distinct from (case new.mark when 'right' then true
                                                                   when 'wrong' then false end) then
      raise exception 'a % record marked % is not correct = %', new.kind, new.mark, new.correct
        using errcode = 'check_violation';
    end if;
    new.correct := case new.mark when 'right' then true when 'wrong' then false end;
  elsif new.correct is not null then
    raise exception 'a % record says yes, sometimes or not yet, never right or wrong', new.kind
      using errcode = 'check_violation';
  end if;
  if new.kind <> 'written' and (new.seen_by is null or new.place is null or new.source is null) then
    raise exception 'a % record says who saw it, where and its source', new.kind using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function internal.note_received_now() returns trigger
language plpgsql set search_path = public as $$
declare
  stages constant text[] := array['received', 'drafted', 'confirmed', 'left_unconfirmed'];  -- in order
begin
  if tg_op = 'INSERT' then
    new.received_at := now();  -- the server's clock, set on insert, never the phone's
  else
    new.received_at := old.received_at;  -- when it reached us never moves
    new.staff_id := old.staff_id;
    new.audio_key := old.audio_key;
    -- when the raw copies were deleted is set once
    new.audio_deleted_at := coalesce(old.audio_deleted_at, new.audio_deleted_at);
    new.transcript_cleared_at := coalesce(old.transcript_cleared_at, new.transcript_cleared_at);
  end if;
  if tg_op = 'UPDATE' then
    -- a confirmed note is what its claims were read from: its words and class never change after, except that its
    -- transcript is cleared (set to null) when the raw copies go; a confirmed or left-unconfirmed note stays so; no
    -- note moves back to an earlier status
    if old.status in ('confirmed', 'left_unconfirmed') and (new.status is distinct from old.status
        or (new.transcript is distinct from old.transcript and new.transcript is not null)
        or new.class_id is distinct from old.class_id) then
      raise exception 'a % note is kept as it was', old.status using errcode = 'check_violation';
    end if;
    if array_position(stages, new.status) < array_position(stages, old.status) then
      raise exception 'a note does not go back from % to %', old.status, new.status using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_at := now();
  end if;
  return new;
end $$;

-- A confirmed link names the person and the time; a proposed one names neither. Shared by both link tables.
create or replace function internal.skill_link_confirmation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' then
    if new.confirmed_by is null then
      raise exception 'a confirmed link names the member of staff who confirmed it' using errcode = 'check_violation';
    end if;
    new.confirmed_at := coalesce(new.confirmed_at, now());
  elsif new.confirmed_by is not null or new.confirmed_at is not null then
    raise exception 'a link nobody confirmed names no one who did' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace view skill_link_confirmed with (security_invoker = true) as
  select l.id, l.tenant_id, l.skill_code, l.before_code, l.strength, l.reason, l.source, l.confirmed_by, l.confirmed_at
  from skill_link l where l.status = 'confirmed';

create or replace view skill_prerequisite_confirmed with (security_invoker = true) as
  select p.id, p.tenant_id, p.skill_code, p.before_code, p.strength, p.reason, p.source, p.confirmed_by, p.confirmed_at
  from skill_prerequisite p where p.status = 'confirmed';

-- 'confirmed', 'already' (someone confirmed it first: their word stands), 'no link' or 'not staff'. A member of staff of
-- the link's own school who is still active; the link is looked for among both tables (an id is unique across them).
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
  if exists (select 1 from skill_link where id = p_id and tenant_id = school) then
    update skill_link set status = 'confirmed', confirmed_by = p_staff, confirmed_at = now()
    where id = p_id and status <> 'confirmed';
    get diagnostics found = row_count;
  elsif exists (select 1 from skill_prerequisite where id = p_id and tenant_id = school) then
    update skill_prerequisite set status = 'confirmed', confirmed_by = p_staff, confirmed_at = now()
    where id = p_id and status <> 'confirmed';
    get diagnostics found = row_count;
  else
    return 'no link';
  end if;
  return case when found then 'confirmed' else 'already' end;
end $$;

create or replace function public.my_reach(p_kind text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case max(case r.reach when 'all' then 2 when 'own' then 1 else 0 end)
             when 2 then 'all' when 1 then 'own' else 'none' end
    from internal.resolve_staff() me
    cross join lateral (select internal.school_day(me.tenant_id, now()) as d) today
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= today.d and (g.valid_to is null or g.valid_to > today.d)
    join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code
    join access_reach r on r.tenant_id = ro.tenant_id and r.group_code = ro.access_group and r.kind_code = p_kind
  ), 'none')
$$;

create or replace function public.my_ids(p_kind text, p_key_type text) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (
    select m.staff_id, m.tenant_id, internal.school_day(m.tenant_id, now()) as d from internal.resolve_staff() m
  ), cls as (
    select distinct g.school_class_id as id, me.tenant_id, me.d
    from me
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= me.d and (g.valid_to is null or g.valid_to > me.d)
    join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code
    join access_reach r on r.tenant_id = ro.tenant_id and r.group_code = ro.access_group
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
    when 'run' then (select array_agg(f.id) from flow_run f
                       where f.tenant_id = (select tenant_id from me)
                         and (f.uploaded_by = public.current_staff()
                              or (f.result ? 'copies' and exists (
                                    select 1 from jsonb_array_elements(case when jsonb_typeof(f.result -> 'copies') = 'array'
                                                                            then f.result -> 'copies' else '[]'::jsonb end) k
                                    where k ->> 'capture_id' in (select id::text from caps)))))
    when 'parent_note' then (select array_agg(n.id) from parent_note n
                               where n.tenant_id = (select tenant_id from me) and n.child_id in (select child_id from kids))
    when 'item_result' then (select array_agg(r.id) from item_result r where r.capture_id in (select id from caps))
  end, '{}'::uuid[])
$$;

create or replace function internal.fortnight_is_approver(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from internal.resolve_staff() me
    cross join lateral (select internal.school_day(me.tenant_id, now()) as d) today
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= today.d and (g.valid_to is null or g.valid_to > today.d)
    join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code
    where me.tenant_id = p_tenant
      and ro.access_group in (select jsonb_array_elements_text(c.value) from config c
                              where c.tenant_id = p_tenant and c.key = 'fortnight.approver_groups'
                                and jsonb_typeof(c.value) = 'array')
  )
$$;

-- 5. What a new school is given, without the lists. ----------------------------------------------------------------

-- Each role's group (on the roles people_vocabulary has just made: this trigger's name sorts after it), and each group's
-- reach of each kind of data. A role already in a group keeps it.
create or replace function internal.access_vocabulary(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update role r set access_group = v.group_code
  from (values
    ('coordinator', 'everything'), ('deputy_coordinator', 'everything'), ('mentor', 'everything'),
    ('head', 'everything'), ('curriculum_team', 'everything'), ('ops', 'everything'),
    ('special_educator', 'everything'),  -- in neither list Nimish gave; here until he says otherwise
    ('educator', 'own_classes'), ('class_teacher', 'own_classes'), ('subject_educator', 'own_classes'),
    ('cover_educator', 'own_classes'), ('specialist', 'own_classes'), ('assistant', 'own_classes')
  ) v (role_code, group_code)
  where r.tenant_id = p_tenant and r.code = v.role_code and r.access_group is null;
  insert into access_reach (tenant_id, group_code, kind_code, reach)
  select p_tenant, g, k,
         case when g = 'everything' then 'all'
              when g = 'own_classes' and k not in ('who_looked', 'consent') then 'own'
              else 'none' end
  from unnest(array['everything', 'own_classes', 'signed_in']) g
  cross join unnest(array['children', 'enrolment', 'staff', 'notes', 'papers', 'answers', 'learning', 'reports',
                          'who_looked', 'consent']) k
  on conflict do nothing;
end $$;

create or replace function internal.approval_begins(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into approval_kind (tenant_id, code, ord, words, reaches_parent)
  select p_tenant, v.code, v.ord, v.words, v.reaches_parent
  from (values
    ('skill_level', 0, 'a skill at a level', false),
    ('question_type', 1, 'a way of asking', false),
    ('parent_note', 2, 'a report for a parent', true)
  ) v (code, ord, words, reaches_parent)
  on conflict (tenant_id, code) do nothing;
end $$;

create or replace function internal.voice_vocabulary(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- How long a note waits for her, and so how long its recording and transcript are kept (CP-10).
  insert into config (tenant_id, key, value, description)
  values (p_tenant, 'voice.confirm_within_hours', '48'::jsonb,
          'A K2 voice note not confirmed within this many hours leaves the educator''s queue, is kept as unconfirmed, and never becomes evidence (observation model, section 4). The same hours are how long a note''s recording and transcript are kept: the clean-up deletes both then (CP-10).')
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.school_states(p_tenant uuid) returns void
language plpgsql set search_path = public as $$
begin
  insert into config (tenant_id, key, value, description)
  values (p_tenant, 'state.colours',
          '[{"code": "red", "words": "needs help", "count_words": "needs help"},
            {"code": "amber", "words": "practising", "count_words": "practising"},
            {"code": "green", "words": "got it", "count_words": "secure"},
            {"code": "grey", "words": "not enough yet", "count_words": "too few answers"}]'::jsonb,
          'The words each colour of a child''s map is said in, weakest first: `words` in a key or a legend, `count_words` in a count ("3 secure"). The four colours are fixed (a check on child_state.colour); their words are the school''s (CP-27: they were the table state_colour).')
  on conflict (tenant_id, key) do nothing;

  insert into child_state (tenant_id, code, ord, words, colour, needs_work, enough, severity, move_up, nearly,
                           card_group, why)
  select p_tenant, v.code, v.ord, v.words, v.colour, v.needs_work, v.enough, v.severity, v.move_up, v.nearly,
         v.card_group, v.why
  from (values
    ('patterned_error', 0, 'repeating mistake', 'red', true, true, 1, false, false, 'reteach',
     'the same mistake more than once'),
    ('emerging', 1, 'under half right', 'red', true, true, 2, false, false, 'emerging',
     'fewer than {next_sheet.demote_below} right'),
    ('practising', 2, 'practising', 'amber', true, true, 3, false, true, 'practising',
     'not yet {next_sheet.promote_at} right on enough answers and days'),
    ('secure_to_recheck', 3, 'secure, to re-check', 'amber', true, true, 4, false, true, 'practising',
     '{next_sheet.promote_at} right — to check again on a later paper'),
    ('secure', 4, 'secure', 'green', false, true, 5, false, false, 'secure',
     '{next_sheet.promote_at} right — a step up'),
    ('stretch_ready', 5, 'ready to move up', 'green', false, true, 5, true, false, 'move_up', 'ready to move up'),
    ('not_enough_yet', 6, 'not enough yet', 'grey', false, false, 4, false, false, 'not_enough_yet', null)
  ) v (code, ord, words, colour, needs_work, enough, severity, move_up, nearly, card_group, why)
  on conflict (tenant_id, code) do update set
    ord = excluded.ord, enough = excluded.enough, severity = excluded.severity, move_up = excluded.move_up,
    nearly = excluded.nearly, card_group = excluded.card_group, why = excluded.why;
end $$;

create or replace function internal.timetable_live_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into config (tenant_id, key, value, description)
  values
    (p_tenant, 'timetable.go_live_group', '"everything"'::jsonb,
     'The access group (role.access_group) whose members may put a draft timetable live; the coordinator''s group by default.')
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.timetable_hand_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into config (tenant_id, key, value, description)
  values
    (p_tenant, 'timetable.open_clash_blocks_approval', 'true'::jsonb,
     'On: a fortnight with a timetable clash nobody accepted cannot be approved, and a move in an approved fortnight that would leave one is refused.'),
    (p_tenant, 'timetable.accept_clash_group', '"everything"'::jsonb,
     'The access group (role.access_group) whose members may accept a timetable clash with a reason; the coordinator''s group by default.')
  on conflict (tenant_id, key) do nothing;
end $$;

-- 6. What served only the lists and the copies goes. ---------------------------------------------------------------

drop trigger evidence_vocabulary on tenant;
drop function internal.evidence_vocabulary_on_new_school();
drop function internal.evidence_vocabulary(uuid);
drop trigger skill_link_vocabulary on tenant;
drop function internal.skill_link_vocabulary_on_new_school();
drop function internal.skill_link_vocabulary(uuid);
drop trigger item_registry_skill_on_item on item;
drop trigger item_registry_skill_checked on item_registry_skill;
drop function internal.item_registry_skill_from_item();
drop function internal.item_registry_skill_check();
drop function internal.item_own_registry_skill(jsonb, text[]);

drop table blueprint;
drop table narrative_observation;
drop table home_sheet;

delete from access_table where schema_name = 'public' and table_name in (
  'note_status', 'claim_decision', 'observation_entry_mode', 'observation_outcome', 'observation_route', 'evidence_kind',
  'evidence_mark', 'evidence_scale', 'link_status', 'link_strength', 'approval_state', 'state_colour', 'access_group',
  'access_kind', 'access_role_group', 'domain', 'item_registry_skill', 'blueprint', 'narrative_observation', 'home_sheet');

update data_register set tables = (
  select array_agg(t order by o) from unnest(tables) with ordinality u (t, o)
  where t not in ('public.access_group', 'public.access_kind', 'public.access_role_group', 'public.home_sheet',
                  'public.narrative_observation', 'public.domain', 'public.item_registry_skill', 'public.blueprint')
) where tables && array['public.access_group', 'public.access_kind', 'public.access_role_group', 'public.home_sheet',
                        'public.narrative_observation', 'public.domain', 'public.item_registry_skill', 'public.blueprint'];

-- 7. The tables with rows move to `retired`, inert: no key, no trigger, no policy, no grant. ---------------------------

do $$
declare
  t text;
  k record;
  moved constant text[] := array[
    'note_status', 'claim_decision', 'observation_entry_mode', 'observation_outcome', 'observation_route',
    'evidence_kind', 'evidence_mark', 'evidence_scale', 'link_status', 'link_strength', 'approval_state',
    'state_colour', 'access_group', 'access_kind', 'access_role_group', 'domain', 'item_registry_skill'];
begin
  -- no table that stays still points at one that goes
  if exists (select 1 from pg_constraint c where c.contype = 'f'
             and c.confrelid in (select ('public.' || x)::regclass from unnest(moved) x)
             and c.conrelid not in (select ('public.' || x)::regclass from unnest(moved) x)) then
    raise exception 'CP-27: a table that stays still has a key into one that is retired';
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

alter table public.note_status set schema retired;
alter table public.claim_decision set schema retired;
alter table public.observation_entry_mode set schema retired;
alter table public.observation_outcome set schema retired;
alter table public.observation_route set schema retired;
alter table public.evidence_kind set schema retired;
alter table public.evidence_mark set schema retired;
alter table public.evidence_scale set schema retired;
alter table public.link_status set schema retired;
alter table public.link_strength set schema retired;
alter table public.approval_state set schema retired;
alter table public.state_colour set schema retired;
alter table public.access_group set schema retired;
alter table public.access_kind set schema retired;
alter table public.access_role_group set schema retired;
alter table public.domain set schema retired;
alter table public.item_registry_skill set schema retired;

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
end $$;

select internal.apply_conventions();
