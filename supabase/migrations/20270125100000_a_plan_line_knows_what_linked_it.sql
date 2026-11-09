-- CP-8: every plan line says what linked it, a run of linking can be undone as a whole, and the lines left over are listed.
--
-- Additive; no new table (so no row in `access_table`). Four columns on `plan_entry`, a trigger, two views, two functions.
--   * link_rule, link_run, linked_at, linked_by: a line with an activity always names its rule (exact_name: the loader's;
--     person: a hand edit; later rules are added by later migrations). link_run is set only by a run of `plan_link_apply`.
--   * plan_line_candidate: for each unlinked line, every activity of the class's grade a rule matches, with its rank.
--   * plan_unmatched: every unlinked line, computed live, with its fortnight and why (no_match, several_matches,
--     ready_to_link), so none is silently unlinked and the list cannot go stale after a reload, an undo or a new activity.
--   * plan_link_apply / plan_link_undo: one run, optionally one fortnight; undo reverts exactly that run's lines.
-- A tie is never broken by code. The views are security_invoker, so the role rules on plan_entry apply through them.
--
-- Written to run twice.

alter table plan_entry
  add column if not exists link_rule text check (link_rule in ('exact_name', 'person')),
  add column if not exists link_run uuid,
  add column if not exists linked_at timestamptz,
  add column if not exists linked_by text;

-- The links the loader already made are tagged before the rule that needs a tag is added.
update plan_entry set link_rule = 'exact_name', linked_at = coalesce(linked_at, now()), linked_by = coalesce(linked_by, 'loader')
 where activity_id is not null and link_rule is null;

alter table plan_entry drop constraint if exists plan_entry_link_names_rule;
alter table plan_entry add constraint plan_entry_link_names_rule check ((activity_id is null) = (link_rule is null));

create index if not exists plan_entry_link_run_idx on plan_entry (link_run) where link_run is not null;

-- A hand edit of the link leaves any run: the undo never touches it. Edits made by the run functions change link_run
-- themselves, so they are left alone here.
create or replace function internal.plan_link_by_hand() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.activity_id is distinct from old.activity_id and new.link_run is not distinct from old.link_run then
    new.link_run := null;
    if new.activity_id is null then
      new.link_rule := null; new.linked_at := null; new.linked_by := null;
    else
      new.link_rule := 'person';
      new.linked_at := now();
      new.linked_by := coalesce(nullif(btrim(current_setting('app.changed_by', true)), ''), session_user::text);
    end if;
  end if;
  return new;
end $$;

-- A line inserted already linked by something other than the loader or a run (a test, a hand entry) is a person's.
create or replace function internal.plan_link_on_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.activity_id is not null and new.link_rule is null then
    new.link_rule := 'person';
    new.linked_at := coalesce(new.linked_at, now());
    new.linked_by := coalesce(new.linked_by, nullif(btrim(current_setting('app.changed_by', true)), ''), session_user::text);
  end if;
  return new;
end $$;

drop trigger if exists plan_entry_link_on_insert on plan_entry;
create trigger plan_entry_link_on_insert before insert on plan_entry
  for each row execute function internal.plan_link_on_insert();

drop trigger if exists plan_entry_link_by_hand on plan_entry;
create trigger plan_entry_link_by_hand before update on plan_entry
  for each row execute function internal.plan_link_by_hand();

-- Rules. Rank 1 is the loader's own rule: the line's text equals one activity's name when both are reduced to lower-case
-- letters and digits. A looser rule is added here only after a dry run shows it never links a line a person would refuse.
create or replace view plan_line_candidate with (security_invoker = true) as
select pe.id as plan_entry_id, a.id as activity_id, 'exact_name'::text as rule, 1 as rank
  from plan_entry pe
  join school_class sc on sc.id = pe.school_class_id
  join activity a on a.tenant_id = pe.tenant_id and a.band = sc.grade_code
 where pe.activity_id is null
   and regexp_replace(lower(a.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(pe.text), '[^a-z0-9]+', '', 'g');

create or replace view plan_unmatched with (security_invoker = true) as
with best as (
  select distinct on (plan_entry_id) plan_entry_id, rank,
         count(*) over (partition by plan_entry_id, rank) as n
    from plan_line_candidate
   order by plan_entry_id, rank
)
select pe.id as plan_entry_id, pe.tenant_id, pe.school_class_id, pe.fortnight_id, f.number as fortnight_number,
       pe.week_code, pe.plan_key, pe.text,
       case when b.n is null then 'no_match' when b.n = 1 then 'ready_to_link' else 'several_matches' end as reason,
       coalesce(b.n, 0)::int as candidates
  from plan_entry pe
  join fortnight f on f.id = pe.fortnight_id
  left join best b on b.plan_entry_id = pe.id
 where pe.activity_id is null;

-- One run: every unlinked line with exactly one candidate at its best rank, in one fortnight (a fortnight.number) or all.
create or replace function plan_link_apply(p_tenant uuid, p_band text, p_by text, p_fortnight int default null)
returns uuid language plpgsql set search_path = public as $$
declare v_run uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || ':' || p_band, 0));
  update plan_entry pe
     set activity_id = c.activity_id, link_rule = c.rule, link_run = v_run, linked_at = now(), linked_by = p_by
    from (select plan_entry_id, activity_id, rule, rank,
                 count(*) over (partition by plan_entry_id, rank) as n,
                 min(rank) over (partition by plan_entry_id) as best
            from plan_line_candidate) c,
         school_class sc, fortnight f
   where pe.id = c.plan_entry_id and c.rank = c.best and c.n = 1
     and pe.activity_id is null and pe.tenant_id = p_tenant
     and sc.id = pe.school_class_id and sc.grade_code = p_band
     and f.id = pe.fortnight_id and (p_fortnight is null or f.number = p_fortnight);
  return v_run;
end $$;

-- Undo: exactly the lines that still carry the run's id (a line a person changed since no longer does).
create or replace function plan_link_undo(p_run uuid, p_by text) returns int
language plpgsql set search_path = public as $$
declare v_n int;
begin
  update plan_entry
     set activity_id = null, link_rule = null, link_run = null, linked_at = null, linked_by = null
   where link_run = p_run;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function plan_link_apply(uuid, text, text, int), plan_link_undo(uuid, text) from public;
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function plan_link_apply(uuid, text, text, int), plan_link_undo(uuid, text) from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on function plan_link_apply(uuid, text, text, int), plan_link_undo(uuid, text) from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant execute on function plan_link_apply(uuid, text, text, int), plan_link_undo(uuid, text) to app_engine;
  end if;
end $$;

select internal.apply_conventions();
