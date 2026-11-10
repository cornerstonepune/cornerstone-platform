-- CP-27 group 5: the timetable is the dated lessons; weeks become dates (specs/CP-27, Done when 15 and 16;
-- docs/notes/CP-27.md "Group 5"). One transaction under `db push`: any check below that fails rolls the whole of it back.
--
-- In plain words:
--   * The timetable of a date is its `session` rows. A session now says what kind of lesson it is (`kind`: fixed,
--     subject, specialist), which the dated copy of the frame (`timetable_slot` rows with a fortnight) used to say. No
--     table keeps a second copy of a fortnight's periods: the dated layer and `fortnight_plan_line` are gone.
--   * The timetable's rules are one table, `timetable_rule`, with a `kind`: `frame` (the week A/B frame, 150 rows on
--     live, each copied with its own id), `block` and `limit`. FET reads the frame from there, so what it is asked is
--     the same.
--   * A fortnight's state is a column, `fortnight.state`. Each step a person takes (freeze, align, approve, list sent),
--     a class's fortnight approved (CP-7), a draft put live (CP-22) and a clash accepted (CP-12) is a row of `approval`.
--     "Unchanged since the last approved" is a signature of the fortnight's sessions kept on the approval row; a
--     fortnight that rolls forward writes no approval and carries the last one's signature as its baseline.
--   * History (a change made after a fortnight froze, a rule changed, a lesson moved by hand) is `change_log`.
--   * Every text `week` column holds a date: the Monday of the ISO week its label named ('2026-W40' → 2026-09-28).
--     A label that is no ISO week ('Sep W1', 'Baseline', 'Jul 24' on old papers) stays, as text, in the paper's own
--     `key ->> 'week'`; its date is empty.
--   * `week_declaration` (N4's note of the week, empty) goes; a declaration is an `approval` row of kind `week`.
-- A table that holds rows when this runs moves to the schema `retired`; an empty one is checked empty and dropped.

-- 0. A week label → its Monday, or null when it is no ISO week. Lives in pg_temp: it is this migration's only. --------

create function pg_temp.cp27_week(p text) returns date language sql immutable as $$
  select case when p ~ '^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$'
               and to_char(to_date(p, 'IYYY-"W"IW'), 'IYYY-"W"IW') = p
              then to_date(p, 'IYYY-"W"IW') end
$$;

-- 1. Refuse what this cannot move faithfully; then say how much it moves. ----------------------------------------

do $$
declare
  bad text;
  n_layer bigint := (select count(*) from timetable_slot where fortnight_id is not null);
begin
  if n_layer > 0 then
    raise exception 'CP-27: % dated timetable rows (a fortnight''s layer) exist; this migration expects none', n_layer;
  end if;
  select string_agg(t || ' ' || n, ', ') into bad from (
    select 'fortnight_plan' as t, count(*) as n from fortnight_plan
    union all select 'fortnight_plan_line', count(*) from fortnight_plan_line
    union all select 'week_declaration', count(*) from week_declaration) x where n > 0;
  if bad is not null then
    raise exception 'CP-27: tables expected empty are not: %', bad;
  end if;
  -- a label that is no week cannot be kept where the table has no paper key to keep it in
  select string_agg(t || ' ' || w, ', ') into bad from (
    select 'prescription' as t, week as w from prescription where week is not null and pg_temp.cp27_week(week) is null
    union all select 'parent_note', week from parent_note where week is not null and pg_temp.cp27_week(week) is null
    union all select 'item_exposure', week from item_exposure where week is not null and pg_temp.cp27_week(week) is null
  ) x;
  if bad is not null then
    raise exception 'CP-27: week labels that are no ISO week, with nowhere to keep them: %', left(bad, 500);
  end if;
  -- a step taken has a person
  if exists (select 1 from fortnight_cycle where (frozen_at is null) <> (frozen_by is null)
             or (aligned_at is null) <> (aligned_by is null) or (approved_at is null) <> (approved_by is null)
             or (list_sent_at is null) <> (list_sent_by is null)
             or btrim(coalesce(frozen_by, aligned_by, approved_by, list_sent_by, 'x')) = '') then
    raise exception 'CP-27: a fortnight step with a time and no one, or one and no time';
  end if;
  raise notice 'CP-27 group 5 moves: frame % blocks % limits % cycles % (steps %) fortnight edits % rule edits % moves % lives % accepts %',
    (select count(*) from timetable_slot), (select count(*) from timetable_block), (select count(*) from timetable_limit),
    (select count(*) from fortnight_cycle),
    (select count(frozen_at) + count(aligned_at) + count(approved_at) + count(list_sent_at) from fortnight_cycle),
    (select count(*) from fortnight_edit), (select count(*) from timetable_rule_edit), (select count(*) from timetable_move),
    (select count(*) from timetable_live), (select count(*) from timetable_clash_accept);
end $$;

-- 2. What must read the same after: sessions per class and date. -----------------------------------------------------

create temp table cp27_sessions_before as
  select s.school_class_id, d.on_date, count(*) as n,
         md5(string_agg(s.id::text || s.period_id::text || coalesce(s.subject_code, '') || s.text || s.state
                        || s.planned::text || coalesce(s.plan_entry_id::text, ''), ',' order by s.id)) as sig
  from session s join school_day d on d.id = s.school_day_id group by 1, 2;

-- 3. One table of rules. ---------------------------------------------------------------------------------------------

drop view if exists timetable_clash;

create table timetable_rule (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  school_class_id uuid not null references school_class(id),
  kind            text not null check (kind in ('frame', 'block', 'limit')),
  period_id       uuid references period(id),
  week_code       text check (week_code in ('A', 'B')),
  weekday         smallint check (weekday between 1 and 5),
  on_date         date check (on_date is null or extract(isodow from on_date) between 1 and 5),
  cell            text check (cell in ('fixed', 'subject', 'specialist', 'empty')),
  subject_code    text,
  text            text,
  reason          text,
  span            text check (span in ('week', 'fortnight')),
  fewest          int check (fewest is null or fewest >= 0),
  most            int check (most is null or most >= 0),
  valid_from      date,
  valid_to        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- frame: one class in one period of week A or B on one weekday, from a date; what sits there and its words
  -- block: a date, or a weekday (of one week or both), or one period of either, on which nothing is placed, and why
  -- limit: the fewest and most periods of a subject in a week or a fortnight
  check (case kind
    when 'frame' then period_id is not null and week_code is not null and weekday is not null and cell is not null
      and text is not null and (cell = 'empty' or btrim(text) <> '') and valid_from is not null
      and (valid_to is null or valid_to >= valid_from)
      and on_date is null and reason is null and span is null and fewest is null and most is null
    when 'block' then (on_date is null) <> (weekday is null) and (week_code is null or weekday is not null)
      and btrim(coalesce(reason, '')) <> '' and cell is null and subject_code is null and text is null
      and span is null and fewest is null and most is null and valid_from is null and valid_to is null
    when 'limit' then btrim(coalesce(subject_code, '')) <> '' and span is not null and (fewest is not null or most is not null)
      and (fewest is null or most is null or fewest <= most) and period_id is null and week_code is null
      and weekday is null and on_date is null and cell is null and text is null and reason is null
      and valid_from is null and valid_to is null
  end)
);
create unique index timetable_rule_frame_cell on timetable_rule (school_class_id, period_id, week_code, weekday, valid_from)
  where kind = 'frame';
create index timetable_rule_frame_open on timetable_rule (school_class_id) where kind = 'frame' and valid_to is null;
create unique index timetable_rule_block_once on timetable_rule (
  school_class_id, coalesce(on_date, '0001-01-01'::date), coalesce(weekday, 0), coalesce(week_code, ''),
  coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid)) where kind = 'block';
