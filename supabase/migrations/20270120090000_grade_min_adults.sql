-- CP-13 (issue #461): the minimum number of adults is a number per grade, on the grade (Nimish, 8 Nov 2026).
--   * `grade.min_adults`: 2 by default, 1 for K2 (the pilot's rule, until now `observed_rule.min_adults`). One home: the
--     threshold row `state.min_adults` and the column `observed_rule.min_adults` go.
--   * The written graph reads the child's own grade (`child.band`, read live) through `graph_level_window`, which now
--     returns it; `graph_state_of` takes it as an argument. The K2 observed graph reads `grade.min_adults`.
--   * `graph_state_changes`: the child states a rebuild WOULD change, counted by grade and transition. It writes nothing;
--     applying is the existing rebuild, a separate step Nimish approves.
-- Ring A is not touched. Ring B changes only at the next rebuild. Written to run twice.

alter table grade add column if not exists min_adults int not null default 2 check (min_adults > 0);

-- K2's rule, for every school there now and any added later (runs after the vocabulary, as before).
create or replace function internal.observed_rules(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into observed_rule (tenant_id, grade_code, secure_level, secure_days, recheck_days)
  values (p_tenant, 'K2', 3, 2, 14)
  on conflict (tenant_id, grade_code) do nothing;
  update grade set min_adults = 1 where tenant_id = p_tenant and code = 'K2';
  insert into observed_weight (tenant_id, grade_code, kind, entry_mode, opens_secure, rechecks, lowers)
  values (p_tenant, 'K2', 'observed', 'individual', true, true, true),
         (p_tenant, 'K2', 'observed', 'group_as_expected', false, true, false)
  on conflict (tenant_id, grade_code, kind, entry_mode) do nothing;
end $$;

-- the value moves from observed_rule to grade, for schools there now, before the column goes
update grade g set min_adults = r.min_adults from observed_rule r
 where r.tenant_id = g.tenant_id and r.grade_code = g.code and g.min_adults is distinct from r.min_adults;
alter table observed_rule drop column if exists min_adults;
delete from threshold where key = 'state.min_adults';

drop view if exists level_calibration;
drop view if exists child_level_state;
drop function if exists public.graph_skill_states(uuid);
drop function if exists public.graph_level_window(uuid);
drop function if exists public.graph_state_of(uuid, numeric, numeric, numeric, numeric, text, numeric, boolean, boolean);

create function public.graph_level_window(p_child uuid default null)
returns table (scope text, tenant_id uuid, child_id uuid, unit text, rung_code text, difficulty text, level_ord int,
               n_events int, n_correct int, share numeric, days int, adults int, latest_share numeric,
               repeating text, rechecked boolean, harder boolean, latest_at timestamptz, min_adults int)
language sql stable set search_path = public as $$
  with th as (  -- every school's numbers; one with no row yet reads the seed's
    select t.id as tenant_id,
           coalesce((select value from threshold where tenant_id = t.id and key = 'state.window_answers'), 10)     as win,
           coalesce((select value from threshold where tenant_id = t.id and key = 'state.repeat_min'), 2)          as repeat_min,
           coalesce((select value from threshold where tenant_id = t.id and key = 'state.repeat_clears_after'), 3) as clears,
           coalesce((select value from threshold where tenant_id = t.id and key = 'state.recheck_days'), 14)       as recheck,
           coalesce((select value from threshold where tenant_id = t.id and key = 'next_sheet.promote_at'), 0.8)   as promote
    from tenant t
  ), a as (
    select 'skill'::text as scope, g.tenant_id, g.child_id, g.skill_code as unit, g.rung_code, g.difficulty,
           g.level_ord, g.correct, g.misconception_codes, g.observed_at, g.seen_by, g.day, g.pos, g.id
    from graph_answer g
    where p_child is null or g.child_id = p_child
    union all
    select * from (
      select distinct on (g.answer) 'set'::text, g.tenant_id, g.child_id, g.skill_set_code, null::text, g.difficulty,
             g.level_ord, g.correct, g.misconception_codes, g.observed_at, g.seen_by, g.day, g.pos, g.id
      from graph_answer g
      where g.skill_set_code is not null and (p_child is null or g.child_id = p_child)
      order by g.answer, g.id
    ) s
  ), r as (
    select a.*, a.correct is not null and row_number() over (
             partition by a.scope, a.child_id, a.unit, a.rung_code, a.difficulty, a.correct is null
             order by a.observed_at desc, a.pos desc nulls last, a.id desc) <= th.win as w
    from a join th on th.tenant_id = a.tenant_id
  ), lv as (
    select r.scope, r.tenant_id, r.child_id, r.unit, r.rung_code, r.difficulty, r.level_ord,
           (count(*) filter (where r.w))::int                                         as n_events,
           (count(*) filter (where r.w and r.correct))::int                           as n_correct,
           (count(*) filter (where r.w and r.correct))::numeric
             / nullif(count(*) filter (where r.w), 0)                                 as share,
           (count(distinct r.day) filter (where r.w))::int                            as days,
           (count(distinct r.seen_by) filter (where r.w))::int                        as adults,
           max(r.day) filter (where r.w)                                              as latest_day,
           max(r.observed_at)                                                         as latest_at
    from r group by 1, 2, 3, 4, 5, 6, 7
  ), sat as (  -- each day's share at each level: a passing day reaches promote_at
    select a.scope, a.child_id, a.unit, a.rung_code, a.difficulty, a.level_ord, a.day,
           avg(a.correct::int) >= max(th.promote) as passed
    from a join th on th.tenant_id = a.tenant_id
    where a.correct is not null
    group by 1, 2, 3, 4, 5, 6, 7
  )
  select lv.scope, lv.tenant_id, lv.child_id, lv.unit, lv.rung_code, lv.difficulty, lv.level_ord,
         lv.n_events, lv.n_correct, lv.share, lv.days, lv.adults,
         (select avg(r.correct::int) from r
           where r.w and r.scope = lv.scope and r.child_id = lv.child_id and r.unit = lv.unit
             and r.rung_code is not distinct from lv.rung_code and r.difficulty is not distinct from lv.difficulty
             and r.day = lv.latest_day)                                               as latest_share,
         (select m.code
            from r, unnest(r.misconception_codes) as m(code)
           where r.w and r.scope = lv.scope and r.child_id = lv.child_id and r.unit = lv.unit
             and r.rung_code is not distinct from lv.rung_code and r.difficulty is not distinct from lv.difficulty
           group by m.code
          having count(*) >= th.repeat_min
             and (select count(*) from r r2
                   where r2.w and r2.correct and r2.scope = lv.scope and r2.child_id = lv.child_id
                     and r2.unit = lv.unit and r2.rung_code is not distinct from lv.rung_code
                     and r2.difficulty is not distinct from lv.difficulty
                     and r2.observed_at > max(r.observed_at)) < th.clears
           order by count(*) desc, m.code limit 1)                                    as repeating,
         exists (
           select 1 from sat s1 join sat s2 on s2.scope = s1.scope and s2.child_id = s1.child_id and s2.unit = s1.unit
                                         and s2.rung_code is not distinct from s1.rung_code
           where s1.scope = lv.scope and s1.child_id = lv.child_id and s1.unit = lv.unit
             and s1.rung_code is not distinct from lv.rung_code and s1.difficulty is not distinct from lv.difficulty
             and s1.passed and s2.passed and s2.day >= s1.day + th.recheck::int
             and s1.day in (select r.day from r where r.w and r.scope = lv.scope and r.child_id = lv.child_id
                              and r.unit = lv.unit and r.rung_code is not distinct from lv.rung_code
                              and r.difficulty is not distinct from lv.difficulty)
             and (s2.difficulty is not distinct from lv.difficulty or s2.level_ord > lv.level_ord))  as rechecked,
         exists (select 1 from difficulty d where d.tenant_id = lv.tenant_id and d.ord > lv.level_ord)  as harder,
         lv.latest_at,
         (select g.min_adults from child c join grade g on g.tenant_id = c.tenant_id and g.code = c.band
           where c.id = lv.child_id)                                                           as min_adults
  from lv join th on th.tenant_id = lv.tenant_id
$$;

create or replace function public.graph_state_of(
  p_tenant uuid, p_n_events numeric, p_share numeric, p_days numeric, p_adults numeric, p_min_adults numeric,
  p_repeating text,
  p_latest_share numeric, p_rechecked boolean, p_harder boolean
) returns text
language sql stable set search_path = public as $$
  select case when p_n_events < t.min_events                                      then 'not_enough_yet'
              when p_repeating is not null                                        then 'patterned_error'
              when p_share < t.demote                                             then 'emerging'
              when p_share < t.promote or p_n_events < t.secure_min or p_days < t.min_days
                   or p_latest_share < t.promote
                   or (p_adults > 0 and p_adults < p_min_adults)                  then 'practising'
              when not p_rechecked                                                then 'secure_to_recheck'
              when p_harder                                                       then 'stretch_ready'
              else 'secure' end
  from (select
          coalesce((select value from threshold where tenant_id = p_tenant and key = 'state.min_events'), 3)          as min_events,
          coalesce((select value from threshold where tenant_id = p_tenant and key = 'state.secure_min_answers'), 6)  as secure_min,
          coalesce((select value from threshold where tenant_id = p_tenant and key = 'state.min_days'), 2)            as min_days,
          coalesce((select value from threshold where tenant_id = p_tenant and key = 'next_sheet.promote_at'), 0.8)   as promote,
          coalesce((select value from threshold where tenant_id = p_tenant and key = 'next_sheet.demote_below'), 0.5) as demote
       ) t
$$;

drop function if exists public.graph_skill_states(uuid);
create function public.graph_skill_states(p_child uuid default null)
returns table (tenant_id uuid, child_id uuid, skill_code text, rung_code text, difficulty text, state text,
               n_events int, n_correct int, repeating_misconception text, last_seen timestamptz,
               share numeric, days int, latest_share numeric, rechecked boolean)
language sql stable set search_path = public as $$
  select l.tenant_id, l.child_id, l.unit, l.rung_code, l.difficulty,
         public.graph_state_of(l.tenant_id, l.n_events, l.share, l.days, l.adults, l.min_adults, l.repeating, l.latest_share,
                               l.rechecked, l.harder),
         l.n_events, l.n_correct, l.repeating, l.last_seen, l.share, l.days, l.latest_share, l.rechecked
  from (
    select distinct on (w.child_id, w.unit, w.rung_code) w.*,
           max(w.latest_at) over (partition by w.child_id, w.unit, w.rung_code) as last_seen
    from public.graph_level_window(p_child) w
    where w.scope = 'skill'
    order by w.child_id, w.unit, w.rung_code, w.latest_at desc, w.level_ord desc nulls last
  ) l
$$;

create or replace function public.graph_observed_states(p_child uuid default null)
returns table (tenant_id uuid, child_id uuid, skill_code text, grade_code text, state text, named_days int,
               adults int, first_named_yes date, rechecked_on date, last_seen timestamptz)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare
  m record;
  unit text := null;
  phase text;          -- building, to_recheck, secure
  reopened boolean;
  yes_days date[];
  who text[];
  latest text;
  named boolean;
  goal record;
begin
  for m in
    select e.tenant_id, e.child_id, e.skill_code, k.grade_code, e.mark, e.seen_by, e.observed_at,
           (e.observed_at at time zone coalesce(z.value #>> '{}', 'UTC'))::date as day,
           w.opens_secure, w.rechecks, w.lowers, o.reached_level >= r.secure_level as reached, r.secure_days, r.recheck_days, gr.min_adults,
           concat_ws('|', e.child_id, e.skill_code, k.grade_code) as unit
    from evidence_event e
    join activity_observation o on o.id = e.observation_id and o.tenant_id = e.tenant_id
    join school_class k on k.id = o.class_id
    join observed_weight w on w.tenant_id = e.tenant_id and w.grade_code = k.grade_code and w.kind = e.kind
                          and w.entry_mode = o.entry_mode
    join observed_rule r on r.tenant_id = e.tenant_id and r.grade_code = k.grade_code
    join grade gr on gr.tenant_id = e.tenant_id and gr.code = k.grade_code
    left join config z on z.tenant_id = e.tenant_id and z.key = 'school.time_zone'
    where e.confirmed_by is not null and o.reached_level is not null
      and (p_child is null or e.child_id = p_child)
      and not exists (select 1 from activity_observation c where c.supersedes = o.id)
    order by e.child_id, e.skill_code, k.grade_code, e.observed_at, o.reached_level < r.secure_level, e.id
  loop
    if unit is distinct from m.unit then
      if unit is not null then
        return query select goal.tenant_id, goal.child_id, goal.skill_code, goal.grade_code,
          case when not named then 'not_enough_yet' when phase = 'secure' then 'secure'
               when phase = 'to_recheck' then 'secure_to_recheck' when reopened then 'practising'
               when latest = 'not_yet' then 'emerging' else 'practising' end,
          cardinality(yes_days), cardinality(who), goal.first_yes, goal.rechecked, goal.last_seen;
      end if;
      unit := m.unit; phase := 'building'; reopened := false; yes_days := '{}'; who := '{}'; latest := null;
      named := false;
      select m.tenant_id, m.child_id, m.skill_code, m.grade_code, null::date as first_yes, null::date as rechecked,
             m.observed_at as last_seen into goal;
    end if;
    goal.last_seen := m.observed_at;
    if m.lowers then
      named := true;
      latest := m.mark;
      if not m.reached and phase in ('to_recheck', 'secure') then  -- re-opened: the clock starts again
        phase := 'building'; reopened := true; yes_days := '{}'; who := '{}';
        goal.first_yes := null; goal.rechecked := null;
      end if;
    end if;
    if m.reached then
      if m.rechecks and goal.first_yes is not null and m.day >= goal.first_yes + m.recheck_days then
        goal.rechecked := coalesce(goal.rechecked, m.day);
      end if;
      if m.opens_secure then
        goal.first_yes := coalesce(goal.first_yes, m.day);
        if not m.day = any (yes_days) then yes_days := yes_days || m.day; end if;
        if not m.seen_by = any (who) then who := who || m.seen_by; end if;
      end if;
    end if;
    if phase <> 'secure' and cardinality(yes_days) >= m.secure_days and cardinality(who) >= m.min_adults then
      phase := case when goal.rechecked is not null then 'secure' else 'to_recheck' end;
      reopened := false;
    end if;
  end loop;
  if unit is not null then
    return query select goal.tenant_id, goal.child_id, goal.skill_code, goal.grade_code,
      case when not named then 'not_enough_yet' when phase = 'secure' then 'secure'
           when phase = 'to_recheck' then 'secure_to_recheck' when reopened then 'practising'
           when latest = 'not_yet' then 'emerging' else 'practising' end,
      cardinality(yes_days), cardinality(who), goal.first_yes, goal.rechecked, goal.last_seen;
  end if;
end $$;

create or replace view child_level_state with (security_invoker = true) as
select w.tenant_id, w.child_id, w.unit as skill_code, w.difficulty,
       public.graph_state_of(w.tenant_id, w.n_events, w.share, w.days, w.adults, w.min_adults, w.repeating, w.latest_share,
                             w.rechecked, w.harder) as state,
       w.n_events, w.n_correct, w.latest_at as last_seen
from public.graph_level_window() w
where w.scope = 'set' and w.difficulty is not null;

-- Levels to review, as 20261216090000 made it, over the view above.
create or replace view level_calibration with (security_invoker = true) as
with kid as (
  select l.tenant_id, l.child_id, l.skill_code, l.difficulty, c.section, c.band,
         (st.enough and not st.needs_work) as is_secure
  from child_level_state l
  join child c on c.id = l.child_id and c.active
  join child_state st on st.tenant_id = l.tenant_id and st.code = l.state
), counted as (
  select tenant_id, 'class'::text as scope_kind, section as scope_value, class_band(tenant_id, section) as grade,
         skill_code, difficulty, count(*)::int as assessed, (count(*) filter (where is_secure))::int as secure
  from kid group by tenant_id, section, skill_code, difficulty
  union all
  select tenant_id, 'grade', band, band, skill_code, difficulty, count(*)::int, (count(*) filter (where is_secure))::int
  from kid group by tenant_id, band, skill_code, difficulty
), th as (
  select tenant_id,
         max(value) filter (where key = 'calibration.too_easy_share')          as share,
         max(value) filter (where key = 'calibration.min_children')            as min_children,
         max(value) filter (where key = 'calibration.review_again_children')   as again
  from threshold group by tenant_id
)
select n.tenant_id, n.scope_kind, n.scope_value, n.grade, n.skill_code, n.difficulty, n.assessed, n.secure,
       th.min_children::int as min_children, th.share as share_needed,
       case when n.assessed < th.min_children                   then 'too_few'
            when n.secure::numeric / n.assessed >= th.share     then 'review'
            else 'fine' end as verdict,
       r.reviewed_at as looked_at, r.reviewed_by as looked_by
from counted n
join th on th.tenant_id = n.tenant_id
left join lateral (
  select v.reviewed_at, v.reviewed_by, v.assessed, v.secure
  from calibration_review v
  where v.tenant_id = n.tenant_id and v.skill_code = n.skill_code and v.difficulty = n.difficulty
    and v.scope_kind = n.scope_kind and v.scope_value = n.scope_value
  order by v.reviewed_at desc, v.id limit 1
) r on abs(n.assessed - r.assessed) < th.again and abs(n.secure - r.secure) < th.again
where th.share is not null and th.min_children is not null and th.again is not null;

-- Every state a rebuild would change, counted: one row per grade and transition. `old_state` is the stored state ('none'
-- with no stored row), `new_state` what the graph now gives. Counts only; writes nothing.
create or replace function public.graph_state_changes(p_child uuid default null)
returns table (grade_code text, old_state text, new_state text, skills int, children int)
language sql stable set search_path = public as $$
  select c.band, coalesce(s.state, 'none'), g.state, count(*)::int, count(distinct g.child_id)::int
  from public.graph_skill_states(p_child) g
  join child c on c.id = g.child_id
  left join child_skill_state s on s.child_id = g.child_id and s.skill_code = g.skill_code
                               and s.rung_code is not distinct from g.rung_code
  where coalesce(s.state, 'none') is distinct from g.state
  group by c.band, coalesce(s.state, 'none'), g.state
$$;

do $$ begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant execute on function public.graph_state_of(uuid, numeric, numeric, numeric, numeric, numeric, text, numeric,
                                                    boolean, boolean) to app_engine;
    grant execute on function public.graph_level_window(uuid), public.graph_skill_states(uuid),
                              public.graph_state_changes(uuid) to app_engine;
    grant select on child_level_state, level_calibration to app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant execute on function public.graph_state_of(uuid, numeric, numeric, numeric, numeric, numeric, text, numeric,
                                                    boolean, boolean) to app_web;
    grant execute on function public.graph_level_window(uuid) to app_web;
    grant select on child_level_state, level_calibration to app_web;
  end if;
end $$;

select internal.apply_conventions();
