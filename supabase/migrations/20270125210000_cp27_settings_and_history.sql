-- CP-27, group 2 (specs/CP-27/spec.md, docs/data-model.md): one settings table and one history log.
--
--   * Settings. `config` is the one home of every setting a school may change (Done when 11):
--       threshold (every number)               -> config rows, the value a JSON number, its key unchanged
--       observed_rule (K2's secure rule)       -> columns on `grade`: secure_level, secure_days, recheck_days
--       observed_weight (how a record counts)  -> the setting `observed.weights`, by grade
--       approval_kind (three words)            -> a check on `approval.kind`; the kind that reaches a parent, and so
--                                                 needs a second person, is said in `approval_list`
--       validation_rule, validation_stage      -> nothing: no screen, command or rule read them (the view kind_stage
--                                                 and one test did); marking trusts a kind through `kind_trust`
--     Twelve functions that each gave a new school a few settings become one, `internal.school_settings_on_new_school`:
--     a new school copies every setting of the first school (its people excepted). A school's own value stays its own.
--   * History. `change_log` is the one history log (Done when 9): one row per change, written by one trigger function,
--     `internal.change_kept`, on every table whose history it keeps; it refuses edits and deletes as `approval` does.
--       curriculum_edit (activities, objectives and their links)   -> change_log rows of those tables
--       skill_set_version (a skill's rule before it changed)       -> change_log rows of `skill`
--       skill_level_version (a level's words before they changed)  -> change_log rows of `skill_level`
--     The current value was already on the row (`skill.version`, `skill_level.version`); only the history moves.
--     Who: `app.changed_by` says where a change came from (an upload, the seed, `staff:<id>` for a person), kept as
--     `origin`; a person is `staff_id` (from `staff:<id>`, else the website's signed-in member of staff).
--
-- A table with rows on live is never dropped: its rows are copied, a block raises unless every one is in its new home,
-- and the table moves to the schema `retired` (no grants, keys, triggers or policies). One transaction: any raise
-- leaves the database as it was. Runs once, on live and on a fresh database.

-- 1. What the new rules would refuse, refused first. ----------------------------------------------------------------

do $$
declare bad text;
begin
  select string_agg(format('%s: %s', t, v), '; ') into bad from (
    -- a threshold whose key is already a config row would be two settings of one name
    select 'threshold and config' as t, h.key as v from threshold h join config c on c.tenant_id = h.tenant_id and c.key = h.key
    union all select 'approval_kind', code || '/' || reaches_parent from approval_kind
      where (code, reaches_parent) not in (('skill_level', false), ('question_type', false), ('parent_note', true))
    union all select 'approval.kind', kind from approval where kind not in ('skill_level', 'question_type', 'parent_note')
    union all select 'observed_rule', grade_code from observed_rule r
      where not exists (select 1 from grade g where g.tenant_id = r.tenant_id and g.code = r.grade_code)
    union all select 'observed_weight', grade_code || '/' || kind || '/' || entry_mode from observed_weight w
      where not exists (select 1 from grade g where g.tenant_id = w.tenant_id and g.code = w.grade_code)
    union all select 'config observed.weights', key from config where key = 'observed.weights'
  ) x;
  if bad is not null then
    raise exception 'CP-27: a row the new rules would not keep: %', bad;
  end if;
end $$;

-- 2. Settings. ----------------------------------------------------------------------------------------------------

-- every threshold, a number in config; its unit was read by nothing (the seed keeps it for a reader of the file)
insert into config (tenant_id, key, value, description, created_at, updated_at)
select tenant_id, key, to_jsonb(trim_scale(value)), description, created_at, updated_at from threshold;

-- K2's secure rule, on its grade
alter table grade add column secure_level int check (secure_level between 0 and 3);
alter table grade add column secure_days int check (secure_days > 0);
alter table grade add column recheck_days int check (recheck_days >= 0);
alter table grade add constraint grade_observed_rule_whole
  check ((secure_level is null) = (secure_days is null) and (secure_days is null) = (recheck_days is null));
comment on column grade.secure_level is
  'Observed grades (K2): the activity level a named child reaches for a yes to count toward secure. None: the grade is not read from observations (CP-27: was observed_rule).';
comment on column grade.secure_days is 'Observed grades: on how many different days a child is named at secure_level to be secure.';
comment on column grade.recheck_days is 'Observed grades: how many days after the first yes a later yes re-checks it.';
update grade g set secure_level = r.secure_level, secure_days = r.secure_days, recheck_days = r.recheck_days
from observed_rule r where r.tenant_id = g.tenant_id and r.grade_code = g.code;

-- how each kind of observed record counts, a setting by grade
insert into config (tenant_id, key, value, description)
select tenant_id, 'observed.weights',
       jsonb_object_agg(grade_code, weights),
       'How each observed record counts toward a grade''s observed picture, by grade: a record of this kind and entry mode opens_secure (its yes counts toward secure), rechecks (a later yes re-checks) and lowers (a not-yet re-opens). A record with no entry here is not read (CP-27: was observed_weight).'
from (
  select tenant_id, grade_code,
         jsonb_agg(jsonb_build_object('kind', kind, 'entry_mode', entry_mode, 'opens_secure', opens_secure,
                                      'rechecks', rechecks, 'lowers', lowers) order by kind, entry_mode) as weights
  from observed_weight group by tenant_id, grade_code
) w group by tenant_id;

do $$
declare n_old int; n_new int;
begin
  -- every threshold is a config row of the same school, key and number
  select count(*) into n_old from threshold;
  select count(*) into n_new from threshold t
    join config c on c.tenant_id = t.tenant_id and c.key = t.key
   where jsonb_typeof(c.value) = 'number' and c.value::numeric = t.value;
  if n_old <> n_new then
    raise exception 'CP-27: % threshold rows, % of them in config with their number', n_old, n_new;
  end if;
  -- every observed rule is on its grade, and every grade with one has it
  select count(*) into n_old from observed_rule;
  select count(*) into n_new from observed_rule r
    join grade g on g.tenant_id = r.tenant_id and g.code = r.grade_code
   where (g.secure_level, g.secure_days, g.recheck_days) = (r.secure_level, r.secure_days, r.recheck_days);
  if n_old <> n_new or (select count(*) from grade where secure_level is not null) <> n_old then
    raise exception 'CP-27: % observed rules, % on their grade', n_old, n_new;
  end if;
  -- every observed weight is in its school's setting, as it was
  select count(*) into n_old from observed_weight;
  select count(*) into n_new from observed_weight w
    join config c on c.tenant_id = w.tenant_id and c.key = 'observed.weights'
    cross join lateral jsonb_to_recordset(c.value -> w.grade_code)
      x (kind text, entry_mode text, opens_secure boolean, rechecks boolean, lowers boolean)
   where (x.kind, x.entry_mode, x.opens_secure, x.rechecks, x.lowers)
       = (w.kind, w.entry_mode, w.opens_secure, w.rechecks, w.lowers);
  if n_old <> n_new or (select coalesce(sum(jsonb_array_length(e.value)), 0) from config c, jsonb_each(c.value) e
                         where c.key = 'observed.weights') <> n_old then
    raise exception 'CP-27: % observed weights, % in the setting observed.weights', n_old, n_new;
  end if;
end $$;

-- The approval list's kinds: a rule on the column. A parent note reaches a parent, so it needs a second person.
alter table approval drop constraint approval_tenant_id_kind_fkey;
alter table approval add constraint approval_kind_check check (kind in ('skill_level', 'question_type', 'parent_note'));

create or replace view approval_list with (security_invoker = true) as
with firsts as (
  select l.tenant_id, 'skill_level' as kind, l.skill_code || ' ' || l.difficulty as target,
         s.level_approved -> l.difficulty ->> 'by' as first_by,
         (s.level_approved -> l.difficulty ->> 'at')::timestamptz as first_at
  from skill_level l join skill s on s.tenant_id = l.tenant_id and s.code = l.skill_code
  union all
  select q.tenant_id, 'question_type', q.code, a.approved_by, a.approved_at
  from question_type q
  left join lateral (
    select approved_by, approved_at from question_type_approval x
    where x.tenant_id = q.tenant_id and x.question_type = q.code order by approved_at limit 1
  ) a on true
  union all
  select n.tenant_id, 'parent_note', n.id::text, n.approved_by, case when n.approved_by is not null then n.updated_at end
  from parent_note n
), stood as (
  select f.*, f.kind = 'parent_note' as reaches_parent,  -- what reaches a parent waits for a second person
         (select a.reason from approval a
          where a.tenant_id = f.tenant_id and a.kind = f.kind and a.target = f.target and a.decision = 'sent_back'
            and (f.first_at is null or a.created_at > f.first_at)
          order by a.created_at desc, a.id desc limit 1) as sent_back_because,
         (select a.created_at from approval a
          where a.tenant_id = f.tenant_id and a.kind = f.kind and a.target = f.target and a.decision = 'sent_back'
            and (f.first_at is null or a.created_at > f.first_at)
          order by a.created_at desc, a.id desc limit 1) as sent_back_at,
         (select a.by from approval a
          where a.tenant_id = f.tenant_id and a.kind = f.kind and a.target = f.target and a.decision = 'approved'
            and a.by <> f.first_by
          order by a.created_at desc, a.id desc limit 1) as second_by
  from firsts f
)
select tenant_id, kind, target, first_by, first_at, second_by, sent_back_because,
       case when sent_back_at is not null and (second_by is null) then 'sent_back'
            when first_by is null then 'draft'
            when reaches_parent and second_by is null then 'waiting_second'
            else 'approved' end as state
from stood;

-- 3. What read a threshold reads config. Each default is the seed's, as before. -------------------------------------

create or replace function public.graph_level_window(p_child uuid default null)
returns table (scope text, tenant_id uuid, child_id uuid, unit text, rung_code text, difficulty text, level_ord int,
               n_events int, n_correct int, share numeric, days int, adults int, latest_share numeric,
               repeating text, rechecked boolean, harder boolean, latest_at timestamptz, min_adults int)
language sql stable set search_path = public as $$
  with th as (  -- every school's numbers; one with no row yet reads the seed's
    select t.id as tenant_id,
           coalesce((select value::numeric from config where tenant_id = t.id and key = 'state.window_answers'), 10)     as win,
           coalesce((select value::numeric from config where tenant_id = t.id and key = 'state.repeat_min'), 2)          as repeat_min,
           coalesce((select value::numeric from config where tenant_id = t.id and key = 'state.repeat_clears_after'), 3) as clears,
           coalesce((select value::numeric from config where tenant_id = t.id and key = 'state.recheck_days'), 14)       as recheck,
           coalesce((select value::numeric from config where tenant_id = t.id and key = 'next_sheet.promote_at'), 0.8)   as promote
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
          coalesce((select value::numeric from config where tenant_id = p_tenant and key = 'state.min_events'), 3)          as min_events,
          coalesce((select value::numeric from config where tenant_id = p_tenant and key = 'state.secure_min_answers'), 6)  as secure_min,
          coalesce((select value::numeric from config where tenant_id = p_tenant and key = 'state.min_days'), 2)            as min_days,
          coalesce((select value::numeric from config where tenant_id = p_tenant and key = 'next_sheet.promote_at'), 0.8)   as promote,
          coalesce((select value::numeric from config where tenant_id = p_tenant and key = 'next_sheet.demote_below'), 0.5) as demote
       ) t
$$;

create or replace function public.next_difficulty(p_child_id uuid, p_skill_set text)
returns table (difficulty text, rule text, targets text[])
language plpgsql stable security definer rows 1 set search_path = public as $$
declare
  tenant_    uuid    := (select tenant_id from child where id = p_child_id);
  min_events numeric := coalesce((select value::numeric from config where tenant_id = tenant_ and key = 'state.min_events'), 3);
  promote    numeric := coalesce((select value::numeric from config where tenant_id = tenant_ and key = 'next_sheet.promote_at'), 0.8);
  demote     numeric := coalesce((select value::numeric from config where tenant_id = tenant_ and key = 'next_sheet.demote_below'), 0.5);
  papers     integer := coalesce((select value::numeric from config where tenant_id = tenant_ and key = 'next_sheet.papers'), 2);
  repeat_min numeric := coalesce((select value::numeric from config where tenant_id = tenant_ and key = 'state.repeat_min'), 2);
  ord        text[]  := array(select d.code from difficulty d where d.tenant_id = tenant_ order by d.ord);
  usual      text    := (select c.value #>> '{}' from config c where c.tenant_id = tenant_ and c.key = 'level.usual');
  total integer; answered integer; right_ integer; share numeric; at_ text; i integer; tg text[];
begin
  -- every answer on the skill's rung, right or wrong, one row each (an answer counts once however many registry skills
  -- it used), at any level or none: too few, and nothing says where the child is. A paper made before levels (the
  -- historical papers, N3) names none, so it never sets the next level, but it is answers: such a child stays at their
  -- current level, as a child just moved up does (rehearsal run 119: the grade's start instead reset 60 levels the
  -- school had already set).
  select count(distinct g.answer) into total
  from graph_answer g join skill s on s.tenant_id = g.tenant_id and s.rung_code = g.rung_code
  where g.child_id = p_child_id and s.code = p_skill_set and g.correct is not null;
  if total < min_events then
    return query select null::text, 'band_default'::text, '{}'::text[];
    return;
  end if;

  select p.difficulty into at_ from prescription p
   where p.child_id = p_child_id and p.skill_set_code = p_skill_set and p.difficulty is not null
   order by p.created_at desc limit 1;
  at_ := coalesce(at_, (select g.difficulty
                          from graph_answer g join skill s on s.tenant_id = g.tenant_id and s.rung_code = g.rung_code
                         where g.child_id = p_child_id and s.code = p_skill_set and g.difficulty is not null
                         order by g.observed_at desc, g.level_ord desc limit 1), usual);
  i := coalesce(array_position(ord, at_), array_position(ord, usual));

  with ans as (  -- the answers at the current level, one row each
    select g.answer, max(g.paper) as paper, max(g.observed_at) as observed_at, bool_and(g.correct) as correct,
           max(g.misconception_codes) as codes
    from graph_answer g join skill s on s.tenant_id = g.tenant_id and s.rung_code = g.rung_code
    where g.child_id = p_child_id and s.code = p_skill_set and g.correct is not null and g.difficulty = at_
    group by g.answer
  ), last_ as (  -- of them, those on the latest papers
    select a.* from ans a
    where a.paper in (select a2.paper from ans a2 group by a2.paper order by max(a2.observed_at) desc limit papers)
  )
  select (select count(*) from last_), (select count(*) from last_ where correct),
         coalesce((select array_agg(q.code order by q.n desc, q.code)
                   from (select m.code, count(*) as n from last_, unnest(last_.codes) as m(code)
                          group by m.code having count(*) >= repeat_min
                          order by n desc, m.code limit 3) q), '{}')
    into answered, right_, tg;

  if answered < min_events then
    return query select at_, 'from_state'::text, tg;
    return;
  end if;
  share := right_::numeric / answered;
  if share >= promote then
    return query select ord[least(i + 1, cardinality(ord))], 'from_state'::text, '{}'::text[];
  elsif share < demote then
    return query select ord[greatest(i - 1, 1)], 'from_state'::text, tg;
  else
    return query select at_, 'from_state'::text, tg;
  end if;
end $$;

-- the reader's gate, each school's own (a second school no longer makes the bar two rows)
create or replace view kind_trust with (security_invoker = true) as
with gate as (
  select t.id as tenant_id,
         coalesce((select value::float from config where tenant_id = t.id and key = 'marking.agreement_gate'), 0.95) as bar,
         coalesce((select value::int from config where tenant_id = t.id and key = 'marking.agreement_window'), 50) as size
  from tenant t
), checks as (
  select a.tenant_id, a.fmt, a.reader_right,
         row_number() over (partition by a.tenant_id, a.fmt
                            order by a.read_at desc, a.item_key desc, a.item_result_id desc) as rn
    from answer_checked a
   where a.stood
)
select c.tenant_id, c.fmt,
       count(*) filter (where c.rn <= g.size)::int as n,
       count(*) filter (where c.rn <= g.size and c.reader_right)::int as "right",
       count(*) filter (where c.rn <= g.size) >= g.size
         and count(*) filter (where c.rn <= g.size and c.reader_right) >= g.bar * g.size as trusted,
       public.checks_to_trust(array_agg(c.reader_right order by c.rn) filter (where c.rn <= g.size), g.size, g.bar)
         as checks_to_trust
  from checks c join gate g on g.tenant_id = c.tenant_id
 group by c.tenant_id, c.fmt, g.size, g.bar;

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
         max(value::numeric) filter (where key = 'calibration.too_easy_share')          as share,
         max(value::numeric) filter (where key = 'calibration.min_children')            as min_children,
         max(value::numeric) filter (where key = 'calibration.review_again_children')   as again
  from config
  where key in ('calibration.too_easy_share', 'calibration.min_children', 'calibration.review_again_children')
  group by tenant_id
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

-- the observed picture: a grade's rule from its row, how a record counts from `observed.weights`
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
           w.opens_secure, w.rechecks, w.lowers, o.reached_level >= gr.secure_level as reached, gr.secure_days,
           gr.recheck_days, gr.min_adults,
           concat_ws('|', e.child_id, e.skill_code, k.grade_code) as unit
    from evidence_event e
    join activity_observation o on o.id = e.observation_id and o.tenant_id = e.tenant_id
    join school_class k on k.id = o.class_id
    join grade gr on gr.tenant_id = e.tenant_id and gr.code = k.grade_code and gr.secure_level is not null
    join config wc on wc.tenant_id = e.tenant_id and wc.key = 'observed.weights'
    join lateral jsonb_to_recordset(wc.value -> k.grade_code)
           w (kind text, entry_mode text, opens_secure boolean, rechecks boolean, lowers boolean)
      on w.kind = e.kind and w.entry_mode = o.entry_mode
    left join config z on z.tenant_id = e.tenant_id and z.key = 'school.time_zone'
    where e.confirmed_by is not null and o.reached_level is not null
      and (p_child is null or e.child_id = p_child)
      and not exists (select 1 from activity_observation c where c.supersedes = o.id)
    order by e.child_id, e.skill_code, k.grade_code, e.observed_at, o.reached_level < gr.secure_level, e.id
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

-- 4. A new school: its grades carry K2's rule; every setting is copied by one function. ---------------------------

create or replace function internal.school_vocabulary(p_tenant uuid) returns void
language plpgsql set search_path = public as $$
begin
  -- K2 is read from observations: a child is secure named at level 3 on 2 days by 1 adult, re-checked 14 days on
  insert into grade (tenant_id, code, name, ord, min_adults, secure_level, secure_days, recheck_days)
  select p_tenant, v.code, v.name, v.ord, v.min_adults, v.secure_level, v.secure_days, v.recheck_days
  from (values
    ('PG', 'PG', 0, 2, null, null, null), ('N', 'Nursery', 1, 2, null, null, null), ('K1', 'K1', 2, 2, null, null, null),
    ('K2', 'K2', 3, 1, 3, 2, 14),
    ('G1', 'Grade 1', 4, 2, null, null, null), ('G2', 'Grade 2', 5, 2, null, null, null),
    ('G3', 'Grade 3', 6, 2, null, null, null), ('G4', 'Grade 4', 7, 2, null, null, null),
    ('G5', 'Grade 5', 8, 2, null, null, null), ('G6', 'Grade 6', 9, 2, null, null, null),
    ('G7', 'Grade 7', 10, 2, null, null, null), ('G8', 'Grade 8', 11, 2, null, null, null),
    ('G9', 'Grade 9', 12, 2, null, null, null), ('G10', 'Grade 10', 13, 2, null, null, null)
  ) v (code, name, ord, min_adults, secure_level, secure_days, recheck_days)
  on conflict (tenant_id, code) do nothing;

  insert into difficulty (tenant_id, code, ord)
  select p_tenant, v.code, v.ord
  from (values ('Easy', 0), ('Medium', 1), ('Hard', 2), ('Advance', 3)) v (code, ord)
  on conflict (tenant_id, code) do nothing;

  insert into child_state (tenant_id, code, ord, words, colour, needs_work)
  select p_tenant, v.code, v.ord, v.words, v.colour, v.needs_work
  from (values
    ('patterned_error', 0, 'repeating mistake', 'red', true),
    ('emerging', 1, 'under half right', 'red', true),
    ('practising', 2, 'practising', 'amber', true),
    ('secure', 3, 'secure', 'green', false),
    ('stretch_ready', 4, 'ready to move up', 'green', false),
    ('not_enough_yet', 5, 'not enough yet', 'grey', false)
  ) v (code, ord, words, colour, needs_work)
  on conflict (tenant_id, code) do nothing;
end $$;

-- Every setting of a new school is the first school's, copied: the numbers, the switches, the words (the seed's, or
-- what that school has since chosen). The list of people is a school's own and is not copied. The first school of a
-- database gets its settings from the seed (`engine load`).
create function internal.school_settings_on_new_school() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into config (tenant_id, key, value, description)
  select new.id, c.key, c.value, c.description
  from config c
  where c.tenant_id = (select t.id from tenant t where t.id <> new.id order by t.created_at, t.id limit 1)
    and c.key <> 'app.staff'
  on conflict (tenant_id, key) do nothing;
  return null;
end $$;

drop trigger approval_begins on tenant;
drop trigger fortnight_plan_settings on tenant;
drop trigger fortnight_settings on tenant;
drop trigger nightly_settings on tenant;
drop trigger timetable_hand_settings on tenant;
drop trigger timetable_live_settings on tenant;
drop trigger timetable_run_settings on tenant;
drop trigger validation_begins on tenant;
drop trigger voice_evidence_settings on tenant;
drop trigger voice_vocabulary on tenant;
drop trigger voice_vocabulary_then_observed_rules on tenant;
drop trigger validation_rule_on_new_subject on subject;
create trigger school_settings after insert on tenant
  for each row execute function internal.school_settings_on_new_school();

drop function internal.approval_begins_on_new_school();
drop function internal.approval_begins(uuid);
drop function internal.fortnight_plan_settings_on_new_school();
drop function internal.fortnight_plan_settings(uuid);
drop function internal.fortnight_settings_on_new_school();
drop function internal.fortnight_settings(uuid);
drop function internal.nightly_settings_on_new_school();
drop function internal.nightly_settings(uuid);
drop function internal.timetable_hand_settings_on_new_school();
drop function internal.timetable_hand_settings(uuid);
drop function internal.timetable_live_settings_on_new_school();
drop function internal.timetable_live_settings(uuid);
drop function internal.timetable_run_settings_on_new_school();
drop function internal.timetable_run_settings(uuid);
drop function internal.validation_begins_on_new_school();
drop function internal.validation_rule_on_new_subject();
drop function internal.validation_begins(uuid);
drop function internal.voice_evidence_settings_on_new_school();
drop function internal.voice_evidence_settings(uuid);
drop function internal.voice_vocabulary_on_new_school();
drop function internal.voice_vocabulary(uuid);
drop function internal.observed_rules_on_new_school();
drop function internal.observed_rules(uuid);
drop view kind_stage;

-- 5. One history log. ---------------------------------------------------------------------------------------------

create table change_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  table_name text not null check (btrim(table_name) <> ''),
  row_id text not null,            -- the row's own code or key, as people name it (an activity's code, `skill level`)
  op text not null check (btrim(op) <> ''),  -- insert, update, delete, or a step a table names
  before jsonb,                    -- what changed, as it was (the changed columns; a removed row's watched columns)
  after jsonb,                     -- what changed, as it is now
  staff_id uuid references staff(id),
  origin text,                     -- where it came from: an upload's or the seed's label, `staff:<id>`, a login
  reason text check (btrim(reason) <> ''),
  at timestamptz not null default clock_timestamp()
);
comment on table change_log is
  'The one history log (CP-27, docs/data-model.md): who changed what, when, before and after, and why; one row per change, written by internal.change_kept on each table whose history it keeps. Never edited or deleted.';
create index change_log_row_idx on change_log (tenant_id, table_name, row_id, at);
create trigger change_log_kept before update or delete on change_log
  for each statement execute function internal.forbid_change();

-- One trigger function for every table whose history is kept. Argument 1: the column(s) naming the row, comma-separated
-- (joined with a space); the rest: the columns watched (none: every column but its id, school and timestamps). An
-- update that changes no watched column writes nothing; an insert keeps the watched columns it fills, a delete those
-- it had.
create function internal.change_kept() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  watched text[] := case when tg_nargs > 1 then tg_argv[1:tg_nargs - 1] else array(
                      select k from jsonb_object_keys(r) k where k not in ('id', 'tenant_id', 'created_at', 'updated_at'))
                    end;
  b jsonb := '{}';
  a jsonb := '{}';
  f text;
  who text := nullif(btrim(current_setting('app.changed_by', true)), '');
  person uuid;
begin
  foreach f in array watched loop
    if tg_op = 'UPDATE' then
      if o -> f is distinct from n -> f then
        b := b || jsonb_build_object(f, o -> f);
        a := a || jsonb_build_object(f, n -> f);
      end if;
    elsif coalesce(r ->> f, '') <> '' then
      if tg_op = 'INSERT' then a := a || jsonb_build_object(f, n -> f); else b := b || jsonb_build_object(f, o -> f); end if;
    end if;
  end loop;
  if tg_op = 'UPDATE' and a = '{}' then
    return null;
  end if;
  person := (select s.id from staff s
              where s.id::text = lower(substring(who from 'staff:([0-9A-Fa-f-]{36})')));
  insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)
  values ((r ->> 'tenant_id')::uuid, tg_table_name,
          (select string_agg(r ->> k, ' ' order by i) from unnest(string_to_array(tg_argv[0], ',')) with ordinality u (k, i)),
          lower(tg_op), nullif(b, '{}'), nullif(a, '{}'),
          coalesce(person, public.signed_in_staff()), coalesce(who, session_user::text),
          nullif(btrim(current_setting('app.change_reason', true)), ''));
  return null;
end $$;

-- The rows of the three history tables, each one change_log row, tagged with where it came from.
insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason, at)
select e.tenant_id, e.record, e.code,
       case when e.record in ('activity', 'learning_objective') then 'update'
            when e.before = '' then 'insert' else 'delete' end,
       case when e.record in ('activity', 'learning_objective') or e.before <> '' then jsonb_build_object(e.field, e.before) end,
       case when e.record in ('activity', 'learning_objective') or e.after <> '' then jsonb_build_object(e.field, e.after) end,
       (select s.id from staff s where s.id::text = lower(substring(e.changed_by from 'staff:([0-9A-Fa-f-]{36})'))),
       e.changed_by, 'CP-27: kept in curriculum_edit until 2026-11', e.created_at
