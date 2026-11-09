-- CP-7: the fortnight's timetable, one approval per class per fortnight (specs/CP-7; design in specs/CP-7/design.md, lean).
--   * `fortnight_plan`: one row per class per fortnight per version: the class's timetable for the fortnight, drafted from
--     its slots. `rolled_forward` when it matches the class's last settled fortnight (and the fortnight is no exception),
--     else `draft` until one person approves it (`settled_by`, `settled_at` on the plan itself: no row in the shared
--     approval ledger).
--   * `fortnight_plan_line`: one row per period of each weekday of weeks A and B, on its real date.
--   * `fortnight_draft(class, fortnight)` and `fortnight_approve(plan)`: the only writers. The app roles only read.
--   * a gate on CP-6's `fortnight_cycle`: a fortnight cannot move to `approved` while a class with a timetable in it has
--     no settled plan that still matches its timetable.
--   * two settings per school: `fortnight.no_roll_forward` (exception fortnights per school year) and
--     `fortnight.approver_groups` (CP-3 groups that may approve).
-- Additive and written to run twice.

create table if not exists fortnight_plan (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  school_class_id uuid not null references school_class(id),
  fortnight_id    uuid not null references fortnight(id),
  version         int not null check (version > 0),
  state           text not null default 'draft' check (state in ('draft', 'approved', 'rolled_forward')),
  baseline_id     uuid references fortnight_plan(id),
  drafted_at      timestamptz not null default now(),
  drafted_by      text not null default coalesce(nullif(current_setting('app.changed_by', true), ''), session_user)
                  check (btrim(drafted_by) <> ''),
  settled_at      timestamptz,
  settled_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (school_class_id, fortnight_id, version),
  check ((state = 'draft') = (settled_at is null and settled_by is null))
);

create table if not exists fortnight_plan_line (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant(id) on delete cascade,
  fortnight_plan_id uuid not null references fortnight_plan(id),
  week_code         text not null check (week_code in ('A', 'B')),
  weekday           smallint not null check (weekday between 1 and 5),
  on_date           date not null,
  period_id         uuid not null references period(id),
  kind              text not null,
  subject_code      text,
  text              text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (fortnight_plan_id, week_code, weekday, period_id)
);
create index if not exists fortnight_plan_fortnight_idx on fortnight_plan (school_class_id, fortnight_id);

-- Nothing is ever deleted.
create or replace function internal.fortnight_plan_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'a fortnight plan is never deleted' using errcode = 'P0001';
end $$;
drop trigger if exists fortnight_plan_kept on fortnight_plan;
create trigger fortnight_plan_kept before delete on fortnight_plan
  for each statement execute function internal.fortnight_plan_no_delete();
drop trigger if exists fortnight_plan_line_kept on fortnight_plan_line;
create trigger fortnight_plan_line_kept before delete on fortnight_plan_line
  for each statement execute function internal.fortnight_plan_no_delete();

-- Settings, for every school there is and every school added later.
create or replace function internal.fortnight_plan_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into config (tenant_id, key, value, description) values
    (p_tenant, 'fortnight.no_roll_forward', '{"2026-27": [10, 11]}'::jsonb,
     'Fortnights of a school year that always need a yes, even when nothing in the timetable changed: {"<school year>": [fortnight numbers]}. Default: Fortnights 10 and 11 of 2026-27.'),
    (p_tenant, 'fortnight.approver_groups', '["everything"]'::jsonb,
     'The access groups (CP-3) whose members may approve a class''s fortnight timetable. Default: the Everything group.')
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.fortnight_plan_settings_on_new_school() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.fortnight_plan_settings(new.id);
  return new;
end $$;

drop trigger if exists fortnight_plan_settings on tenant;
create trigger fortnight_plan_settings after insert on tenant
  for each row execute function internal.fortnight_plan_settings_on_new_school();

select internal.fortnight_plan_settings(id) from tenant;