create unique index timetable_rule_limit_once on timetable_rule (school_class_id, subject_code, span) where kind = 'limit';

insert into timetable_rule (id, tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code,
                            text, valid_from, valid_to, created_at, updated_at)
select id, tenant_id, school_class_id, 'frame', period_id, week_code, weekday, kind, subject_code, text, valid_from,
       valid_to, created_at, updated_at
from timetable_slot;
insert into timetable_rule (id, tenant_id, school_class_id, kind, on_date, weekday, week_code, period_id, reason,
                            created_at, updated_at)
select id, tenant_id, school_class_id, 'block', on_date, weekday, week_code, period_id, reason, created_at, updated_at
from timetable_block;
insert into timetable_rule (id, tenant_id, school_class_id, kind, subject_code, span, fewest, most, created_at, updated_at)
select id, tenant_id, school_class_id, 'limit', subject_code, span, fewest, most, created_at, updated_at
from timetable_limit;

-- 4. A lesson says what kind it is: the frame's cell on its date, else fixed with no subject and subject with one. -----

alter table session add column kind text not null default 'subject' check (kind in ('fixed', 'subject', 'specialist'));
alter table session disable trigger touch_updated_at;
update session s set kind = coalesce(
  (select r.cell from school_day d
   join school_class c on c.id = s.school_class_id
   join fortnight f on f.academic_year_id = c.academic_year_id and f.kind = 'teaching'
     and d.on_date between f.starts_on and f.ends_on
   join timetable_rule r on r.kind = 'frame' and r.school_class_id = s.school_class_id and r.period_id = s.period_id
     and r.weekday = extract(isodow from d.on_date)
     and r.week_code = case when d.on_date - f.starts_on < 7 then 'A' else 'B' end
     and r.valid_from <= d.on_date and (r.valid_to is null or r.valid_to >= d.on_date)
   where d.id = s.school_day_id and r.cell <> 'empty' limit 1),
  case when s.subject_code is null then 'fixed' else 'subject' end);
alter table session enable trigger touch_updated_at;

-- 5. A fortnight's state is its own column; each step taken is an approval row; the start is kept in the history. -----

alter table fortnight add column state text not null default 'planning'
  check (state in ('planning', 'frozen', 'aligned', 'approved', 'list_sent'));
alter table fortnight disable trigger touch_updated_at;
update fortnight f set state = c.state from fortnight_cycle c where c.fortnight_id = f.id;
alter table fortnight enable trigger touch_updated_at;

-- the approval list takes the time kinds (added to whatever kinds and decisions it has, so other steps' kinds stay)
do $$
declare d text;
begin
  d := pg_get_constraintdef((select oid from pg_constraint where conrelid = 'approval'::regclass
                                                             and conname = 'approval_kind_check'));
  if position('ARRAY[' in d) = 0 then
    raise exception 'CP-27: approval_kind_check is not a list: %', d;
  end if;
  d := regexp_replace(d, 'ARRAY\[', 'ARRAY[''fortnight''::text, ''timetable''::text, ''timetable_live''::text, '
                                    '''timetable_clash''::text, ''week''::text, ');
  alter table approval drop constraint approval_kind_check;
  execute format('alter table approval add constraint approval_kind_check %s', d);
  d := pg_get_constraintdef((select oid from pg_constraint where conrelid = 'approval'::regclass
                                                             and conname = 'approval_decision_check'));
  if position('CASE kind' in d) = 0 then
    raise exception 'CP-27: approval_decision_check is not a rule by kind: %', d;
  end if;
  d := regexp_replace(d, 'CASE kind',
    'CASE kind WHEN ''fortnight''::text THEN (decision = ANY (ARRAY[''freeze''::text, ''align''::text, '
    '''approve''::text, ''list_sent''::text])) WHEN ''timetable''::text THEN (decision = ''approve''::text) '
    'WHEN ''timetable_live''::text THEN (decision = ''go_live''::text) '
    'WHEN ''timetable_clash''::text THEN (decision = ''accept''::text) WHEN ''week''::text THEN (decision = ''confirmed''::text)');
  alter table approval drop constraint approval_decision_check;
  execute format('alter table approval add constraint approval_decision_check %s', d);
