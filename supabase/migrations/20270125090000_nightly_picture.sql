-- CP-9: observations become evidence for real (specs/CP-9; design in specs/CP-9/design.md).
--   * `graph_run`: the ledger of the nightly rebuild of the picture. One row per run, never changed (rule 4). It holds
--     the run's clock, whether it worked, and the numbers and digests of evidence and states before and after, so a
--     run says by itself that it changed no evidence and no state it should not have. The digests cover only evidence
--     made before the run's clock (a watermark), so a note confirmed during the run cannot make before differ from after.
--   * `hand_check`: the coordinator's hand calculation for a child's skill, stored with what the system said at that
--     moment and whether they matched. Never changed. Child ids only (rule 6).
--   * `unplanned_sessions()`: sessions that happened with no plan line, or marked unplanned, on a campus in a date range.
--   * settings: how long a ledger may be silent before the live check calls the nightly flow dead, and the date from
--     which a note counts as a real one (empty until Nimish sets it at go-live).
-- Additive: no existing table, row or function is changed. Written to run twice.

create table if not exists graph_run (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenant(id) on delete cascade,
  started_at             timestamptz not null,
  ran_at                 timestamptz not null,
  ok                     boolean not null,
  error                  text,
  children               integer not null default 0,
  evidence_rows          integer not null default 0,
  evidence_digest_before text,
  evidence_digest_after  text,
  skill_states_before    integer,
  skill_states_after     integer,
  observed_states_before integer,
  observed_states_after  integer,
  states_digest_before   text,
  states_digest_after    text,
  created_at             timestamptz not null default clock_timestamp(),
  updated_at             timestamptz not null default now()
);
create index if not exists graph_run_started_idx on graph_run (tenant_id, started_at);

create table if not exists hand_check (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  child_id       uuid not null references child(id),
  skill_code     text not null,
  grade_code     text not null,
  expected_state text not null check (btrim(expected_state) <> ''),
  system_state   text,
  matches        boolean not null,
  checked_by     text not null check (btrim(checked_by) <> ''),
  checked_on     date not null default current_date,
  created_at     timestamptz not null default clock_timestamp(),
  updated_at     timestamptz not null default now()
);
create index if not exists hand_check_child_idx on hand_check (tenant_id, child_id);

drop trigger if exists graph_run_kept on graph_run;
create trigger graph_run_kept before update or delete on graph_run
  for each statement execute function internal.forbid_change();
drop trigger if exists hand_check_kept on hand_check;
create trigger hand_check_kept before update or delete on hand_check
  for each statement execute function internal.forbid_change();

-- What the nightly run measures, once: evidence made before the watermark (count and digest) and the two kinds of state
-- (counts and one digest of their business columns, without the surrogate id and timestamps).
create or replace function public.graph_numbers(p_before timestamptz)
returns table (children integer, evidence_rows integer, evidence_digest text, skill_states integer,
               observed_states integer, states_digest text)
language sql stable set search_path = public as $$
  select
    (select count(distinct child_id)::int from evidence_event where confirmed_by is not null),
    (select count(*)::int from evidence_event where created_at < p_before),
    (select md5(coalesce(string_agg(to_jsonb(e)::text, '' order by e.id), '')) from evidence_event e
      where e.created_at < p_before),
    (select count(*)::int from child_skill_state),
    (select count(*)::int from child_observed_state),
    md5(coalesce((select string_agg(t, '' order by t) from (
        select (to_jsonb(s) - 'id' - 'computed_at' - 'created_at' - 'updated_at')::text as t from child_skill_state s
        union all
        select (to_jsonb(o) - 'id' - 'computed_at' - 'created_at' - 'updated_at')::text from child_observed_state o
      ) x), ''))
$$;

-- Sessions that happened (state done) on a campus's classes in the range that are marked unplanned or carry no plan line.
create or replace function public.unplanned_sessions(p_campus uuid, p_from date, p_to date)
returns integer
language sql stable set search_path = public as $$
  select count(*)::int
  from session s
  join school_class c on c.id = s.school_class_id
  join school_day d on d.id = s.school_day_id
  where c.campus_id = p_campus and d.on_date between p_from and p_to
    and s.state = 'done' and (not s.planned or s.plan_entry_id is null)
$$;

create or replace function internal.nightly_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into config (tenant_id, key, value, description)
  values
    (p_tenant, 'graph.nightly_stale_hours', '26'::jsonb,
     'How many hours the ledger of the nightly rebuild (graph_run) may go without an ok run before the live check says the nightly flow has stopped.'),
    (p_tenant, 'cp9.real_notes_from', '""'::jsonb,
     'The date (YYYY-MM-DD) from which a K2 note counts as a real one, not a test, for the 20-notes acceptance gate. Empty until Nimish sets it at go-live.')
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.nightly_settings_on_new_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform internal.nightly_settings(new.id);
  return new;
end $$;

drop trigger if exists nightly_settings on tenant;
create trigger nightly_settings after insert on tenant
  for each row execute function internal.nightly_settings_on_new_school();

select internal.nightly_settings(id) from tenant;

-- The engine writes both ledgers and reads everything; the website reads.
do $$ begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert on graph_run, hand_check to app_engine;
    revoke update, delete, truncate on graph_run, hand_check from app_engine;
    grant execute on function public.graph_numbers(timestamptz), public.unplanned_sessions(uuid, date, date)
      to app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant select on graph_run, hand_check to app_web;
    revoke insert, update, delete, truncate on graph_run, hand_check from app_web;
    -- the website calls neither function; the engine's coordinator read and nightly job do
    revoke execute on function public.graph_numbers(timestamptz), public.unplanned_sessions(uuid, date, date)
      from app_web;
  end if;
end $$;

-- Every table is listed (CP-4): the ledger of runs names no child; a hand calculation is about one child's skill.
insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'graph_run', null, null, null, 'school_wide',
   'the nightly rebuild''s ledger: counts, times and digests of the picture; no child'),
  ('public', 'hand_check', 'learning', 'child_id', 'child', 'child_data', null)
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code,
  key_column = excluded.key_column, key_type = excluded.key_type, data_class = excluded.data_class,
  reason = excluded.reason;

select internal.apply_conventions();