from curriculum_edit e;

insert into change_log (tenant_id, table_name, row_id, op, before, after, origin, reason, at)
select v.tenant_id, 'skill', v.code, 'update',
       jsonb_build_object('version', v.version, 'rung_code', v.rung_code, 'name', v.name,
                          'learning_objective', v.learning_objective, 'philosophy', to_jsonb(v.philosophy),
                          'formats', to_jsonb(v.formats), 'misconception_codes', to_jsonb(v.misconception_codes),
                          'difficulty', v.difficulty, 'eval_type', v.eval_type, 'status', v.status,
                          'ratified_by', v.ratified_by, 'valid_from', v.valid_from),
       null, null, 'CP-27: kept in skill_set_version until 2026-11', v.valid_to
from skill_set_version v;

insert into change_log (tenant_id, table_name, row_id, op, before, after, origin, reason, at)
select v.tenant_id, 'skill_level', v.skill_code || ' ' || v.difficulty, 'update',
       jsonb_build_object('version', v.version, 'learning_objective', v.learning_objective, 'looks_like', v.looks_like,
                          'rule', v.rule, 'valid_from', v.valid_from),
       null, null, 'CP-27: kept in skill_level_version until 2026-11', v.valid_to
from skill_level_version v;

do $$
declare n_old int; n_new int;
begin
  select count(*) into n_old from curriculum_edit;
  select count(*) into n_new from change_log c join curriculum_edit e
    on e.tenant_id = c.tenant_id and e.record = c.table_name and e.code = c.row_id and e.created_at = c.at
   and e.changed_by = c.origin and coalesce(c.after, c.before) ? e.field
   and coalesce(c.before ->> e.field, '') = e.before and coalesce(c.after ->> e.field, '') = e.after
   where c.reason = 'CP-27: kept in curriculum_edit until 2026-11';
  if n_old <> n_new or n_new <> (select count(*) from change_log where reason = 'CP-27: kept in curriculum_edit until 2026-11') then
    raise exception 'CP-27: % curriculum_edit rows, % in change_log', n_old, n_new;
  end if;
  select count(*) into n_old from skill_set_version;
  select count(*) into n_new from change_log c join skill_set_version v
    on v.tenant_id = c.tenant_id and c.table_name = 'skill' and v.code = c.row_id
   and (c.before ->> 'version')::int = v.version and c.before -> 'difficulty' = v.difficulty
   and c.before ->> 'name' = v.name and c.at = v.valid_to
   where c.reason = 'CP-27: kept in skill_set_version until 2026-11';
  if n_old <> n_new or n_new <> (select count(*) from change_log where reason = 'CP-27: kept in skill_set_version until 2026-11') then
    raise exception 'CP-27: % skill_set_version rows, % in change_log', n_old, n_new;
  end if;
  select count(*) into n_old from skill_level_version;
  select count(*) into n_new from change_log c join skill_level_version v
    on v.tenant_id = c.tenant_id and c.table_name = 'skill_level' and v.skill_code || ' ' || v.difficulty = c.row_id
   and (c.before ->> 'version')::int = v.version and c.before -> 'rule' = v.rule
   and c.before ->> 'looks_like' is not distinct from v.looks_like and c.at = v.valid_to
   where c.reason = 'CP-27: kept in skill_level_version until 2026-11';
  if n_old <> n_new or n_new <> (select count(*) from change_log where reason = 'CP-27: kept in skill_level_version until 2026-11') then
    raise exception 'CP-27: % skill_level_version rows, % in change_log', n_old, n_new;
  end if;