end $$;
alter table approval add constraint approval_accept_has_reason check (decision <> 'accept' or reason is not null);

insert into approval (tenant_id, kind, target, decision, "by", reason, created_at, detail)
select x.tenant_id, x.kind, x.target, x.decision, x."by", x.reason, x.at, x.detail
from (
  select c.tenant_id, 'fortnight' as kind, c.fortnight_id::text as target, s.step as decision, btrim(s.who) as "by",
         null::text as reason, s.at, jsonb_build_object('kept_in', 'fortnight_cycle', 'state', s.state) as detail
  from fortnight_cycle c
  cross join lateral (values ('freeze', 'frozen', c.frozen_by, c.frozen_at), ('align', 'aligned', c.aligned_by, c.aligned_at),
                             ('approve', 'approved', c.approved_by, c.approved_at),
                             ('list_sent', 'list_sent', c.list_sent_by, c.list_sent_at)) s(step, state, who, at)
  where s.at is not null
  union all
  select l.tenant_id, 'timetable_live', l.school_class_id::text || ' ' || l.fortnight_id::text, 'go_live', l.who::text,
         nullif(btrim(coalesce(l.reason, '')), ''), l.at,
         jsonb_build_object('kept_in', 'timetable_live', 'run_id', l.run_id, 'state_hash', l.state_hash,
                            'discarded', l.discarded)
  from timetable_live l
  union all
  select a.tenant_id, 'timetable_clash', a.clash_key, 'accept', a.who::text, a.reason, a.at,
         jsonb_build_object('kept_in', 'timetable_clash_accept', 'fortnight_id', a.fortnight_id, 'clash', a.kind)
  from timetable_clash_accept a
) x
order by x.at;

-- 6. History: the start of each cycle, the fortnight history, the rule history and every lesson moved by hand. ---------

insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason, at)
select c.tenant_id, 'fortnight', c.fortnight_id::text, 'insert', null, jsonb_build_object('state', 'planning'),
       (select s.id from staff s where s.id::text = lower(substring(c.planning_by from '([0-9A-Fa-f-]{36})'))),
       c.planning_by, 'CP-27: kept in fortnight_cycle until 2026-11', c.planning_at
from fortnight_cycle c;

insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason, at)
select e.tenant_id,
       case e.kind when 'state' then 'fortnight' else e.subject end,
       case e.kind when 'state' then e.fortnight_id::text else coalesce(e.record_id, e.fortnight_id::text) end,
       case e.kind when 'state' then 'update' else e.op end,
       case e.kind when 'state' then jsonb_build_object('state', split_part(e.subject, '->', 1)) end,
       case e.kind when 'state' then jsonb_build_object('state', split_part(e.subject, '->', 2))
                   else jsonb_build_object('fortnight_id', e.fortnight_id, 'frozen', true) end,
       (select s.id from staff s where s.id::text = lower(substring(e.changed_by from '([0-9A-Fa-f-]{36})'))),
       e.changed_by,
       coalesce(nullif(btrim(e.reason), '') || ' ', '') || '(CP-27: kept in fortnight_edit until 2026-11)', e.created_at
from fortnight_edit e;

insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason, at)
select e.tenant_id,
       case e.rule when 'period' then 'period' else 'timetable_rule' end,
       case e.rule when 'period' then coalesce(e.after ->> 'id', e.before ->> 'id')
                   else e.school_class_id::text || ' ' || coalesce(e.after ->> 'id', e.before ->> 'id') end,
       case when e.action = 'remove' then 'delete' when e.before is null then 'insert' else 'update' end,
       e.before, e.after, e.who, 'staff:' || e.who::text,
       'CP-27: kept in timetable_rule_edit until 2026-11 (' || e.rule || ', class ' || e.school_class_id::text || ')', e.at
from timetable_rule_edit e;

insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason, at)
select m.tenant_id, 'session', m.school_class_id::text || ' ' || m.fortnight_id::text, 'move',
       jsonb_build_object('school_class_id', m.school_class_id, 'on_date', m.from_date, 'period_id', m.from_period),
       jsonb_build_object('school_class_id', m.school_class_id, 'on_date', m.to_date, 'period_id', m.to_period,
                          'kind', m.moved_kind, 'subject_code', m.moved_subject),
       m.who, 'staff:' || m.who::text,
       coalesce(nullif(btrim(m.reason), '') || ' ', '') || '(CP-27: kept in timetable_move until 2026-11)', m.at
from timetable_move m;

-- 7. Weeks become dates. --------------------------------------------------------------------------------------------

create temp table cp27_weeks_before as
  select 'sheet_template' as t, id, week from sheet_template where week is not null
  union all select 'sheet_instance', id, week from sheet_instance where week is not null
  union all select 'prescription', id, week from prescription where week is not null
  union all select 'parent_note', id, week from parent_note where week is not null
  union all select 'item_exposure', id, week from item_exposure where week is not null;