-- Every candidate line of a class's fortnight: each period of each weekday of weeks A and B on its real date (the Monday
-- of the week holding the fortnight's first day, plus the weekday, plus 7 for week B), from the slot valid on that date.
create or replace function internal.fortnight_slots(p_class uuid, p_fortnight uuid)
returns table (week_code text, weekday smallint, on_date date, period_id uuid, kind text, subject_code text, text text)
language sql stable set search_path = public as $$
  select w.code, g.wd::smallint, d.day, s.period_id, s.kind, s.subject_code, s.text
  from fortnight f
  cross join (values ('A'), ('B')) w(code)
  cross join generate_series(1, 5) g(wd)
  cross join lateral (select (f.starts_on - (extract(isodow from f.starts_on)::int - 1) + (g.wd - 1)
                              + case w.code when 'B' then 7 else 0 end)::date as day) d
  join timetable_slot s on s.school_class_id = p_class and s.week_code = w.code and s.weekday = g.wd
   and s.valid_from <= d.day and (s.valid_to is null or s.valid_to >= d.day)
  where f.id = p_fortnight
$$;

-- The lines of a draft: refused when a period has two slots on a date, or the class has no timetable in the fortnight.
create or replace function internal.fortnight_lines(p_class uuid, p_fortnight uuid)
returns table (week_code text, weekday smallint, on_date date, period_id uuid, kind text, subject_code text, text text)
language plpgsql stable set search_path = public as $$
declare dup record;
begin
  select x.on_date, x.period_id into dup
  from internal.fortnight_slots(p_class, p_fortnight) x
  group by x.on_date, x.period_id having count(*) > 1 limit 1;
  if found then
    raise exception 'two slots for one period: class % % period %', p_class, dup.on_date, dup.period_id
      using errcode = '23514';
  end if;
  if not exists (select from internal.fortnight_slots(p_class, p_fortnight)) then
    raise exception 'fortnight has no timetable: class %', p_class using errcode = '23514';
  end if;
  return query select * from internal.fortnight_slots(p_class, p_fortnight);
end $$;

-- What a fortnight says, for comparing: week, weekday, period, kind, subject and wording of every period that is not
-- empty (a missing period and an `empty` one are the same). Dates are not compared: they differ by fortnight.
create or replace function internal.fortnight_signature(p_lines jsonb) returns text
language sql immutable set search_path = public as $$
  select md5(coalesce(string_agg(
    format('%s|%s|%s|%s|%s|%s', l->>'week_code', l->>'weekday', l->>'period_id', l->>'kind',
           coalesce(l->>'subject_code', ''), l->>'text'),
    E'\n' order by l->>'week_code', (l->>'weekday')::int, l->>'period_id'), ''))
  from jsonb_array_elements(p_lines) l
  where l->>'kind' <> 'empty'
$$;

create or replace function internal.fortnight_signature_of_slots(p_class uuid, p_fortnight uuid) returns text
language sql stable set search_path = public as $$
  select internal.fortnight_signature(coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb))
  from internal.fortnight_lines(p_class, p_fortnight) x
$$;

create or replace function internal.fortnight_signature_of_plan(p_plan uuid) returns text
language sql stable set search_path = public as $$
  select internal.fortnight_signature(coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb))
  from fortnight_plan_line l where l.fortnight_plan_id = p_plan
$$;

-- Who may approve: an active member of staff of the school, holding a role valid today that CP-3 puts in one of the
-- groups the school's `fortnight.approver_groups` names. `current_staff()` is the website's identity (a uuid or nothing).
create or replace function internal.fortnight_is_approver(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from staff s
    join staff_role_grant g on g.tenant_id = s.tenant_id and g.staff_id = s.id
    join access_role_group rg on rg.tenant_id = g.tenant_id and rg.role_code = g.role_code
    where s.id = public.current_staff() and s.tenant_id = p_tenant and s.active
      and g.valid_from <= current_date and (g.valid_to is null or g.valid_to >= current_date)
      and rg.group_code in (select jsonb_array_elements_text(c.value) from config c
                            where c.tenant_id = p_tenant and c.key = 'fortnight.approver_groups'
                              and jsonb_typeof(c.value) = 'array')
  )
$$;