end $$;

-- The writers: one trigger function on each table whose history was kept, watching what was watched before.
drop trigger activity_edit_kept on activity;
drop trigger learning_objective_edit_kept on learning_objective;
drop trigger activity_skill_kept on activity_skill;
drop trigger activity_objective_kept on activity_objective;
drop trigger learning_objective_skill_kept on learning_objective_skill;
drop function internal.curriculum_edit_kept();
drop function internal.curriculum_link_kept();

create trigger activity_change_kept after insert or update on activity for each row execute function
  internal.change_kept('code', 'strand', 'name', 'objective', 'materials', 'level_0', 'level_1', 'level_2', 'level_3',
                       'sheet_no', 'steps', 'thinking');
create trigger learning_objective_change_kept after update on learning_objective for each row execute function
  internal.change_kept('code', 'subject', 'unit', 'title');
create trigger activity_skill_change_kept after insert or update or delete on activity_skill for each row execute function
  internal.change_kept('activity_code', 'skill_code');
create trigger activity_objective_change_kept after insert or update or delete on activity_objective for each row
  execute function internal.change_kept('activity_code', 'lo_code');
create trigger learning_objective_skill_change_kept after insert or update or delete on learning_objective_skill
  for each row execute function internal.change_kept('lo_code', 'skill_code');
