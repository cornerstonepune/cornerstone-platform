-- CP-12: the timetable by hand (specs/CP-12; design in specs/CP-12/design.md, lean: Nimish, 9 Nov).
--   * `timetable_move`: every lesson moved or swapped by hand inside one fortnight: who, when, from where, to where, why.
--     Append-only; an undo is a move back, also kept. A staff id, never a name.
--   * `timetable_clash_accept`: a person's acceptance of one clash, by its key, with a reason. Append-only.
--   * `timetable_clash` (a view): every clash of every teaching fortnight, worked out from the timetable as it stands
--     (the fortnight's dated layer when it has one, else the standing frame on the fortnight's dates), so the list
--     cannot go stale. Kinds: `blocked` (a lesson on a timetable_block of its class), `over_limit` and `under_limit`
--     (a subject above its most or below its fewest in a week or in the fortnight; a subject with no lesson at all is
--     below its fewest with no places). `clash_key` is what the clash is (kind, fortnight, the cells and for a block
--     the lesson in the cell, the rule and its numbers, the count); an acceptance also lapses when a lesson of the clash
--     is moved after it was accepted, so a lesson that moves again (or leaves and comes back) or a limit that changes
--     opens the clash afresh.
--   * `timetable_fortnight_layer(class, fortnight)`: the fortnight's own dated rows (CP-22's layer, `fortnight_id` set,
--     one row per teaching date and period) copied once from the standing frame, for a fortnight no draft put live.
--     The first hand move in a fortnight calls it; the frame itself is never edited.
--   * two settings per school: `timetable.open_clash_blocks_approval` (on: the approve command refuses a fortnight with a
--     clash nobody accepted, and a move in an approved fortnight that would leave one) and `timetable.accept_clash_group`
--     (the access group whose members may accept a clash; the coordinator's, Nimish 8 Nov).
-- The engine (`w2_print/tt_move.py`, `tt_clash.py`) does every check and write; nothing here decides. Written to run twice.

create table if not exists timetable_move (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  school_class_id uuid not null references school_class(id),
  fortnight_id    uuid not null references fortnight(id),
  from_date       date not null,
  from_period     uuid not null references period(id),
  to_date         date not null,
  to_period       uuid not null references period(id),
  moved_kind      text not null,
  moved_subject   text,
  reason          text,
  who             uuid not null references staff(id),
  at              timestamptz not null default clock_timestamp()
);
create index if not exists timetable_move_fortnight_idx on timetable_move (school_class_id, fortnight_id, at);
drop trigger if exists timetable_move_append_only on timetable_move;
create trigger timetable_move_append_only before update or delete on timetable_move
  for each statement execute function internal.forbid_change();

create table if not exists timetable_clash_accept (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  fortnight_id uuid not null references fortnight(id),
  clash_key    text not null check (btrim(clash_key) <> ''),
  kind         text not null check (kind in ('blocked', 'over_limit', 'under_limit')),
  reason       text not null check (btrim(reason) <> ''),
  who          uuid not null references staff(id),
  at           timestamptz not null default clock_timestamp()
);
create index if not exists timetable_clash_accept_key_idx on timetable_clash_accept (fortnight_id, clash_key);
drop trigger if exists timetable_clash_accept_append_only on timetable_clash_accept;
create trigger timetable_clash_accept_append_only before update or delete on timetable_clash_accept
  for each statement execute function internal.forbid_change();

-- The fortnight's dated rows, copied from the frame once (no rows while the fortnight already has a layer). Weekdays
-- with a school day that is not a holiday; week A is the first seven days, B the rest (the day page's rule).
create or replace function public.timetable_fortnight_layer(p_class uuid, p_fortnight uuid) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  if exists (select 1 from timetable_slot where school_class_id = p_class and fortnight_id = p_fortnight) then
    return 0;
  end if;
  insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind, subject_code, text,
                              valid_from, valid_to, fortnight_id)
  select s.tenant_id, s.school_class_id, s.period_id, w.code, extract(isodow from d.day)::smallint, s.kind,
         s.subject_code, s.text, d.day, d.day, f.id
  from fortnight f
  join school_class c on c.id = p_class and c.tenant_id = f.tenant_id
  cross join lateral (select g::date as day from generate_series(f.starts_on, f.ends_on, interval '1 day') g) d
  cross join lateral (select case when d.day - f.starts_on < 7 then 'A' else 'B' end as code) w
  join school_day sd on sd.campus_id = c.campus_id and sd.on_date = d.day and sd.kind <> 'holiday'
  join timetable_slot s on s.school_class_id = c.id and s.fortnight_id is null
    and s.week_code = w.code and s.weekday = extract(isodow from d.day)
    and s.valid_from <= d.day and (s.valid_to is null or s.valid_to >= d.day)
  where f.id = p_fortnight and extract(isodow from d.day) <= 5;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.timetable_fortnight_layer(uuid, uuid) from public;

-- Every clash, worked out now. `places` names the lessons involved: class, date and period ids, no text.
create or replace view timetable_clash with (security_invoker = true) as
with cell as (
  -- every cell of every teaching fortnight of every class with a timetable in it: the layer's rows when the fortnight
  -- has them, else the frame's rows on the fortnight's teaching dates
  select f.tenant_id, f.id as fortnight_id, f.number as fortnight_number, c.id as school_class_id, d.day as on_date,
         w.code as week_code, s.period_id, s.kind, s.subject_code, n.id as session_id
  from fortnight f
  join school_class c on c.tenant_id = f.tenant_id and c.academic_year_id = f.academic_year_id
  cross join lateral (select g::date as day from generate_series(f.starts_on, f.ends_on, interval '1 day') g) d
  cross join lateral (select case when d.day - f.starts_on < 7 then 'A' else 'B' end as code) w
  join school_day sd on sd.campus_id = c.campus_id and sd.on_date = d.day and sd.kind <> 'holiday'
  cross join lateral (select exists (select 1 from timetable_slot l where l.school_class_id = c.id
                                     and l.fortnight_id = f.id) as layered) x
  join timetable_slot s on s.school_class_id = c.id
    and s.week_code = w.code and s.weekday = extract(isodow from d.day)
    and s.valid_from <= d.day and (s.valid_to is null or s.valid_to >= d.day)
    and ((x.layered and s.fortnight_id = f.id) or (not x.layered and s.fortnight_id is null))
  left join session n on n.school_class_id = c.id and n.school_day_id = sd.id and n.period_id = s.period_id
  where f.kind = 'teaching' and extract(isodow from d.day) <= 5
),
blocked as (
  select k.tenant_id, k.fortnight_id, k.fortnight_number, k.week_code, 'blocked'::text as kind,
         md5(format('blocked|%s|%s|%s|%s|%s|%s|%s', k.fortnight_id, k.school_class_id, k.on_date, k.period_id, b.id,
                    coalesce(k.subject_code, k.kind), coalesce(k.session_id::text, ''))) as clash_key,
         jsonb_build_array(jsonb_build_object('class', k.school_class_id, 'date', k.on_date, 'period', k.period_id)) as places,
         b.id as rule_id,
         format('%s on %s: %s', coalesce(k.subject_code, k.kind), k.on_date, b.reason) as detail
  from cell k
  join timetable_block b on b.school_class_id = k.school_class_id
    and (b.on_date = k.on_date or (b.on_date is null and b.weekday = extract(isodow from k.on_date)
                                   and (b.week_code is null or b.week_code = k.week_code)))
    and (b.period_id is null or b.period_id = k.period_id)
  where k.kind in ('subject', 'specialist')
),
limited as (
  -- each limit of a class, for each fortnight the class has cells in, per week (span week) or whole (span fortnight)
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
  from timetable_limit l
  join (select distinct tenant_id, fortnight_id, fortnight_number, school_class_id from cell) fn
    on fn.school_class_id = l.school_class_id
  cross join lateral (select unnest(case when l.span = 'week' then array['A', 'B'] else array[null::text] end) as code) wk
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
       exists (select 1 from timetable_clash_accept a
               where a.fortnight_id = k.fortnight_id and a.clash_key = k.clash_key
                 -- a lesson in the clash moved after it was accepted (even away and back): it is open again
                 and not exists (select 1 from timetable_move m, jsonb_array_elements(k.places) p
                                 where m.fortnight_id = k.fortnight_id and m.at > a.at
                                   and m.school_class_id = (p ->> 'class')::uuid
                                   and ((m.from_date::text = p ->> 'date' and m.from_period::text = p ->> 'period')
                                     or (m.to_date::text = p ->> 'date' and m.to_period::text = p ->> 'period'))))
         as accepted
from (select * from blocked union all select * from limits) k;

-- per-school settings, the same pattern as internal.timetable_live_settings
create or replace function internal.timetable_hand_settings(p_tenant uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into config (tenant_id, key, value, description)
  values
    (p_tenant, 'timetable.open_clash_blocks_approval', 'true'::jsonb,
     'On: a fortnight with a timetable clash nobody accepted cannot be approved, and a move in an approved fortnight that would leave one is refused.'),
    (p_tenant, 'timetable.accept_clash_group', '"everything"'::jsonb,
     'The access group (access_group.code) whose members may accept a timetable clash with a reason; the coordinator''s group by default.')
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function internal.timetable_hand_settings_on_new_school() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.timetable_hand_settings(new.id);
  return new;
end $$;

drop trigger if exists timetable_hand_settings on tenant;
create trigger timetable_hand_settings after insert on tenant
  for each row execute function internal.timetable_hand_settings_on_new_school();

select internal.timetable_hand_settings(id) from tenant;

-- Every table is listed (CP-4): a move is class data by its class, read with the reach of `enrolment` (the classes a
-- person holds; a child-data row carries no reason); an acceptance can span classes and holds no child.
insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'timetable_move', 'enrolment', 'school_class_id', 'class', 'child_data', null),
  ('public', 'timetable_clash_accept', null, null, null, 'school_wide',
   'a timetable clash a person accepted, with the reason and staff id; a clash can span classes; holds no child data')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code,
  key_column = excluded.key_column, key_type = excluded.key_type, data_class = excluded.data_class,
  reason = excluded.reason;

select internal.apply_conventions();
