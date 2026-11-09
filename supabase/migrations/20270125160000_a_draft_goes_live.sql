-- CP-22: a draft timetable goes live for one class and one fortnight (specs/CP-22; design in specs/CP-22/design.md).
--   * A live fortnight is a layer of dated `timetable_slot` rows (valid_from = valid_to = the date, `fortnight_id` set)
--     on top of the standing frame (`fortnight_id` null, read as before by `valid_to is null`). The frame is never touched.
--   * The slot key gains `fortnight_id`, nulls not distinct: frame rows stay unique among themselves, a layer row on the
--     frame's own first day no longer collides with the frame row, and the loader's `on conflict do nothing` still
--     infers the key. A partial index keeps one layer row per class, period and date.
--   * The session key is left as it is: sessions that change place are taken out with their materials links, and put back
--     at the same id in their new cells in the same transaction (a deferrable key is no `on conflict` arbiter, and the
--     loader's insert is one).
--   * `timetable_live`: who put which draft live for which fortnight, when; `state_hash` of the fortnight as written, so
--     a later go-live sees a hand change; `discarded` when the person chose to overwrite one. Append-only.
--   * `timetable.go_live_group`: the access group (CP-3) whose members may put a draft live; `everything` by default
--     (Nimish, 8 Nov: only the coordinator).
-- The engine (`w2_print/tt_live.py`) does every check and write; nothing here decides. Written to run twice.

alter table timetable_slot add column if not exists fortnight_id uuid references fortnight(id);

alter table timetable_slot drop constraint if exists timetable_slot_school_class_id_period_id_week_code_weekday__key;
alter table timetable_slot drop constraint if exists timetable_slot_cell_key;
alter table timetable_slot add constraint timetable_slot_cell_key
  unique nulls not distinct (school_class_id, period_id, week_code, weekday, valid_from, fortnight_id);
create unique index if not exists timetable_slot_live_cell_idx on timetable_slot (school_class_id, period_id, valid_from)
  where fortnight_id is not null;
create index if not exists timetable_slot_fortnight_idx on timetable_slot (fortnight_id) where fortnight_id is not null;

create table if not exists timetable_live (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  school_class_id uuid not null references school_class(id),
  fortnight_id    uuid not null references fortnight(id),
  run_id          uuid not null references timetable_run(id),
  state_hash      text not null check (btrim(state_hash) <> ''),
  discarded       boolean not null default false,
  reason          text,
  who             uuid not null references staff(id),
  at              timestamptz not null default clock_timestamp()
);
create index if not exists timetable_live_fortnight_idx on timetable_live (school_class_id, fortnight_id, at);

drop trigger if exists timetable_live_append_only on timetable_live;
create trigger timetable_live_append_only before update or delete on timetable_live
  for each statement execute function internal.forbid_change();

-- per-school setting, the same pattern as internal.timetable_run_settings
create or replace function internal.timetable_live_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into config (tenant_id, key, value, description)
  values
    (p_tenant, 'timetable.go_live_group', '"everything"'::jsonb,
     'The access group (access_group.code) whose members may put a draft timetable live; the coordinator''s group by default.')
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.timetable_live_settings_on_new_school() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.timetable_live_settings(new.id);
  return new;
end $$;

drop trigger if exists timetable_live_settings on tenant;
create trigger timetable_live_settings after insert on tenant
  for each row execute function internal.timetable_live_settings_on_new_school();

select internal.timetable_live_settings(id) from tenant;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'timetable_live', null, null, null, 'school_wide',
   'plan and timetable: which draft went live for a class and fortnight, who and when, by class id; no child')
on conflict do nothing;

select internal.apply_conventions();