-- a skill's rule and a level's words: the version is still counted on the row, the rule before it is in the log
create trigger skill_change_kept after update on skill for each row execute function
  internal.change_kept('code', 'rung_code', 'name', 'learning_objective', 'philosophy', 'formats', 'difficulty',
                       'eval_type', 'version');
create trigger skill_level_change_kept after update on skill_level for each row execute function
  internal.change_kept('skill_code,difficulty', 'learning_objective', 'looks_like', 'rule', 'version');

create or replace function internal.skill_set_version_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if row(new.rung_code, new.name, new.learning_objective, new.philosophy, new.formats,
         new.difficulty, new.eval_type)
     is distinct from
     row(old.rung_code, old.name, old.learning_objective, old.philosophy, old.formats,
         old.difficulty, old.eval_type) then
    new.version := old.version + 1;  -- the rule before it is kept in change_log (skill_change_kept)
  end if;
  -- the skill approved or withdrawn whole, by its status (`engine ratify`, a person approving every level at once): every
  -- level with it, so the status and the levels never disagree, whoever writes the row
  if new.status is distinct from old.status and new.level_approved is not distinct from old.level_approved then
    new.level_approved := case when new.status = 'ratified'
      then (select jsonb_object_agg(k, jsonb_build_object('by', coalesce(new.ratified_by, 'someone'), 'at', now()))
            from jsonb_object_keys(new.difficulty) k)
      else '{}'::jsonb end;
  end if;
  -- a level keeps its approval while what makes its questions is the one that was approved
  new.level_approved := coalesce((
    select jsonb_object_agg(e.key, e.value) from jsonb_each(new.level_approved) e
    where new.difficulty ? e.key
      and (old.difficulty -> e.key) - 'words' is not distinct from (new.difficulty -> e.key) - 'words'
      and new.formats is not distinct from old.formats
      and new.eval_type is not distinct from old.eval_type), '{}'::jsonb);
  if (select bool_and(new.level_approved ? k) from jsonb_object_keys(new.difficulty) k) then
    new.status := 'ratified';
    new.ratified_by := coalesce(
      (select e.value ->> 'by' from jsonb_each(new.level_approved) e
       order by e.value ->> 'at' desc limit 1), new.ratified_by);
  else
    new.status := 'draft';
    new.ratified_by := null;
  end if;
  return new;
