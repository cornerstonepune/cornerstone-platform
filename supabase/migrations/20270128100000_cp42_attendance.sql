-- CP-42: attendance per child per day. One row a child a day: what the school's attendance report says, with no name
-- (names stay in pii) and not who marked it. Rebuilt by loading the report again: a corrected day replaces its row.
create table if not exists attendance (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  child_id   uuid not null references child(id),
  on_date    date not null,
  program    text not null check (btrim(program) <> ''),
  status     text not null check (status in ('present', 'absent', 'leave')),
  in_time    time,
  out_time   time,
  minutes    int check (minutes is null or minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, child_id, on_date)
);
create index if not exists attendance_day_idx on attendance (tenant_id, on_date);
comment on table attendance is 'Attendance per child per day (CP-42): present, absent or leave, with the in and out times and the minutes the report gives. Loaded from the school''s report by `POST /attendance/load`; never holds a name or who marked it.';

do $$
begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert, update, delete on attendance to app_engine;
  end if;
end $$;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'attendance', 'children', 'child_id', 'child', 'child_data', null)
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code, key_column = excluded.key_column,
  key_type = excluded.key_type, data_class = excluded.data_class, reason = excluded.reason;

select internal.apply_conventions();