-- a paper's label that is no week stays with the paper (a legacy paper's key already holds it as its own `week`)
alter table sheet_template disable trigger touch_updated_at;
alter table sheet_instance disable trigger touch_updated_at;
update sheet_template set key = coalesce(key, '{}'::jsonb) || jsonb_build_object('week', week)
where week is not null and pg_temp.cp27_week(week) is null and coalesce(key ->> 'week', '') <> week;
update sheet_instance set key = coalesce(key, '{}'::jsonb) || jsonb_build_object('week', week)
where week is not null and pg_temp.cp27_week(week) is null and coalesce(key ->> 'week', '') <> week;

alter table sheet_template drop constraint sheet_template_week_unless_library;
alter table sheet_template alter column week type date using pg_temp.cp27_week(week);
alter table sheet_template add constraint sheet_template_week_unless_library
  check (week is not null or source = 'library' or key ->> 'week' is not null);
alter table sheet_instance alter column week type date using pg_temp.cp27_week(week);
alter table sheet_template enable trigger touch_updated_at;
alter table sheet_instance enable trigger touch_updated_at;
alter table prescription alter column week type date using pg_temp.cp27_week(week);
alter table parent_note alter column week type date using pg_temp.cp27_week(week);
alter table item_exposure alter column week type date using pg_temp.cp27_week(week);

-- a child moved mid-week: the week's papers from this Monday on (it compared the text label before)
do $$
declare d text := pg_get_functiondef('public.move_child'::regproc);
begin
  if position('this_week   text;' in d) = 0 or position('this_week := to_char(today, ''IYYY-"W"IW'');' in d) = 0 then
    raise exception 'CP-27: move_child no longer reads the week as this migration expects';
  end if;
  d := replace(d, 'this_week   text;', 'this_week   date;');
  d := replace(d, 'this_week := to_char(today, ''IYYY-"W"IW'');', 'this_week := date_trunc(''week'', today)::date;');
  execute d;
end $$;

-- 8. The fortnight's timetable: its signature, where it stands, one yes, the guard and the cycle gate. ---------------

drop trigger if exists fortnight_cycle_gate on fortnight_cycle;
drop trigger if exists fortnight_plan_guard on fortnight_plan;
drop function public.fortnight_draft(uuid, uuid);
drop function public.fortnight_approve(uuid);
drop function public.timetable_fortnight_layer(uuid, uuid);
drop function internal.fortnight_signature_of_plan(uuid);
drop function internal.fortnight_signature_of_slots(uuid, uuid);
drop function internal.fortnight_signature(jsonb);
drop function internal.fortnight_lines(uuid, uuid);
drop function internal.fortnight_slots(uuid, uuid);
drop function internal.fortnight_plan_guard();
drop function internal.fortnight_cycle_gate();

-- What a class's fortnight says, for comparing with another: for every lesson, its place in the fortnight (the week
-- counted from the first day, so a 15-day fortnight's third Monday is its own, and the weekday), its period, its kind,
-- its subject and its words, unless its words carry the plan's line for the fortnight (a lesson with a plan line),
-- which differ every fortnight and are the plan's, not the timetable's. Dates are not compared: they differ by fortnight.
create function internal.timetable_signature(p_class uuid, p_fortnight uuid) returns text
language sql stable set search_path = public as $$
  select md5(coalesce(string_agg(x.line, E'\n' order by x.line), ''))
  from (
    select format('%s|%s|%s|%s|%s|%s', (d.on_date - f.starts_on) / 7, extract(isodow from d.on_date)::int, s.period_id,
                  s.kind, coalesce(s.subject_code, ''), case when s.plan_entry_id is null then s.text else '' end) as line
    from fortnight f
    join school_day d on d.on_date between f.starts_on and f.ends_on
    join session s on s.school_day_id = d.id and s.school_class_id = p_class
    where f.id = p_fortnight
  ) x
$$;