end $$;

create or replace function internal.skill_level_version_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if row(new.learning_objective, new.looks_like, new.rule) is distinct from row(old.learning_objective, old.looks_like, old.rule) then
    new.version := old.version + 1;  -- the words before it are kept in change_log (skill_level_change_kept)
  end if;
  return new;
end $$;

do $$ begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert on change_log to app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant select on change_log to app_web;
  end if;
end $$;

-- 6. The tables that leave. ---------------------------------------------------------------------------------------

delete from access_table where schema_name = 'public' and table_name in (
  'threshold', 'observed_rule', 'observed_weight', 'validation_rule', 'validation_stage', 'approval_kind',
  'curriculum_edit', 'skill_set_version', 'skill_level_version');
insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'change_log', null, null, null, 'school_wide',
   'the one history log of the school''s own records (curriculum, skills, levels); no child');

do $$
declare
  t text;
  k record;
  moved constant text[] := array[
    'threshold', 'observed_rule', 'observed_weight', 'validation_rule', 'validation_stage', 'approval_kind',
    'curriculum_edit', 'skill_set_version', 'skill_level_version'];
begin
  -- no table that stays still points at one that goes
  if exists (select 1 from pg_constraint c where c.contype = 'f'
             and c.confrelid in (select ('public.' || x)::regclass from unnest(moved) x)
             and c.conrelid not in (select ('public.' || x)::regclass from unnest(moved) x)) then
    raise exception 'CP-27: a table that stays still has a key into one that is retired';
  end if;
  foreach t in array moved loop
    for k in select conname from pg_constraint where contype = 'f' and conrelid = ('public.' || t)::regclass loop
      execute format('alter table public.%I drop constraint %I', t, k.conname);
    end loop;
    for k in select tgname from pg_trigger where not tgisinternal and tgrelid = ('public.' || t)::regclass loop
      execute format('drop trigger %I on public.%I', k.tgname, t);
    end loop;
    for k in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', k.policyname, t);
    end loop;
  end loop;
end $$;

alter table public.threshold set schema retired;
alter table public.observed_rule set schema retired;
alter table public.observed_weight set schema retired;
alter table public.validation_rule set schema retired;
alter table public.validation_stage set schema retired;
alter table public.approval_kind set schema retired;
alter table public.curriculum_edit set schema retired;
alter table public.skill_set_version set schema retired;
alter table public.skill_level_version set schema retired;

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

select internal.apply_conventions();
