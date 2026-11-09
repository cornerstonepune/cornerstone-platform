-- CP-11: a draft timetable made by FET for one class and one fortnight, kept with FET's exact input and output.
-- Nothing here touches timetable_slot, session or plan_entry: putting a draft live is a separate step (CP-21).
-- Holds no child's id or answers, so it is school-wide data (no access_table row).

create table if not exists timetable_run (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  school_class_id uuid not null references school_class(id),
  fortnight_id    uuid not null references fortnight(id),
  outcome         text not null check (outcome in ('placed', 'unmeetable', 'not_found_in_time')),
  needed          int not null check (needed >= 0),
  placed          int not null check (placed >= 0),
  input_text      text,
  output_text     text,
  fet_version     text,
  seed            bigint not null,
  solve_seconds   int not null check (solve_seconds > 0),
  report          jsonb not null default '{}'::jsonb,
  draft           jsonb not null default '[]'::jsonb,
  created_by      text not null default coalesce(nullif(btrim(current_setting('app.changed_by', true)), ''), session_user),
  created_at      timestamptz not null default now()
);
create index if not exists timetable_run_class_idx on timetable_run (school_class_id, fortnight_id, created_at);

-- append-only: a kept draft is never changed or deleted
drop trigger if exists timetable_run_append_only on timetable_run;
create trigger timetable_run_append_only before update or delete on timetable_run
  for each statement execute function internal.forbid_change();

-- per-school settings, the same pattern as internal.voice_evidence_settings
create or replace function internal.timetable_run_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into config (tenant_id, key, value, description)
  values
    (p_tenant, 'timetable.solve_seconds', '120'::jsonb,
     'How many seconds FET may search for one class and fortnight before the draft reports "no timetable found in time".'),
    (p_tenant, 'timetable.seed', '20261109'::jsonb,
     'The fixed random seed given to FET, so the same rules give the same draft. Kept in every run.')
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.timetable_run_settings_on_new_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform internal.timetable_run_settings(new.id);
  return new;
end $$;

drop trigger if exists timetable_run_settings on tenant;
create trigger timetable_run_settings after insert on tenant
  for each row execute function internal.timetable_run_settings_on_new_school();

select internal.timetable_run_settings(id) from tenant;

select internal.apply_conventions();