-- Where a class's fortnight stands (CP-7): `approved` when its latest approval was given on what it says now and on the
-- same baseline; else `rolled_forward` when it says what the class's last settled fortnight said and is no exception;
-- else `draft`. `empty` when it has no lessons. The baseline is the signature of the class's last settled fortnight
-- before it: an approved one's own, a rolled-forward one's carried from the one it rolled from. Reads only.
create function public.timetable_standing(p_class uuid, p_fortnight uuid)
returns table (state text, signature text, baseline text, approved_by text, approved_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  target fortnight%rowtype;
  f record;
  sig text;
  last text;
  st text;
  ap approval%rowtype;
  exempt boolean;
begin
  select * into target from fortnight where id = p_fortnight;
  if not found then
    return;
  end if;
  for f in
    select x.id, x.number, x.starts_on, y.label
    from fortnight x join academic_year y on y.id = x.academic_year_id
    join school_class c on c.id = p_class and c.academic_year_id = x.academic_year_id
    where x.kind = 'teaching' and x.starts_on <= target.starts_on
    order by x.starts_on
  loop
    if not exists (select 1 from session s join school_day d on d.id = s.school_day_id
                   where s.school_class_id = p_class and d.on_date between f.starts_on
                     and (select ends_on from fortnight where id = f.id)) then
      st := 'empty';
      sig := null;
    else
      sig := internal.timetable_signature(p_class, f.id);
      select * into ap from approval a where a.kind = 'timetable' and a.target = p_class::text || ' ' || f.id::text
      order by a.seq desc limit 1;
      exempt := exists (
        select 1 from config c, jsonb_array_elements_text(coalesce(c.value -> f.label, '[]'::jsonb)) n
        where c.tenant_id = target.tenant_id and c.key = 'fortnight.no_roll_forward' and n = f.number::text);
      if ap.id is not null and ap.detail ->> 'signature' = sig and (ap.detail ->> 'baseline') is not distinct from last then
        st := 'approved';
      elsif last is not null and not exempt and sig = last then
        st := 'rolled_forward';
      else
        st := 'draft';
      end if;
    end if;
    if f.id = p_fortnight then
      return query select st, sig, last,
        case when st = 'approved' then ap."by" end, case when st = 'approved' then ap.created_at end;
      return;
    end if;
    if st in ('approved', 'rolled_forward') then
      last := sig;
    end if;
    ap := null;
  end loop;
end $$;

-- One yes for a class's fortnight: only while it waits, only from an approving group (the guard below checks the group
-- for every such row, however it is written). The signature and the baseline it was given on are kept with it.
create function public.fortnight_approve(p_class uuid, p_fortnight uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f fortnight%rowtype;
  now_ record;
  who text := coalesce(nullif(current_setting('app.changed_by', true), ''),
                       (select staff_id::text from internal.resolve_staff()));
begin
  select * into f from fortnight where id = p_fortnight;
  if not found or f.kind <> 'teaching' or not exists (select 1 from school_class where id = p_class
                                                                                    and tenant_id = f.tenant_id) then
    raise exception 'fortnight is not open: no such class and fortnight' using errcode = '23514';
  end if;
  if not internal.fortnight_is_approver(f.tenant_id) then
    raise exception 'only the approving group approves a fortnight' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_class::text || p_fortnight::text, 0));
  select * into now_ from public.timetable_standing(p_class, p_fortnight);
  if now_.state = 'empty' then
    raise exception 'fortnight has no timetable: class %', p_class using errcode = '23514';
  end if;
  if now_.state <> 'draft' then
    raise exception 'fortnight is not open: it is %', replace(now_.state, '_', ' ') using errcode = '23514';
  end if;
  insert into approval (tenant_id, kind, target, decision, "by", detail)
  values (f.tenant_id, 'timetable', p_class::text || ' ' || p_fortnight::text, 'approve', who,
          jsonb_build_object('signature', now_.signature, 'baseline', now_.baseline));
end $$;

-- A class's fortnight approved by writing the list directly is held to what the function holds it to: the approving
-- group, a fortnight that waits, and the signature and baseline of the fortnight as it stands.
create function internal.timetable_approval_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare now_ record;
begin
  if not internal.fortnight_is_approver(new.tenant_id) then
    raise exception 'only the approving group approves a fortnight' using errcode = '42501';
  end if;
  select * into now_ from public.timetable_standing(split_part(new.target, ' ', 1)::uuid,
                                                    split_part(new.target, ' ', 2)::uuid);
  if now_.state is distinct from 'draft' or new.detail ->> 'signature' is distinct from now_.signature
     or new.detail ->> 'baseline' is distinct from now_.baseline then
    raise exception 'fortnight is not open: it is %, and a yes is given on the fortnight as it stands',
      coalesce(replace(now_.state, '_', ' '), 'not there') using errcode = '23514';
  end if;
  return new;
end $$;
create trigger timetable_approval_guard before insert on approval
  for each row when (new.kind = 'timetable') execute function internal.timetable_approval_guard();

-- CP-6's fortnight cannot be marked approved while a class with a frame or lessons in it is not settled (a class with a
-- frame and no lessons yet has not been drafted: it is not settled).
create function internal.fortnight_cycle_gate() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare k uuid; st text;
begin
  if new.state <> 'approved' or old.state = 'approved' then
    return new;
  end if;
  for k in
    select c.id from school_class c
    where c.academic_year_id = new.academic_year_id and c.tenant_id = new.tenant_id and (
      exists (select 1 from timetable_rule r where r.school_class_id = c.id and r.kind = 'frame'
              and r.valid_from <= new.ends_on and (r.valid_to is null or r.valid_to >= new.starts_on))
      or exists (select 1 from session s join school_day d on d.id = s.school_day_id
                 where s.school_class_id = c.id and d.on_date between new.starts_on and new.ends_on))
    order by 1
  loop
    select x.state into st from public.timetable_standing(k, new.id) x;
    if st is null or st not in ('approved', 'rolled_forward') then
      raise exception 'fortnight % cannot be approved: class % is not settled', new.number, k using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger fortnight_cycle_gate before update of state on fortnight
  for each row execute function internal.fortnight_cycle_gate();

-- 9. Every clash, worked out from the lessons as they stand (CP-12). An acceptance lapses when a lesson of its clash is
-- moved after it (a move is a `change_log` row of `session`, op `move`). -------------------------------------------