create or replace function internal.fortnight_setting(p_tenant uuid, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  select value into v from config where tenant_id = p_tenant and key = p_key;
  if v is null then
    raise exception 'setting % is missing for this school', p_key using errcode = '23514';
  end if;
  return v;
end $$;

-- Draft a class's fortnight. Returns the plan: the existing one when nothing changed, else a new version.
create or replace function public.fortnight_draft(p_class uuid, p_fortnight uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f fortnight%rowtype;
  cls school_class%rowtype;
  st text;
  who text := coalesce(nullif(current_setting('app.changed_by', true), ''), public.current_staff()::text,
                       session_user::text);
  year_label text;
  exempt boolean;
  base fortnight_plan%rowtype;
  cur fortnight_plan%rowtype;
  sig text;
  new_state text := 'draft';
  new_id uuid;
begin
  select * into f from fortnight where id = p_fortnight;
  if not found or f.kind <> 'teaching' then
    raise exception 'only a teaching fortnight is planned' using errcode = '23514';
  end if;
  select * into cls from school_class where id = p_class;
  if not found or cls.tenant_id <> f.tenant_id then
    raise exception 'class and fortnight are not of one school' using errcode = '23514';
  end if;
  select state into st from fortnight_cycle where fortnight_id = p_fortnight for share;
  if st is null or st not in ('frozen', 'aligned') then
    raise exception 'fortnight cannot be drafted: fortnight % is %', f.number, coalesce(st, 'not planned')
      using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_class::text || p_fortnight::text, 0));

  sig := internal.fortnight_signature_of_slots(p_class, p_fortnight);  -- raises with no timetable, or two slots

  select y.label into year_label from academic_year y where y.id = f.academic_year_id;
  exempt := exists (
    select 1 from jsonb_array_elements_text(
      coalesce(internal.fortnight_setting(f.tenant_id, 'fortnight.no_roll_forward') -> year_label, '[]'::jsonb)) n
    where n = f.number::text);

  -- the class's newest settled version in an earlier teaching fortnight
  select p.* into base
  from fortnight_plan p join fortnight bf on bf.id = p.fortnight_id
  where p.school_class_id = p_class and p.state in ('approved', 'rolled_forward')
    and bf.kind = 'teaching' and bf.starts_on < f.starts_on
  order by bf.starts_on desc, p.version desc limit 1;

  if found and not exempt and internal.fortnight_signature_of_plan(base.id) = sig then
    new_state := 'rolled_forward';
  end if;

  select * into cur from fortnight_plan
  where school_class_id = p_class and fortnight_id = p_fortnight order by version desc limit 1;
  if found and cur.baseline_id is not distinct from base.id and internal.fortnight_signature_of_plan(cur.id) = sig
     and cur.state = case when new_state = 'rolled_forward' then 'rolled_forward' else cur.state end then
    return cur.id;
  end if;

  insert into fortnight_plan (tenant_id, school_class_id, fortnight_id, version, state, baseline_id, drafted_at,
                              drafted_by, settled_at, settled_by)
  values (f.tenant_id, p_class, p_fortnight, coalesce(cur.version, 0) + 1, new_state, base.id, now(), who,
          case when new_state = 'rolled_forward' then now() end,
          case when new_state = 'rolled_forward' then who end)
  returning id into new_id;
  insert into fortnight_plan_line (tenant_id, fortnight_plan_id, week_code, weekday, on_date, period_id, kind,
                                   subject_code, text)
  select f.tenant_id, new_id, l.week_code, l.weekday, l.on_date, l.period_id, l.kind, l.subject_code, l.text
  from internal.fortnight_lines(p_class, p_fortnight) l;
  return new_id;
end $$;

