-- CP-24: one clock. The school's date is `internal.school_day(tenant, at)` (20261206090000: the `school.time_zone`
-- setting), never the server's `current_date` (audit F5: a move made at 01:00 in Pune was dated the day before).
--   * `move_child` (20270111090000) takes `p_at timestamptz default now()` and dates the move, the enrolment and the
--     week it withdraws papers from by the school's day of that moment. The old signature is dropped first: a `create or
--     replace` with a new parameter would have left two `move_child`s.
--   * `hand_check.checked_on` (20270125090000) still defaults to `current_date`: changing it needs a trigger function,
--     which CP-27's budget (functions may only fall) does not allow. The engine dates its hand checks itself
--     (`nightly.hand_check`); the column is CP-27's to settle.
-- Written to run twice.

drop function if exists public.move_child(uuid, text, text, text, text, text);

create or replace function public.move_child(
  p_child uuid, p_band text, p_section text, p_roll text, p_by text, p_reason text default '',
  p_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c child%rowtype;
  p_section_t text := btrim(coalesce(p_section, ''));
  p_roll_t    text := btrim(coalesce(p_roll, ''));
  withdrawn   integer;
  made        integer;
  today       date;   -- the school's day of p_at, never the server's
  this_week   text;
  here        uuid;   -- the campus the child is on now
  there       uuid;   -- the class they are going to
begin
  select * into c from child where id = p_child for update;
  if not found then return jsonb_build_object('moved', false, 'refused', 'no_such_child'); end if;
  today := internal.school_day(c.tenant_id, p_at);
  this_week := to_char(today, 'IYYY-"W"IW');
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
     and today between y.starts_on and y.ends_on and (here is null or s.campus_id = here)
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
    if there is not null then perform enrol_child(c.id, there, p_roll_t, today, btrim(p_by)); end if;
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

-- The same doors as 20261220090000: the engine and the website, never the API's roles.
revoke all on function public.move_child(uuid, text, text, text, text, text, timestamptz) from public;
do $$ begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant execute on function public.move_child(uuid, text, text, text, text, text, timestamptz) to app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant execute on function public.move_child(uuid, text, text, text, text, text, timestamptz) to app_web;
  end if;
end $$;