create view timetable_clash with (security_invoker = true) as
with cell as (
  select f.tenant_id, f.id as fortnight_id, f.number as fortnight_number, s.school_class_id, d.on_date,
         case when d.on_date - f.starts_on < 7 then 'A' else 'B' end as week_code, s.period_id, s.kind, s.subject_code,
         s.id as session_id
  from fortnight f
  join school_class c on c.tenant_id = f.tenant_id and c.academic_year_id = f.academic_year_id
  join school_day d on d.campus_id = c.campus_id and d.on_date between f.starts_on and f.ends_on and d.kind <> 'holiday'
  join session s on s.school_class_id = c.id and s.school_day_id = d.id
  where f.kind = 'teaching' and extract(isodow from d.on_date) <= 5
),
blocked as (
  select k.tenant_id, k.fortnight_id, k.fortnight_number, k.week_code, 'blocked'::text as kind,
         md5(format('blocked|%s|%s|%s|%s|%s|%s|%s', k.fortnight_id, k.school_class_id, k.on_date, k.period_id, b.id,
                    coalesce(k.subject_code, k.kind), k.session_id)) as clash_key,
         jsonb_build_array(jsonb_build_object('class', k.school_class_id, 'date', k.on_date, 'period', k.period_id)) as places,
         b.id as rule_id,
         format('%s on %s: %s', coalesce(k.subject_code, k.kind), k.on_date, b.reason) as detail
  from cell k
  join timetable_rule b on b.kind = 'block' and b.school_class_id = k.school_class_id
    and (b.on_date = k.on_date or (b.on_date is null and b.weekday = extract(isodow from k.on_date)
                                   and (b.week_code is null or b.week_code = k.week_code)))
    and (b.period_id is null or b.period_id = k.period_id)
  where k.kind in ('subject', 'specialist')
),
limited as (
  select l.id as rule_id, l.subject_code, l.span, l.fewest, l.most, fn.tenant_id, fn.fortnight_id, fn.fortnight_number,
         case when l.span = 'week' then wk.code end as week_code,
         (select count(*) from cell k where k.fortnight_id = fn.fortnight_id and k.school_class_id = l.school_class_id
            and k.kind = 'subject' and k.subject_code = l.subject_code
            and (l.span = 'fortnight' or k.week_code = wk.code)) as lessons,
         coalesce((select jsonb_agg(jsonb_build_object('class', k.school_class_id, 'date', k.on_date, 'period', k.period_id)
                                    order by k.on_date, k.period_id)
                   from cell k where k.fortnight_id = fn.fortnight_id and k.school_class_id = l.school_class_id
                     and k.kind = 'subject' and k.subject_code = l.subject_code
                     and (l.span = 'fortnight' or k.week_code = wk.code)), '[]'::jsonb) as places
  from timetable_rule l
  join (select distinct tenant_id, fortnight_id, fortnight_number, school_class_id from cell) fn
    on fn.school_class_id = l.school_class_id
  cross join lateral (select unnest(case when l.span = 'week' then array['A', 'B'] else array[null::text] end) as code) wk
  where l.kind = 'limit'
),
limits as (
  select tenant_id, fortnight_id, fortnight_number, week_code,
         case when most is not null and lessons > most then 'over_limit' else 'under_limit' end as kind,
         md5(format('limit|%s|%s|%s|%s|%s|%s|%s', fortnight_id, rule_id, coalesce(week_code, ''),
                    coalesce(fewest::text, ''), coalesce(most::text, ''), lessons, places::text)) as clash_key,
         places, rule_id,
         format('%s: %s lessons in %s, %s', subject_code, lessons,
                case when week_code is null then 'the fortnight' else 'week ' || week_code end,
                case when most is not null and lessons > most then 'most ' || most else 'fewest ' || fewest end) as detail
  from limited
  where (most is not null and lessons > most) or (fewest is not null and lessons < fewest)
)
select k.tenant_id, k.fortnight_id, k.fortnight_number, k.week_code, k.kind, k.clash_key, k.places, k.rule_id, k.detail,
       exists (select 1 from approval a
               where a.tenant_id = k.tenant_id and a.kind = 'timetable_clash' and a.target = k.clash_key
                 and a.decision = 'accept'
                 and not exists (select 1 from change_log m, jsonb_array_elements(k.places) p
                                 where m.tenant_id = k.tenant_id and m.table_name = 'session' and m.op = 'move'
                                   and m.row_id = (p ->> 'class') || ' ' || k.fortnight_id::text and m.at > a.created_at
                                   and ((m.before ->> 'on_date' = p ->> 'date' and m.before ->> 'period_id' = p ->> 'period')
                                     or (m.after ->> 'on_date' = p ->> 'date' and m.after ->> 'period_id' = p ->> 'period'))))
         as accepted
from (select * from blocked union all select * from limits) k;

-- 10. History kept by the one trigger: a rule, a period's times and name, a fortnight's state (from the moment it is
-- made at planning: who made it and when, as `fortnight_cycle.planning_by` kept it). -------------------------------

create trigger timetable_rule_change_kept after insert or update or delete on timetable_rule
  for each row execute function internal.change_kept('school_class_id,id');
create trigger period_change_kept after update on period
  for each row execute function internal.change_kept('id', 'label', 'starts_at', 'ends_at', 'ord', 'fixed');
create trigger fortnight_change_kept after insert or update on fortnight
  for each row execute function internal.change_kept('id', 'state');

-- 11. Every value in its new home (each raises, naming the counts). ---------------------------------------------------

