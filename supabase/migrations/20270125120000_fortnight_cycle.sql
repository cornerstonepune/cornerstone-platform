-- CP-6: the fortnight cycle (specs/CP-6; design in specs/CP-6/design.md; Nimish, 8 Nov: "freeze by fortnight", 9 Nov: lean).
--   * `fortnight_cycle`: one row per teaching fortnight holding its state (planning, frozen, aligned, approved, list_sent)
--     and who and when for every step. The engine (`w2_print/fortnight_cycle.py`) moves it, one step at a time.
--   * `fortnight_edit`: the history. One row per state change, and one row per change made in a fortnight that is no
--     longer planning (with the reason that was given).
--   * four settings per school, `fortnight.freeze|align|approve|list_sent`: how many days before the fortnight starts
--     each step falls. The numbers below are PLACEHOLDERS: the roadmap's real dates are not in this repository. A school
--     changes them by updating the row.
-- The engine enforces the order and the freeze (no triggers on the two tables); the only trigger here gives a school
-- added later its four settings. Hand-run SQL is not stopped.
-- Additive and written to run twice.

create table if not exists fortnight_cycle (
  tenant_id     uuid not null references tenant(id) on delete cascade,
  fortnight_id  uuid primary key references fortnight(id) on delete cascade,
  state         text not null default 'planning'
                check (state in ('planning', 'frozen', 'aligned', 'approved', 'list_sent')),
  planning_at   timestamptz not null default now(),
  planning_by   text not null default coalesce(nullif(current_setting('app.changed_by', true), ''), session_user)
                check (btrim(planning_by) <> ''),
  frozen_at     timestamptz,
  frozen_by     text,
  aligned_at    timestamptz,
  aligned_by    text,
  approved_at   timestamptz,
  approved_by   text,
  list_sent_at  timestamptz,
  list_sent_by  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists fortnight_edit (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  fortnight_id uuid not null references fortnight(id) on delete cascade,
  kind         text not null check (kind in ('state', 'frozen_change')),
  subject      text not null check (btrim(subject) <> ''),
  record_id    text,
  op           text not null check (op in ('state', 'insert', 'update', 'delete')),
  reason       text,
  changed_by   text not null check (btrim(changed_by) <> ''),
  created_at   timestamptz not null default clock_timestamp(),
  updated_at   timestamptz not null default now(),
  check (kind <> 'frozen_change' or btrim(coalesce(reason, '')) <> '')
);
create index if not exists fortnight_edit_fortnight_idx on fortnight_edit (fortnight_id, created_at);

-- Placeholder step dates (days before the fortnight starts), one row each per school. Not Nimish's real dates.
create or replace function internal.fortnight_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into config (tenant_id, key, value, description)
  select p_tenant, s.key, jsonb_build_object('days_before_start', s.days), s.description
  from (values
    ('fortnight.freeze',    14, 'Days before a fortnight starts when its plan and timetable freeze (a placeholder until the roadmap''s date is set).'),
    ('fortnight.align',     10, 'Days before a fortnight starts when the plan is aligned (a placeholder until the roadmap''s date is set).'),
    ('fortnight.approve',    7, 'Days before a fortnight starts when the plan is approved (a placeholder until the roadmap''s date is set).'),
    ('fortnight.list_sent',  3, 'Days before a fortnight starts when the materials list is sent (a placeholder until the roadmap''s date is set).')
  ) as s(key, days, description)
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.fortnight_settings_on_new_school() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.fortnight_settings(new.id);
  return new;
end $$;

drop trigger if exists fortnight_settings on tenant;
create trigger fortnight_settings after insert on tenant
  for each row execute function internal.fortnight_settings_on_new_school();

select internal.fortnight_settings(id) from tenant;

-- Every teaching fortnight of a year that has not ended starts at planning (stamped by the column defaults).
insert into fortnight_cycle (tenant_id, fortnight_id)
select f.tenant_id, f.id
from fortnight f
join academic_year y on y.id = f.academic_year_id
where f.kind = 'teaching' and y.ends_on >= current_date
on conflict (fortnight_id) do nothing;

do $$ begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert, update on fortnight_cycle to app_engine;
    grant select, insert on fortnight_edit to app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant select on fortnight_cycle, fortnight_edit to app_web;
  end if;
end $$;

-- Every table is listed (CP-4): neither holds a child, only fortnights, staff ids, reasons and times.
insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'fortnight_cycle', null, null, null, 'school_wide',
   'a fortnight''s state and who and when for each step; no child'),
  ('public', 'fortnight_edit', null, null, null, 'school_wide',
   'the history of a fortnight''s state and of changes made after it froze (table, record id, reason, staff id); no child')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code,
  key_column = excluded.key_column, key_type = excluded.key_type, data_class = excluded.data_class,
  reason = excluded.reason;

select internal.apply_conventions();