-- One yes for a class's fortnight. Only the newest version, only while it waits, only from an approving group.
create or replace function public.fortnight_approve(p_plan uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p fortnight_plan%rowtype;
  who text := coalesce(nullif(current_setting('app.changed_by', true), ''), public.current_staff()::text);
begin
  select * into p from fortnight_plan where id = p_plan for update;
  if not found then
    raise exception 'fortnight is not open: no such plan' using errcode = '23514';
  end if;
  if not internal.fortnight_is_approver(p.tenant_id) then
    raise exception 'only the approving group approves a fortnight' using errcode = '42501';
  end if;
  if p.version <> (select max(version) from fortnight_plan
                   where school_class_id = p.school_class_id and fortnight_id = p.fortnight_id) then
    raise exception 'fortnight is not open: a newer version exists' using errcode = '23514';
  end if;
  if p.state <> 'draft' then
    raise exception 'fortnight is not open: it is %', replace(p.state, '_', ' ') using errcode = '23514';
  end if;
  update fortnight_plan set state = 'approved', settled_by = who, settled_at = now() where id = p_plan;
end $$;

-- A direct change to a plan, by anyone who can reach the table, is held to the same group rule.
create or replace function internal.fortnight_plan_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not internal.fortnight_is_approver(old.tenant_id) then
    raise exception 'only the approving group approves a fortnight' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists fortnight_plan_guard on fortnight_plan;
create trigger fortnight_plan_guard before update on fortnight_plan
  for each row execute function internal.fortnight_plan_guard();

-- CP-6's fortnight cannot be marked approved while a class with a timetable in it is not settled, or its settled plan
-- no longer says what the timetable says.
create or replace function internal.fortnight_cycle_gate() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare f fortnight%rowtype; k uuid; latest fortnight_plan%rowtype;
begin
  if new.state <> 'approved' or old.state = 'approved' then
    return new;
  end if;
  select * into f from fortnight where id = new.fortnight_id;
  for k in
    select distinct s.school_class_id
    from timetable_slot s join school_class c on c.id = s.school_class_id
    where c.academic_year_id = f.academic_year_id and c.tenant_id = f.tenant_id
      and s.valid_from <= f.ends_on and (s.valid_to is null or s.valid_to >= f.starts_on)
    order by 1
  loop
    select * into latest from fortnight_plan
    where school_class_id = k and fortnight_id = new.fortnight_id order by version desc limit 1;
    if not found or latest.state not in ('approved', 'rolled_forward')
       or internal.fortnight_signature_of_plan(latest.id) is distinct from internal.fortnight_signature_of_slots(k, f.id)
    then
      raise exception 'fortnight % cannot be approved: class % is not settled', f.number, k using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists fortnight_cycle_gate on fortnight_cycle;
create trigger fortnight_cycle_gate before update of state on fortnight_cycle
  for each row execute function internal.fortnight_cycle_gate();

-- Who may do what. The app logins only read the two tables; the two functions write them.
do $$ begin
  revoke all on fortnight_plan, fortnight_plan_line from public;
  revoke all on function public.fortnight_draft(uuid, uuid), public.fortnight_approve(uuid) from public;
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on fortnight_plan, fortnight_plan_line from anon;
    revoke all on function public.fortnight_draft(uuid, uuid), public.fortnight_approve(uuid) from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on fortnight_plan, fortnight_plan_line from authenticated;
    revoke all on function public.fortnight_draft(uuid, uuid), public.fortnight_approve(uuid) from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    revoke all on fortnight_plan, fortnight_plan_line from app_web;
    grant select on fortnight_plan, fortnight_plan_line to app_web;
    revoke all on function public.fortnight_draft(uuid, uuid) from app_web;
    grant execute on function public.fortnight_approve(uuid) to app_web;
  end if;
  if exists (select from pg_roles where rolname = 'app_engine') then
    revoke all on fortnight_plan, fortnight_plan_line from app_engine;
    grant select on fortnight_plan, fortnight_plan_line to app_engine;
    grant execute on function public.fortnight_draft(uuid, uuid), public.fortnight_approve(uuid) to app_engine;
  end if;
end $$;

-- Every table is listed (CP-4): a class's timetable for a fortnight and who settled it; no child.
insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'fortnight_plan', null, null, null, 'school_wide',
   'a class''s timetable for a fortnight and the staff id that settled it; by class id; no child'),
  ('public', 'fortnight_plan_line', null, null, null, 'school_wide',
   'one period of a class''s fortnight timetable; by plan id; no child')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code,
  key_column = excluded.key_column, key_type = excluded.key_type, data_class = excluded.data_class,
  reason = excluded.reason;

select internal.apply_conventions();