do $$
declare n_old bigint; n_new bigint; n_tag bigint;
begin
  -- the frame: every row, joined back on every value
  n_old := (select count(*) from timetable_slot);
  n_new := (select count(*) from timetable_slot s join timetable_rule r on r.id = s.id and r.kind = 'frame'
            and r.tenant_id = s.tenant_id and r.school_class_id = s.school_class_id and r.period_id = s.period_id
            and r.week_code = s.week_code and r.weekday = s.weekday and r.cell = s.kind
            and r.subject_code is not distinct from s.subject_code and r.text = s.text and r.valid_from = s.valid_from
            and r.valid_to is not distinct from s.valid_to and r.created_at = s.created_at);
  n_tag := (select count(*) from timetable_rule where kind = 'frame');
  if n_old <> n_new or n_old <> n_tag then
    raise exception 'CP-27: % frame rows, % in timetable_rule with every value (% frame rules)', n_old, n_new, n_tag;
  end if;
  n_old := (select count(*) from timetable_block);
  n_new := (select count(*) from timetable_block b join timetable_rule r on r.id = b.id and r.kind = 'block'
            and r.school_class_id = b.school_class_id and r.on_date is not distinct from b.on_date
            and r.weekday is not distinct from b.weekday and r.week_code is not distinct from b.week_code
            and r.period_id is not distinct from b.period_id and r.reason = b.reason);
  if n_old <> n_new or n_old <> (select count(*) from timetable_rule where kind = 'block') then
    raise exception 'CP-27: % blocks, % in timetable_rule', n_old, n_new;
  end if;
  n_old := (select count(*) from timetable_limit);
  n_new := (select count(*) from timetable_limit l join timetable_rule r on r.id = l.id and r.kind = 'limit'
            and r.school_class_id = l.school_class_id and r.subject_code = l.subject_code and r.span = l.span
            and r.fewest is not distinct from l.fewest and r.most is not distinct from l.most);
  if n_old <> n_new or n_old <> (select count(*) from timetable_rule where kind = 'limit') then
    raise exception 'CP-27: % limits, % in timetable_rule', n_old, n_new;
  end if;
  -- the cycle: every state, every step a row of the one list, every start a history row
  n_old := (select count(*) from fortnight_cycle);
  n_new := (select count(*) from fortnight_cycle c join fortnight f on f.id = c.fortnight_id and f.state = c.state);
  if n_old <> n_new or exists (select 1 from fortnight f where f.state <> 'planning'
                               and not exists (select 1 from fortnight_cycle c where c.fortnight_id = f.id)) then
    raise exception 'CP-27: % fortnight cycles, % fortnights with the same state', n_old, n_new;
  end if;
  n_old := (select count(frozen_at) + count(aligned_at) + count(approved_at) + count(list_sent_at) from fortnight_cycle);
  n_new := (select count(*) from fortnight_cycle c
            cross join lateral (values ('freeze', c.frozen_by, c.frozen_at), ('align', c.aligned_by, c.aligned_at),
                                       ('approve', c.approved_by, c.approved_at),
                                       ('list_sent', c.list_sent_by, c.list_sent_at)) s(step, who, at)
            join approval a on a.kind = 'fortnight' and a.target = c.fortnight_id::text and a.decision = s.step
              and a."by" = btrim(s.who) and a.created_at = s.at and a.tenant_id = c.tenant_id
              and a.detail ->> 'kept_in' = 'fortnight_cycle');
  n_tag := (select count(*) from approval where detail ->> 'kept_in' = 'fortnight_cycle');
  if n_old <> n_new or n_old <> n_tag then
    raise exception 'CP-27: % fortnight steps taken, % in approval (% tagged)', n_old, n_new, n_tag;
  end if;
  n_old := (select count(*) from fortnight_cycle);
  n_new := (select count(*) from fortnight_cycle c join change_log l on l.table_name = 'fortnight'
            and l.row_id = c.fortnight_id::text and l.op = 'insert' and l.at = c.planning_at and l.origin = c.planning_by
            and l.reason = 'CP-27: kept in fortnight_cycle until 2026-11');
  if n_old <> n_new then
    raise exception 'CP-27: % fortnight starts, % in change_log', n_old, n_new;
  end if;
  -- the rows the empty tables would have had
  n_old := (select count(*) from fortnight_edit);
  n_new := (select count(*) from change_log where reason like '%(CP-27: kept in fortnight_edit until 2026-11)');
  if n_old <> n_new then
    raise exception 'CP-27: % fortnight edits, % in change_log', n_old, n_new;
  end if;
  n_old := (select count(*) from timetable_rule_edit);
  n_new := (select count(*) from change_log where reason like 'CP-27: kept in timetable_rule_edit until 2026-11 (%');
  if n_old <> n_new then
    raise exception 'CP-27: % rule edits, % in change_log', n_old, n_new;
  end if;
  n_old := (select count(*) from timetable_move);
  n_new := (select count(*) from timetable_move m join change_log l on l.table_name = 'session' and l.op = 'move'
            and l.row_id = m.school_class_id::text || ' ' || m.fortnight_id::text and l.at = m.at and l.staff_id = m.who
            and l.before ->> 'on_date' = m.from_date::text and l.after ->> 'on_date' = m.to_date::text
            and l.before ->> 'period_id' = m.from_period::text and l.after ->> 'period_id' = m.to_period::text
            and l.reason like '%(CP-27: kept in timetable_move until 2026-11)');
  if n_old <> n_new then
    raise exception 'CP-27: % lessons moved, % in change_log', n_old, n_new;
  end if;
  n_old := (select count(*) from timetable_live);
  n_new := (select count(*) from timetable_live l join approval a on a.kind = 'timetable_live'
            and a.target = l.school_class_id::text || ' ' || l.fortnight_id::text and a."by" = l.who::text
            and a.created_at = l.at and a.detail ->> 'state_hash' = l.state_hash and a.detail ->> 'kept_in' = 'timetable_live');
  if n_old <> n_new then
    raise exception 'CP-27: % drafts put live, % in approval', n_old, n_new;
  end if;
  n_old := (select count(*) from timetable_clash_accept);
  n_new := (select count(*) from timetable_clash_accept x join approval a on a.kind = 'timetable_clash'
            and a.target = x.clash_key and a.reason = x.reason and a."by" = x.who::text and a.created_at = x.at
            and a.detail ->> 'kept_in' = 'timetable_clash_accept');
  if n_old <> n_new then
    raise exception 'CP-27: % clashes accepted, % in approval', n_old, n_new;
  end if;
  -- the weeks: every one that is a week now its Monday, every one that is not kept with its paper, nothing else
  n_old := (select count(*) from cp27_weeks_before where pg_temp.cp27_week(week) is not null);
  n_new := (select count(*) from cp27_weeks_before b where pg_temp.cp27_week(b.week) is not null and pg_temp.cp27_week(b.week) =
            case b.t when 'sheet_template' then (select week from sheet_template where id = b.id)
                     when 'sheet_instance' then (select week from sheet_instance where id = b.id)
                     when 'prescription' then (select week from prescription where id = b.id)
                     when 'parent_note' then (select week from parent_note where id = b.id)
                     when 'item_exposure' then (select week from item_exposure where id = b.id) end);
  n_tag := (select count(*) from cp27_weeks_before b where pg_temp.cp27_week(b.week) is null and b.week =
            case b.t when 'sheet_template' then (select key ->> 'week' from sheet_template where id = b.id and week is null)
                     when 'sheet_instance' then (select key ->> 'week' from sheet_instance where id = b.id and week is null) end);
  if n_old <> n_new or n_tag <> (select count(*) from cp27_weeks_before where pg_temp.cp27_week(week) is null) then
    raise exception 'CP-27: % weeks that are weeks, % now their Monday; % labels that are not, % kept with their paper',
      n_old, n_new, (select count(*) from cp27_weeks_before where pg_temp.cp27_week(week) is null), n_tag;
  end if;
  raise notice 'CP-27 weeks: % became a date, % labels kept with their paper (by table: %)', n_new, n_tag,
    (select string_agg(t || ' ' || c || '/' || k, ', ') from (
       select t, count(*) filter (where pg_temp.cp27_week(week) is not null) as c,
              count(*) filter (where pg_temp.cp27_week(week) is null) as k
       from cp27_weeks_before group by t order by t) x);
  -- the lessons: the same per class and date
  if exists (
    (select school_class_id, on_date, n, sig from cp27_sessions_before
     except
     select s.school_class_id, d.on_date, count(*),
            md5(string_agg(s.id::text || s.period_id::text || coalesce(s.subject_code, '') || s.text || s.state
                           || s.planned::text || coalesce(s.plan_entry_id::text, ''), ',' order by s.id))
     from session s join school_day d on d.id = s.school_day_id group by 1, 2)
    union all
    (select s.school_class_id, d.on_date, count(*), null from session s join school_day d on d.id = s.school_day_id
     group by 1, 2
     except
     select school_class_id, on_date, n, null from cp27_sessions_before)) then
    raise exception 'CP-27: the lessons of some date are not what they were';
  end if;
  raise notice 'CP-27 lessons: % dates, % sessions, unchanged (fixed %, subject %, specialist %)',
    (select count(*) from cp27_sessions_before), (select coalesce(sum(n), 0) from cp27_sessions_before),
    (select count(*) from session where kind = 'fixed'), (select count(*) from session where kind = 'subject'),
    (select count(*) from session where kind = 'specialist');
