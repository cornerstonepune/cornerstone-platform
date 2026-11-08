-- CP-1: people, complete.
-- 1. Moving a child is one step: `move_child` calls `enrol_child`, so the child's open enrolment row closes and a new one opens
--    in the same transaction, and a refused move changes nothing.
-- 2. The edit history keeps the first write of an activity, and a link changed in place (before: only an activity's update
--    and a link's insert or delete were kept).
-- Nothing is added that holds a person: no new table.

-- The class a move goes to is the one `school_class` row of this school year for the grade and section, on the child's
-- campus (their open enrolment's; any when they have none). A child with an open enrolment is enrolled in that class, and
-- is refused when it has no row. A child with no open enrolment (on 8 Nov: every child outside K2, as only K2 has class
-- rows) moves as before, and is enrolled when the class has a row. A roll is taken when another child's row holds it or
-- an open enrolment of the class does; `child.section` and `child.roll_no` are still written, as pages read them.
create or replace function public.move_child(
  p_child uuid, p_band text, p_section text, p_roll text, p_by text, p_reason text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c child%rowtype;
  p_section_t text := btrim(coalesce(p_section, ''));
  p_roll_t    text := btrim(coalesce(p_roll, ''));
  withdrawn   integer;
  made        integer;
  this_week   text := to_char(current_date, 'IYYY-"W"IW');
  here        uuid;   -- the campus the child is on now
  there       uuid;   -- the class they are going to
begin
  select * into c from child where id = p_child for update;
  if not found then return jsonb_build_object('moved', false, 'refused', 'no_such_child'); end if;
  if btrim(coalesce(p_by, '')) = '' then return jsonb_build_object('moved', false, 'refused', 'no_one'); end if;
  if p_roll_t !~ '^[A-Za-z0-9-]{1,8}$' then return jsonb_build_object('moved', false, 'refused', 'bad_roll'); end if;
  if not exists (select 1 from grade where tenant_id = c.tenant_id and code = p_band) then
    return jsonb_build_object('moved', false, 'refused', 'no_such_grade');
  end if;
  -- a class is one that has a child in it: a typed name that matches none is a typing slip, not a new class
  if p_section_t <> c.section and not exists (
    select 1 from child where tenant_id = c.tenant_id and section = p_section_t and active
  ) then
    return jsonb_build_object('moved', false, 'refused', 'no_such_class');
  end if;
  if p_band = c.band and p_section_t = c.section and p_roll_t = c.roll_no then
    return jsonb_build_object('moved', false, 'refused', 'nothing_changes');
  end if;

  select s.campus_id into here from enrolment e join school_class s on s.id = e.class_id
   where e.child_id = c.id and e.to_date is null;
  select s.id into there from school_class s join academic_year y on y.id = s.academic_year_id
   where s.tenant_id = c.tenant_id and s.grade_code = p_band and s.section = p_section_t
     and current_date between y.starts_on and y.ends_on and (here is null or s.campus_id = here)
   order by s.created_at limit 1;
  if there is null and here is not null then  -- an enrolled child cannot be left on a class they are no longer in
    return jsonb_build_object('moved', false, 'refused', 'no_such_class');
  end if;
  if exists (
    select 1 from child where tenant_id = c.tenant_id and section = p_section_t and roll_no = p_roll_t and id <> c.id
  ) or (there is not null and exists (
    select 1 from enrolment where class_id = there and to_date is null and roll_no = p_roll_t and child_id <> c.id
  )) then
    return jsonb_build_object('moved', false, 'refused', 'roll_taken');
  end if;

  begin  -- the child's row and their enrolment change together, or neither does
    update child set band = p_band, section = p_section_t, roll_no = p_roll_t where id = c.id;
    if there is not null then perform enrol_child(c.id, there, p_roll_t, current_date, btrim(p_by)); end if;
  exception
    when unique_violation then  -- someone took the roll between the check and the change
      return jsonb_build_object('moved', false, 'refused', 'roll_taken');
    when raise_exception then
      if sqlerrm like 'no_such_class%' or sqlerrm like 'date_before_current%' then
        return jsonb_build_object('moved', false, 'refused', split_part(sqlerrm, ':', 1));
      end if;
      raise;
  end;
  insert into child_move (tenant_id, child_id, from_band, from_section, from_roll_no, to_band, to_section, to_roll_no,
                          reason, moved_by)
  values (c.tenant_id, c.id, c.band, c.section, c.roll_no, p_band, p_section_t, p_roll_t,
          btrim(coalesce(p_reason, '')), btrim(p_by));

  -- ring B: the stored class card of both classes is dropped and rebuilt from the graph when next asked for
  delete from class_card where tenant_id = c.tenant_id and section in (c.section, p_section_t);

  select count(*) into made from prescription
   where child_id = c.id and week >= this_week and sheet_instance_id is not null;
  with gone as (
    delete from prescription
     where child_id = c.id and week >= this_week and sheet_instance_id is null and override_by is null
     returning 1
  ) select count(*) into withdrawn from gone;

  return jsonb_build_object('moved', true, 'prescriptions_withdrawn', withdrawn, 'papers_made', made);
end $$;

-- An activity written for the first time is kept like one changed: each field it starts with, before empty.
create or replace function internal.curriculum_edit_kept() returns trigger
language plpgsql set search_path = public as $$
declare
  who text := coalesce(nullif(btrim(current_setting('app.changed_by', true)), ''), session_user::text);
  f text;
  was text;
  now_ text;
begin
  foreach f in array tg_argv loop
    if tg_op = 'UPDATE' then
      execute format('select ($1).%I::text', f) into was using old;
    end if;
    execute format('select ($1).%I::text', f) into now_ using new;
    if was is distinct from now_ and not (tg_op = 'INSERT' and coalesce(now_, '') = '') then
      insert into curriculum_edit (tenant_id, record, code, field, before, after, changed_by)
      values (new.tenant_id, tg_table_name, new.code, f, coalesce(was, ''), coalesce(now_, ''), who);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists activity_edit_kept on activity;
create trigger activity_edit_kept after insert or update on activity
  for each row execute function internal.curriculum_edit_kept(
    'strand', 'name', 'objective', 'materials', 'level_0', 'level_1', 'level_2', 'level_3', 'sheet_no',
    'steps', 'thinking');

-- A link changed in place is a link removed (the old one) and a link added (the new one). A change to nothing the
-- link says (its order, its source) is no change to the link.
create or replace function internal.curriculum_link_kept() returns trigger
language plpgsql set search_path = public as $$
declare
  who text := coalesce(nullif(btrim(current_setting('app.changed_by', true)), ''), session_user::text);
  field text := case when tg_table_name = 'activity_objective' then 'lo_code' else 'skill_code' end;
  o jsonb;
  n jsonb;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (o->>field, coalesce(o->>'activity_code', o->>'lo_code'))
                          is not distinct from (n->>field, coalesce(n->>'activity_code', n->>'lo_code')) then
    return null;
  end if;
  if o is not null then
    insert into curriculum_edit (tenant_id, record, code, field, before, after, changed_by)
    values ((o->>'tenant_id')::uuid, tg_table_name, coalesce(o->>'activity_code', o->>'lo_code'), field, o->>field, '', who);
  end if;
  if n is not null then
    insert into curriculum_edit (tenant_id, record, code, field, before, after, changed_by)
    values ((n->>'tenant_id')::uuid, tg_table_name, coalesce(n->>'activity_code', n->>'lo_code'), field, '', n->>field, who);
  end if;
  return null;
end $$;

drop trigger if exists activity_skill_kept on activity_skill;
create trigger activity_skill_kept after insert or update or delete on activity_skill
  for each row execute function internal.curriculum_link_kept();
drop trigger if exists activity_objective_kept on activity_objective;
create trigger activity_objective_kept after insert or update or delete on activity_objective
  for each row execute function internal.curriculum_link_kept();
drop trigger if exists learning_objective_skill_kept on learning_objective_skill;
create trigger learning_objective_skill_kept after insert or update or delete on learning_objective_skill
  for each row execute function internal.curriculum_link_kept();