end $$;

-- 12. Who may do what. --------------------------------------------------------------------------------------------

do $$ begin
  revoke all on function public.timetable_standing(uuid, uuid), public.fortnight_approve(uuid, uuid) from public;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant select on timetable_rule to app_web;
    grant execute on function public.fortnight_approve(uuid, uuid) to app_web;
  end if;
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert, update, delete on timetable_rule to app_engine;
    grant execute on function public.fortnight_approve(uuid, uuid), public.timetable_standing(uuid, uuid) to app_engine;
  end if;
end $$;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'timetable_rule', null, null, null, 'school_wide',
   'plan and timetable: a class''s week A/B frame, its blocked days and its subject limits, by class id; no child')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code, key_column = excluded.key_column,
  key_type = excluded.key_type, data_class = excluded.data_class, reason = excluded.reason;

-- 13. The tables that leave: one with rows moves to `retired`; an empty one, checked empty here, is dropped. ----------

delete from access_table where schema_name = 'public' and table_name in (
  'timetable_slot', 'timetable_block', 'timetable_limit', 'timetable_rule_edit', 'fortnight_cycle', 'fortnight_edit',
  'fortnight_plan', 'fortnight_plan_line', 'timetable_live', 'timetable_move', 'timetable_clash_accept', 'week_declaration');

do $$
declare
  t text;
  k record;
  n bigint;
  going constant text[] := array['timetable_slot', 'timetable_block', 'timetable_limit', 'timetable_rule_edit',
    'fortnight_cycle', 'fortnight_edit', 'fortnight_plan_line', 'fortnight_plan', 'timetable_live', 'timetable_move',
    'timetable_clash_accept', 'week_declaration'];
  kept text[] := '{}';
  dropped text[] := '{}';
begin
  if exists (select 1 from pg_constraint c where c.contype = 'f'
             and c.confrelid in (select ('public.' || x)::regclass from unnest(going) x)
             and c.conrelid not in (select ('public.' || x)::regclass from unnest(going) x)) then
    raise exception 'CP-27: a table that stays still has a key into one that leaves';
  end if;
  foreach t in array going loop
    execute format('select count(*) from public.%I', t) into n;
    if n = 0 then
      execute format('drop table public.%I', t);
      dropped := dropped || t;
    else
      for k in select conname from pg_constraint where contype = 'f' and conrelid = ('public.' || t)::regclass loop
        execute format('alter table public.%I drop constraint %I', t, k.conname);
      end loop;
      for k in select tgname from pg_trigger where not tgisinternal and tgrelid = ('public.' || t)::regclass loop
        execute format('drop trigger %I on public.%I', k.tgname, t);
      end loop;
      for k in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', k.policyname, t);
      end loop;
      execute format('alter table public.%I set schema retired', t);
      kept := kept || t;
    end if;
  end loop;
  raise notice 'CP-27 group 5: retired % ; dropped (empty) %', kept, dropped;
end $$;

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

drop table cp27_sessions_before, cp27_weeks_before;
analyze timetable_rule;
analyze approval;
select internal.apply_conventions();
