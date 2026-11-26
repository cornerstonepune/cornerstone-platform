--
-- PostgreSQL database dump
--

\restrict Ll9SSpIQBG8nRCk0Zp1MxWg13u9YJL9ocgfxCIx94qKtAg8Lr9DqSqEirjpiRVr

-- Dumped from database version 17.12 (Debian 17.12-1.pgdg13+1)
-- Dumped by pg_dump version 17.12 (Debian 17.12-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pii; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pii;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: eval_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.eval_type AS ENUM (
    'computable',
    'closed_set',
    'rule_governed',
    'open_response'
);


--
-- Name: find_child(text, text, text); Type: FUNCTION; Schema: pii; Owner: -
--

CREATE FUNCTION pii.find_child(p_section text, p_first_name text, p_actor text) RETURNS SETOF uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pii', 'public'
    AS $$
begin
  return query
  with found as (
    select c.id, c.tenant_id
    from public.child_now c
    join pii.child p on p.child_id = c.id
    where lower(p.first_name) = lower(p_first_name) and (p_section is null or c.section = p_section)
  ), logged as (
    insert into public.access_log (tenant_id, actor, child_id, action)
    select f.tenant_id, p_actor, f.id, 'find_child' from found f
  )
  select f.id from found f;
end $$;


--
-- Name: read_child(uuid, text); Type: FUNCTION; Schema: pii; Owner: -
--

CREATE FUNCTION pii.read_child(p_child_id uuid, p_actor text) RETURNS TABLE(first_name text, last_name text, home_languages text[])
    LANGUAGE plpgsql SECURITY DEFINER ROWS 1
    SET search_path TO 'pii', 'public'
    AS $$
begin
  insert into public.access_log (tenant_id, actor, child_id, action)
  select c.tenant_id, p_actor, p_child_id, 'read_pii_child'
  from pii.child c
  where c.child_id = p_child_id;

  return query
  select c.first_name, c.last_name, c.home_languages
  from pii.child c
  where c.child_id = p_child_id;
end $$;


--
-- Name: read_staff(uuid, text); Type: FUNCTION; Schema: pii; Owner: -
--

CREATE FUNCTION pii.read_staff(p_staff_id uuid, p_actor text) RETURNS TABLE(name text, email text, phone text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pii', 'public'
    AS $$
begin
  insert into public.access_log (tenant_id, actor, action)
  select s.tenant_id, p_actor, 'read_pii_staff' from pii.staff s where s.staff_id = p_staff_id;
  return query select s.name, s.email, s.phone from pii.staff s where s.staff_id = p_staff_id;
end $$;


--
-- Name: answer_evidence(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.answer_evidence(p_result_ids uuid[]) RETURNS TABLE(item_result_id uuid, tenant_id uuid, child_id uuid, rung_code text, observed_at timestamp with time zone, skill text, correct boolean, codes text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with pending as (
    select r.id, r.tenant_id, si.child_id, r.status, r.misconception_codes, i.rung_code, i.source, i.skill_codes,
           i.mistake_skills, coalesce(i.spec ->> 'skill', i.skill_codes[1]) as own_skill,
           coalesce((t.key ->> 'date')::timestamptz, c.created_at) as observed_at
    from item_result r
    join capture c on c.id = r.capture_id
    join sheet_instance si on si.id = c.sheet_instance_id
    join sheet_template t on t.id = si.sheet_template_id
    join item i on i.id = r.item_id
    where r.id = any(p_result_ids) and r.status in ('correct', 'wrong', 'blank')
  )
  select p.id, p.tenant_id, p.child_id, p.rung_code, p.observed_at, s.skill, true, '{}'::text[]
  from pending p
  cross join lateral unnest(
    case when p.source = 'generated' and cardinality(p.skill_codes) > 0 then p.skill_codes
         else array[p.own_skill] end) as s(skill)
  where p.status = 'correct'
  union all
  select p.id, p.tenant_id, p.child_id, p.rung_code, p.observed_at, coalesce(p.mistake_skills ->> m.code, p.own_skill),
         false, array_agg(m.code order by m.code)
  from pending p
  cross join lateral unnest(p.misconception_codes) as m(code)
  where p.status = 'wrong' and cardinality(p.misconception_codes) > 0
  group by p.id, p.tenant_id, p.child_id, p.rung_code, p.observed_at, coalesce(p.mistake_skills ->> m.code, p.own_skill)
  union all
  select p.id, p.tenant_id, p.child_id, p.rung_code, p.observed_at, p.own_skill,
         case p.status when 'wrong' then false else null end, p.misconception_codes
  from pending p
  where p.status = 'blank' or (p.status = 'wrong' and cardinality(p.misconception_codes) = 0)
$$;


--
-- Name: checks_to_trust(boolean[], integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checks_to_trust(recent boolean[], size integer, bar double precision) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select min(k)::int from generate_series(0, size) k
   where k + least(coalesce(cardinality(recent), 0), size - k) >= size
     and (k + (select count(*) from unnest(recent[1:size - k]) r where r))::float >= bar * size
$$;


--
-- Name: class_band(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.class_band(tenant uuid, section text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  select c.band from child_now c
  join grade g on g.tenant_id = c.tenant_id and g.code = c.band
  where c.tenant_id = $1 and c.section = $2 and c.active
  group by c.band, g.ord
  order by count(*) desc, g.ord
  limit 1
$_$;


--
-- Name: confirm_results(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_results(p_child_id uuid, p_by text, p_capture_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer; ids uuid[];
begin
  select coalesce(array_agg(r.id), '{}') into ids
  from item_result r
  join capture c on c.id = r.capture_id
  join sheet_instance si on si.id = c.sheet_instance_id
  where si.child_id = p_child_id and r.state = 'candidate'
    and r.status in ('correct', 'wrong', 'blank')
    and (p_capture_id is null or r.capture_id = p_capture_id);
  with ev as (
    insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct,
                                misconception_codes, channel, item_result_id, observed_at, confirmed_by)
    select a.tenant_id, p_child_id, a.skill, a.rung_code, a.correct, a.codes, 'item', a.item_result_id,
           a.observed_at, p_by
    from answer_evidence(ids) a
    returning item_result_id
  )
  update item_result r set state = 'confirmed', confirmed_by = p_by, confirmed_at = now()
  where r.id in (select item_result_id from ev);
  get diagnostics n = row_count;
  perform rebuild_child_skill_state(p_child_id);
  return n;
end $$;


--
-- Name: confirm_skill_link(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_skill_link(p_id uuid, p_staff uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  school uuid;
  found boolean;
begin
  select tenant_id into school from staff where id = p_staff and active;
  if school is null then
    return 'not staff';
  end if;
  if not exists (select 1 from skill_prerequisite where id = p_id and tenant_id = school) then
    return 'no link';
  end if;
  update skill_prerequisite set status = 'confirmed', confirmed_by = p_staff, confirmed_at = now()
  where id = p_id and status <> 'confirmed';
  get diagnostics found = row_count;
  return case when found then 'confirmed' else 'already' end;
end $$;


--
-- Name: correct_signed_off(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_signed_off(p_result_id uuid, p_by text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer; kid uuid; at_ timestamptz := clock_timestamp();
begin
  select si.child_id into kid
  from item_result r
  join capture c on c.id = r.capture_id
  join sheet_instance si on si.id = c.sheet_instance_id
  where r.id = p_result_id and r.state = 'confirmed';
  if kid is null then
    return 0;
  end if;
  insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes, channel,
                              item_result_id, observed_at, confirmed_by, created_at, stored_at)
  select a.tenant_id, kid, a.skill, a.rung_code, a.correct, a.codes, 'item', a.item_result_id, a.observed_at,
         p_by, at_, at_
  from answer_evidence(array[p_result_id]) a;
  get diagnostics n = row_count;
  if n > 0 then
    update item_result set confirmed_by = p_by, confirmed_at = now() where id = p_result_id;
    perform rebuild_child_skill_state(kid);
  end if;
  return n;
end $$;


--
-- Name: current_item_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_item_key(p_key text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with recursive k(key, n) as (
    select p_key, 0
    union all
    select c.after ->> 'item_key', k.n + 1 from change_log c join k on c.before ->> 'item_key' = k.key
    where c.table_name = 'item' and c.op = 'rekey' and k.n < 8
  )
  select key from k order by n desc limit 1
$$;


--
-- Name: current_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_staff() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid end
  from (select nullif(btrim(current_setting('app.staff_id', true)), '') as v) s
$_$;


--
-- Name: curriculum_begins(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.curriculum_begins(p_tenant uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into config (tenant_id, key, value, description)
  values (p_tenant, 'school.time_zone', '"Asia/Kolkata"',
          'The school''s own clock: its day and its week, which a published curriculum takes effect from (C3).')
  on conflict (tenant_id, key) do nothing;
  -- a school with no skill yet (one just added, a database just built) begins at its first load (`engine load`)
  if exists (select 1 from curriculum_version where tenant_id = p_tenant)
     or not exists (select 1 from skill where tenant_id = p_tenant) then
    return;
  end if;
  insert into curriculum_version (tenant_id, number, published_by, takes_effect, note, skills)
  values (p_tenant, 1, 'the curriculum as it stood (C3)', date_trunc('week', internal.school_day(p_tenant, now()))::date,
          'Every skill as it stood when versions began.',
          (select coalesce(jsonb_object_agg(s.code, s.version), '{}'::jsonb) from skill s where s.tenant_id = p_tenant));
end $$;


--
-- Name: curriculum_in_force(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.curriculum_in_force(p_tenant uuid, p_at timestamp with time zone DEFAULT now()) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select max(number) from curriculum_version
  where tenant_id = p_tenant and takes_effect <= internal.school_day(p_tenant, p_at)
$$;


--
-- Name: enrol_child(uuid, uuid, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enrol_child(p_child uuid, p_class uuid, p_roll text, p_from date, p_by text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  t uuid;
  open_row enrolment%rowtype;
begin
  select tenant_id into t from school_class where id = p_class;
  if t is null then raise exception 'no_such_class'; end if;
  select * into open_row from enrolment where child_id = p_child and to_date is null for update;
  if found then
    if open_row.class_id = p_class and open_row.roll_no = p_roll then
      return jsonb_build_object('changed', false);
    end if;
    if p_from < open_row.from_date then
      raise exception 'date_before_current: the child is in their present class from %, not earlier', open_row.from_date;
    end if;
    update enrolment set to_date = p_from, updated_at = now() where id = open_row.id;
  end if;
  insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)
  values (t, p_child, p_class, p_roll, p_from, p_by);
  return jsonb_build_object('changed', true, 'moved_from', open_row.class_id);
end $$;


--
-- Name: fortnight_approve(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fortnight_approve(p_class uuid, p_fortnight uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: grade_is_wholly(text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grade_is_wholly(p_grade text, p_sections text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.my_tenant() is not null and not exists (
    select 1 from child_now c
    where c.tenant_id = public.my_tenant() and c.band = p_grade and c.active and c.section <> all (p_sections))
$$;


--
-- Name: grade_ord(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grade_ord(tenant uuid, code text) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  select g.ord from grade g where g.tenant_id = $1 and g.code = $2
$_$;


--
-- Name: graph_level_window(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_level_window(p_child uuid DEFAULT NULL::uuid) RETURNS TABLE(scope text, tenant_id uuid, child_id uuid, unit text, rung_code text, difficulty text, level_ord integer, n_events integer, n_correct integer, share numeric, days integer, adults integer, latest_share numeric, repeating text, rechecked boolean, harder boolean, latest_at timestamp with time zone, min_adults integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: graph_numbers(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_numbers(p_before timestamp with time zone) RETURNS TABLE(children integer, evidence_rows integer, evidence_digest text, skill_states integer, observed_states integer, states_digest text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    (select count(distinct child_id)::int from evidence_event where confirmed_by is not null),
    (select count(*)::int from evidence_event where created_at < p_before),
    (select md5(coalesce(string_agg(to_jsonb(e)::text, '' order by e.id), '')) from evidence_event e
      where e.created_at < p_before),
    (select count(*)::int from child_skill_state where kind = 'written'),
    (select count(*)::int from child_skill_state where kind = 'observed'),
    md5(coalesce((select string_agg(t, '' order by t) from (
        select (to_jsonb(s) - 'id' - 'computed_at' - 'created_at' - 'updated_at')::text as t from child_skill_state s
      ) x), ''))
$$;


--
-- Name: graph_observed_states(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_observed_states(p_child uuid DEFAULT NULL::uuid) RETURNS TABLE(tenant_id uuid, child_id uuid, skill_code text, grade_code text, state text, named_days integer, adults integer, first_named_yes date, rechecked_on date, last_seen timestamp with time zone)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: graph_skill_states(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_skill_states(p_child uuid DEFAULT NULL::uuid) RETURNS TABLE(tenant_id uuid, child_id uuid, skill_code text, rung_code text, difficulty text, state text, n_events integer, n_correct integer, repeating_misconception text, last_seen timestamp with time zone, share numeric, days integer, latest_share numeric, rechecked boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: graph_state_changes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_state_changes(p_child uuid DEFAULT NULL::uuid) RETURNS TABLE(grade_code text, old_state text, new_state text, skills integer, children integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select c.band, coalesce(s.state, 'none'), g.state, count(*)::int, count(distinct g.child_id)::int
  from public.graph_skill_states(p_child) g
  join child c on c.id = g.child_id
  left join child_skill_state s on s.kind = 'written' and s.child_id = g.child_id and s.skill_code = g.skill_code
                               and s.rung_code is not distinct from g.rung_code
  where coalesce(s.state, 'none') is distinct from g.state
  group by c.band, coalesce(s.state, 'none'), g.state
$$;


--
-- Name: graph_state_of(uuid, numeric, numeric, numeric, numeric, numeric, text, numeric, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_state_of(p_tenant uuid, p_n_events numeric, p_share numeric, p_days numeric, p_adults numeric, p_min_adults numeric, p_repeating text, p_latest_share numeric, p_rechecked boolean, p_harder boolean) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mistake_name(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mistake_name(p_code text, p_skill text, p_op text DEFAULT NULL::text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with op as (
    select coalesce(
      operation_sign(p_op),
      (select e.key from config c, jsonb_each_text(c.value) e
        where c.key = 'skills.by_operation' and e.value = p_skill limit 1)) as key
  ), named as (
    select op, name from misconception where code = p_code
  )
  select coalesce(
    (select name from named where op = (select key from op) limit 1),
    (select name from named where op = 'any' limit 1),
    (select min(name) from named having count(distinct name) = 1),
    p_code)
$$;


--
-- Name: move_child(uuid, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_child(p_child uuid, p_band text, p_section text, p_roll text, p_by text, p_reason text DEFAULT ''::text, p_at timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  c child_now%rowtype;
  p_section_t text := btrim(coalesce(p_section, ''));
  p_roll_t    text := btrim(coalesce(p_roll, ''));
  withdrawn   integer;
  made        integer;
  today       date;   -- the school's day of p_at, never the server's
  this_week   date;
  here        uuid;   -- the campus the child is on now
  there       uuid;   -- the class they are going to
  who         uuid;
begin
  perform 1 from child where id = p_child for update;
  select * into c from child_now where id = p_child;
  if not found then return jsonb_build_object('moved', false, 'refused', 'no_such_child'); end if;
  today := internal.school_day(c.tenant_id, p_at);
  this_week := date_trunc('week', today)::date;
  if btrim(coalesce(p_by, '')) = '' then return jsonb_build_object('moved', false, 'refused', 'no_one'); end if;
  if p_roll_t !~ '^[A-Za-z0-9-]{1,8}$' then return jsonb_build_object('moved', false, 'refused', 'bad_roll'); end if;
  if not exists (select 1 from grade where tenant_id = c.tenant_id and code = p_band) then
    return jsonb_build_object('moved', false, 'refused', 'no_such_grade');
  end if;
  select s.campus_id into here from school_class s where s.id = c.class_id;
  -- a class is a class of this year: a typed label that names none is a typing slip, not a new class
  select s.id into there from school_class s join academic_year y on y.id = s.academic_year_id
   where s.tenant_id = c.tenant_id and s.label = p_section_t and today between y.starts_on and y.ends_on
     and (here is null or s.campus_id = here)
   order by s.created_at limit 1;
  if there is null then return jsonb_build_object('moved', false, 'refused', 'no_such_class'); end if;
  if p_band = c.band and there is not distinct from c.class_id and p_roll_t = c.roll_no then
    return jsonb_build_object('moved', false, 'refused', 'nothing_changes');
  end if;
  if exists (select 1 from enrolment where class_id = there and to_date is null and roll_no = p_roll_t
             and child_id <> c.id) then
    return jsonb_build_object('moved', false, 'refused', 'roll_taken');
  end if;

  begin  -- the child's grade and their enrolment change together, or neither does
    update child set band = p_band where id = c.id and band is distinct from p_band;
    perform enrol_child(c.id, there, p_roll_t, today, btrim(p_by));
  exception
    when unique_violation then  -- someone took the roll between the check and the change
      return jsonb_build_object('moved', false, 'refused', 'roll_taken');
    when raise_exception then
      if sqlerrm like 'no_such_class%' or sqlerrm like 'date_before_current%' then
        return jsonb_build_object('moved', false, 'refused', split_part(sqlerrm, ':', 1));
      end if;
      raise;
  end;
  who := coalesce((select p.staff_id from pii.staff p where p.tenant_id = c.tenant_id
                     and p.email = lower(btrim(p_by))), public.signed_in_staff());
  insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)
  values (c.tenant_id, 'child', c.id::text, 'move',
          jsonb_build_object('band', c.band, 'section', c.section, 'roll_no', c.roll_no),
          jsonb_build_object('band', p_band, 'section', p_section_t, 'roll_no', p_roll_t),
          who, case when who is null then btrim(p_by) else 'move_child' end, nullif(btrim(coalesce(p_reason, '')), ''));

  select count(*) into made from prescription
   where child_id = c.id and week >= this_week and sheet_instance_id is not null;
  with gone as (
    delete from prescription
     where child_id = c.id and week >= this_week and sheet_instance_id is null and override_by is null
     returning 1
  ) select count(*) into withdrawn from gone;

  return jsonb_build_object('moved', true, 'prescriptions_withdrawn', withdrawn, 'papers_made', made);
end $_$;


--
-- Name: my_ids(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_ids(p_kind text, p_key_type text) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with me as (
    select m.staff_id, m.tenant_id, internal.school_day(m.tenant_id, now()) as d from internal.resolve_staff() m
  ), cls as (
    select distinct g.school_class_id as id, me.tenant_id, me.d
    from me
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= me.d and (g.valid_to is null or g.valid_to > me.d)
    join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code
    join access_reach r on r.tenant_id = ro.tenant_id and r.group_code = ro.access_group
      and r.kind_code = p_kind and r.reach = 'own'
    where g.school_class_id is not null
  ), kids as (
    -- the children enrolled in those classes now, and (Nimish, 27 Oct 2026: "Achal should only see the papers he has
    -- uploaded") the children whose papers this person put in, whatever their class
    select e.child_id from enrolment e join cls on e.tenant_id = cls.tenant_id and e.class_id = cls.id
    where e.from_date <= cls.d and (e.to_date is null or e.to_date > cls.d)
    union
    select si.child_id from capture c
      join sheet_instance si on si.id = c.sheet_instance_id and si.child_id is not null
    where c.uploaded_by = (select staff_id from me) and c.superseded_by is null
      and c.tenant_id = (select tenant_id from me)
  ), sheets as (
    select si.id from sheet_instance si
    where si.tenant_id = (select tenant_id from me)
      and (si.child_id in (select child_id from kids)
           or (si.child_id is null and si.section in (select sc.label from school_class sc join cls on sc.id = cls.id))
           or exists (select 1 from capture c where c.sheet_instance_id = si.id and c.superseded_by is null
                        and c.uploaded_by = (select staff_id from me)))
  ), caps as (
    -- two lookups by key, not one scan with an OR: the scan cost 35 ms against 4 ms on 6,000 scans
    select c.id from capture c join sheets s on s.id = c.sheet_instance_id
    union
    select c.id from capture c
    where c.uploaded_by = (select staff_id from me) and c.tenant_id = (select tenant_id from me)
  )
  select coalesce(case p_key_type
    when 'class' then (select array_agg(id) from cls)
    when 'child' then (select array_agg(child_id) from kids)
    when 'note' then (select array_agg(n.id) from pii.educator_note n join cls
                        on n.tenant_id = cls.tenant_id and n.class_id = cls.id)
    when 'sheet' then (select array_agg(id) from sheets)
    when 'capture' then (select array_agg(id) from caps)
    when 'run' then (select array_agg(f.id) from flow_run f
                       where f.tenant_id = (select tenant_id from me)
                         and (f.uploaded_by = (select staff_id from me)
                              or (f.result ? 'copies' and exists (
                                    select 1 from jsonb_array_elements(case when jsonb_typeof(f.result -> 'copies') = 'array'
                                                                            then f.result -> 'copies' else '[]'::jsonb end) k
                                    where k ->> 'capture_id' in (select id::text from caps)))))
    when 'parent_note' then (select array_agg(n.id) from parent_note n
                               where n.tenant_id = (select tenant_id from me) and n.child_id in (select child_id from kids))
    when 'item_result' then (select array_agg(r.id) from item_result r where r.capture_id in (select id from caps))
  end, '{}'::uuid[])
$$;


--
-- Name: my_reach(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_reach(p_kind text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select case max(case r.reach when 'all' then 2 when 'own' then 1 else 0 end)
             when 2 then 'all' when 1 then 'own' else 'none' end
    from internal.resolve_staff() me
    cross join lateral (select internal.school_day(me.tenant_id, now()) as d) today
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= today.d and (g.valid_to is null or g.valid_to > today.d)
    join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code
    join access_reach r on r.tenant_id = ro.tenant_id and r.group_code = ro.access_group and r.kind_code = p_kind
  ), 'none')
$$;


--
-- Name: my_sections(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_sections(p_kind text) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(array_agg(distinct sc.label), '{}'::text[])
  from school_class sc where sc.id = any (public.my_ids(p_kind, 'class'))
$$;


--
-- Name: my_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_tenant() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select tenant_id from internal.resolve_staff()
$$;


--
-- Name: next_difficulty(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_difficulty(p_child_id uuid, p_skill_set text) RETURNS TABLE(difficulty text, rule text, targets text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER ROWS 1
    SET search_path TO 'public'
    AS $$
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


--
-- Name: operation_sign(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operation_sign(p_op text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case left(p_op, 1)
    when '+' then '+' when '-' then '-' when '−' then '-' when '–' then '-'
    when '×' then '×' when 'x' then '×' when 'X' then '×' when '*' then '×'
    when '÷' then '÷' when '/' then '÷' when ':' then '÷'
  end
$$;


--
-- Name: plan_link_apply(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.plan_link_apply(p_tenant uuid, p_band text, p_by text, p_fortnight integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: plan_link_undo(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.plan_link_undo(p_run uuid, p_by text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_n int;
begin
  update plan_entry
     set activity_id = null, link_rule = null, link_run = null, linked_at = null, linked_by = null
   where link_run = p_run;
  get diagnostics v_n = row_count;
  return v_n;
end $$;


--
-- Name: propose_skill_link(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.propose_skill_link(p_tenant uuid, p_before text, p_after text, p_reason text, p_source text, p_strength text DEFAULT 'hard'::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  made integer;
begin
  insert into skill_prerequisite (tenant_id, registry_code, before_registry_code, strength, reason, source)
  values (p_tenant, p_after, p_before, p_strength, p_reason, p_source)
  on conflict (tenant_id, registry_code, before_registry_code) do nothing;
  get diagnostics made = row_count;
  return case when made = 1 then 'added' else 'there' end;
end $$;


--
-- Name: publish_curriculum(uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_curriculum(p_tenant uuid, p_by text, p_note text DEFAULT ''::text, p_at timestamp with time zone DEFAULT now()) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('publish_curriculum'), hashtext(p_tenant::text));
  select coalesce(max(number), 0) + 1 into n from curriculum_version where tenant_id = p_tenant;
  insert into curriculum_version (tenant_id, number, published_by, published_at, takes_effect, note, skills)
  values (p_tenant, n, p_by, p_at, date_trunc('week', internal.school_day(p_tenant, p_at))::date + 7, p_note,
          (select coalesce(jsonb_object_agg(s.code, s.version), '{}'::jsonb) from skill s where s.tenant_id = p_tenant));
  return n;
end $$;


--
-- Name: question_type_of(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_type_of(fmt text, template text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  select coalesce((select q.code from question_type q where q.code = $2 limit 1), $1)
$_$;


--
-- Name: rebuild_child_observed_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebuild_child_observed_state(p_child_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n integer;
begin
  -- one rebuild of a child at a time, as rebuild_child_skill_state
  perform pg_advisory_xact_lock(hashtext('rebuild_child_observed_state'), hashtext(p_child_id::text));
  delete from child_skill_state where child_id = p_child_id and kind = 'observed';
  insert into child_skill_state (tenant_id, child_id, skill_code, kind, grade_code, state, named_days, adults,
                                 first_named_yes, rechecked_on, last_seen)
  select g.tenant_id, g.child_id, g.skill_code, 'observed', g.grade_code, g.state, g.named_days, g.adults,
         g.first_named_yes, g.rechecked_on, g.last_seen
  from public.graph_observed_states(p_child_id) g;
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: rebuild_child_skill_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebuild_child_skill_state(p_child_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n integer;
begin
  -- one rebuild of a child at a time: two at once each deleted what the other had not yet written, and the second
  -- insert failed on the first's rows (code review, 2026-09-30)
  perform pg_advisory_xact_lock(hashtext('rebuild_child_skill_state'), hashtext(p_child_id::text));
  delete from child_skill_state where child_id = p_child_id and kind = 'written';
  insert into child_skill_state
    (tenant_id, child_id, skill_code, rung_code, difficulty, state, n_events, n_correct, repeating_misconception,
     last_seen)
  select g.tenant_id, g.child_id, g.skill_code, g.rung_code, g.difficulty, g.state, g.n_events, g.n_correct,
         g.repeating_misconception, g.last_seen
  from public.graph_skill_states(p_child_id) g;
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: resolve_result(uuid, text, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_result(p_result_id uuid, p_status text, p_codes text[], p_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare child uuid; cap uuid;
begin
  if p_status not in ('correct', 'wrong', 'blank') then
    raise exception 'resolve_result: status must be correct, wrong or blank, not %', p_status;
  end if;
  select si.child_id, c.id into child, cap from item_result r
    join capture c on c.id = r.capture_id join sheet_instance si on si.id = c.sheet_instance_id
   where r.id = p_result_id and r.state = 'candidate';
  if child is null then raise exception 'resolve_result: no candidate result %', p_result_id; end if;
  -- who judged it, with the engine's reading unchanged (rule 4): the same row the queue's judgement leaves
  insert into read_correction (tenant_id, child_id, capture_id, item_result_id, model_read, human_read, by, judged)
  select r.tenant_id, child, cap, r.id, coalesce(r.raw_read::jsonb ->> 'child_answer', ''),
         coalesce(r.raw_read::jsonb ->> 'child_answer', ''), p_by, p_status
    from item_result r where r.id = p_result_id;
  update item_result set status = p_status, misconception_codes = coalesce(p_codes, '{}')
   where id = p_result_id and state = 'candidate';
  perform confirm_results(child, p_by, cap);
end $$;


--
-- Name: result_order(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.result_order(p_responses jsonb, p_rid text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select o::int from jsonb_array_elements(p_responses) with ordinality e(x, o) where x ->> 'rid' = p_rid limit 1
$$;


--
-- Name: result_part(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.result_part(p_responses jsonb, p_rid text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select 'answer ' || o || ' of ' || jsonb_array_length(p_responses) || coalesce(' · ' || nullif(x ->> 'label', ''), '')
    from jsonb_array_elements(p_responses) with ordinality e(x, o)
   where x ->> 'rid' = p_rid and jsonb_array_length(p_responses) > 1
   limit 1
$$;


--
-- Name: result_response(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.result_response(p_responses jsonb, p_rid text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce((select x from jsonb_array_elements(p_responses) x where x ->> 'rid' = p_rid limit 1),
                  p_responses -> 0)
$$;


--
-- Name: result_slot(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.result_slot(p_item_key text, p_raw jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(nullif(split_part(p_item_key, '/', 3), ''), split_part(p_raw ->> 'slot', '.', 1), '')
$$;


--
-- Name: roll_order(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roll_order(roll text) RETURNS integer
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public'
    AS $$
  select coalesce(substring(roll from '\d{1,9}')::integer, 2147483647)
$$;


--
-- Name: say_taught(uuid, text, text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.say_taught(tenant uuid, section text, topic text, skill text, taught boolean, said_by text) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  with cls as (
    select sc.id from school_class sc join academic_year y on y.id = sc.academic_year_id
    where sc.tenant_id = $1 and sc.label = $2
      and exists (select 1 from enrolment e join child c on c.id = e.child_id and c.active
                  where e.class_id = sc.id and e.to_date is null)
    order by y.starts_on desc limit 1
  ), said as (
    select s.code from skill s where s.tenant_id = $1 and s.topic_code = $3 and ($4 is null or s.code = $4)
  ), done as (
    update school_class sc set taught = sc.taught || (
      select jsonb_object_agg(code, jsonb_build_object('taught', $5, 'by', $6, 'at', now())) from said)
    where sc.id = (select id from cls) and exists (select 1 from said)
    returning 1
  )
  select case when exists (select 1 from done) then (select count(*)::int from said) else 0 end
$_$;


--
-- Name: sheet_code_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sheet_code_exists(p_qr text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.my_tenant() is not null
     and exists (select 1 from sheet_instance where tenant_id = public.my_tenant() and qr_code = p_qr)
$$;


--
-- Name: sheet_subject(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sheet_subject(p_template uuid) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select min(tp.subject_code)
  from sheet_template t
  join skill s on s.tenant_id = t.tenant_id
    and (s.code = t.skill_set_code or s.code in (select i.skill_set_code from item i where i.id = any(t.item_ids)))
  join topic tp on tp.tenant_id = s.tenant_id and tp.code = s.topic_code
  where t.id = p_template
$$;


--
-- Name: signed_in_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signed_in_staff() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select staff_id from internal.resolve_staff()
$$;


--
-- Name: skill_levels(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.skill_levels(tenant uuid, skill text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  select coalesce(jsonb_object_agg(l.difficulty,
           case when l.looks_like is null then l.rule else l.rule || jsonb_build_object('words', l.looks_like) end),
         '{}'::jsonb)
  from skill_level l where l.tenant_id = $1 and l.skill_code = $2
$_$;


--
-- Name: skill_taught_in(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.skill_taught_in(tenant uuid, skill text, section text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  select coalesce(
    (select (sc.taught -> $2 ->> 'taught')::boolean from school_class sc
       join academic_year y on y.id = sc.academic_year_id
      where sc.tenant_id = $1 and sc.label = $3
      order by y.starts_on desc limit 1),
    (select s.taught from skill s where s.tenant_id = $1 and s.code = $2),
    false)
$_$;


--
-- Name: staff_add(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_add(p_slug text, p_email text, p_name text, p_role text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  t uuid := (select id from tenant where slug = p_slug);
  e text := lower(btrim(p_email));
  had uuid;
  gone boolean;
begin
  select s.id, not s.active into had, gone from pii.staff p join staff s on s.id = p.staff_id
  where p.tenant_id = t and p.email = e;
  if had is not null and not gone then
    return false;
  end if;
  if had is null then
    insert into staff (tenant_id, campus_id, role_code)
    values (t, (select id from campus where tenant_id = t order by created_at limit 1), p_role) returning id into had;
    insert into pii.staff (tenant_id, staff_id, name, email) values (t, had, btrim(p_name), e);
  else
    update staff set active = true, role_code = p_role, classes = '{}', subjects = '{}', created_at = clock_timestamp()
    where id = had;  -- put on the list again, last
    update pii.staff set name = btrim(p_name), password_hash = null, password_set_at = null where staff_id = had;
  end if;
  return true;
end $$;


--
-- Name: staff_list(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_list(p_slug text) RETURNS TABLE(id uuid, email text, name text, role text, password text, password_set_at timestamp with time zone, classes text[], subjects text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select s.id, p.email, p.name, s.role_code, p.password_hash, p.password_set_at,
         case when s.role_code = 'coordinator' then '{}'::text[] else array(select distinct sc.label
               from staff_role_grant g
               join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code and ro.access_group = 'own_classes'
               join school_class sc on sc.id = g.school_class_id
               where g.staff_id = s.id and g.valid_from <= d.day and (g.valid_to is null or g.valid_to > d.day)
               order by 1) end as classes,
         case when s.role_code = 'coordinator' then '{}'::text[] when exists (
                select 1 from staff_role_grant g
                join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code and ro.access_group = 'own_classes'
                where g.staff_id = s.id and g.school_class_id is not null and g.subject_code is null
                  and g.valid_from <= d.day and (g.valid_to is null or g.valid_to > d.day))
              then '{}'::text[]
              else array(select distinct g.subject_code
                         from staff_role_grant g
                         join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code
                                     and ro.access_group = 'own_classes'
                         where g.staff_id = s.id and g.school_class_id is not null and g.subject_code is not null
                           and g.valid_from <= d.day and (g.valid_to is null or g.valid_to > d.day)
                         order by 1)
         end as subjects
  from tenant t
  join staff s on s.tenant_id = t.id and s.active and s.role_code is not null
  join pii.staff p on p.staff_id = s.id
  cross join lateral (select internal.school_day(t.id, now()) as day) d
  where t.slug = p_slug
  order by s.created_at, s.id
$$;


--
-- Name: staff_of_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_of_email(p_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pii', 'public'
    AS $$
declare
  ids uuid[];
  school uuid;
begin
  select array_agg(s.staff_id order by s.id), (array_agg(s.tenant_id order by s.id))[1] into ids, school
  from pii.staff s where s.email = lower(btrim(p_email));
  if ids is null then return null; end if;
  insert into public.access_log (tenant_id, actor, action) values (school, 'staff_of_email', 'lookup_staff_by_email');
  if array_length(ids, 1) <> 1 then return null; end if;
  return ids[1];
end $$;


--
-- Name: staff_sees(text, text[], text[], uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_sees(p_role text, p_classes text[], p_subjects text[], p_staff uuid, p_section text, p_subject text, p_uploaded_by uuid) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(
    p_role = 'coordinator'
    or (p_uploaded_by is not null and p_uploaded_by = p_staff)
    or (p_section = any(p_classes)
        and (cardinality(coalesce(p_subjects, '{}')) = 0 or p_subject is null or p_subject = any(p_subjects))),
    false)
$$;


--
-- Name: staff_sees_capture(text, text[], text[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_sees_capture(p_role text, p_classes text[], p_subjects text[], p_staff uuid, p_capture uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select staff_sees(p_role, p_classes, p_subjects, p_staff, null, null, c.uploaded_by)
           or (c.sheet_instance_id is not null and staff_sees_sheet(p_role, p_classes, p_subjects, p_staff, c.sheet_instance_id))
    from capture c where c.id = p_capture), false)
$$;


--
-- Name: staff_sees_sheet(text, text[], text[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_sees_sheet(p_role text, p_classes text[], p_subjects text[], p_staff uuid, p_sheet uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    when p_role = 'coordinator' then true
    else exists (select 1 from capture c
                 where c.sheet_instance_id = p_sheet and c.superseded_by is null
                   and c.uploaded_by is not null and c.uploaded_by = p_staff)
      or coalesce((
        select s.sec = any (p_classes)
               and (cardinality(coalesce(p_subjects, '{}')) = 0
                    or coalesce(sheet_subject(si.sheet_template_id) = any (p_subjects), true))
        from sheet_instance si
        cross join lateral (
          select coalesce(si.section, (
            select sc.label from enrolment e join school_class sc on sc.id = e.class_id
            where e.child_id = si.child_id
            order by (e.to_date is null) desc, e.to_date desc, e.from_date desc, e.id desc limit 1)) as sec) s
        where si.id = p_sheet), false)
  end
$$;


--
-- Name: staff_set_password(text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_set_password(p_slug text, p_email text, p_hash text, p_at timestamp with time zone) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with done as (
    update pii.staff p set password_hash = p_hash, password_set_at = p_at
    from tenant t, staff s
    where t.slug = p_slug and p.tenant_id = t.id and p.email = lower(btrim(p_email)) and s.id = p.staff_id and s.active
    returning 1)
  select exists (select 1 from done)
$$;


--
-- Name: taught_in(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.taught_in(tenant uuid, topic text, section text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  select exists (
    select 1 from skill s
    where s.tenant_id = $1 and s.topic_code = $2 and public.skill_taught_in($1, s.code, $3))
$_$;


--
-- Name: timetable_standing(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.timetable_standing(p_class uuid, p_fortnight uuid) RETURNS TABLE(state text, signature text, baseline text, approved_by text, approved_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: unplanned_sessions(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unplanned_sessions(p_campus uuid, p_from date, p_to date) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select count(*)::int
  from session s
  join school_class c on c.id = s.school_class_id
  join school_day d on d.id = s.school_day_id
  where c.campus_id = p_campus and d.on_date between p_from and p_to
    and s.state = 'done' and (not s.planned or s.plan_entry_id is null)
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: child; Type: TABLE; Schema: pii; Owner: -
--

CREATE TABLE pii.child (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    home_languages text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    birthday date
);

ALTER TABLE ONLY pii.child FORCE ROW LEVEL SECURITY;


--
-- Name: educator_note; Type: TABLE; Schema: pii; Owner: -
--

CREATE TABLE pii.educator_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    class_id uuid NOT NULL,
    audio_key text,
    transcript text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    status_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sentence text,
    audio_deleted_at timestamp with time zone,
    transcript_cleared_at timestamp with time zone,
    session_id uuid,
    photo_keys text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT educator_note_audio_key_check CHECK ((btrim(audio_key) <> ''::text)),
    CONSTRAINT educator_note_status_check CHECK ((status = ANY (ARRAY['received'::text, 'drafted'::text, 'confirmed'::text, 'left_unconfirmed'::text])))
);

ALTER TABLE ONLY pii.educator_note FORCE ROW LEVEL SECURITY;


--
-- Name: note_claim; Type: TABLE; Schema: pii; Owner: -
--

CREATE TABLE pii.note_claim (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    note_id uuid NOT NULL,
    section text NOT NULL,
    read_as text NOT NULL,
    words text,
    span_start integer NOT NULL,
    span_end integer NOT NULL,
    decision text NOT NULL,
    kept_as text,
    decided_by uuid NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT note_claim_check CHECK ((span_end >= span_start)),
    CONSTRAINT note_claim_check1 CHECK (((decision = 'changed'::text) = (kept_as IS NOT NULL))),
    CONSTRAINT note_claim_decision_check CHECK ((decision = ANY (ARRAY['accepted'::text, 'changed'::text, 'removed'::text]))),
    CONSTRAINT note_claim_section_check CHECK ((btrim(section) <> ''::text)),
    CONSTRAINT note_claim_span_start_check CHECK ((span_start >= 0))
);

ALTER TABLE ONLY pii.note_claim FORCE ROW LEVEL SECURITY;


--
-- Name: staff; Type: TABLE; Schema: pii; Owner: -
--

CREATE TABLE pii.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    password_set_at timestamp with time zone,
    CONSTRAINT staff_email_check CHECK (((email = lower(btrim(email))) AND (email ~~ '%_@_%._%'::text))),
    CONSTRAINT staff_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT staff_password_hash_check CHECK (((password_hash IS NULL) OR (password_hash ~ '^scrypt\$'::text)))
);

ALTER TABLE ONLY pii.staff FORCE ROW LEVEL SECURITY;


--
-- Name: academic_year; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_year (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT academic_year_check CHECK ((ends_on > starts_on)),
    CONSTRAINT academic_year_label_check CHECK ((label ~ '^[0-9]{4}-[0-9]{2}$'::text))
);

ALTER TABLE ONLY public.academic_year FORCE ROW LEVEL SECURITY;


--
-- Name: access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    actor text NOT NULL,
    child_id uuid,
    action text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.access_log FORCE ROW LEVEL SECURITY;


--
-- Name: access_reach; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_reach (
    tenant_id uuid NOT NULL,
    group_code text NOT NULL,
    kind_code text NOT NULL,
    reach text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_reach_group_code_check CHECK ((group_code = ANY (ARRAY['everything'::text, 'own_classes'::text, 'signed_in'::text]))),
    CONSTRAINT access_reach_kind_code_check CHECK ((kind_code = ANY (ARRAY['children'::text, 'enrolment'::text, 'staff'::text, 'notes'::text, 'papers'::text, 'answers'::text, 'learning'::text, 'reports'::text, 'who_looked'::text, 'consent'::text]))),
    CONSTRAINT access_reach_reach_check CHECK ((reach = ANY (ARRAY['all'::text, 'own'::text, 'none'::text])))
);

ALTER TABLE ONLY public.access_reach FORCE ROW LEVEL SECURITY;


--
-- Name: access_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_table (
    schema_name text NOT NULL,
    table_name text NOT NULL,
    kind_code text,
    key_column text,
    key_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    data_class text NOT NULL,
    reason text,
    CONSTRAINT access_table_data_class_check CHECK ((data_class = ANY (ARRAY['child_data'::text, 'school_wide'::text]))),
    CONSTRAINT access_table_key_type_check CHECK ((key_type = ANY (ARRAY['class'::text, 'child'::text, 'note'::text, 'staff'::text, 'sheet'::text, 'capture'::text, 'item_result'::text, 'section'::text, 'child_open'::text, 'run'::text, 'approval_target'::text]))),
    CONSTRAINT access_table_schema_name_check CHECK ((schema_name = ANY (ARRAY['public'::text, 'pii'::text]))),
    CONSTRAINT access_table_shape_check CHECK ((((data_class = 'child_data'::text) AND (kind_code IS NOT NULL) AND (key_column IS NOT NULL) AND (key_type IS NOT NULL) AND (reason IS NULL)) OR ((data_class = 'school_wide'::text) AND (kind_code IS NULL) AND (key_column IS NULL) AND (key_type IS NULL) AND (reason IS NOT NULL) AND (btrim(reason) <> ''::text) AND (reason !~ '[\r\n]'::text))))
);

ALTER TABLE ONLY public.access_table FORCE ROW LEVEL SECURITY;


--
-- Name: activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    band text NOT NULL,
    strand text NOT NULL,
    name text NOT NULL,
    objective text DEFAULT ''::text NOT NULL,
    level_1 text DEFAULT ''::text NOT NULL,
    level_2 text DEFAULT ''::text NOT NULL,
    level_3 text DEFAULT ''::text NOT NULL,
    confidence text DEFAULT ''::text NOT NULL,
    requirement text DEFAULT ''::text NOT NULL,
    printable text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    source_file text DEFAULT ''::text NOT NULL,
    source_tab text DEFAULT ''::text NOT NULL,
    source_row text DEFAULT ''::text NOT NULL,
    source_url text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    materials text DEFAULT ''::text NOT NULL,
    level_0 text DEFAULT ''::text NOT NULL,
    sheet_no text DEFAULT ''::text NOT NULL,
    steps text DEFAULT ''::text NOT NULL,
    thinking text DEFAULT ''::text NOT NULL,
    steps_list jsonb,
    thinking_doc jsonb,
    subject_code text,
    also_bands text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT activity_also_bands_not_home CHECK (((band IS NULL) OR (NOT (band = ANY (also_bands))))),
    CONSTRAINT activity_steps_list_check CHECK (((steps_list IS NULL) OR (jsonb_typeof(steps_list) = 'array'::text))),
    CONSTRAINT activity_thinking_doc_check CHECK (((thinking_doc IS NULL) OR (jsonb_typeof(thinking_doc) = 'object'::text)))
);

ALTER TABLE ONLY public.activity FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN activity.also_bands; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activity.also_bands IS 'The other grades this activity is tagged to besides its own `band` (CP-70). Edited by a coordinator through the engine; every change is a change_log row.';


--
-- Name: activity_material; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_material (
    tenant_id uuid NOT NULL,
    activity_code text NOT NULL,
    material_code text NOT NULL,
    quantity numeric,
    ord integer NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    proposal_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    alt_group integer,
    CONSTRAINT activity_material_alt_group_check CHECK ((alt_group >= 1)),
    CONSTRAINT activity_material_ord_check CHECK ((ord >= 1)),
    CONSTRAINT activity_material_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT activity_material_source_check CHECK ((source = ANY (ARRAY['person'::text, 'machine'::text])))
);

ALTER TABLE ONLY public.activity_material FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN activity_material.alt_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activity_material.alt_group IS 'CP-85: items of one activity with the same number are alternatives (either will do); null is needed on its own. The first by ord is the one the class list shows, with the others named on it.';


--
-- Name: activity_objective; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_objective (
    tenant_id uuid NOT NULL,
    activity_code text NOT NULL,
    lo_code text NOT NULL,
    ord integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    proposal_id uuid,
    CONSTRAINT activity_objective_ord_check CHECK ((ord >= 1)),
    CONSTRAINT activity_objective_source_check CHECK ((source = ANY (ARRAY['school'::text, 'person'::text, 'machine'::text])))
);

ALTER TABLE ONLY public.activity_objective FORCE ROW LEVEL SECURITY;


--
-- Name: activity_observation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_observation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    confirmation_id uuid NOT NULL,
    note_id uuid,
    session_id uuid,
    activity_code text NOT NULL,
    curriculum_version integer,
    child_id uuid NOT NULL,
    class_id uuid NOT NULL,
    outcome text NOT NULL,
    entry_mode text NOT NULL,
    route text NOT NULL,
    expected_level integer NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    stored_at timestamp with time zone DEFAULT now() NOT NULL,
    observed_by uuid NOT NULL,
    confirmed_by uuid NOT NULL,
    supersedes uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reached_level integer,
    CONSTRAINT activity_observation_check CHECK ((supersedes <> id)),
    CONSTRAINT activity_observation_check1 CHECK (((supersedes IS NULL) = (reason IS NULL))),
    CONSTRAINT activity_observation_check2 CHECK (((route = 'voice'::text) = (note_id IS NOT NULL))),
    CONSTRAINT activity_observation_check3 CHECK (((entry_mode <> 'group_as_expected'::text) OR (outcome = 'as_expected'::text))),
    CONSTRAINT activity_observation_check4 CHECK ((observed_at <= stored_at)),
    CONSTRAINT activity_observation_entry_mode_check CHECK ((entry_mode = ANY (ARRAY['individual'::text, 'group_as_expected'::text]))),
    CONSTRAINT activity_observation_expected_level_check CHECK (((expected_level >= 0) AND (expected_level <= 3))),
    CONSTRAINT activity_observation_outcome_check CHECK ((outcome = ANY (ARRAY['above'::text, 'as_expected'::text, 'below'::text, 'not_willing'::text, 'absent'::text]))),
    CONSTRAINT activity_observation_reached_level_check CHECK (((reached_level >= 0) AND (reached_level <= 3))),
    CONSTRAINT activity_observation_reason_check CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT activity_observation_route_check CHECK ((route = ANY (ARRAY['voice'::text, 'form'::text])))
);

ALTER TABLE ONLY public.activity_observation FORCE ROW LEVEL SECURITY;


--
-- Name: change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.change_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    table_name text NOT NULL,
    row_id text NOT NULL,
    op text NOT NULL,
    before jsonb,
    after jsonb,
    staff_id uuid,
    origin text,
    reason text,
    at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT change_log_op_check CHECK ((btrim(op) <> ''::text)),
    CONSTRAINT change_log_reason_check CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT change_log_table_name_check CHECK ((btrim(table_name) <> ''::text))
);

ALTER TABLE ONLY public.change_log FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE change_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.change_log IS 'The one history log (CP-27, docs/data-model.md): who changed what, when, before and after, and why; one row per change, written by internal.change_kept on each table whose history it keeps. Never edited or deleted.';


--
-- Name: activity_part_source; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.activity_part_source WITH (security_invoker='true') AS
 SELECT tenant_id,
    activity_code,
    part,
    source,
    proposal_id,
    staff_id,
    check_me,
    created_at,
    updated_at
   FROM ( SELECT DISTINCT ON (k.tenant_id, k.row_id, (k.after ->> 'part'::text)) k.tenant_id,
            k.row_id AS activity_code,
            (k.after ->> 'part'::text) AS part,
            (k.after ->> 'source'::text) AS source,
            ((k.after ->> 'proposal_id'::text))::uuid AS proposal_id,
            ((k.after ->> 'staff_id'::text))::uuid AS staff_id,
            COALESCE(((k.after ->> 'check_me'::text))::boolean, false) AS check_me,
            min(k.at) OVER (PARTITION BY k.tenant_id, k.row_id, (k.after ->> 'part'::text)) AS created_at,
            k.at AS updated_at
           FROM public.change_log k
          WHERE ((k.table_name = 'activity'::text) AND (k.op = 'part_source'::text))
          ORDER BY k.tenant_id, k.row_id, (k.after ->> 'part'::text), k.at DESC, k.id DESC) m
  WHERE ((source IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.activity a
          WHERE ((a.tenant_id = m.tenant_id) AND (a.code = m.activity_code)))));


--
-- Name: VIEW activity_part_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.activity_part_source IS 'Whose words each part of a K2 activity page is: the newest part_source mark in change_log (CP-27 group 6: once a table).';


--
-- Name: activity_skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_skill (
    tenant_id uuid NOT NULL,
    activity_code text NOT NULL,
    skill_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    proposal_id uuid,
    CONSTRAINT activity_skill_source_check CHECK ((source = ANY (ARRAY['school'::text, 'person'::text, 'machine'::text])))
);

ALTER TABLE ONLY public.activity_skill FORCE ROW LEVEL SECURITY;


--
-- Name: capture; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capture (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    drive_file_id text,
    path text NOT NULL,
    pages integer DEFAULT 0 NOT NULL,
    qr_read text,
    sheet_instance_id uuid,
    status text DEFAULT 'new'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    file_sha256 text,
    superseded_by uuid,
    uploaded_by uuid,
    page_choices jsonb,
    page_prints jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT capture_page_choices_check CHECK ((jsonb_typeof(page_choices) = 'object'::text)),
    CONSTRAINT capture_page_prints_check CHECK ((jsonb_typeof(page_prints) = 'object'::text)),
    CONSTRAINT capture_status_check CHECK ((status = ANY (ARRAY['new'::text, 'resolved'::text, 'needs_rephoto'::text, 'processed'::text, 'error'::text])))
);

ALTER TABLE ONLY public.capture FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN capture.page_choices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.capture.page_choices IS 'a person''s choice on each doubtful page of this capture, by file page: {problem, choice (theirs | not_theirs), by, at}; the one that stands (w3_read/whose_paper.py), each change kept in change_log';


--
-- Name: COLUMN capture.page_prints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.capture.page_prints IS 'Each page of the scan file told once: {file page: {print, code}}, the page picture''s fingerprint and the code printed on it (CP-27 group 6: once the table capture_page). A page may be added; never changed or taken away.';


--
-- Name: item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    item_key text NOT NULL,
    template text NOT NULL,
    rung_code text NOT NULL,
    skill_codes text[] DEFAULT '{}'::text[] NOT NULL,
    signal text NOT NULL,
    fmt text NOT NULL,
    stem text DEFAULT ''::text NOT NULL,
    spec jsonb NOT NULL,
    responses jsonb NOT NULL,
    tags jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'generated'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    times_used integer DEFAULT 0 NOT NULL,
    p_correct numeric(5,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_set_code text,
    difficulty text,
    eval_type public.eval_type DEFAULT 'computable'::public.eval_type NOT NULL,
    skill_set_version integer,
    generator text,
    prompt_id uuid,
    model text,
    corrected_from uuid,
    mistake_skills jsonb DEFAULT '{}'::jsonb NOT NULL,
    case_codes text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT item_source_check CHECK ((source = ANY (ARRAY['generated'::text, 'legacy'::text]))),
    CONSTRAINT item_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))
);

ALTER TABLE ONLY public.item FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN item.eval_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.item.eval_type IS 'Stamped from the skill set when the item is generated, so marking never has to re-derive it.';


--
-- Name: item_result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_result (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    capture_id uuid NOT NULL,
    item_id uuid NOT NULL,
    rid text NOT NULL,
    raw_read text,
    read_confidence numeric(5,4),
    status text NOT NULL,
    misconception_codes text[] DEFAULT '{}'::text[] NOT NULL,
    working_shown text DEFAULT 'none'::text NOT NULL,
    state text DEFAULT 'candidate'::text NOT NULL,
    confirmed_by text,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    curriculum_version integer,
    named_mistakes jsonb,
    CONSTRAINT item_result_named_mistakes_check CHECK ((jsonb_typeof(named_mistakes) = 'object'::text)),
    CONSTRAINT item_result_state_check CHECK ((state = ANY (ARRAY['candidate'::text, 'confirmed'::text, 'rejected'::text]))),
    CONSTRAINT item_result_status_check CHECK ((status = ANY (ARRAY['correct'::text, 'wrong'::text, 'blank'::text, 'unreadable'::text, 'needs_teacher'::text]))),
    CONSTRAINT item_result_working_shown_check CHECK ((working_shown = ANY (ARRAY['none'::text, 'partial'::text, 'full'::text])))
);

ALTER TABLE ONLY public.item_result FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN item_result.named_mistakes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.item_result.named_mistakes IS 'the mistake a person named for this wrong answer, by the reading it was named on: {code (or NONE), proposed, by, at} (w3_read/naming.py); each naming kept in change_log';


--
-- Name: read_correction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.read_correction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    capture_id uuid NOT NULL,
    item_result_id uuid NOT NULL,
    model_read text DEFAULT ''::text NOT NULL,
    human_read text NOT NULL,
    misconception_codes text[] DEFAULT '{}'::text[] NOT NULL,
    by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    judged text,
    CONSTRAINT read_correction_judged_check CHECK ((judged = ANY (ARRAY['correct'::text, 'wrong'::text, 'blank'::text])))
);

ALTER TABLE ONLY public.read_correction FORCE ROW LEVEL SECURITY;


--
-- Name: sheet_instance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sheet_instance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    qr_code text NOT NULL,
    sheet_template_id uuid NOT NULL,
    child_id uuid,
    print_status text DEFAULT 'new'::text NOT NULL,
    pdf_path text,
    printed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    key jsonb,
    week date,
    section text,
    kind text,
    replaced_by uuid,
    CONSTRAINT sheet_instance_kind_check CHECK (((kind IS NULL) OR (kind = ANY (ARRAY['practice'::text, 'assessment'::text, 'focus'::text, 'custom'::text])))),
    CONSTRAINT sheet_instance_print_status_check CHECK ((print_status = ANY (ARRAY['new'::text, 'printed'::text, 'with_teacher'::text, 'returned'::text, 'void'::text]))),
    CONSTRAINT sheet_instance_printed_needs_approver CHECK (((print_status <> 'printed'::text) OR (approved_by IS NOT NULL)))
);

ALTER TABLE ONLY public.sheet_instance FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN sheet_instance.replaced_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sheet_instance.replaced_by IS 'The copy an edit made of this paper (CP-27 group 6: once the table paper_edit); the edit is a change_log row.';


--
-- Name: sheet_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sheet_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    band text NOT NULL,
    level text,
    variant integer DEFAULT 1 NOT NULL,
    week date,
    batch_id text,
    item_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    key jsonb DEFAULT '{}'::jsonb NOT NULL,
    html_path text,
    source text DEFAULT 'generated'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_set_code text,
    difficulty text,
    child_id uuid,
    code text,
    retired_at timestamp with time zone,
    CONSTRAINT sheet_template_focus_is_for_a_child CHECK (((source <> 'focus'::text) OR (child_id IS NOT NULL))),
    CONSTRAINT sheet_template_level_check CHECK (((level IS NULL) OR (level = ANY (ARRAY['Lm'::text, 'L0'::text, 'Lp'::text])))),
    CONSTRAINT sheet_template_library_has_a_code CHECK (((source = 'library'::text) = (code IS NOT NULL))),
    CONSTRAINT sheet_template_source_check CHECK ((source = ANY (ARRAY['generated'::text, 'legacy'::text, 'library'::text, 'focus'::text]))),
    CONSTRAINT sheet_template_week_unless_library CHECK (((week IS NOT NULL) OR (source = 'library'::text) OR ((key ->> 'week'::text) IS NOT NULL)))
);

ALTER TABLE ONLY public.sheet_template FORCE ROW LEVEL SECURITY;


--
-- Name: answer_checked; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.answer_checked WITH (security_invoker='true') AS
 WITH latest AS (
         SELECT DISTINCT ON (rc.item_result_id) rc.item_result_id,
            rc.human_read,
            rc.judged,
            rc.by
           FROM public.read_correction rc
          ORDER BY rc.item_result_id, rc.created_at DESC
        )
 SELECT r.id AS item_result_id,
    r.tenant_id,
    si.child_id,
    c.id AS capture_id,
    c.path,
    c.pages AS file_pages,
    c.created_at AS read_at,
    (c.created_at)::date AS read_on,
    i.fmt,
    i.item_key,
    COALESCE((((r.raw_read)::jsonb ->> 'page'::text))::integer, ((i.spec ->> 'page'::text))::integer, 1) AS page,
    t.batch_id AS paper,
    COALESCE(((r.raw_read)::jsonb ->> 'child_answer'::text), ''::text) AS reading,
    COALESCE(l.human_read, ((r.raw_read)::jsonb ->> 'child_answer'::text), ''::text) AS label,
        CASE
            WHEN (l.item_result_id IS NOT NULL) THEN 'typed'::text
            ELSE 'signed off'::text
        END AS how,
    l.by,
    COALESCE((((r.raw_read)::jsonb ->> 'confidence'::text))::double precision, (0)::double precision) AS confidence,
    COALESCE(((r.raw_read)::jsonb ->> 'why'::text), ''::text) AS why,
    COALESCE(((r.raw_read)::jsonb ->> 'answer_state'::text), ''::text) AS answer_state,
    COALESCE(((r.raw_read)::jsonb ->> 'guess'::text), ''::text) AS guess,
    ((r.raw_read)::jsonb -> 'box'::text) AS box,
    ((r.raw_read)::jsonb ->> 'crop'::text) AS crop,
    ((COALESCE(((r.raw_read)::jsonb ->> 'why'::text), ''::text) = ''::text) OR (((r.raw_read)::jsonb ->> 'why'::text) ~~ 'read as%'::text)) AS stood,
    (regexp_replace(lower(COALESCE(((r.raw_read)::jsonb ->> 'child_answer'::text), ''::text)), '[\s,]'::text, ''::text, 'g'::text) = regexp_replace(lower(COALESCE(l.human_read, ((r.raw_read)::jsonb ->> 'child_answer'::text), ''::text)), '[\s,]'::text, ''::text, 'g'::text)) AS reader_right,
    COALESCE((((r.raw_read)::jsonb ->> 'file_page'::text))::integer, (((r.raw_read)::jsonb ->> 'page'::text))::integer, ((i.spec ->> 'page'::text))::integer, 1) AS file_page,
    (COALESCE(((r.raw_read)::jsonb ->> 'why'::text), ''::text) ~~ '%not a number%'::text) AS never_read,
    ((r.raw_read)::jsonb ? 'boxes'::text) AS in_boxes
   FROM (((((public.item_result r
     JOIN public.item i ON ((i.id = r.item_id)))
     JOIN public.capture c ON ((c.id = r.capture_id)))
     JOIN public.sheet_instance si ON ((si.id = c.sheet_instance_id)))
     JOIN public.sheet_template t ON ((t.id = si.sheet_template_id)))
     LEFT JOIN latest l ON ((l.item_result_id = r.id)))
  WHERE ((c.superseded_by IS NULL) AND (l.judged IS NULL) AND ((l.item_result_id IS NOT NULL) OR ((r.state = 'confirmed'::text) AND (COALESCE(((r.raw_read)::jsonb ->> 'why'::text), ''::text) <> ''::text))));


--
-- Name: VIEW answer_checked; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.answer_checked IS 'Every answer a person checked: typed, or signed off after it waited for a person (its reading carries why). The reader''s reading, the person''s label, the crop, the kind, the day read, and whether it was read in boxes. What the notebook, kind_trust, engine read report and Marking count from (ADR 0032).';


--
-- Name: evidence_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidence_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    skill_code text NOT NULL,
    rung_code text,
    correct boolean,
    misconception_codes text[] DEFAULT '{}'::text[] NOT NULL,
    channel text NOT NULL,
    item_result_id uuid,
    observed_at timestamp with time zone NOT NULL,
    stored_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'written'::text NOT NULL,
    mark text,
    seen_by text,
    place text,
    source text,
    curriculum_version integer,
    observation_id uuid,
    CONSTRAINT evidence_event_channel_check CHECK ((channel = ANY (ARRAY['item'::text, 'teacher_override'::text, 'educator'::text]))),
    CONSTRAINT evidence_event_kind_check CHECK ((kind = ANY (ARRAY['written'::text, 'observed'::text, 'voice'::text, 'project'::text, 'performance'::text]))),
    CONSTRAINT evidence_event_place_check CHECK ((btrim(place) <> ''::text)),
    CONSTRAINT evidence_event_seen_by_check CHECK ((btrim(seen_by) <> ''::text)),
    CONSTRAINT evidence_event_source_check CHECK ((btrim(source) <> ''::text)),
    CONSTRAINT evidence_event_written_has_rung CHECK (((kind <> 'written'::text) OR (rung_code IS NOT NULL)))
);

ALTER TABLE ONLY public.evidence_event FORCE ROW LEVEL SECURITY;


--
-- Name: evidence_placed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.evidence_placed WITH (security_invoker='true') AS
 SELECT e.id,
    e.tenant_id,
    e.child_id,
    e.skill_code,
    e.rung_code,
    e.correct,
    e.misconception_codes,
    e.channel,
    e.item_result_id,
    e.observed_at,
    e.stored_at,
    e.confirmed_by,
    e.created_at,
    e.updated_at,
    COALESCE(i.rung_code, e.rung_code) AS placed_rung
   FROM ((public.evidence_event e
     LEFT JOIN public.item_result r ON ((r.id = e.item_result_id)))
     LEFT JOIN public.item i ON ((i.id = r.item_id)))
  WHERE ((e.kind = 'written'::text) AND ((e.item_result_id IS NULL) OR (e.created_at = ( SELECT max(e2.created_at) AS max
           FROM public.evidence_event e2
          WHERE (e2.item_result_id = e.item_result_id)))));


--
-- Name: answer_placed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.answer_placed WITH (security_invoker='true') AS
 SELECT COALESCE(e.item_result_id, e.id) AS answer,
    e.item_result_id,
    e.tenant_id,
    e.child_id,
    e.placed_rung,
    e.correct,
    e.confirmed_by,
    e.observed_at,
    array_agg(DISTINCT e.skill_code ORDER BY e.skill_code) AS skill_codes,
    COALESCE(array_agg(DISTINCT m.code ORDER BY m.code) FILTER (WHERE (m.code IS NOT NULL)), '{}'::text[]) AS misconception_codes
   FROM (public.evidence_placed e
     LEFT JOIN LATERAL unnest(e.misconception_codes) m(code) ON (true))
  GROUP BY COALESCE(e.item_result_id, e.id), e.item_result_id, e.tenant_id, e.child_id, e.placed_rung, e.correct, e.confirmed_by, e.observed_at;


--
-- Name: answer_standing; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.answer_standing WITH (security_invoker='true') AS
 SELECT r.id AS item_result_id,
    r.tenant_id,
    c.sheet_instance_id,
    si.child_id,
        CASE
            WHEN (r.status = ANY (ARRAY['unreadable'::text, 'needs_teacher'::text])) THEN 'waiting'::text
            WHEN (EXISTS ( SELECT 1
               FROM public.read_correction rc
              WHERE (rc.item_result_id = r.id))) THEN 'person'::text
            ELSE 'engine'::text
        END AS standing,
    (r.state = 'confirmed'::text) AS signed_off
   FROM ((public.item_result r
     JOIN public.capture c ON ((c.id = r.capture_id)))
     JOIN public.sheet_instance si ON ((si.id = c.sheet_instance_id)))
  WHERE (c.superseded_by IS NULL);


--
-- Name: VIEW answer_standing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.answer_standing IS 'Each answer on a live read: waiting (for a person), engine (settled by the engine), person (checked by a person); and whether a person has signed it off. The one definition Marking and `engine read waiting` count from.';


--
-- Name: approval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    target text NOT NULL,
    decision text NOT NULL,
    reason text,
    by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    detail jsonb,
    seq bigint NOT NULL,
    CONSTRAINT approval_accept_has_reason CHECK (((decision <> 'accept'::text) OR (reason IS NOT NULL))),
    CONSTRAINT approval_by_check CHECK ((btrim(by) <> ''::text)),
    CONSTRAINT approval_check CHECK (((decision <> 'sent_back'::text) OR (reason IS NOT NULL))),
    CONSTRAINT approval_decision_check CHECK (
CASE kind
    WHEN 'fortnight'::text THEN (decision = ANY (ARRAY['freeze'::text, 'align'::text, 'approve'::text, 'list_sent'::text]))
    WHEN 'timetable'::text THEN (decision = 'approve'::text)
    WHEN 'timetable_live'::text THEN (decision = 'go_live'::text)
    WHEN 'timetable_clash'::text THEN (decision = 'accept'::text)
    WHEN 'week'::text THEN (decision = 'confirmed'::text)
    WHEN 'item'::text THEN (decision = ANY (ARRAY['retire'::text, 'keep'::text]))
    WHEN 'calibration'::text THEN (decision = 'looked_at'::text)
    WHEN 'class_card'::text THEN (decision = 'confirmed'::text)
    ELSE (decision = ANY (ARRAY['approved'::text, 'sent_back'::text, 'withdrawn'::text]))
END),
    CONSTRAINT approval_kind_check CHECK ((kind = ANY (ARRAY['materials_ack'::text, 'fortnight'::text, 'timetable'::text, 'timetable_live'::text, 'timetable_clash'::text, 'week'::text, 'skill_level'::text, 'question_type'::text, 'parent_note'::text, 'sheet'::text, 'skill_prerequisite'::text, 'item'::text, 'calibration'::text, 'class_card'::text, 'report_line'::text, 'curriculum_link'::text, 'objective_order'::text, 'expense'::text]))),
    CONSTRAINT approval_reason_check CHECK ((btrim(reason) <> ''::text))
);

ALTER TABLE ONLY public.approval FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN approval.detail; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval.detail IS 'what the decision was taken on (a class card as seen, the counts a level was looked at on); kept_in: the table a row was moved from (CP-27)';


--
-- Name: COLUMN approval.seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval.seq IS 'the order decisions were taken in: the first approval is the first after the latest withdrawal';


--
-- Name: parent_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    week date NOT NULL,
    body text NOT NULL,
    prompt_version integer,
    approved_by text,
    sent_at timestamp with time zone,
    channel text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lines jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT parent_note_lines_array CHECK ((jsonb_typeof(lines) = 'array'::text))
);

ALTER TABLE ONLY public.parent_note FORCE ROW LEVEL SECURITY;


--
-- Name: question_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_type (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    fmt text NOT NULL,
    words text NOT NULL,
    reaches text DEFAULT 'printed'::text NOT NULL,
    marked public.eval_type[] NOT NULL,
    own_words boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT question_type_marked_check CHECK ((cardinality(marked) > 0)),
    CONSTRAINT question_type_reaches_check CHECK ((reaches = ANY (ARRAY['printed'::text, 'read_aloud'::text, 'drawn'::text])))
);

ALTER TABLE ONLY public.question_type FORCE ROW LEVEL SECURITY;


--
-- Name: skill_level; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_level (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    skill_code text NOT NULL,
    difficulty text NOT NULL,
    grade text NOT NULL,
    learning_objective text,
    looks_like text,
    rule jsonb NOT NULL,
    confirmed_by text,
    confirmed_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skill_level_rule_shape CHECK (((jsonb_typeof(rule) = 'object'::text) AND (NOT (rule ? 'words'::text))))
);

ALTER TABLE ONLY public.skill_level FORCE ROW LEVEL SECURITY;


--
-- Name: approval_list; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.approval_list WITH (security_invoker='true') AS
 WITH listed AS (
         SELECT l.tenant_id,
            'skill_level'::text AS kind,
            ((l.skill_code || ' '::text) || l.difficulty) AS target
           FROM public.skill_level l
        UNION ALL
         SELECT q.tenant_id,
            'question_type'::text,
            q.code
           FROM public.question_type q
        UNION ALL
         SELECT n.tenant_id,
            'parent_note'::text,
            (n.id)::text AS id
           FROM public.parent_note n
        ), firsts AS (
         SELECT f.tenant_id,
            f.kind,
            f.target,
            a.by AS first_by,
            a.created_at AS first_at,
            w.since
           FROM ((listed f
             CROSS JOIN LATERAL ( SELECT COALESCE(max(x.seq), (0)::bigint) AS since
                   FROM public.approval x
                  WHERE ((x.tenant_id = f.tenant_id) AND (x.kind = f.kind) AND (x.target = f.target) AND (x.decision = 'withdrawn'::text))) w)
             LEFT JOIN LATERAL ( SELECT x.by,
                    x.created_at
                   FROM public.approval x
                  WHERE ((x.tenant_id = f.tenant_id) AND (x.kind = f.kind) AND (x.target = f.target) AND (x.decision = 'approved'::text) AND (x.seq > w.since))
                  ORDER BY x.seq
                 LIMIT 1) a ON (true))
        ), stood AS (
         SELECT f.tenant_id,
            f.kind,
            f.target,
            f.first_by,
            f.first_at,
            f.since,
            (f.kind = 'parent_note'::text) AS reaches_parent,
            ( SELECT a.reason
                   FROM public.approval a
                  WHERE ((a.tenant_id = f.tenant_id) AND (a.kind = f.kind) AND (a.target = f.target) AND (a.decision = 'sent_back'::text) AND ((f.first_at IS NULL) OR (a.created_at > f.first_at)))
                  ORDER BY a.created_at DESC, a.seq DESC
                 LIMIT 1) AS sent_back_because,
            ( SELECT a.created_at
                   FROM public.approval a
                  WHERE ((a.tenant_id = f.tenant_id) AND (a.kind = f.kind) AND (a.target = f.target) AND (a.decision = 'sent_back'::text) AND ((f.first_at IS NULL) OR (a.created_at > f.first_at)))
                  ORDER BY a.created_at DESC, a.seq DESC
                 LIMIT 1) AS sent_back_at,
            ( SELECT a.by
                   FROM public.approval a
                  WHERE ((a.tenant_id = f.tenant_id) AND (a.kind = f.kind) AND (a.target = f.target) AND (a.decision = 'approved'::text) AND (a.seq > f.since) AND (a.by <> f.first_by))
                  ORDER BY a.seq DESC
                 LIMIT 1) AS second_by
           FROM firsts f
        )
 SELECT tenant_id,
    kind,
    target,
    first_by,
    first_at,
    second_by,
    sent_back_because,
        CASE
            WHEN ((sent_back_at IS NOT NULL) AND (second_by IS NULL)) THEN 'sent_back'::text
            WHEN (first_by IS NULL) THEN 'draft'::text
            WHEN (reaches_parent AND (second_by IS NULL)) THEN 'waiting_second'::text
            ELSE 'approved'::text
        END AS state
   FROM stood;


--
-- Name: approval_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.approval ALTER COLUMN seq ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.approval_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ask; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ask (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    ord integer DEFAULT 0 NOT NULL,
    for_role text NOT NULL,
    question text NOT NULL,
    drafted text NOT NULL,
    why text,
    source text NOT NULL,
    link text,
    answer text,
    correction text,
    answered_by text,
    answered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ask_answer_check CHECK ((answer = ANY (ARRAY['agreed'::text, 'corrected'::text]))),
    CONSTRAINT ask_check CHECK ((((answer IS NULL) = (answered_by IS NULL)) AND ((answer IS NULL) = (answered_at IS NULL)))),
    CONSTRAINT ask_check1 CHECK (((answer = 'corrected'::text) = (COALESCE(correction, ''::text) <> ''::text)))
);

ALTER TABLE ONLY public.ask FORCE ROW LEVEL SECURITY;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    on_date date NOT NULL,
    program text NOT NULL,
    status text NOT NULL,
    in_time time without time zone,
    out_time time without time zone,
    minutes integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_minutes_check CHECK (((minutes IS NULL) OR (minutes >= 0))),
    CONSTRAINT attendance_program_check CHECK ((btrim(program) <> ''::text)),
    CONSTRAINT attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'leave'::text])))
);

ALTER TABLE ONLY public.attendance FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE attendance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.attendance IS 'Attendance per child per day (CP-42): present, absent or leave, with the in and out times and the minutes the report gives. Loaded from the school''s report by `POST /attendance/load`; never holds a name or who marked it.';


--
-- Name: campus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campus_name_check CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE ONLY public.campus FORCE ROW LEVEL SECURITY;


--
-- Name: case_dimension; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_dimension (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    allowed_values text[] DEFAULT '{}'::text[] NOT NULL,
    dimension_order integer,
    source text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.case_dimension FORCE ROW LEVEL SECURITY;


--
-- Name: child; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.child (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    band text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.child FORCE ROW LEVEL SECURITY;


--
-- Name: child_level_state; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.child_level_state WITH (security_invoker='true') AS
 SELECT tenant_id,
    child_id,
    unit AS skill_code,
    difficulty,
    public.graph_state_of(tenant_id, (n_events)::numeric, share, (days)::numeric, (adults)::numeric, (min_adults)::numeric, repeating, latest_share, rechecked, harder) AS state,
    n_events,
    n_correct,
    latest_at AS last_seen
   FROM public.graph_level_window() w(scope, tenant_id, child_id, unit, rung_code, difficulty, level_ord, n_events, n_correct, share, days, adults, latest_share, repeating, rechecked, harder, latest_at, min_adults)
  WHERE ((scope = 'set'::text) AND (difficulty IS NOT NULL));


--
-- Name: enrolment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrolment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    class_id uuid NOT NULL,
    roll_no text NOT NULL,
    from_date date NOT NULL,
    to_date date,
    recorded_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enrolment_check CHECK (((to_date IS NULL) OR (to_date >= from_date))),
    CONSTRAINT enrolment_recorded_by_check CHECK ((btrim(recorded_by) <> ''::text)),
    CONSTRAINT enrolment_roll_no_check CHECK ((roll_no ~ '^[A-Za-z0-9-]{1,8}$'::text))
);

ALTER TABLE ONLY public.enrolment FORCE ROW LEVEL SECURITY;


--
-- Name: school_class; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_class (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campus_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    grade_code text NOT NULL,
    section text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    label text NOT NULL,
    taught jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT school_class_label_check CHECK ((btrim(label) <> ''::text)),
    CONSTRAINT school_class_section_check CHECK ((btrim(section) <> ''::text)),
    CONSTRAINT school_class_taught_check CHECK ((jsonb_typeof(taught) = 'object'::text))
);

ALTER TABLE ONLY public.school_class FORCE ROW LEVEL SECURITY;


--
-- Name: child_now; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.child_now WITH (security_invoker='true') AS
 SELECT c.id,
    c.tenant_id,
    c.band,
    c.active,
    c.created_at,
    c.updated_at,
    e.class_id,
    sc.label AS section,
    e.roll_no
   FROM ((public.enrolment e
     JOIN public.child c ON ((c.id = e.child_id)))
     JOIN public.school_class sc ON ((sc.id = e.class_id)))
  WHERE (e.to_date IS NULL)
UNION ALL
 SELECT c.id,
    c.tenant_id,
    c.band,
    c.active,
    c.created_at,
    c.updated_at,
    e.class_id,
    sc.label AS section,
    e.roll_no
   FROM ((public.enrolment e
     JOIN public.child c ON ((c.id = e.child_id)))
     JOIN public.school_class sc ON ((sc.id = e.class_id)))
  WHERE ((e.to_date IS NOT NULL) AND (NOT (EXISTS ( SELECT
           FROM public.enrolment o
          WHERE ((o.child_id = e.child_id) AND ((o.to_date IS NULL) OR (ROW(o.to_date, o.from_date, o.id) > ROW(e.to_date, e.from_date, e.id))))))))
UNION ALL
 SELECT c.id,
    c.tenant_id,
    c.band,
    c.active,
    c.created_at,
    c.updated_at,
    NULL::uuid AS class_id,
    NULL::text AS section,
    NULL::text AS roll_no
   FROM public.child c
  WHERE (NOT (EXISTS ( SELECT
           FROM public.enrolment o
          WHERE (o.child_id = c.id))));


--
-- Name: child_skill_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.child_skill_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    skill_code text NOT NULL,
    rung_code text,
    state text NOT NULL,
    n_events integer DEFAULT 0 NOT NULL,
    n_correct integer DEFAULT 0 NOT NULL,
    repeating_misconception text,
    last_seen timestamp with time zone,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    difficulty text,
    kind text DEFAULT 'written'::text NOT NULL,
    grade_code text,
    named_days integer,
    adults integer,
    first_named_yes date,
    rechecked_on date,
    CONSTRAINT child_skill_state_kind_check CHECK ((kind = ANY (ARRAY['written'::text, 'observed'::text]))),
    CONSTRAINT child_skill_state_kind_fits CHECK (
CASE kind
    WHEN 'written'::text THEN ((rung_code IS NOT NULL) AND (grade_code IS NULL) AND (named_days IS NULL) AND (adults IS NULL))
    ELSE ((rung_code IS NULL) AND (grade_code IS NOT NULL) AND (named_days IS NOT NULL) AND (adults IS NOT NULL) AND (last_seen IS NOT NULL))
END)
);

ALTER TABLE ONLY public.child_skill_state FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN child_skill_state.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.child_skill_state.kind IS 'written: from a child''s answers (by rung); observed: from what educators confirmed seeing (by grade; CP-27 group 6, once the table child_observed_state). The written graph, its readers and engine past read written only.';


--
-- Name: child_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.child_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    ord integer NOT NULL,
    words text NOT NULL,
    colour text NOT NULL,
    needs_work boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    enough boolean DEFAULT true NOT NULL,
    severity integer DEFAULT 0 NOT NULL,
    move_up boolean DEFAULT false NOT NULL,
    nearly boolean DEFAULT false NOT NULL,
    card_group text,
    why text,
    CONSTRAINT child_state_colour_check CHECK ((colour = ANY (ARRAY['red'::text, 'amber'::text, 'green'::text, 'grey'::text])))
);

ALTER TABLE ONLY public.child_state FORCE ROW LEVEL SECURITY;


--
-- Name: config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.config FORCE ROW LEVEL SECURITY;


--
-- Name: consent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    decision text NOT NULL,
    given_by text NOT NULL,
    how text NOT NULL,
    recorded_by text NOT NULL,
    register text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consent_decision_check CHECK ((decision = ANY (ARRAY['given'::text, 'withdrawn'::text]))),
    CONSTRAINT consent_given_by_check CHECK ((btrim(given_by) <> ''::text)),
    CONSTRAINT consent_how_check CHECK ((btrim(how) <> ''::text)),
    CONSTRAINT consent_recorded_by_check CHECK ((btrim(recorded_by) <> ''::text))
);

ALTER TABLE ONLY public.consent FORCE ROW LEVEL SECURITY;


--
-- Name: consent_now; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.consent_now WITH (security_invoker='true') AS
 SELECT DISTINCT ON (child_id) tenant_id,
    child_id,
    decision,
    given_by,
    how,
    recorded_by,
    created_at,
    (register = internal.data_register_fingerprint(tenant_id)) AS register_unchanged
   FROM public.consent c
  ORDER BY child_id, created_at DESC, id DESC;


--
-- Name: curriculum_proposal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_proposal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    about uuid,
    run_id uuid NOT NULL,
    kind text NOT NULL,
    subject_code text NOT NULL,
    proposal jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric,
    proposer text DEFAULT ''::text NOT NULL,
    validator text DEFAULT ''::text NOT NULL,
    problems text[] DEFAULT '{}'::text[] NOT NULL,
    verdict text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    curriculum_version integer,
    staff_id uuid,
    machine text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT curriculum_proposal_check CHECK (((about IS NULL) OR (about <> id))),
    CONSTRAINT curriculum_proposal_check1 CHECK (((staff_id IS NOT NULL) OR (machine IS NOT NULL))),
    CONSTRAINT curriculum_proposal_check2 CHECK (((status <> ALL (ARRAY['approved'::text, 'rejected'::text])) OR (about IS NULL) OR (staff_id IS NOT NULL))),
    CONSTRAINT curriculum_proposal_check3 CHECK (
CASE
    WHEN (about IS NULL) THEN (status = ANY (ARRAY['auto_passed'::text, 'needs_person'::text, 'rejected'::text]))
    ELSE (status = ANY (ARRAY['approved'::text, 'rejected'::text, 'applied'::text, 'reverted'::text]))
END),
    CONSTRAINT curriculum_proposal_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT curriculum_proposal_kind_check CHECK ((kind = ANY (ARRAY['skill_group'::text, 'plan_link'::text, 'materials_note'::text, 'skill'::text, 'objective'::text, 'levels'::text, 'lo_skill'::text, 'page_part'::text, 'material'::text, 'skill_offer'::text, 'mislevelled'::text, 'new_mistake'::text]))),
    CONSTRAINT curriculum_proposal_machine_check CHECK ((btrim(machine) <> ''::text)),
    CONSTRAINT curriculum_proposal_status_check CHECK ((status = ANY (ARRAY['auto_passed'::text, 'needs_person'::text, 'rejected'::text, 'approved'::text, 'applied'::text, 'reverted'::text]))),
    CONSTRAINT curriculum_proposal_subject_code_check CHECK ((btrim(subject_code) <> ''::text)),
    CONSTRAINT curriculum_proposal_verdict_check CHECK ((verdict = ANY (ARRAY[''::text, 'agree'::text, 'disagree'::text])))
);

ALTER TABLE ONLY public.curriculum_proposal FORCE ROW LEVEL SECURITY;


--
-- Name: curriculum_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    number integer NOT NULL,
    published_by text NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    takes_effect date NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skills jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT curriculum_version_number_check CHECK ((number > 0)),
    CONSTRAINT curriculum_version_published_by_check CHECK ((btrim(published_by) <> ''::text)),
    CONSTRAINT curriculum_version_skills_check CHECK ((jsonb_typeof(skills) = 'object'::text)),
    CONSTRAINT curriculum_version_takes_effect_check CHECK ((EXTRACT(isodow FROM takes_effect) = (1)::numeric))
);

ALTER TABLE ONLY public.curriculum_version FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN curriculum_version.skills; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.curriculum_version.skills IS 'Every skill at its version when this version was published: {skill: version} (CP-27 group 6: once the table curriculum_version_skill).';


--
-- Name: data_register; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_register (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    ord integer NOT NULL,
    what text NOT NULL,
    why text NOT NULL,
    how_long text NOT NULL,
    who_sees text NOT NULL,
    tables text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT data_register_how_long_check CHECK ((btrim(how_long) <> ''::text)),
    CONSTRAINT data_register_tables_check CHECK ((cardinality(tables) > 0)),
    CONSTRAINT data_register_what_check CHECK ((btrim(what) <> ''::text)),
    CONSTRAINT data_register_who_sees_check CHECK ((btrim(who_sees) <> ''::text)),
    CONSTRAINT data_register_why_check CHECK ((btrim(why) <> ''::text))
);

ALTER TABLE ONLY public.data_register FORCE ROW LEVEL SECURITY;


--
-- Name: difficulty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.difficulty (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    ord integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    letter text
);

ALTER TABLE ONLY public.difficulty FORCE ROW LEVEL SECURITY;


--
-- Name: skill_level_question_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_level_question_type (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    skill_code text NOT NULL,
    difficulty text NOT NULL,
    question_type text NOT NULL,
    place integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    declared boolean DEFAULT true NOT NULL,
    stopped_at timestamp with time zone,
    stopped_by text,
    removed_at timestamp with time zone,
    removed_by text,
    CONSTRAINT skill_level_question_type_removed_check CHECK ((((removed_at IS NULL) = (removed_by IS NULL)) AND (btrim(removed_by) <> ''::text))),
    CONSTRAINT skill_level_question_type_stopped_check CHECK ((((stopped_at IS NULL) = (stopped_by IS NULL)) AND (btrim(stopped_by) <> ''::text)))
);

ALTER TABLE ONLY public.skill_level_question_type FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN skill_level_question_type.stopped_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_level_question_type.stopped_at IS 'an educator stopped the kind at this level (w1_bank/retire.py): no new paper draws it here (kind_stopped)';


--
-- Name: COLUMN skill_level_question_type.removed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_level_question_type.removed_at IS 'a person took the kind from this English level (w1_bank/english_edit.py): kept, so a load does not bring it back';


--
-- Name: kind_stopped; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.kind_stopped WITH (security_invoker='true') AS
 SELECT tenant_id,
    skill_code,
    difficulty,
    question_type,
    true AS stopped,
    stopped_by AS changed_by,
    stopped_at AS created_at
   FROM public.skill_level_question_type
  WHERE (stopped_at IS NOT NULL);


--
-- Name: drawable_item; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.drawable_item WITH (security_invoker='true') AS
 SELECT i.id,
    i.tenant_id,
    i.item_key,
    i.template,
    i.rung_code,
    i.skill_codes,
    i.signal,
    i.fmt,
    i.stem,
    i.spec,
    i.responses,
    i.tags,
    i.source,
    i.status,
    i.times_used,
    i.p_correct,
    i.created_at,
    i.updated_at,
    i.skill_set_code,
    i.difficulty,
    i.eval_type,
    i.skill_set_version,
    i.generator,
    i.prompt_id,
    i.model,
    i.corrected_from,
    i.mistake_skills,
    i.case_codes,
    q.question_type
   FROM (((public.item i
     CROSS JOIN LATERAL ( SELECT public.question_type_of(i.fmt, i.template) AS question_type
         OFFSET 0) q)
     JOIN public.skill_level l ON (((l.tenant_id = i.tenant_id) AND (l.skill_code = i.skill_set_code) AND (l.difficulty = i.difficulty))))
     CROSS JOIN LATERAL ( SELECT a.decision
           FROM public.approval a
          WHERE ((a.tenant_id = i.tenant_id) AND (a.kind = 'question_type'::text) AND (a.target = q.question_type) AND (a.decision = ANY (ARRAY['approved'::text, 'withdrawn'::text])))
          ORDER BY a.seq DESC
         LIMIT 1) w)
  WHERE ((i.status = 'active'::text) AND (l.confirmed_at IS NOT NULL) AND (w.decision = 'approved'::text) AND (NOT (EXISTS ( SELECT 1
           FROM public.kind_stopped k
          WHERE ((k.tenant_id = i.tenant_id) AND (k.skill_code = i.skill_set_code) AND (k.difficulty = i.difficulty) AND (k.question_type = q.question_type))))));


--
-- Name: english_sample; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.english_sample (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    skill_code text NOT NULL,
    difficulty text NOT NULL,
    question_type text NOT NULL,
    ord smallint NOT NULL,
    ask text NOT NULL,
    passage_code text,
    text text,
    options jsonb,
    answer jsonb NOT NULL,
    accept jsonb DEFAULT '[]'::jsonb NOT NULL,
    rubric_code text,
    key_points jsonb,
    must_contain jsonb,
    not_words jsonb,
    worked_out jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    wrong jsonb DEFAULT '[]'::jsonb NOT NULL,
    removed_at timestamp with time zone,
    made_from smallint,
    CONSTRAINT english_sample_made_from_check CHECK ((made_from >= 1)),
    CONSTRAINT english_sample_ord_check CHECK ((ord >= 1)),
    CONSTRAINT english_sample_wrong_check CHECK ((jsonb_typeof(wrong) = 'array'::text))
);

ALTER TABLE ONLY public.english_sample FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN english_sample.wrong; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.english_sample.wrong IS 'The likely wrong answers, [{answer, mistake_code}] by answer (CP-27 group 6: once the table english_sample_wrong); a code is a misconception''s (engine load --check).';


--
-- Name: COLUMN english_sample.removed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.english_sample.removed_at IS 'When an educator took the sample off its level; what each change replaced is a change_log row (table english_sample, row `skill level kind ord`).';


--
-- Name: english_sample_now; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.english_sample_now WITH (security_invoker='true') AS
 SELECT e.tenant_id,
    e.skill_code,
    e.difficulty,
    e.question_type,
    e.ord,
    e.ask,
    e.passage_code,
    e.text,
    e.options,
    e.answer,
    e.accept,
    e.rubric_code,
    e.key_points,
    e.not_words,
    e.wrong,
    h.edited_by,
    h.edited_at,
    GREATEST((h.n - 1), (0)::bigint) AS earlier,
    e.made_from
   FROM (public.english_sample e
     CROSS JOIN LATERAL ( SELECT (array_agg(k.origin ORDER BY k.at DESC, k.id DESC))[1] AS edited_by,
            max(k.at) AS edited_at,
            count(*) AS n
           FROM public.change_log k
          WHERE ((k.tenant_id = e.tenant_id) AND (k.table_name = 'english_sample'::text) AND (k.row_id = concat_ws(' '::text, e.skill_code, e.difficulty, e.question_type, e.ord)))) h)
  WHERE (e.removed_at IS NULL);


--
-- Name: eval_case; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_case (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    child_id uuid,
    skill_code text,
    difficulty text,
    ref text,
    verdict text,
    source text,
    confirmed_by text,
    checked_on date,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT eval_case_kind_check CHECK ((kind = ANY (ARRAY['report_finding'::text, 'hand_check'::text, 'item_review'::text]))),
    CONSTRAINT eval_case_kind_check_columns CHECK (COALESCE(
CASE kind
    WHEN 'report_finding'::text THEN ((child_id IS NOT NULL) AND (skill_code IS NOT NULL) AND (verdict = ANY (ARRAY['strong'::text, 'faulty'::text])) AND (source IS NOT NULL) AND (detail ? 'words'::text) AND (jsonb_typeof((detail -> 'words'::text)) = 'string'::text) AND (COALESCE((detail ->> 'expect_mark'::text), 'correct'::text) = ANY (ARRAY['correct'::text, 'wrong'::text])))
    WHEN 'hand_check'::text THEN ((child_id IS NOT NULL) AND (skill_code IS NOT NULL) AND (btrim(verdict) <> ''::text) AND (btrim(confirmed_by) <> ''::text) AND (checked_on IS NOT NULL) AND (detail ? 'grade'::text) AND (jsonb_typeof((detail -> 'matches'::text)) = 'boolean'::text))
    WHEN 'item_review'::text THEN ((child_id IS NULL) AND (skill_code IS NOT NULL) AND (difficulty IS NOT NULL) AND (ref IS NOT NULL) AND (verdict = ANY (ARRAY['pass'::text, 'revise'::text, 'reject'::text])) AND (source = ANY (ARRAY['pedagogy_review'::text, 'language_review'::text])))
    ELSE NULL::boolean
END, false))
);

ALTER TABLE ONLY public.eval_case FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE eval_case; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.eval_case IS 'the one eval set (CP-27): hand-checked truth used to score a model, and a model''s verdicts kept to be acted on';


--
-- Name: expense; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campus_id uuid,
    claimant_id uuid NOT NULL,
    spent_on date NOT NULL,
    amount numeric(12,2) NOT NULL,
    vendor text NOT NULL,
    category text NOT NULL,
    note text,
    receipt_key text,
    rule_version integer NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_on date,
    payment_mode text,
    payment_ref text,
    paid_by uuid,
    subcategory text,
    event text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    bill_quality text,
    bill_ref text,
    source_ref text,
    CONSTRAINT expense_amount_check CHECK (((amount > (0)::numeric) OR ((status = 'historic'::text) AND (amount <> (0)::numeric)))),
    CONSTRAINT expense_bill_quality_check CHECK ((bill_quality = ANY (ARRAY['vendor_bill'::text, 'payment_proof'::text, 'none'::text]))),
    CONSTRAINT expense_campus_check CHECK (((campus_id IS NOT NULL) OR (status = 'historic'::text))),
    CONSTRAINT expense_category_check CHECK ((btrim(category) <> ''::text)),
    CONSTRAINT expense_check CHECK (((status <> 'voided'::text) OR (reason IS NOT NULL))),
    CONSTRAINT expense_event_check CHECK (((event IS NULL) OR (btrim(event) <> ''::text))),
    CONSTRAINT expense_paid_check CHECK ((((paid_on IS NULL) = (payment_ref IS NULL)) AND ((paid_on IS NULL) = (paid_by IS NULL)))),
    CONSTRAINT expense_reason_check CHECK (((reason IS NULL) OR (btrim(reason) <> ''::text))),
    CONSTRAINT expense_rule_version_check CHECK ((rule_version >= 1)),
    CONSTRAINT expense_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'withdrawn'::text, 'voided'::text, 'historic'::text]))),
    CONSTRAINT expense_subcategory_check CHECK (((subcategory IS NULL) OR (btrim(subcategory) <> ''::text))),
    CONSTRAINT expense_vendor_check CHECK ((btrim(vendor) <> ''::text))
);

ALTER TABLE ONLY public.expense FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE expense; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.expense IS 'A money claim (CP-78): amount, date, vendor, category, campus, the bill''s private key, and the version of the money rules it pinned. Never deleted.';


--
-- Name: COLUMN expense.paid_on; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expense.paid_on IS 'When the claim was paid (CP-79); with the mode, the reference and who paid. An approval is an approval row, a payment is this.';


--
-- Name: COLUMN expense.subcategory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expense.subcategory IS 'The kind of regular expense within the category (the sheet''s cost stream): a stream may sit under several categories (CP-81).';


--
-- Name: COLUMN expense.source_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expense.source_ref IS 'The line''s id in the school''s expense sheet, for a historic line: what makes the import safe to run twice.';


--
-- Name: flow_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    flow text NOT NULL,
    trigger text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    error text,
    tokens integer,
    cost_inr numeric(20,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request jsonb DEFAULT '{}'::jsonb NOT NULL,
    model text,
    tokens_in integer,
    tokens_out integer,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    uploaded_by uuid,
    CONSTRAINT flow_run_status_check CHECK ((status = ANY (ARRAY['running'::text, 'ok'::text, 'error'::text])))
);

ALTER TABLE ONLY public.flow_run FORCE ROW LEVEL SECURITY;


--
-- Name: fortnight; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fortnight (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    number integer,
    kind text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    state text DEFAULT 'planning'::text NOT NULL,
    CONSTRAINT fortnight_check CHECK ((ends_on >= starts_on)),
    CONSTRAINT fortnight_check1 CHECK (((kind <> 'teaching'::text) OR (number IS NOT NULL))),
    CONSTRAINT fortnight_kind_check CHECK ((kind = ANY (ARRAY['settling'::text, 'teaching'::text, 'buffer'::text, 'vacation'::text, 'celebration'::text]))),
    CONSTRAINT fortnight_number_check CHECK (((number IS NULL) OR (number > 0))),
    CONSTRAINT fortnight_state_check CHECK ((state = ANY (ARRAY['planning'::text, 'frozen'::text, 'aligned'::text, 'approved'::text, 'list_sent'::text])))
);

ALTER TABLE ONLY public.fortnight FORCE ROW LEVEL SECURITY;


--
-- Name: framework; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.framework (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    publisher text NOT NULL,
    kind text NOT NULL,
    edition text,
    documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT framework_code_check CHECK ((code ~ '^[A-Z0-9][A-Z0-9-]*$'::text)),
    CONSTRAINT framework_documents_check CHECK ((jsonb_typeof(documents) = 'array'::text)),
    CONSTRAINT framework_kind_check CHECK ((kind = ANY (ARRAY['national'::text, 'international'::text, 'school'::text]))),
    CONSTRAINT framework_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT framework_publisher_check CHECK ((btrim(publisher) <> ''::text))
);

ALTER TABLE ONLY public.framework FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE framework; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.framework IS 'A curriculum framework (CP-54): a national or international body''s, or the school''s own (its progressions, its graduate profile). documents: the copies an import read, each {url, sha256, bytes, provenance, reading, retrieved_at}.';


--
-- Name: framework_statement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.framework_statement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    framework_code text NOT NULL,
    code text NOT NULL,
    printed_code text,
    parent_code text,
    kind text NOT NULL,
    level_code text,
    area text,
    text text,
    text_sha256 text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    ord integer,
    age_from numeric,
    age_to numeric,
    pdf_page integer,
    note text,
    supersedes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT framework_statement_age_from_check CHECK (((age_from IS NULL) OR (age_from >= (0)::numeric))),
    CONSTRAINT framework_statement_check CHECK (((age_to IS NULL) OR (age_to >= age_from))),
    CONSTRAINT framework_statement_check1 CHECK (((text IS NOT NULL) OR (text_sha256 IS NOT NULL))),
    CONSTRAINT framework_statement_code_check CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT framework_statement_items_check CHECK ((jsonb_typeof(items) = 'array'::text)),
    CONSTRAINT framework_statement_kind_check CHECK ((kind = ANY (ARRAY['level'::text, 'strand'::text, 'substrand'::text, 'curricular_goal'::text, 'competency'::text, 'learning_outcome'::text, 'learning_objective'::text, 'characteristic'::text, 'note'::text, 'progression'::text, 'step'::text, 'word'::text, 'capability'::text, 'group'::text])))
);

ALTER TABLE ONLY public.framework_statement FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE framework_statement; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.framework_statement IS 'A statement of a framework as printed (CP-54): a level or stage with its ages, a goal, a competency, an outcome or objective; for the school, a progression and its steps (with ages), a capability, a word, a group. A correction is a new row naming the one it supersedes. text is null only where the publisher''s words may not be republished; text_sha256 then fingerprints them.';


--
-- Name: grade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    ord integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    min_adults integer DEFAULT 2 NOT NULL,
    secure_level integer,
    secure_days integer,
    recheck_days integer,
    CONSTRAINT grade_min_adults_check CHECK ((min_adults > 0)),
    CONSTRAINT grade_observed_rule_whole CHECK ((((secure_level IS NULL) = (secure_days IS NULL)) AND ((secure_days IS NULL) = (recheck_days IS NULL)))),
    CONSTRAINT grade_recheck_days_check CHECK ((recheck_days >= 0)),
    CONSTRAINT grade_secure_days_check CHECK ((secure_days > 0)),
    CONSTRAINT grade_secure_level_check CHECK (((secure_level >= 0) AND (secure_level <= 3)))
);

ALTER TABLE ONLY public.grade FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN grade.secure_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grade.secure_level IS 'Observed grades (K2): the activity level a named child reaches for a yes to count toward secure. None: the grade is not read from observations (CP-27: was observed_rule).';


--
-- Name: COLUMN grade.secure_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grade.secure_days IS 'Observed grades: on how many different days a child is named at secure_level to be secure.';


--
-- Name: COLUMN grade.recheck_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grade.recheck_days IS 'Observed grades: how many days after the first yes a later yes re-checks it.';


--
-- Name: graph_answer; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.graph_answer WITH (security_invoker='true') AS
 SELECT e.id,
    e.tenant_id,
    e.child_id,
    e.skill_code,
    e.placed_rung AS rung_code,
    i.skill_set_code,
    i.difficulty,
    d.ord AS level_ord,
    e.correct,
    e.misconception_codes,
    e.observed_at,
    ev.seen_by,
    COALESCE(e.item_result_id, e.id) AS answer,
    array_position(t.item_ids, r.item_id) AS pos,
    ((e.observed_at AT TIME ZONE COALESCE((z.value #>> '{}'::text[]), 'UTC'::text)))::date AS day,
    COALESCE((c.sheet_instance_id)::text, (c.id)::text, (((e.observed_at AT TIME ZONE COALESCE((z.value #>> '{}'::text[]), 'UTC'::text)))::date)::text) AS paper
   FROM ((((((((public.evidence_placed e
     JOIN public.evidence_event ev ON ((ev.id = e.id)))
     LEFT JOIN public.item_result r ON ((r.id = e.item_result_id)))
     LEFT JOIN public.item i ON ((i.id = r.item_id)))
     LEFT JOIN public.capture c ON ((c.id = r.capture_id)))
     LEFT JOIN public.sheet_instance si ON ((si.id = c.sheet_instance_id)))
     LEFT JOIN public.sheet_template t ON ((t.id = si.sheet_template_id)))
     LEFT JOIN public.difficulty d ON (((d.tenant_id = e.tenant_id) AND (d.code = i.difficulty))))
     LEFT JOIN public.config z ON (((z.tenant_id = e.tenant_id) AND (z.key = 'school.time_zone'::text))))
  WHERE ((e.confirmed_by IS NOT NULL) AND ((c.id IS NULL) OR (c.superseded_by IS NULL)));


--
-- Name: item_exposure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_exposure (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    item_id uuid NOT NULL,
    week date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.item_exposure FORCE ROW LEVEL SECURITY;


--
-- Name: item_stat; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.item_stat WITH (security_invoker='true') AS
 SELECT r.tenant_id,
    r.item_id,
    (count(*))::integer AS n,
    (avg(((r.status = 'correct'::text))::integer))::numeric(5,4) AS p_correct
   FROM (public.item_result r
     JOIN public.capture c ON ((c.id = r.capture_id)))
  WHERE ((r.state = 'confirmed'::text) AND (r.status = ANY (ARRAY['correct'::text, 'wrong'::text, 'blank'::text])) AND (c.superseded_by IS NULL))
  GROUP BY r.tenant_id, r.item_id;


--
-- Name: VIEW item_stat; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.item_stat IS 'Each question''s confirmed answers and share right (CP-27 group 6: once a table rebuilt by engine graph); a question far off its level is learn''s, from the settings.';


--
-- Name: tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.tenant FORCE ROW LEVEL SECURITY;


--
-- Name: kind_trust; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.kind_trust WITH (security_invoker='true') AS
 WITH gate AS (
         SELECT t.id AS tenant_id,
            COALESCE(( SELECT (config.value)::double precision AS value
                   FROM public.config
                  WHERE ((config.tenant_id = t.id) AND (config.key = 'marking.agreement_gate'::text))), (0.95)::double precision) AS bar,
            COALESCE(( SELECT (config.value)::integer AS value
                   FROM public.config
                  WHERE ((config.tenant_id = t.id) AND (config.key = 'marking.agreement_window'::text))), 50) AS size
           FROM public.tenant t
        ), checks AS (
         SELECT a.tenant_id,
            a.fmt,
            a.reader_right,
            row_number() OVER (PARTITION BY a.tenant_id, a.fmt ORDER BY a.read_at DESC, a.item_key DESC, a.item_result_id DESC) AS rn
           FROM public.answer_checked a
          WHERE a.stood
        )
 SELECT c.tenant_id,
    c.fmt,
    (count(*) FILTER (WHERE (c.rn <= g.size)))::integer AS n,
    (count(*) FILTER (WHERE ((c.rn <= g.size) AND c.reader_right)))::integer AS "right",
    ((count(*) FILTER (WHERE (c.rn <= g.size)) >= g.size) AND ((count(*) FILTER (WHERE ((c.rn <= g.size) AND c.reader_right)))::double precision >= (g.bar * (g.size)::double precision))) AS trusted,
    public.checks_to_trust(array_agg(c.reader_right ORDER BY c.rn) FILTER (WHERE (c.rn <= g.size)), g.size, g.bar) AS checks_to_trust
   FROM (checks c
     JOIN gate g ON ((g.tenant_id = c.tenant_id)))
  GROUP BY c.tenant_id, c.fmt, g.size, g.bar;


--
-- Name: VIEW kind_trust; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.kind_trust IS 'Each kind of question''s standing against marking.agreement_gate over its newest marking.agreement_window checks the reader stood behind (ADR 0032): n, right, trusted, and the right checks still needed. The one rule the engine marks by and the website shows.';


--
-- Name: learning_objective; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_objective (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    band text NOT NULL,
    subject text NOT NULL,
    unit text NOT NULL,
    title text NOT NULL,
    signal text NOT NULL,
    confidence text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    subject_code text,
    topic_code text,
    kind text DEFAULT 'academic'::text NOT NULL,
    stage text,
    source_text text,
    retired boolean DEFAULT false NOT NULL,
    also_bands text[] DEFAULT '{}'::text[] NOT NULL,
    ord integer,
    CONSTRAINT learning_objective_also_bands_not_home CHECK (((band IS NULL) OR (NOT (band = ANY (also_bands))))),
    CONSTRAINT learning_objective_kind_check CHECK ((kind = ANY (ARRAY['academic'::text, 'character'::text, 'routine'::text]))),
    CONSTRAINT learning_objective_source_check CHECK ((source = ANY (ARRAY['school'::text, 'machine'::text, 'person'::text])))
);

ALTER TABLE ONLY public.learning_objective FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN learning_objective.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.learning_objective.source IS 'Where the objective came from: school (a sheet the school wrote), machine (a curriculum proposal applied), person (added by hand). CP-48.';


--
-- Name: COLUMN learning_objective.subject_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.learning_objective.subject_code IS 'The one subject list (CP-54): a subject row. Null only for a routine, a character objective, or one placement has not placed (config curriculum.subjects).';


--
-- Name: COLUMN learning_objective.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.learning_objective.kind IS 'academic, character (a behaviour or character area) or routine (CP-54).';


--
-- Name: COLUMN learning_objective.source_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.learning_objective.source_text IS 'The original wording, kept when a rewrite replaces title (CP-54).';


--
-- Name: COLUMN learning_objective.retired; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.learning_objective.retired IS 'True for an objective folded into another or removed (CP-54 point 11): hidden from lists and the chain, kept for its source.';


--
-- Name: COLUMN learning_objective.also_bands; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.learning_objective.also_bands IS 'The other grades this objective sits in besides its home grade `band` (CP-70). Edited by a coordinator through the engine; every change is a change_log row.';


--
-- Name: COLUMN learning_objective.ord; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.learning_objective.ord IS 'Teaching order inside a grade and subject (CP-74). Seeded once from the source order (machine-made); a unit''s order is the smallest ord it holds.';


--
-- Name: learning_objective_skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_objective_skill (
    tenant_id uuid NOT NULL,
    lo_code text NOT NULL,
    skill_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    proposal_id uuid,
    CONSTRAINT learning_objective_skill_source_check CHECK ((source = ANY (ARRAY['school'::text, 'person'::text, 'machine'::text])))
);

ALTER TABLE ONLY public.learning_objective_skill FORCE ROW LEVEL SECURITY;


--
-- Name: level_calibration; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.level_calibration WITH (security_invoker='true') AS
 WITH kid AS (
         SELECT l.tenant_id,
            l.child_id,
            l.skill_code,
            l.difficulty,
            c.section,
            c.band,
            (st.enough AND (NOT st.needs_work)) AS is_secure
           FROM ((public.child_level_state l
             JOIN public.child_now c ON (((c.id = l.child_id) AND c.active)))
             JOIN public.child_state st ON (((st.tenant_id = l.tenant_id) AND (st.code = l.state))))
        ), counted AS (
         SELECT kid.tenant_id,
            'class'::text AS scope_kind,
            kid.section AS scope_value,
            public.class_band(kid.tenant_id, kid.section) AS grade,
            kid.skill_code,
            kid.difficulty,
            (count(*))::integer AS assessed,
            (count(*) FILTER (WHERE kid.is_secure))::integer AS secure
           FROM kid
          GROUP BY kid.tenant_id, kid.section, kid.skill_code, kid.difficulty
        UNION ALL
         SELECT kid.tenant_id,
            'grade'::text AS text,
            kid.band,
            kid.band,
            kid.skill_code,
            kid.difficulty,
            (count(*))::integer AS count,
            (count(*) FILTER (WHERE kid.is_secure))::integer AS count
           FROM kid
          GROUP BY kid.tenant_id, kid.band, kid.skill_code, kid.difficulty
        ), th AS (
         SELECT config.tenant_id,
            max((config.value)::numeric) FILTER (WHERE (config.key = 'calibration.too_easy_share'::text)) AS share,
            max((config.value)::numeric) FILTER (WHERE (config.key = 'calibration.min_children'::text)) AS min_children,
            max((config.value)::numeric) FILTER (WHERE (config.key = 'calibration.review_again_children'::text)) AS again
           FROM public.config
          WHERE (config.key = ANY (ARRAY['calibration.too_easy_share'::text, 'calibration.min_children'::text, 'calibration.review_again_children'::text]))
          GROUP BY config.tenant_id
        )
 SELECT n.tenant_id,
    n.scope_kind,
    n.scope_value,
    n.grade,
    n.skill_code,
    n.difficulty,
    n.assessed,
    n.secure,
    (th.min_children)::integer AS min_children,
    th.share AS share_needed,
        CASE
            WHEN ((n.assessed)::numeric < th.min_children) THEN 'too_few'::text
            WHEN (((n.secure)::numeric / (n.assessed)::numeric) >= th.share) THEN 'review'::text
            ELSE 'fine'::text
        END AS verdict,
    r.reviewed_at AS looked_at,
    r.reviewed_by AS looked_by
   FROM ((counted n
     JOIN th ON ((th.tenant_id = n.tenant_id)))
     LEFT JOIN LATERAL ( SELECT v.created_at AS reviewed_at,
            v.by AS reviewed_by,
            ((v.detail ->> 'assessed'::text))::integer AS assessed,
            ((v.detail ->> 'secure'::text))::integer AS secure
           FROM public.approval v
          WHERE ((v.tenant_id = n.tenant_id) AND (v.kind = 'calibration'::text) AND (v.target = ((((((n.skill_code || ' '::text) || n.difficulty) || ' '::text) || n.scope_kind) || ' '::text) || n.scope_value)))
          ORDER BY v.created_at DESC, v.seq DESC
         LIMIT 1) r ON ((((abs((n.assessed - r.assessed)))::numeric < th.again) AND ((abs((n.secure - r.secure)))::numeric < th.again))))
  WHERE ((th.share IS NOT NULL) AND (th.min_children IS NOT NULL) AND (th.again IS NOT NULL));


--
-- Name: skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    rung_code text NOT NULL,
    name text NOT NULL,
    learning_objective text NOT NULL,
    philosophy text[] DEFAULT '{}'::text[] NOT NULL,
    formats text[] DEFAULT '{}'::text[] NOT NULL,
    misconception_codes text[] DEFAULT '{}'::text[] NOT NULL,
    difficulty jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    ratified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    eval_type public.eval_type DEFAULT 'computable'::public.eval_type NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    topic_code text,
    level_band jsonb DEFAULT '{}'::jsonb NOT NULL,
    level_band_by text,
    level_band_at timestamp with time zone,
    level_approved jsonb DEFAULT '{}'::jsonb NOT NULL,
    taught boolean DEFAULT false NOT NULL,
    taught_by text,
    taught_at timestamp with time zone,
    grade text NOT NULL,
    ladder_order integer,
    descriptor text NOT NULL,
    registry_codes text[] DEFAULT '{}'::text[] NOT NULL,
    question_kinds jsonb DEFAULT '{}'::jsonb NOT NULL,
    lo_code text,
    lo_source text DEFAULT 'machine'::text NOT NULL,
    CONSTRAINT skill_level_band_moved_by_someone CHECK (((level_band_by IS NULL) = (level_band_at IS NULL))),
    CONSTRAINT skill_level_band_shape CHECK ((jsonb_typeof(level_band) = 'object'::text)),
    CONSTRAINT skill_lo_source_check CHECK ((lo_source = ANY (ARRAY['school'::text, 'machine'::text, 'person'::text]))),
    CONSTRAINT skill_question_kinds_check CHECK ((jsonb_typeof(question_kinds) = 'object'::text)),
    CONSTRAINT skill_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ratified'::text]))),
    CONSTRAINT skill_taught_by_a_person CHECK (((taught_by IS NULL) = (taught_at IS NULL)))
);

ALTER TABLE ONLY public.skill FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN skill.eval_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill.eval_type IS 'How questions in this set are evaluated. A row, so a coordinator can say it without a deploy.';


--
-- Name: COLUMN skill.question_kinds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill.question_kinds IS 'The kinds of question the skill set''s card levels draw: {code: kind} (ADR 0075; CP-27 group 6: once the table question_format). A code names one kind in the school (the loader refuses a second).';


--
-- Name: COLUMN skill.lo_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill.lo_code IS 'The one school learning objective this engine skill tests (CP-54).';


--
-- Name: COLUMN skill.lo_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill.lo_source IS 'Who made the link skill.lo_code: school, machine or person (CP-54). Meaningless while lo_code is null.';


--
-- Name: topic; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    subject_code text NOT NULL,
    name text NOT NULL,
    ord integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.topic FORCE ROW LEVEL SECURITY;


--
-- Name: level_kind_choice; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.level_kind_choice WITH (security_invoker='true') AS
 SELECT DISTINCT t.tenant_id,
    t.subject_code,
    q.code,
    q.words,
    ('open_response'::public.eval_type = ANY (q.marked)) AS open
   FROM ((((public.question_type q
     JOIN public.approval_list a ON (((a.tenant_id = q.tenant_id) AND (a.kind = 'question_type'::text) AND (a.target = q.code) AND (a.first_by IS NOT NULL))))
     JOIN public.skill_level_question_type l ON (((l.tenant_id = q.tenant_id) AND (l.question_type = q.code) AND (l.removed_at IS NULL))))
     JOIN public.skill s ON (((s.tenant_id = l.tenant_id) AND (s.code = l.skill_code))))
     JOIN public.topic t ON (((t.tenant_id = s.tenant_id) AND (t.code = s.topic_code))))
  WHERE (q.reaches <> 'observed'::text);


--
-- Name: level_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.level_rule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    band text NOT NULL,
    level text NOT NULL,
    rung_codes text[] DEFAULT '{}'::text[] NOT NULL,
    foundational_rung_code text,
    probe_rung_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT level_rule_level_check CHECK ((level = ANY (ARRAY['Lm'::text, 'L0'::text, 'Lp'::text])))
);

ALTER TABLE ONLY public.level_rule FORCE ROW LEVEL SECURITY;


--
-- Name: material_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_item (
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    unit text DEFAULT 'piece'::text NOT NULL,
    home text,
    unit_value numeric,
    proposal_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    proposed_by uuid,
    proposed_at timestamp with time zone,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    conversions jsonb DEFAULT '{}'::jsonb NOT NULL,
    category text,
    CONSTRAINT material_item_conversions_check CHECK ((jsonb_typeof(conversions) = 'object'::text)),
    CONSTRAINT material_item_home_check CHECK ((home = ANY (ARRAY['class'::text, 'school'::text]))),
    CONSTRAINT material_item_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT material_item_proposed_check CHECK (((proposed_by IS NULL) = (proposed_at IS NULL))),
    CONSTRAINT material_item_unit_check CHECK ((btrim(unit) <> ''::text)),
    CONSTRAINT material_item_unit_value_check CHECK ((unit_value >= (0)::numeric))
);

ALTER TABLE ONLY public.material_item FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN material_item.aliases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_item.aliases IS 'Words a person approved for the item (CP-27 group 6: once the table material_alias); a word means one item in the school. Each approval a change_log row.';


--
-- Name: COLUMN material_item.conversions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_item.conversions IS 'How many of the item''s own unit make one of another: {unit: factor} (CP-27 group 6: once the table material_unit_conversion). Each approval a change_log row.';


--
-- Name: COLUMN material_item.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_item.category IS 'CP-84: the school''s category of this item, one of the setting money.categories (checked in the engine, not here); null reads "needs a category". A person''s change is a row of change_log.';


--
-- Name: materials_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    list_id uuid NOT NULL,
    material_code text NOT NULL,
    unit text NOT NULL,
    quantity numeric,
    needed_on date NOT NULL,
    activity_code text,
    source text DEFAULT 'school'::text NOT NULL,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT materials_line_check CHECK (((source = 'educator'::text) OR (activity_code IS NOT NULL))),
    CONSTRAINT materials_line_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT materials_line_source_check CHECK ((source = ANY (ARRAY['school'::text, 'educator'::text]))),
    CONSTRAINT materials_line_sources_check CHECK ((jsonb_typeof(sources) = 'array'::text)),
    CONSTRAINT materials_line_unit_check CHECK ((btrim(unit) <> ''::text))
);

ALTER TABLE ONLY public.materials_line FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN materials_line.sources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materials_line.sources IS 'The planned lessons the line comes from: [{session_id, activity_code, on_date, quantity}] (CP-27 group 6: once the table materials_line_source); a lesson removed takes its entries with it.';


--
-- Name: materials_line_source; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.materials_line_source WITH (security_invoker='true') AS
 SELECT l.id AS line_id,
    ((x.value ->> 'session_id'::text))::uuid AS session_id,
    (x.value ->> 'activity_code'::text) AS activity_code,
    ((x.value ->> 'on_date'::text))::date AS on_date,
    ((x.value ->> 'quantity'::text))::numeric AS quantity
   FROM (public.materials_line l
     CROSS JOIN LATERAL jsonb_array_elements(l.sources) x(value));


--
-- Name: VIEW materials_line_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.materials_line_source IS 'The planned lessons each materials line comes from, read from materials_line.sources (CP-27 group 6: once a table).';


--
-- Name: materials_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_class_id uuid NOT NULL,
    period text NOT NULL,
    from_on date NOT NULL,
    to_on date NOT NULL,
    state text DEFAULT 'draft'::text NOT NULL,
    built_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materials_list_check CHECK ((to_on >= from_on)),
    CONSTRAINT materials_list_period_check CHECK ((period = ANY (ARRAY['day'::text, 'week'::text, 'fortnight'::text]))),
    CONSTRAINT materials_list_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'sent'::text])))
);

ALTER TABLE ONLY public.materials_list FORCE ROW LEVEL SECURITY;


--
-- Name: misconception; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.misconception (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    op text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    repair_hint text DEFAULT ''::text NOT NULL,
    detectable_by text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    external_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_from text DEFAULT 'operation'::text NOT NULL,
    skill_code text,
    learned_rule jsonb,
    learned_from uuid,
    CONSTRAINT misconception_detectable_by_check CHECK ((detectable_by = ANY (ARRAY['answer_lookup'::text, 'working'::text, 'explanation'::text, 'teacher'::text]))),
    CONSTRAINT misconception_learned_check CHECK (((learned_rule IS NULL) = (learned_from IS NULL))),
    CONSTRAINT misconception_op_check CHECK ((op = ANY (ARRAY['+'::text, '-'::text, '×'::text, '÷'::text, 'any'::text]))),
    CONSTRAINT misconception_skill_from_check CHECK ((skill_from = ANY (ARRAY['operation'::text, 'row'::text]))),
    CONSTRAINT misconception_skill_named CHECK (((skill_from = 'operation'::text) OR (skill_code IS NOT NULL)))
);

ALTER TABLE ONLY public.misconception FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN misconception.learned_rule; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.misconception.learned_rule IS 'a mistake learned from children''s answers: its column rule (assess/learned_rules.py), recognised by marking';


--
-- Name: COLUMN misconception.learned_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.misconception.learned_from IS 'the proposal (curriculum_proposal, kind new_mistake) it was adopted from';


--
-- Name: objective_statement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objective_statement (
    tenant_id uuid NOT NULL,
    lo_code text NOT NULL,
    framework_code text NOT NULL,
    statement_code text NOT NULL,
    relation text NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    proposal_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT objective_statement_relation_check CHECK ((relation = ANY (ARRAY['meets'::text, 'partly_meets'::text, 'extends'::text, 'on_step'::text, 'counts_toward'::text, 'evidence_for'::text]))),
    CONSTRAINT objective_statement_source_check CHECK ((source = ANY (ARRAY['school'::text, 'machine'::text, 'person'::text])))
);

ALTER TABLE ONLY public.objective_statement FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE objective_statement; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.objective_statement IS 'A learning objective held against a framework statement (CP-54): meets, partly meets or extends an outside statement; sits on a step of a progression; counts toward its one capability. source: school, machine or person (CP-48''s three words); a machine link is live, marked, until a person checks it.';


--
-- Name: skill_profile_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_profile_group (
    tenant_id uuid NOT NULL,
    skill_code text NOT NULL,
    framework_code text DEFAULT 'CS-PROFILE'::text NOT NULL,
    statement_code text NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    proposal_id uuid,
    staff_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skill_profile_group_framework_code_check CHECK ((framework_code = 'CS-PROFILE'::text)),
    CONSTRAINT skill_profile_group_source_check CHECK ((source = 'person'::text))
);

ALTER TABLE ONLY public.skill_profile_group FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE skill_profile_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.skill_profile_group IS 'ADR 0115: the one capability-profile group a registry skill is evidence of, as a person approved it (the proposal it came from, the staff member who approved). Objectives of the bands in profile.skill_bands count toward the groups of their skills (view objective_profile_group).';


--
-- Name: objective_profile_group; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.objective_profile_group WITH (security_invoker='true') AS
 WITH scoped AS (
         SELECT lo.tenant_id,
            lo.code
           FROM (public.learning_objective lo
             JOIN public.config c ON (((c.tenant_id = lo.tenant_id) AND (c.key = 'profile.skill_bands'::text))))
          WHERE (lo.band IN ( SELECT jsonb_array_elements_text(c.value) AS jsonb_array_elements_text))
        ), from_skills AS (
         SELECT los.tenant_id,
            los.lo_code,
            spg.statement_code AS group_code,
            array_agg(los.skill_code ORDER BY los.skill_code) AS skills
           FROM ((public.learning_objective_skill los
             JOIN scoped s ON (((s.tenant_id = los.tenant_id) AND (s.code = los.lo_code))))
             JOIN public.skill_profile_group spg ON (((spg.tenant_id = los.tenant_id) AND (spg.skill_code = los.skill_code))))
          GROUP BY los.tenant_id, los.lo_code, spg.statement_code
        )
 SELECT f.tenant_id,
    f.lo_code,
    f.group_code,
    'skill'::text AS origin,
    'person'::text AS source,
    f.skills
   FROM from_skills f
UNION ALL
 SELECT os.tenant_id,
    os.lo_code,
    os.statement_code AS group_code,
    'default'::text AS origin,
    os.source,
    '{}'::text[] AS skills
   FROM public.objective_statement os
  WHERE ((os.framework_code = 'CS-PROFILE'::text) AND (os.relation = 'counts_toward'::text) AND ((os.source = 'person'::text) OR (NOT (EXISTS ( SELECT 1
           FROM from_skills f
          WHERE ((f.tenant_id = os.tenant_id) AND (f.lo_code = os.lo_code)))))));


--
-- Name: VIEW objective_profile_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.objective_profile_group IS 'ADR 0115: each objective''s capability-profile groups, derived: from its skills'' approved groups (origin skill) or, failing that, its own counts_toward row (origin default).';


--
-- Name: passage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    grade text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    text text NOT NULL,
    facts jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.passage FORCE ROW LEVEL SECURITY;


--
-- Name: password_ask; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_ask (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    ip text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.password_ask FORCE ROW LEVEL SECURITY;


--
-- Name: password_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_link (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    purpose text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    closed_at timestamp with time zone,
    mail text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT password_link_mail_check CHECK ((mail = ANY (ARRAY['sent'::text, 'not configured'::text, 'failed'::text]))),
    CONSTRAINT password_link_purpose_check CHECK ((purpose = ANY (ARRAY['reset'::text, 'first'::text])))
);

ALTER TABLE ONLY public.password_link FORCE ROW LEVEL SECURITY;


--
-- Name: period; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.period (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    grade_code text NOT NULL,
    ord integer NOT NULL,
    starts_at time without time zone NOT NULL,
    ends_at time without time zone,
    label text NOT NULL,
    fixed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from date,
    valid_to date,
    CONSTRAINT period_check CHECK (((ends_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT period_label_check CHECK ((btrim(label) <> ''::text)),
    CONSTRAINT period_valid_order_check CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))
);

ALTER TABLE ONLY public.period FORCE ROW LEVEL SECURITY;


--
-- Name: plan_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_class_id uuid NOT NULL,
    fortnight_id uuid NOT NULL,
    plan_key text NOT NULL,
    ord integer NOT NULL,
    text text NOT NULL,
    activity_id uuid,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    week_code text,
    link_rule text,
    link_run uuid,
    linked_at timestamp with time zone,
    linked_by text,
    CONSTRAINT plan_entry_link_names_rule CHECK (((activity_id IS NULL) = (link_rule IS NULL))),
    CONSTRAINT plan_entry_link_rule_check CHECK ((link_rule = ANY (ARRAY['model'::text, 'exact_name'::text, 'person'::text]))),
    CONSTRAINT plan_entry_ord_check CHECK ((ord > 0)),
    CONSTRAINT plan_entry_plan_key_check CHECK ((btrim(plan_key) <> ''::text)),
    CONSTRAINT plan_entry_source_check CHECK ((btrim(source) <> ''::text)),
    CONSTRAINT plan_entry_text_check CHECK ((btrim(text) <> ''::text)),
    CONSTRAINT plan_entry_week_code_check CHECK ((week_code = ANY (ARRAY['A'::text, 'B'::text])))
);

ALTER TABLE ONLY public.plan_entry FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN plan_entry.week_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.plan_entry.week_code IS 'The week of its fortnight this line plans, when the fortnight is listed under two month headings: A from the first row, B from the second. Null when the fortnight has one row, whose lines plan both weeks.';


--
-- Name: plan_line_candidate; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.plan_line_candidate WITH (security_invoker='true') AS
 SELECT pe.id AS plan_entry_id,
    a.id AS activity_id,
    'exact_name'::text AS rule,
    1 AS rank
   FROM ((public.plan_entry pe
     JOIN public.school_class sc ON ((sc.id = pe.school_class_id)))
     JOIN public.activity a ON (((a.tenant_id = pe.tenant_id) AND (a.band = sc.grade_code))))
  WHERE ((pe.activity_id IS NULL) AND (regexp_replace(lower(a.name), '[^a-z0-9]+'::text, ''::text, 'g'::text) = regexp_replace(lower(pe.text), '[^a-z0-9]+'::text, ''::text, 'g'::text)));


--
-- Name: plan_unmatched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.plan_unmatched WITH (security_invoker='true') AS
 WITH best AS (
         SELECT DISTINCT ON (plan_line_candidate.plan_entry_id) plan_line_candidate.plan_entry_id,
            plan_line_candidate.rank,
            count(*) OVER (PARTITION BY plan_line_candidate.plan_entry_id, plan_line_candidate.rank) AS n
           FROM public.plan_line_candidate
          ORDER BY plan_line_candidate.plan_entry_id, plan_line_candidate.rank
        )
 SELECT pe.id AS plan_entry_id,
    pe.tenant_id,
    pe.school_class_id,
    pe.fortnight_id,
    f.number AS fortnight_number,
    pe.week_code,
    pe.plan_key,
    pe.text,
        CASE
            WHEN (b.n IS NULL) THEN 'no_match'::text
            WHEN (b.n = 1) THEN 'ready_to_link'::text
            ELSE 'several_matches'::text
        END AS reason,
    (COALESCE(b.n, (0)::bigint))::integer AS candidates
   FROM ((public.plan_entry pe
     JOIN public.fortnight f ON ((f.id = pe.fortnight_id)))
     LEFT JOIN best b ON ((b.plan_entry_id = pe.id)))
  WHERE (pe.activity_id IS NULL);


--
-- Name: prescription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    child_id uuid NOT NULL,
    week date NOT NULL,
    strand text,
    level text,
    rung_codes text[] DEFAULT '{}'::text[] NOT NULL,
    rule_fired text NOT NULL,
    misconception_targets text[] DEFAULT '{}'::text[] NOT NULL,
    sheet_instance_id uuid,
    override_by text,
    override_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_set_code text,
    difficulty text,
    kind text DEFAULT 'practice'::text NOT NULL,
    no_paper text,
    CONSTRAINT prescription_kind_check CHECK ((kind = ANY (ARRAY['practice'::text, 'assessment'::text]))),
    CONSTRAINT prescription_level_check CHECK (((level IS NULL) OR (level = ANY (ARRAY['Lm'::text, 'L0'::text, 'Lp'::text]))))
);

ALTER TABLE ONLY public.prescription FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN prescription.no_paper; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prescription.no_paper IS 'Why the week''s assembly could not give this child a paper, in words; null once they have one (w2_print/assemble.py).';


--
-- Name: prompt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    purpose text NOT NULL,
    version integer NOT NULL,
    text text NOT NULL,
    model text NOT NULL,
    json_schema jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text,
    effort text,
    CONSTRAINT prompt_effort_check CHECK ((effort = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'xhigh'::text, 'max'::text])))
);

ALTER TABLE ONLY public.prompt FORCE ROW LEVEL SECURITY;


--
-- Name: registry_skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registry_skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    domain text NOT NULL,
    strand text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_type text,
    pillar text,
    ncf text,
    cg text,
    authored_by text,
    domain_name text,
    milestones jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT registry_skill_milestones_check CHECK ((jsonb_typeof(milestones) = 'object'::text))
);

ALTER TABLE ONLY public.registry_skill FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN registry_skill.milestones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registry_skill.milestones IS 'The skill''s milestones by band: {band: {descriptor, scale, source}} (CP-27 group 6: once the table milestone); a band is a grade''s code (engine load --check).';


--
-- Name: report_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    skill_code text NOT NULL,
    band text NOT NULL,
    title text NOT NULL,
    section text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.report_item FORCE ROW LEVEL SECURITY;


--
-- Name: role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role (
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    scope text NOT NULL,
    may_grant text[] DEFAULT '{}'::text[] NOT NULL,
    one_per_class boolean DEFAULT false NOT NULL,
    ord integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    access_group text,
    CONSTRAINT role_access_group_check CHECK ((access_group = ANY (ARRAY['everything'::text, 'own_classes'::text]))),
    CONSTRAINT role_check CHECK (((NOT one_per_class) OR (scope = 'class'::text))),
    CONSTRAINT role_scope_check CHECK ((scope = ANY (ARRAY['campus'::text, 'class'::text, 'class_subject'::text, 'child'::text])))
);

ALTER TABLE ONLY public.role FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN role.access_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.role.access_group IS 'The access group a person holding this role is in (CP-3): everything or own_classes; none: no reach by this role.';


--
-- Name: rubric; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubric (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    applies_to text NOT NULL,
    criteria jsonb NOT NULL,
    scale text[] NOT NULL,
    skill_codes text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.rubric FORCE ROW LEVEL SECURITY;


--
-- Name: school_day; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_day (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campus_id uuid NOT NULL,
    on_date date NOT NULL,
    kind text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_day_kind_check CHECK ((kind = ANY (ARRAY['teaching'::text, 'holiday'::text, 'changed_timing'::text])))
);

ALTER TABLE ONLY public.school_day FORCE ROW LEVEL SECURITY;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_class_id uuid NOT NULL,
    school_day_id uuid NOT NULL,
    period_id uuid NOT NULL,
    subject_code text,
    led_by_staff_id uuid,
    state text DEFAULT 'planned'::text NOT NULL,
    planned boolean DEFAULT true NOT NULL,
    plan_entry_id uuid,
    text text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'subject'::text NOT NULL,
    activity_code text,
    lo_code text,
    source text DEFAULT 'machine'::text NOT NULL,
    CONSTRAINT session_kind_check CHECK ((kind = ANY (ARRAY['fixed'::text, 'subject'::text, 'specialist'::text]))),
    CONSTRAINT session_source_check CHECK ((source = ANY (ARRAY['machine'::text, 'person'::text]))),
    CONSTRAINT session_state_check CHECK ((state = ANY (ARRAY['planned'::text, 'done'::text, 'not_done'::text, 'moved'::text])))
);

ALTER TABLE ONLY public.session FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN session.activity_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.activity_code IS 'The activity this lesson holds, chosen by the coordinator from the activities of its head (CP-39); null: none chosen. The plan line''s activity (plan_entry.activity_id) is shown when this is null.';


--
-- Name: COLUMN session.lo_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.lo_code IS 'The one objective this lesson is mainly about (CP-74); others are reached through its activity''s links.';


--
-- Name: COLUMN session.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.source IS 'Who chose the lesson''s objective and activity: machine (the suggestion job, publish) or person (CP-74).';


--
-- Name: sign_in_failure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sign_in_failure (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.sign_in_failure FORCE ROW LEVEL SECURITY;


--
-- Name: skill_prerequisite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_prerequisite (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    skill_code text,
    before_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    strength text DEFAULT 'soft'::text NOT NULL,
    reason text NOT NULL,
    source text NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    registry_code text,
    before_registry_code text,
    CONSTRAINT skill_prerequisite_not_itself CHECK ((skill_code <> before_code)),
    CONSTRAINT skill_prerequisite_one_pair CHECK ((((skill_code IS NOT NULL) AND (before_code IS NOT NULL) AND (registry_code IS NULL) AND (before_registry_code IS NULL)) OR ((skill_code IS NULL) AND (before_code IS NULL) AND (registry_code IS NOT NULL) AND (before_registry_code IS NOT NULL)))),
    CONSTRAINT skill_prerequisite_reason_check CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT skill_prerequisite_registry_not_itself CHECK ((registry_code <> before_registry_code)),
    CONSTRAINT skill_prerequisite_source_check CHECK ((btrim(source) <> ''::text)),
    CONSTRAINT skill_prerequisite_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'confirmed'::text]))),
    CONSTRAINT skill_prerequisite_strength_check CHECK ((strength = ANY (ARRAY['hard'::text, 'soft'::text])))
);

ALTER TABLE ONLY public.skill_prerequisite FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN skill_prerequisite.registry_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_prerequisite.registry_code IS 'A link between broad registry skills (K2''s "ready next") names them here, and no skill set (CP-27 group 6: once the table skill_link).';


--
-- Name: skill_link_audit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.skill_link_audit WITH (security_invoker='true') AS
 SELECT id,
    tenant_id,
    registry_code AS skill_code,
    before_registry_code AS before_code,
    strength,
    reason,
    source,
    status,
    confirmed_by,
    confirmed_at,
    created_at
   FROM public.skill_prerequisite
  WHERE (registry_code IS NOT NULL);


--
-- Name: skill_link_confirmed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.skill_link_confirmed WITH (security_invoker='true') AS
 SELECT id,
    tenant_id,
    registry_code AS skill_code,
    before_registry_code AS before_code,
    strength,
    reason,
    source,
    confirmed_by,
    confirmed_at
   FROM public.skill_prerequisite l
  WHERE ((status = 'confirmed'::text) AND (registry_code IS NOT NULL));


--
-- Name: skill_mistake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_mistake (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    skill_code text NOT NULL,
    misconception_code text NOT NULL,
    op text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.skill_mistake FORCE ROW LEVEL SECURITY;


--
-- Name: skill_prerequisite_audit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.skill_prerequisite_audit WITH (security_invoker='true') AS
 SELECT id,
    tenant_id,
    skill_code,
    before_code,
    strength,
    reason,
    source,
    status,
    confirmed_by,
    confirmed_at,
    created_at
   FROM public.skill_prerequisite
  WHERE (skill_code IS NOT NULL);


--
-- Name: skill_prerequisite_confirmed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.skill_prerequisite_confirmed WITH (security_invoker='true') AS
 SELECT id,
    tenant_id,
    skill_code,
    before_code,
    strength,
    reason,
    source,
    confirmed_by,
    confirmed_at
   FROM public.skill_prerequisite p
  WHERE ((status = 'confirmed'::text) AND (skill_code IS NOT NULL));


--
-- Name: skill_registry_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_registry_link (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    skill_code text NOT NULL,
    registry_skill text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.skill_registry_link FORCE ROW LEVEL SECURITY;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campus_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_code text,
    classes text[] DEFAULT '{}'::text[] NOT NULL,
    subjects text[] DEFAULT '{}'::text[] NOT NULL
);

ALTER TABLE ONLY public.staff FORCE ROW LEVEL SECURITY;


--
-- Name: staff_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    doing text NOT NULL,
    happened text NOT NULL,
    how_often text,
    route text NOT NULL,
    role text NOT NULL,
    classes text DEFAULT ''::text NOT NULL,
    browser text DEFAULT ''::text NOT NULL,
    reporter text NOT NULL,
    status text DEFAULT 'saved'::text NOT NULL,
    issue_number integer,
    tried_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_note_how_often_check CHECK ((how_often = ANY (ARRAY['once'::text, 'sometimes'::text, 'every time'::text]))),
    CONSTRAINT staff_note_kind_check CHECK ((kind = ANY (ARRAY['bug'::text, 'feature'::text, 'question'::text]))),
    CONSTRAINT staff_note_status_check CHECK ((status = ANY (ARRAY['saved'::text, 'sent'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.staff_note FORCE ROW LEVEL SECURITY;


--
-- Name: staff_role_grant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_role_grant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    role_code text NOT NULL,
    school_class_id uuid,
    subject_code text,
    child_id uuid,
    valid_from date NOT NULL,
    valid_to date,
    granted_by text NOT NULL,
    override_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_role_grant_check CHECK (((valid_to IS NULL) OR (valid_to >= valid_from))),
    CONSTRAINT staff_role_grant_granted_by_check CHECK ((btrim(granted_by) <> ''::text)),
    CONSTRAINT staff_role_grant_override_reason_check CHECK (((override_reason IS NULL) OR (btrim(override_reason) <> ''::text)))
);

ALTER TABLE ONLY public.staff_role_grant FORCE ROW LEVEL SECURITY;


--
-- Name: stock_move; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_move (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seq bigint NOT NULL,
    tenant_id uuid NOT NULL,
    campus_id uuid NOT NULL,
    material_code text NOT NULL,
    kind text NOT NULL,
    quantity numeric(12,3) NOT NULL,
    expected numeric(12,3),
    class_label text,
    expense_id uuid,
    reason text,
    staff_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_move_check CHECK (((kind = ANY (ARRAY['count'::text, 'minimum'::text])) OR (quantity > (0)::numeric))),
    CONSTRAINT stock_move_check1 CHECK (((kind = 'out'::text) = (class_label IS NOT NULL))),
    CONSTRAINT stock_move_check2 CHECK (((kind = 'in'::text) OR (expense_id IS NULL))),
    CONSTRAINT stock_move_check3 CHECK (((kind = 'count'::text) = (expected IS NOT NULL))),
    CONSTRAINT stock_move_check4 CHECK (((kind <> 'writeoff'::text) OR (reason IS NOT NULL))),
    CONSTRAINT stock_move_class_label_check CHECK (((class_label IS NULL) OR (btrim(class_label) <> ''::text))),
    CONSTRAINT stock_move_kind_check CHECK ((kind = ANY (ARRAY['in'::text, 'out'::text, 'count'::text, 'writeoff'::text, 'minimum'::text]))),
    CONSTRAINT stock_move_quantity_check CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT stock_move_reason_check CHECK (((reason IS NULL) OR (btrim(reason) <> ''::text)))
);

ALTER TABLE ONLY public.stock_move FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE stock_move; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_move IS 'A move in a campus''s store (CP-82): in, out (to a class), count (quantity counted, expected = what the books said), writeoff (with its reason) or minimum (newest wins). Append-only.';


--
-- Name: COLUMN stock_move.expected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_move.expected IS 'For a count: what the books said just before it, so the difference it kept is on the row.';


--
-- Name: stock_level; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stock_level WITH (security_invoker='true') AS
 WITH last AS (
         SELECT stock_move.tenant_id,
            stock_move.campus_id,
            stock_move.material_code,
            max(stock_move.seq) FILTER (WHERE (stock_move.kind = 'count'::text)) AS count_seq,
            max(stock_move.seq) FILTER (WHERE (stock_move.kind = 'minimum'::text)) AS minimum_seq,
            count(*) FILTER (WHERE (stock_move.kind <> 'minimum'::text)) AS recorded
           FROM public.stock_move
          GROUP BY stock_move.tenant_id, stock_move.campus_id, stock_move.material_code
        )
 SELECT l.tenant_id,
    l.campus_id,
    l.material_code,
    (COALESCE(c.quantity, (0)::numeric) + COALESCE(( SELECT sum(
                CASE m.kind
                    WHEN 'in'::text THEN m.quantity
                    ELSE (- m.quantity)
                END) AS sum
           FROM public.stock_move m
          WHERE ((m.tenant_id = l.tenant_id) AND (m.campus_id = l.campus_id) AND (m.material_code = l.material_code) AND (m.kind = ANY (ARRAY['in'::text, 'out'::text, 'writeoff'::text])) AND (m.seq > COALESCE(l.count_seq, (0)::bigint)))), (0)::numeric)) AS on_hand,
    mn.quantity AS minimum,
    l.recorded
   FROM ((last l
     LEFT JOIN public.stock_move c ON ((c.seq = l.count_seq)))
     LEFT JOIN public.stock_move mn ON ((mn.seq = l.minimum_seq)));


--
-- Name: VIEW stock_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.stock_level IS 'What each campus holds of each catalogue item (CP-82): the last count plus the moves after it, and the newest minimum. Never a table.';


--
-- Name: stock_move_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stock_move ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stock_move_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    verifier text,
    mark_mode text DEFAULT 'lookup'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    label text,
    CONSTRAINT subject_mark_mode_check CHECK ((mark_mode = ANY (ARRAY['lookup'::text, 'rubric'::text])))
);

ALTER TABLE ONLY public.subject FORCE ROW LEVEL SECURITY;


--
-- Name: taxonomy_case; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_case (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    section text NOT NULL,
    section_name text NOT NULL,
    label text NOT NULL,
    example_text text DEFAULT ''::text NOT NULL,
    example jsonb NOT NULL,
    match jsonb NOT NULL,
    min_items integer DEFAULT 12 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    taxonomy text DEFAULT 'ADD_SUB'::text NOT NULL,
    CONSTRAINT taxonomy_case_min_items_check CHECK ((min_items > 0))
);

ALTER TABLE ONLY public.taxonomy_case FORCE ROW LEVEL SECURITY;


--
-- Name: timetable_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_rule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_class_id uuid,
    kind text NOT NULL,
    period_id uuid,
    week_code text,
    weekday smallint,
    on_date date,
    cell text,
    subject_code text,
    text text,
    reason text,
    span text,
    fewest integer,
    most integer,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    staff_id uuid,
    weight integer,
    CONSTRAINT timetable_rule_cell_check CHECK ((cell = ANY (ARRAY['fixed'::text, 'subject'::text, 'specialist'::text, 'empty'::text]))),
    CONSTRAINT timetable_rule_check CHECK (
CASE kind
    WHEN 'frame'::text THEN ((school_class_id IS NOT NULL) AND (staff_id IS NULL) AND (weight IS NULL) AND (period_id IS NOT NULL) AND (week_code IS NOT NULL) AND (weekday IS NOT NULL) AND (cell IS NOT NULL) AND (text IS NOT NULL) AND ((cell = 'empty'::text) OR (btrim(text) <> ''::text)) AND (valid_from IS NOT NULL) AND ((valid_to IS NULL) OR (valid_to >= valid_from)) AND (on_date IS NULL) AND (reason IS NULL) AND (span IS NULL) AND (fewest IS NULL) AND (most IS NULL))
    WHEN 'block'::text THEN ((school_class_id IS NOT NULL) AND (staff_id IS NULL) AND ((on_date IS NULL) <> (weekday IS NULL)) AND ((week_code IS NULL) OR (weekday IS NOT NULL)) AND (btrim(COALESCE(reason, ''::text)) <> ''::text) AND (cell IS NULL) AND (subject_code IS NULL) AND (text IS NULL) AND (span IS NULL) AND (fewest IS NULL) AND (most IS NULL) AND (valid_from IS NULL) AND (valid_to IS NULL))
    WHEN 'limit'::text THEN ((school_class_id IS NOT NULL) AND (staff_id IS NULL) AND (btrim(COALESCE(subject_code, ''::text)) <> ''::text) AND (span IS NOT NULL) AND ((fewest IS NOT NULL) OR (most IS NOT NULL)) AND ((fewest IS NULL) OR (most IS NULL) OR (fewest <= most)) AND (period_id IS NULL) AND (week_code IS NULL) AND (weekday IS NULL) AND (on_date IS NULL) AND (cell IS NULL) AND (text IS NULL) AND (reason IS NULL) AND (valid_from IS NULL) AND (valid_to IS NULL))
    WHEN 'away'::text THEN ((school_class_id IS NULL) AND (staff_id IS NOT NULL) AND ((on_date IS NULL) <> (weekday IS NULL)) AND ((week_code IS NULL) OR (weekday IS NOT NULL)) AND (btrim(COALESCE(reason, ''::text)) <> ''::text) AND (cell IS NULL) AND (subject_code IS NULL) AND (text IS NULL) AND (span IS NULL) AND (fewest IS NULL) AND (most IS NULL) AND (valid_from IS NULL) AND (valid_to IS NULL))
    ELSE NULL::boolean
END),
    CONSTRAINT timetable_rule_fewest_check CHECK (((fewest IS NULL) OR (fewest >= 0))),
    CONSTRAINT timetable_rule_kind_check CHECK ((kind = ANY (ARRAY['frame'::text, 'block'::text, 'limit'::text, 'away'::text]))),
    CONSTRAINT timetable_rule_most_check CHECK (((most IS NULL) OR (most >= 0))),
    CONSTRAINT timetable_rule_on_date_check CHECK (((on_date IS NULL) OR ((EXTRACT(isodow FROM on_date) >= (1)::numeric) AND (EXTRACT(isodow FROM on_date) <= (5)::numeric)))),
    CONSTRAINT timetable_rule_source_check CHECK ((source = ANY (ARRAY['machine'::text, 'person'::text]))),
    CONSTRAINT timetable_rule_span_check CHECK ((span = ANY (ARRAY['week'::text, 'fortnight'::text, 'day'::text]))),
    CONSTRAINT timetable_rule_week_code_check CHECK ((week_code = ANY (ARRAY['A'::text, 'B'::text]))),
    CONSTRAINT timetable_rule_weekday_check CHECK (((weekday >= 1) AND (weekday <= 5))),
    CONSTRAINT timetable_rule_weight_check CHECK (((weight IS NULL) OR (weight > 0)))
);

ALTER TABLE ONLY public.timetable_rule FORCE ROW LEVEL SECURITY;


--
-- Name: timetable_clash; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.timetable_clash WITH (security_invoker='true') AS
 WITH cell AS (
         SELECT f.tenant_id,
            f.id AS fortnight_id,
            f.number AS fortnight_number,
            s.school_class_id,
            d.on_date,
                CASE
                    WHEN ((d.on_date - f.starts_on) < 7) THEN 'A'::text
                    ELSE 'B'::text
                END AS week_code,
            s.period_id,
            s.kind,
            s.subject_code,
            s.id AS session_id
           FROM (((public.fortnight f
             JOIN public.school_class c ON (((c.tenant_id = f.tenant_id) AND (c.academic_year_id = f.academic_year_id))))
             JOIN public.school_day d ON (((d.campus_id = c.campus_id) AND ((d.on_date >= f.starts_on) AND (d.on_date <= f.ends_on)) AND (d.kind <> 'holiday'::text))))
             JOIN public.session s ON (((s.school_class_id = c.id) AND (s.school_day_id = d.id))))
          WHERE ((f.kind = 'teaching'::text) AND (EXTRACT(isodow FROM d.on_date) <= (5)::numeric))
        ), blocked AS (
         SELECT k_1.tenant_id,
            k_1.fortnight_id,
            k_1.fortnight_number,
            k_1.week_code,
            'blocked'::text AS kind,
            md5(format('blocked|%s|%s|%s|%s|%s|%s|%s'::text, k_1.fortnight_id, k_1.school_class_id, k_1.on_date, k_1.period_id, b.id, COALESCE(k_1.subject_code, k_1.kind), k_1.session_id)) AS clash_key,
            jsonb_build_array(jsonb_build_object('class', k_1.school_class_id, 'date', k_1.on_date, 'period', k_1.period_id)) AS places,
            b.id AS rule_id,
            format('%s on %s: %s'::text, COALESCE(k_1.subject_code, k_1.kind), k_1.on_date, b.reason) AS detail
           FROM (cell k_1
             JOIN public.timetable_rule b ON (((b.kind = 'block'::text) AND (b.school_class_id = k_1.school_class_id) AND ((b.on_date = k_1.on_date) OR ((b.on_date IS NULL) AND ((b.weekday)::numeric = EXTRACT(isodow FROM k_1.on_date)) AND ((b.week_code IS NULL) OR (b.week_code = k_1.week_code)))) AND ((b.period_id IS NULL) OR (b.period_id = k_1.period_id)))))
          WHERE (k_1.kind = ANY (ARRAY['subject'::text, 'specialist'::text]))
        ), limited AS (
         SELECT l.id AS rule_id,
            l.subject_code,
            l.span,
            l.fewest,
            l.most,
            fn.tenant_id,
            fn.fortnight_id,
            fn.fortnight_number,
                CASE
                    WHEN (l.span = 'week'::text) THEN wk.code
                    ELSE NULL::text
                END AS week_code,
            ( SELECT count(*) AS count
                   FROM cell k_1
                  WHERE ((k_1.fortnight_id = fn.fortnight_id) AND (k_1.school_class_id = l.school_class_id) AND (k_1.kind = 'subject'::text) AND (k_1.subject_code = l.subject_code) AND ((l.span = 'fortnight'::text) OR (k_1.week_code = wk.code)))) AS lessons,
            COALESCE(( SELECT jsonb_agg(jsonb_build_object('class', k_1.school_class_id, 'date', k_1.on_date, 'period', k_1.period_id) ORDER BY k_1.on_date, k_1.period_id) AS jsonb_agg
                   FROM cell k_1
                  WHERE ((k_1.fortnight_id = fn.fortnight_id) AND (k_1.school_class_id = l.school_class_id) AND (k_1.kind = 'subject'::text) AND (k_1.subject_code = l.subject_code) AND ((l.span = 'fortnight'::text) OR (k_1.week_code = wk.code)))), '[]'::jsonb) AS places
           FROM ((public.timetable_rule l
             JOIN ( SELECT DISTINCT cell.tenant_id,
                    cell.fortnight_id,
                    cell.fortnight_number,
                    cell.school_class_id
                   FROM cell) fn ON ((fn.school_class_id = l.school_class_id)))
             CROSS JOIN LATERAL ( SELECT unnest(
                        CASE
                            WHEN (l.span = 'week'::text) THEN ARRAY['A'::text, 'B'::text]
                            ELSE ARRAY[NULL::text]
                        END) AS code) wk)
          WHERE (l.kind = 'limit'::text)
        ), limits AS (
         SELECT limited.tenant_id,
            limited.fortnight_id,
            limited.fortnight_number,
            limited.week_code,
                CASE
                    WHEN ((limited.most IS NOT NULL) AND (limited.lessons > limited.most)) THEN 'over_limit'::text
                    ELSE 'under_limit'::text
                END AS kind,
            md5(format('limit|%s|%s|%s|%s|%s|%s|%s'::text, limited.fortnight_id, limited.rule_id, COALESCE(limited.week_code, ''::text), COALESCE((limited.fewest)::text, ''::text), COALESCE((limited.most)::text, ''::text), limited.lessons, (limited.places)::text)) AS clash_key,
            limited.places,
            limited.rule_id,
            format('%s: %s lessons in %s, %s'::text, limited.subject_code, limited.lessons,
                CASE
                    WHEN (limited.week_code IS NULL) THEN 'the fortnight'::text
                    ELSE ('week '::text || limited.week_code)
                END,
                CASE
                    WHEN ((limited.most IS NOT NULL) AND (limited.lessons > limited.most)) THEN ('most '::text || limited.most)
                    ELSE ('fewest '::text || limited.fewest)
                END) AS detail
           FROM limited
          WHERE (((limited.most IS NOT NULL) AND (limited.lessons > limited.most)) OR ((limited.fewest IS NOT NULL) AND (limited.lessons < limited.fewest)))
        )
 SELECT tenant_id,
    fortnight_id,
    fortnight_number,
    week_code,
    kind,
    clash_key,
    places,
    rule_id,
    detail,
    (EXISTS ( SELECT 1
           FROM public.approval a
          WHERE ((a.tenant_id = k.tenant_id) AND (a.kind = 'timetable_clash'::text) AND (a.target = k.clash_key) AND (a.decision = 'accept'::text) AND (NOT (EXISTS ( SELECT 1
                   FROM public.change_log m,
                    jsonb_array_elements(k.places) p(value)
                  WHERE ((m.tenant_id = k.tenant_id) AND (m.table_name = 'session'::text) AND (m.op = 'move'::text) AND (m.row_id = (((p.value ->> 'class'::text) || ' '::text) || (k.fortnight_id)::text)) AND (m.at > a.created_at) AND ((((m.before ->> 'on_date'::text) = (p.value ->> 'date'::text)) AND ((m.before ->> 'period_id'::text) = (p.value ->> 'period'::text))) OR (((m.after ->> 'on_date'::text) = (p.value ->> 'date'::text)) AND ((m.after ->> 'period_id'::text) = (p.value ->> 'period'::text))))))))))) AS accepted
   FROM ( SELECT blocked.tenant_id,
            blocked.fortnight_id,
            blocked.fortnight_number,
            blocked.week_code,
            blocked.kind,
            blocked.clash_key,
            blocked.places,
            blocked.rule_id,
            blocked.detail
           FROM blocked
        UNION ALL
         SELECT limits.tenant_id,
            limits.fortnight_id,
            limits.fortnight_number,
            limits.week_code,
            limits.kind,
            limits.clash_key,
            limits.places,
            limits.rule_id,
            limits.detail
           FROM limits) k;


--
-- Name: timetable_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_class_id uuid NOT NULL,
    fortnight_id uuid NOT NULL,
    outcome text NOT NULL,
    needed integer NOT NULL,
    placed integer NOT NULL,
    input_text text,
    output_text text,
    fet_version text,
    seed bigint NOT NULL,
    solve_seconds integer NOT NULL,
    report jsonb DEFAULT '{}'::jsonb NOT NULL,
    draft jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by text DEFAULT COALESCE(NULLIF(btrim(current_setting('app.changed_by'::text, true)), ''::text), (SESSION_USER)::text) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT timetable_run_needed_check CHECK ((needed >= 0)),
    CONSTRAINT timetable_run_outcome_check CHECK ((outcome = ANY (ARRAY['placed'::text, 'unmeetable'::text, 'not_found_in_time'::text, 'discarded'::text]))),
    CONSTRAINT timetable_run_placed_check CHECK ((placed >= 0)),
    CONSTRAINT timetable_run_solve_seconds_check CHECK ((solve_seconds > 0))
);

ALTER TABLE ONLY public.timetable_run FORCE ROW LEVEL SECURITY;


--
-- Name: web_error; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_error (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    route text NOT NULL,
    kind text NOT NULL,
    digest text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.web_error FORCE ROW LEVEL SECURITY;


--
-- Name: child child_pkey; Type: CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.child
    ADD CONSTRAINT child_pkey PRIMARY KEY (id);


--
-- Name: child child_tenant_id_child_id_key; Type: CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.child
    ADD CONSTRAINT child_tenant_id_child_id_key UNIQUE (tenant_id, child_id);


--
-- Name: educator_note educator_note_pkey; Type: CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.educator_note
    ADD CONSTRAINT educator_note_pkey PRIMARY KEY (id);


--
-- Name: educator_note educator_note_tenant_id_audio_key_key; Type: CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.educator_note
    ADD CONSTRAINT educator_note_tenant_id_audio_key_key UNIQUE (tenant_id, audio_key);


--
-- Name: note_claim note_claim_pkey; Type: CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.note_claim
    ADD CONSTRAINT note_claim_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff staff_tenant_id_staff_id_key; Type: CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.staff
    ADD CONSTRAINT staff_tenant_id_staff_id_key UNIQUE (tenant_id, staff_id);


--
-- Name: academic_year academic_year_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_year
    ADD CONSTRAINT academic_year_pkey PRIMARY KEY (id);


--
-- Name: academic_year academic_year_tenant_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_year
    ADD CONSTRAINT academic_year_tenant_id_label_key UNIQUE (tenant_id, label);


--
-- Name: access_log access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_log
    ADD CONSTRAINT access_log_pkey PRIMARY KEY (id);


--
-- Name: access_reach access_reach_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_reach
    ADD CONSTRAINT access_reach_pkey PRIMARY KEY (tenant_id, group_code, kind_code);


--
-- Name: access_table access_table_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_table
    ADD CONSTRAINT access_table_pkey PRIMARY KEY (schema_name, table_name);


--
-- Name: activity_material activity_material_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_material
    ADD CONSTRAINT activity_material_pkey PRIMARY KEY (tenant_id, activity_code, material_code);


--
-- Name: activity_objective activity_objective_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_objective
    ADD CONSTRAINT activity_objective_pkey PRIMARY KEY (tenant_id, activity_code, lo_code);


--
-- Name: activity_observation activity_observation_confirmation_id_child_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_confirmation_id_child_id_key UNIQUE (confirmation_id, child_id);


--
-- Name: activity_observation activity_observation_id_tenant_id_child_id_activity_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_id_tenant_id_child_id_activity_code_key UNIQUE (id, tenant_id, child_id, activity_code);


--
-- Name: activity_observation activity_observation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_pkey PRIMARY KEY (id);


--
-- Name: activity activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (id);


--
-- Name: activity_skill activity_skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_skill
    ADD CONSTRAINT activity_skill_pkey PRIMARY KEY (tenant_id, activity_code, skill_code);


--
-- Name: activity activity_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: approval approval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval
    ADD CONSTRAINT approval_pkey PRIMARY KEY (id);


--
-- Name: ask ask_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ask
    ADD CONSTRAINT ask_pkey PRIMARY KEY (id);


--
-- Name: ask ask_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ask
    ADD CONSTRAINT ask_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_tenant_id_child_id_on_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_tenant_id_child_id_on_date_key UNIQUE (tenant_id, child_id, on_date);


--
-- Name: campus campus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campus
    ADD CONSTRAINT campus_pkey PRIMARY KEY (id);


--
-- Name: campus campus_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campus
    ADD CONSTRAINT campus_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: capture capture_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_pkey PRIMARY KEY (id);


--
-- Name: case_dimension case_dimension_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_dimension
    ADD CONSTRAINT case_dimension_pkey PRIMARY KEY (id);


--
-- Name: case_dimension case_dimension_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_dimension
    ADD CONSTRAINT case_dimension_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: change_log change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_log
    ADD CONSTRAINT change_log_pkey PRIMARY KEY (id);


--
-- Name: child child_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child
    ADD CONSTRAINT child_pkey PRIMARY KEY (id);


--
-- Name: child_skill_state child_skill_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_skill_state
    ADD CONSTRAINT child_skill_state_pkey PRIMARY KEY (id);


--
-- Name: child_skill_state child_skill_state_tenant_id_child_id_skill_code_rung_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_skill_state
    ADD CONSTRAINT child_skill_state_tenant_id_child_id_skill_code_rung_code_key UNIQUE (tenant_id, child_id, skill_code, rung_code);


--
-- Name: child_state child_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_state
    ADD CONSTRAINT child_state_pkey PRIMARY KEY (id);


--
-- Name: child_state child_state_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_state
    ADD CONSTRAINT child_state_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: config config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (id);


--
-- Name: config config_tenant_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config
    ADD CONSTRAINT config_tenant_id_key_key UNIQUE (tenant_id, key);


--
-- Name: consent consent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent
    ADD CONSTRAINT consent_pkey PRIMARY KEY (id);


--
-- Name: curriculum_proposal curriculum_proposal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_proposal
    ADD CONSTRAINT curriculum_proposal_pkey PRIMARY KEY (id);


--
-- Name: curriculum_version curriculum_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_version
    ADD CONSTRAINT curriculum_version_pkey PRIMARY KEY (id);


--
-- Name: curriculum_version curriculum_version_tenant_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_version
    ADD CONSTRAINT curriculum_version_tenant_id_number_key UNIQUE (tenant_id, number);


--
-- Name: data_register data_register_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_register
    ADD CONSTRAINT data_register_pkey PRIMARY KEY (id);


--
-- Name: data_register data_register_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_register
    ADD CONSTRAINT data_register_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: difficulty difficulty_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.difficulty
    ADD CONSTRAINT difficulty_pkey PRIMARY KEY (id);


--
-- Name: difficulty difficulty_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.difficulty
    ADD CONSTRAINT difficulty_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: difficulty difficulty_tenant_id_letter_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.difficulty
    ADD CONSTRAINT difficulty_tenant_id_letter_key UNIQUE (tenant_id, letter);


--
-- Name: english_sample english_sample_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_sample
    ADD CONSTRAINT english_sample_pkey PRIMARY KEY (id);


--
-- Name: english_sample english_sample_tenant_id_skill_code_difficulty_question_typ_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_sample
    ADD CONSTRAINT english_sample_tenant_id_skill_code_difficulty_question_typ_key UNIQUE (tenant_id, skill_code, difficulty, question_type, ord);


--
-- Name: enrolment enrolment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrolment
    ADD CONSTRAINT enrolment_pkey PRIMARY KEY (id);


--
-- Name: eval_case eval_case_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_case
    ADD CONSTRAINT eval_case_pkey PRIMARY KEY (id);


--
-- Name: evidence_event evidence_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_event
    ADD CONSTRAINT evidence_event_pkey PRIMARY KEY (id);


--
-- Name: expense expense_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_pkey PRIMARY KEY (id);


--
-- Name: flow_run flow_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_run
    ADD CONSTRAINT flow_run_pkey PRIMARY KEY (id);


--
-- Name: fortnight fortnight_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fortnight
    ADD CONSTRAINT fortnight_pkey PRIMARY KEY (id);


--
-- Name: fortnight fortnight_tenant_id_academic_year_id_starts_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fortnight
    ADD CONSTRAINT fortnight_tenant_id_academic_year_id_starts_on_key UNIQUE (tenant_id, academic_year_id, starts_on);


--
-- Name: framework framework_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.framework
    ADD CONSTRAINT framework_pkey PRIMARY KEY (id);


--
-- Name: framework_statement framework_statement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.framework_statement
    ADD CONSTRAINT framework_statement_pkey PRIMARY KEY (id);


--
-- Name: framework_statement framework_statement_tenant_id_framework_code_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.framework_statement
    ADD CONSTRAINT framework_statement_tenant_id_framework_code_code_key UNIQUE (tenant_id, framework_code, code);


--
-- Name: framework framework_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.framework
    ADD CONSTRAINT framework_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: grade grade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_pkey PRIMARY KEY (id);


--
-- Name: grade grade_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: item_exposure item_exposure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_exposure
    ADD CONSTRAINT item_exposure_pkey PRIMARY KEY (id);


--
-- Name: item_exposure item_exposure_tenant_id_child_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_exposure
    ADD CONSTRAINT item_exposure_tenant_id_child_id_item_id_key UNIQUE (tenant_id, child_id, item_id);


--
-- Name: item item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_pkey PRIMARY KEY (id);


--
-- Name: item_result item_result_capture_id_item_id_rid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_result
    ADD CONSTRAINT item_result_capture_id_item_id_rid_key UNIQUE (capture_id, item_id, rid);


--
-- Name: item_result item_result_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_result
    ADD CONSTRAINT item_result_pkey PRIMARY KEY (id);


--
-- Name: item item_tenant_id_item_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_tenant_id_item_key_key UNIQUE (tenant_id, item_key);


--
-- Name: learning_objective learning_objective_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective
    ADD CONSTRAINT learning_objective_pkey PRIMARY KEY (id);


--
-- Name: learning_objective_skill learning_objective_skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_skill
    ADD CONSTRAINT learning_objective_skill_pkey PRIMARY KEY (tenant_id, lo_code, skill_code);


--
-- Name: learning_objective learning_objective_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective
    ADD CONSTRAINT learning_objective_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: level_rule level_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_rule
    ADD CONSTRAINT level_rule_pkey PRIMARY KEY (id);


--
-- Name: level_rule level_rule_tenant_id_band_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_rule
    ADD CONSTRAINT level_rule_tenant_id_band_level_key UNIQUE (tenant_id, band, level);


--
-- Name: material_item material_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_item
    ADD CONSTRAINT material_item_pkey PRIMARY KEY (tenant_id, code);


--
-- Name: material_item material_item_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_item
    ADD CONSTRAINT material_item_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: materials_line materials_line_list_id_material_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_line
    ADD CONSTRAINT materials_line_list_id_material_code_key UNIQUE (list_id, material_code);


--
-- Name: materials_line materials_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_line
    ADD CONSTRAINT materials_line_pkey PRIMARY KEY (id);


--
-- Name: materials_list materials_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_list
    ADD CONSTRAINT materials_list_pkey PRIMARY KEY (id);


--
-- Name: materials_list materials_list_school_class_id_period_from_on_to_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_list
    ADD CONSTRAINT materials_list_school_class_id_period_from_on_to_on_key UNIQUE (school_class_id, period, from_on, to_on);


--
-- Name: misconception misconception_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception
    ADD CONSTRAINT misconception_pkey PRIMARY KEY (id);


--
-- Name: misconception misconception_tenant_id_code_op_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception
    ADD CONSTRAINT misconception_tenant_id_code_op_key UNIQUE (tenant_id, code, op);


--
-- Name: objective_statement objective_statement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objective_statement
    ADD CONSTRAINT objective_statement_pkey PRIMARY KEY (tenant_id, lo_code, framework_code, statement_code);


--
-- Name: parent_note parent_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_note
    ADD CONSTRAINT parent_note_pkey PRIMARY KEY (id);


--
-- Name: passage passage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passage
    ADD CONSTRAINT passage_pkey PRIMARY KEY (id);


--
-- Name: passage passage_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passage
    ADD CONSTRAINT passage_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: password_ask password_ask_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_ask
    ADD CONSTRAINT password_ask_pkey PRIMARY KEY (id);


--
-- Name: password_link password_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_link
    ADD CONSTRAINT password_link_pkey PRIMARY KEY (id);


--
-- Name: password_link password_link_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_link
    ADD CONSTRAINT password_link_token_hash_key UNIQUE (token_hash);


--
-- Name: period period_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period
    ADD CONSTRAINT period_pkey PRIMARY KEY (id);


--
-- Name: period period_tenant_id_grade_code_starts_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period
    ADD CONSTRAINT period_tenant_id_grade_code_starts_at_key UNIQUE NULLS NOT DISTINCT (tenant_id, grade_code, starts_at, valid_from);


--
-- Name: plan_entry plan_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entry
    ADD CONSTRAINT plan_entry_pkey PRIMARY KEY (id);


--
-- Name: plan_entry plan_entry_school_class_id_fortnight_id_plan_key_ord_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entry
    ADD CONSTRAINT plan_entry_school_class_id_fortnight_id_plan_key_ord_key UNIQUE (school_class_id, fortnight_id, plan_key, ord);


--
-- Name: prescription prescription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_pkey PRIMARY KEY (id);


--
-- Name: prompt prompt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt
    ADD CONSTRAINT prompt_pkey PRIMARY KEY (id);


--
-- Name: question_type question_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_type
    ADD CONSTRAINT question_type_pkey PRIMARY KEY (id);


--
-- Name: question_type question_type_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_type
    ADD CONSTRAINT question_type_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: read_correction read_correction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.read_correction
    ADD CONSTRAINT read_correction_pkey PRIMARY KEY (id);


--
-- Name: registry_skill registry_skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registry_skill
    ADD CONSTRAINT registry_skill_pkey PRIMARY KEY (id);


--
-- Name: registry_skill registry_skill_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registry_skill
    ADD CONSTRAINT registry_skill_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: report_item report_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_item
    ADD CONSTRAINT report_item_pkey PRIMARY KEY (id);


--
-- Name: report_item report_item_tenant_id_skill_code_band_title_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_item
    ADD CONSTRAINT report_item_tenant_id_skill_code_band_title_key UNIQUE (tenant_id, skill_code, band, title);


--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (tenant_id, code);


--
-- Name: rubric rubric_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric
    ADD CONSTRAINT rubric_pkey PRIMARY KEY (id);


--
-- Name: rubric rubric_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric
    ADD CONSTRAINT rubric_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: school_class school_class_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_class
    ADD CONSTRAINT school_class_label_key UNIQUE (tenant_id, academic_year_id, label);


--
-- Name: school_class school_class_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_class
    ADD CONSTRAINT school_class_pkey PRIMARY KEY (id);


--
-- Name: school_class school_class_tenant_id_campus_id_academic_year_id_grade_cod_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_class
    ADD CONSTRAINT school_class_tenant_id_campus_id_academic_year_id_grade_cod_key UNIQUE (tenant_id, campus_id, academic_year_id, grade_code, section);


--
-- Name: school_day school_day_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_day
    ADD CONSTRAINT school_day_pkey PRIMARY KEY (id);


--
-- Name: school_day school_day_tenant_id_campus_id_on_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_day
    ADD CONSTRAINT school_day_tenant_id_campus_id_on_date_key UNIQUE (tenant_id, campus_id, on_date);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_school_class_id_school_day_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_school_class_id_school_day_id_period_id_key UNIQUE (school_class_id, school_day_id, period_id);


--
-- Name: sheet_instance sheet_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_instance
    ADD CONSTRAINT sheet_instance_pkey PRIMARY KEY (id);


--
-- Name: sheet_instance sheet_instance_tenant_id_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_instance
    ADD CONSTRAINT sheet_instance_tenant_id_qr_code_key UNIQUE (tenant_id, qr_code);


--
-- Name: sheet_template sheet_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_template
    ADD CONSTRAINT sheet_template_pkey PRIMARY KEY (id);


--
-- Name: sign_in_failure sign_in_failure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sign_in_failure
    ADD CONSTRAINT sign_in_failure_pkey PRIMARY KEY (id);


--
-- Name: skill_level skill_level_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT skill_level_pkey PRIMARY KEY (id);


--
-- Name: skill_level_question_type skill_level_question_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level_question_type
    ADD CONSTRAINT skill_level_question_type_pkey PRIMARY KEY (id);


--
-- Name: skill_level_question_type skill_level_question_type_tenant_id_skill_code_difficulty_q_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level_question_type
    ADD CONSTRAINT skill_level_question_type_tenant_id_skill_code_difficulty_q_key UNIQUE (tenant_id, skill_code, difficulty, question_type);


--
-- Name: skill_level skill_level_tenant_id_skill_code_difficulty_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT skill_level_tenant_id_skill_code_difficulty_key UNIQUE (tenant_id, skill_code, difficulty);


--
-- Name: skill_mistake skill_mistake_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mistake
    ADD CONSTRAINT skill_mistake_pkey PRIMARY KEY (id);


--
-- Name: skill_mistake skill_mistake_tenant_id_skill_code_misconception_code_op_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mistake
    ADD CONSTRAINT skill_mistake_tenant_id_skill_code_misconception_code_op_key UNIQUE (tenant_id, skill_code, misconception_code, op);


--
-- Name: skill skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_pkey PRIMARY KEY (id);


--
-- Name: skill_prerequisite skill_prerequisite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_pkey PRIMARY KEY (id);


--
-- Name: skill_prerequisite skill_prerequisite_registry_pair_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_registry_pair_key UNIQUE (tenant_id, registry_code, before_registry_code);


--
-- Name: skill_prerequisite skill_prerequisite_tenant_id_skill_code_before_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_tenant_id_skill_code_before_code_key UNIQUE (tenant_id, skill_code, before_code);


--
-- Name: skill_profile_group skill_profile_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_profile_group
    ADD CONSTRAINT skill_profile_group_pkey PRIMARY KEY (tenant_id, skill_code);


--
-- Name: skill_registry_link skill_registry_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_registry_link
    ADD CONSTRAINT skill_registry_link_pkey PRIMARY KEY (id);


--
-- Name: skill_registry_link skill_registry_link_tenant_id_skill_code_registry_skill_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_registry_link
    ADD CONSTRAINT skill_registry_link_tenant_id_skill_code_registry_skill_key UNIQUE (tenant_id, skill_code, registry_skill);


--
-- Name: skill skill_rung_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_rung_code_key UNIQUE (tenant_id, rung_code);


--
-- Name: skill skill_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: staff_note staff_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_note
    ADD CONSTRAINT staff_note_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff_role_grant staff_role_grant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_role_grant
    ADD CONSTRAINT staff_role_grant_pkey PRIMARY KEY (id);


--
-- Name: stock_move stock_move_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_move
    ADD CONSTRAINT stock_move_pkey PRIMARY KEY (id);


--
-- Name: stock_move stock_move_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_move
    ADD CONSTRAINT stock_move_seq_key UNIQUE (seq);


--
-- Name: subject subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_pkey PRIMARY KEY (id);


--
-- Name: subject subject_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: taxonomy_case taxonomy_case_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_case
    ADD CONSTRAINT taxonomy_case_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_case taxonomy_case_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_case
    ADD CONSTRAINT taxonomy_case_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: tenant tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);


--
-- Name: tenant tenant_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_slug_key UNIQUE (slug);


--
-- Name: timetable_rule timetable_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_rule
    ADD CONSTRAINT timetable_rule_pkey PRIMARY KEY (id);


--
-- Name: timetable_run timetable_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_run
    ADD CONSTRAINT timetable_run_pkey PRIMARY KEY (id);


--
-- Name: topic topic_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic
    ADD CONSTRAINT topic_pkey PRIMARY KEY (id);


--
-- Name: topic topic_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic
    ADD CONSTRAINT topic_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: web_error web_error_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_error
    ADD CONSTRAINT web_error_pkey PRIMARY KEY (id);


--
-- Name: educator_note_queue_idx; Type: INDEX; Schema: pii; Owner: -
--

CREATE INDEX educator_note_queue_idx ON pii.educator_note USING btree (tenant_id, staff_id, status);


--
-- Name: educator_note_session_idx; Type: INDEX; Schema: pii; Owner: -
--

CREATE INDEX educator_note_session_idx ON pii.educator_note USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: note_claim_note_idx; Type: INDEX; Schema: pii; Owner: -
--

CREATE INDEX note_claim_note_idx ON pii.note_claim USING btree (note_id);


--
-- Name: pii_child_child_idx; Type: INDEX; Schema: pii; Owner: -
--

CREATE INDEX pii_child_child_idx ON pii.child USING btree (child_id);


--
-- Name: pii_staff_email_idx; Type: INDEX; Schema: pii; Owner: -
--

CREATE UNIQUE INDEX pii_staff_email_idx ON pii.staff USING btree (tenant_id, email);


--
-- Name: access_log_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_log_child_idx ON public.access_log USING btree (child_id, occurred_at DESC);


--
-- Name: access_log_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_log_tenant_idx ON public.access_log USING btree (tenant_id);


--
-- Name: activity_also_bands_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_also_bands_idx ON public.activity USING gin (also_bands);


--
-- Name: activity_material_by_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_material_by_item_idx ON public.activity_material USING btree (tenant_id, material_code);


--
-- Name: activity_objective_by_lo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_objective_by_lo_idx ON public.activity_objective USING btree (tenant_id, lo_code);


--
-- Name: activity_observation_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_observation_child_idx ON public.activity_observation USING btree (tenant_id, child_id, activity_code);


--
-- Name: activity_observation_corrected_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_observation_corrected_once ON public.activity_observation USING btree (supersedes) WHERE (supersedes IS NOT NULL);


--
-- Name: activity_observation_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_observation_note_idx ON public.activity_observation USING btree (note_id) WHERE (note_id IS NOT NULL);


--
-- Name: activity_skill_by_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_skill_by_skill_idx ON public.activity_skill USING btree (tenant_id, skill_code);


--
-- Name: activity_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_subject_idx ON public.activity USING btree (tenant_id, subject_code);


--
-- Name: approval_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_target_idx ON public.approval USING btree (tenant_id, kind, target, seq);


--
-- Name: attendance_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_day_idx ON public.attendance USING btree (tenant_id, on_date);


--
-- Name: capture_live_content_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX capture_live_content_idx ON public.capture USING btree (tenant_id, sheet_instance_id, file_sha256) WHERE (superseded_by IS NULL);


--
-- Name: capture_sheet_instance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_sheet_instance_idx ON public.capture USING btree (sheet_instance_id);


--
-- Name: capture_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_status_idx ON public.capture USING btree (tenant_id, status);


--
-- Name: capture_superseded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_superseded_by_idx ON public.capture USING btree (superseded_by);


--
-- Name: capture_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_uploaded_by_idx ON public.capture USING btree (uploaded_by) WHERE (uploaded_by IS NOT NULL);


--
-- Name: change_log_rekey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX change_log_rekey_key ON public.change_log USING btree (((before ->> 'item_key'::text)), tenant_id) WHERE ((table_name = 'item'::text) AND (op = 'rekey'::text));


--
-- Name: change_log_row_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX change_log_row_idx ON public.change_log USING btree (tenant_id, table_name, row_id, at);


--
-- Name: child_skill_state_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX child_skill_state_child_idx ON public.child_skill_state USING btree (child_id);


--
-- Name: child_skill_state_one; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX child_skill_state_one ON public.child_skill_state USING btree (tenant_id, child_id, skill_code, kind, COALESCE(rung_code, grade_code));


--
-- Name: child_state_one_too_few; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX child_state_one_too_few ON public.child_state USING btree (tenant_id) WHERE (NOT enough);


--
-- Name: consent_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consent_child_idx ON public.consent USING btree (child_id, created_at);


--
-- Name: curriculum_proposal_about_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX curriculum_proposal_about_idx ON public.curriculum_proposal USING btree (about) WHERE (about IS NOT NULL);


--
-- Name: curriculum_proposal_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX curriculum_proposal_subject_idx ON public.curriculum_proposal USING btree (tenant_id, kind, subject_code);


--
-- Name: english_sample_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX english_sample_skill_idx ON public.english_sample USING btree (tenant_id, skill_code);


--
-- Name: enrolment_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrolment_child_idx ON public.enrolment USING btree (child_id);


--
-- Name: enrolment_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrolment_class_idx ON public.enrolment USING btree (class_id) WHERE (to_date IS NULL);


--
-- Name: enrolment_one_open_per_child; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX enrolment_one_open_per_child ON public.enrolment USING btree (child_id) WHERE (to_date IS NULL);


--
-- Name: enrolment_one_open_roll_per_class; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX enrolment_one_open_roll_per_class ON public.enrolment USING btree (class_id, roll_no) WHERE (to_date IS NULL);


--
-- Name: eval_case_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_case_child_idx ON public.eval_case USING btree (tenant_id, child_id) WHERE (child_id IS NOT NULL);


--
-- Name: eval_case_finding_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX eval_case_finding_key ON public.eval_case USING btree (tenant_id, child_id, verdict, skill_code, ref) NULLS NOT DISTINCT WHERE (kind = 'report_finding'::text);


--
-- Name: eval_case_open_review_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_case_open_review_idx ON public.eval_case USING btree (tenant_id, verdict) WHERE ((kind = 'item_review'::text) AND (confirmed_by IS NULL) AND (verdict <> 'pass'::text));


--
-- Name: eval_case_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_case_ref_idx ON public.eval_case USING btree (tenant_id, ref) WHERE (ref IS NOT NULL);


--
-- Name: eval_case_review_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX eval_case_review_key ON public.eval_case USING btree (tenant_id, source, ref) WHERE (kind = 'item_review'::text);


--
-- Name: evidence_event_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_event_child_idx ON public.evidence_event USING btree (child_id, observed_at);


--
-- Name: evidence_event_item_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_event_item_result_idx ON public.evidence_event USING btree (item_result_id);


--
-- Name: evidence_event_observation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_event_observation_idx ON public.evidence_event USING btree (observation_id) WHERE (observation_id IS NOT NULL);


--
-- Name: evidence_event_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_event_tenant_idx ON public.evidence_event USING btree (tenant_id);


--
-- Name: expense_claimant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expense_claimant_idx ON public.expense USING btree (claimant_id, created_at DESC);


--
-- Name: expense_source_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX expense_source_ref_idx ON public.expense USING btree (tenant_id, source_ref) WHERE (source_ref IS NOT NULL);


--
-- Name: flow_run_flow_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flow_run_flow_idx ON public.flow_run USING btree (tenant_id, flow, started_at DESC);


--
-- Name: flow_run_idempotency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX flow_run_idempotency_idx ON public.flow_run USING btree (tenant_id, flow, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: fortnight_number_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fortnight_number_once ON public.fortnight USING btree (academic_year_id, number) WHERE (number IS NOT NULL);


--
-- Name: framework_statement_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX framework_statement_kind_idx ON public.framework_statement USING btree (tenant_id, framework_code, kind);


--
-- Name: item_case_codes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_case_codes_idx ON public.item USING gin (case_codes) WHERE (status = 'active'::text);


--
-- Name: item_corrected_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_corrected_from_idx ON public.item USING btree (corrected_from);


--
-- Name: item_eval_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_eval_type_idx ON public.item USING btree (tenant_id, eval_type) WHERE (status = 'active'::text);


--
-- Name: item_exposure_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_exposure_child_idx ON public.item_exposure USING btree (child_id, created_at DESC);


--
-- Name: item_exposure_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_exposure_item_idx ON public.item_exposure USING btree (item_id);


--
-- Name: item_result_capture_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_result_capture_idx ON public.item_result USING btree (capture_id);


--
-- Name: item_result_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_result_item_idx ON public.item_result USING btree (item_id);


--
-- Name: item_result_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_result_state_idx ON public.item_result USING btree (tenant_id, state);


--
-- Name: item_rung_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_rung_idx ON public.item USING btree (tenant_id, rung_code);


--
-- Name: item_skill_set_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_skill_set_idx ON public.item USING btree (tenant_id, skill_set_code, difficulty) WHERE (status = 'active'::text);


--
-- Name: learning_objective_also_bands_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_objective_also_bands_idx ON public.learning_objective USING gin (also_bands);


--
-- Name: learning_objective_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_objective_subject_idx ON public.learning_objective USING btree (tenant_id, subject_code);


--
-- Name: lo_skill_by_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lo_skill_by_skill_idx ON public.learning_objective_skill USING btree (tenant_id, skill_code);


--
-- Name: objective_statement_one_capability; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX objective_statement_one_capability ON public.objective_statement USING btree (tenant_id, lo_code) WHERE (relation = 'counts_toward'::text);


--
-- Name: objective_statement_one_step; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX objective_statement_one_step ON public.objective_statement USING btree (tenant_id, lo_code, framework_code) WHERE (relation = 'on_step'::text);


--
-- Name: objective_statement_statement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX objective_statement_statement_idx ON public.objective_statement USING btree (tenant_id, framework_code, statement_code);


--
-- Name: parent_note_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX parent_note_child_idx ON public.parent_note USING btree (child_id);


--
-- Name: parent_note_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX parent_note_tenant_idx ON public.parent_note USING btree (tenant_id);


--
-- Name: password_ask_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_ask_email_idx ON public.password_ask USING btree (email, created_at DESC);


--
-- Name: password_ask_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_ask_ip_idx ON public.password_ask USING btree (ip, created_at DESC);


--
-- Name: password_link_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_link_open_idx ON public.password_link USING btree (email) WHERE (closed_at IS NULL);


--
-- Name: plan_entry_fortnight_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_entry_fortnight_idx ON public.plan_entry USING btree (fortnight_id);


--
-- Name: plan_entry_link_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_entry_link_run_idx ON public.plan_entry USING btree (link_run) WHERE (link_run IS NOT NULL);


--
-- Name: prescription_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescription_child_idx ON public.prescription USING btree (child_id);


--
-- Name: prescription_one_per_child_week_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prescription_one_per_child_week_kind ON public.prescription USING btree (tenant_id, child_id, week, kind);


--
-- Name: prescription_sheet_instance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescription_sheet_instance_idx ON public.prescription USING btree (sheet_instance_id);


--
-- Name: prescription_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescription_week_idx ON public.prescription USING btree (tenant_id, week);


--
-- Name: prompt_one_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompt_one_active_idx ON public.prompt USING btree (tenant_id, purpose, COALESCE(subject, ''::text)) WHERE active;


--
-- Name: prompt_purpose_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompt_purpose_version_idx ON public.prompt USING btree (tenant_id, purpose, COALESCE(subject, ''::text), version);


--
-- Name: read_correction_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX read_correction_child_idx ON public.read_correction USING btree (tenant_id, child_id);


--
-- Name: read_correction_item_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX read_correction_item_result_idx ON public.read_correction USING btree (item_result_id);


--
-- Name: session_activity_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_activity_code_idx ON public.session USING btree (tenant_id, activity_code) WHERE (activity_code IS NOT NULL);


--
-- Name: session_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_day_idx ON public.session USING btree (school_day_id);


--
-- Name: session_lo_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_lo_code_idx ON public.session USING btree (school_class_id, lo_code) WHERE (lo_code IS NOT NULL);


--
-- Name: sheet_instance_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sheet_instance_child_idx ON public.sheet_instance USING btree (child_id);


--
-- Name: sheet_instance_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sheet_instance_template_idx ON public.sheet_instance USING btree (sheet_template_id);


--
-- Name: sheet_template_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sheet_template_child_idx ON public.sheet_template USING btree (child_id);


--
-- Name: sheet_template_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sheet_template_code_key ON public.sheet_template USING btree (tenant_id, code) WHERE (code IS NOT NULL);


--
-- Name: sheet_template_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sheet_template_week_idx ON public.sheet_template USING btree (tenant_id, week);


--
-- Name: sign_in_failure_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sign_in_failure_recent_idx ON public.sign_in_failure USING btree (email, created_at DESC);


--
-- Name: skill_level_question_type_stopped_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_level_question_type_stopped_idx ON public.skill_level_question_type USING btree (tenant_id, skill_code, difficulty, question_type) WHERE (stopped_at IS NOT NULL);


--
-- Name: skill_lo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_lo_idx ON public.skill USING btree (tenant_id, lo_code);


--
-- Name: skill_profile_group_statement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_profile_group_statement_idx ON public.skill_profile_group USING btree (tenant_id, statement_code);


--
-- Name: staff_note_reporter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_note_reporter_idx ON public.staff_note USING btree (reporter, created_at DESC);


--
-- Name: staff_note_unsent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_note_unsent_idx ON public.staff_note USING btree (created_at) WHERE (status <> 'sent'::text);


--
-- Name: staff_role_grant_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_role_grant_class_idx ON public.staff_role_grant USING btree (school_class_id) WHERE (school_class_id IS NOT NULL);


--
-- Name: staff_role_grant_staff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_role_grant_staff_idx ON public.staff_role_grant USING btree (staff_id);


--
-- Name: stock_move_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_move_item_idx ON public.stock_move USING btree (tenant_id, campus_id, material_code, seq);


--
-- Name: timetable_rule_away_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timetable_rule_away_once ON public.timetable_rule USING btree (staff_id, COALESCE(on_date, '0001-01-01'::date), COALESCE((weekday)::integer, 0), COALESCE(week_code, ''::text), COALESCE(period_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (kind = 'away'::text);


--
-- Name: timetable_rule_away_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_rule_away_staff ON public.timetable_rule USING btree (staff_id) WHERE (kind = 'away'::text);


--
-- Name: timetable_rule_block_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timetable_rule_block_once ON public.timetable_rule USING btree (school_class_id, COALESCE(on_date, '0001-01-01'::date), COALESCE((weekday)::integer, 0), COALESCE(week_code, ''::text), COALESCE(period_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (kind = 'block'::text);


--
-- Name: timetable_rule_frame_cell; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timetable_rule_frame_cell ON public.timetable_rule USING btree (school_class_id, period_id, week_code, weekday, valid_from) WHERE (kind = 'frame'::text);


--
-- Name: timetable_rule_frame_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_rule_frame_open ON public.timetable_rule USING btree (school_class_id) WHERE ((kind = 'frame'::text) AND (valid_to IS NULL));


--
-- Name: timetable_rule_limit_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timetable_rule_limit_once ON public.timetable_rule USING btree (school_class_id, subject_code, span) WHERE (kind = 'limit'::text);


--
-- Name: timetable_run_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_run_class_idx ON public.timetable_run USING btree (school_class_id, fortnight_id, created_at);


--
-- Name: web_error_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_error_recent_idx ON public.web_error USING btree (created_at DESC);


--
-- Name: educator_note educator_note_clock; Type: TRIGGER; Schema: pii; Owner: -
--

CREATE TRIGGER educator_note_clock BEFORE INSERT OR UPDATE ON pii.educator_note FOR EACH ROW EXECUTE FUNCTION internal.note_received_now();


--
-- Name: note_claim note_claim_append_only; Type: TRIGGER; Schema: pii; Owner: -
--

CREATE TRIGGER note_claim_append_only BEFORE DELETE OR UPDATE ON pii.note_claim FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: note_claim note_claim_clock; Type: TRIGGER; Schema: pii; Owner: -
--

CREATE TRIGGER note_claim_clock BEFORE INSERT ON pii.note_claim FOR EACH ROW EXECUTE FUNCTION internal.claim_decided_now();


--
-- Name: child touch_updated_at; Type: TRIGGER; Schema: pii; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON pii.child FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: educator_note touch_updated_at; Type: TRIGGER; Schema: pii; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON pii.educator_note FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: note_claim touch_updated_at; Type: TRIGGER; Schema: pii; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON pii.note_claim FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: staff touch_updated_at; Type: TRIGGER; Schema: pii; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON pii.staff FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: activity activity_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_change_kept AFTER INSERT OR UPDATE ON public.activity FOR EACH ROW EXECUTE FUNCTION internal.change_kept('code', 'strand', 'name', 'objective', 'materials', 'level_0', 'level_1', 'level_2', 'level_3', 'sheet_no', 'steps', 'thinking', 'band', 'also_bands');


--
-- Name: activity_objective activity_objective_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_objective_change_kept AFTER INSERT OR DELETE OR UPDATE ON public.activity_objective FOR EACH ROW EXECUTE FUNCTION internal.change_kept('activity_code', 'lo_code');


--
-- Name: activity_observation activity_observation_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_observation_append_only BEFORE DELETE OR UPDATE ON public.activity_observation FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: activity_observation activity_observation_clock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_observation_clock BEFORE INSERT ON public.activity_observation FOR EACH ROW EXECUTE FUNCTION internal.observation_stored_now();


--
-- Name: activity_observation activity_observation_curriculum; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_observation_curriculum BEFORE INSERT ON public.activity_observation FOR EACH ROW EXECUTE FUNCTION internal.result_names_its_curriculum();


--
-- Name: activity_skill activity_skill_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_skill_change_kept AFTER INSERT OR DELETE OR UPDATE ON public.activity_skill FOR EACH ROW EXECUTE FUNCTION internal.change_kept('activity_code', 'skill_code');


--
-- Name: parent_note approval_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_changed AFTER UPDATE OF approved_by ON public.parent_note FOR EACH ROW WHEN ((old.approved_by IS DISTINCT FROM new.approved_by)) EXECUTE FUNCTION internal.approval_from_stamp('parent_note', 'id', 'approved_by');


--
-- Name: sheet_instance approval_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_changed AFTER UPDATE OF approved_by, approved_at ON public.sheet_instance FOR EACH ROW WHEN (((old.approved_by IS DISTINCT FROM new.approved_by) OR (old.approved_at IS DISTINCT FROM new.approved_at))) EXECUTE FUNCTION internal.approval_from_stamp('sheet', 'id', 'approved_by', 'approved_at');


--
-- Name: skill_level approval_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_changed AFTER UPDATE OF skill_code, difficulty, confirmed_by, confirmed_at ON public.skill_level FOR EACH ROW WHEN (((((old.skill_code IS DISTINCT FROM new.skill_code) OR (old.difficulty IS DISTINCT FROM new.difficulty)) OR (old.confirmed_by IS DISTINCT FROM new.confirmed_by)) OR (old.confirmed_at IS DISTINCT FROM new.confirmed_at))) EXECUTE FUNCTION internal.approval_from_stamp('skill_level', 'skill_code,difficulty', 'confirmed_by', 'confirmed_at');


--
-- Name: skill_prerequisite approval_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_changed AFTER UPDATE OF confirmed_by, confirmed_at ON public.skill_prerequisite FOR EACH ROW WHEN (((old.confirmed_by IS DISTINCT FROM new.confirmed_by) OR (old.confirmed_at IS DISTINCT FROM new.confirmed_at))) EXECUTE FUNCTION internal.approval_from_stamp('skill_prerequisite', 'id', 'confirmed_by', 'confirmed_at');


--
-- Name: approval approval_checked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_checked BEFORE INSERT ON public.approval FOR EACH ROW EXECUTE FUNCTION internal.approval_checked();


--
-- Name: parent_note approval_given; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_given AFTER INSERT ON public.parent_note FOR EACH ROW WHEN ((new.approved_by IS NOT NULL)) EXECUTE FUNCTION internal.approval_from_stamp('parent_note', 'id', 'approved_by');


--
-- Name: sheet_instance approval_given; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_given AFTER INSERT ON public.sheet_instance FOR EACH ROW WHEN ((new.approved_by IS NOT NULL)) EXECUTE FUNCTION internal.approval_from_stamp('sheet', 'id', 'approved_by', 'approved_at');


--
-- Name: skill_level approval_given; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_given AFTER INSERT ON public.skill_level FOR EACH ROW WHEN ((new.confirmed_by IS NOT NULL)) EXECUTE FUNCTION internal.approval_from_stamp('skill_level', 'skill_code,difficulty', 'confirmed_by', 'confirmed_at');


--
-- Name: skill_prerequisite approval_given; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_given AFTER INSERT ON public.skill_prerequisite FOR EACH ROW WHEN ((new.confirmed_by IS NOT NULL)) EXECUTE FUNCTION internal.approval_from_stamp('skill_prerequisite', 'id', 'confirmed_by', 'confirmed_at');


--
-- Name: approval approval_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_kept BEFORE DELETE OR UPDATE ON public.approval FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: capture capture_page_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER capture_page_kept BEFORE UPDATE OF page_prints ON public.capture FOR EACH ROW WHEN ((old.page_prints IS DISTINCT FROM new.page_prints)) EXECUTE FUNCTION internal.capture_page_kept();


--
-- Name: change_log change_log_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER change_log_kept BEFORE DELETE OR UPDATE ON public.change_log FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: consent consent_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consent_kept BEFORE DELETE OR UPDATE ON public.consent FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: consent consent_names_its_register; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consent_names_its_register BEFORE INSERT ON public.consent FOR EACH ROW EXECUTE FUNCTION internal.consent_names_its_register();


--
-- Name: tenant curriculum_begins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER curriculum_begins AFTER INSERT ON public.tenant FOR EACH ROW EXECUTE FUNCTION internal.curriculum_begins_on_new_school();


--
-- Name: curriculum_proposal curriculum_proposal_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER curriculum_proposal_append_only BEFORE DELETE OR UPDATE ON public.curriculum_proposal FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: curriculum_version curriculum_version_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER curriculum_version_kept BEFORE DELETE OR UPDATE ON public.curriculum_version FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: evidence_event evidence_event_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER evidence_event_append_only BEFORE DELETE OR UPDATE ON public.evidence_event FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: evidence_event evidence_event_curriculum; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER evidence_event_curriculum BEFORE INSERT ON public.evidence_event FOR EACH ROW EXECUTE FUNCTION internal.result_names_its_curriculum();


--
-- Name: evidence_event evidence_event_of_a_confirmed_note; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER evidence_event_of_a_confirmed_note BEFORE INSERT ON public.evidence_event FOR EACH ROW EXECUTE FUNCTION internal.evidence_of_a_confirmed_note();


--
-- Name: evidence_event evidence_event_record; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER evidence_event_record BEFORE INSERT ON public.evidence_event FOR EACH ROW EXECUTE FUNCTION internal.evidence_event_record();


--
-- Name: expense expense_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expense_change_kept AFTER INSERT OR UPDATE ON public.expense FOR EACH ROW EXECUTE FUNCTION internal.change_kept('id', 'amount', 'spent_on', 'vendor', 'category', 'status', 'reason', 'paid_on', 'payment_ref');


--
-- Name: expense expense_never_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expense_never_deleted BEFORE DELETE ON public.expense FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_delete();


--
-- Name: fortnight fortnight_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fortnight_change_kept AFTER INSERT OR UPDATE ON public.fortnight FOR EACH ROW EXECUTE FUNCTION internal.change_kept('id', 'state');


--
-- Name: fortnight fortnight_cycle_gate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fortnight_cycle_gate BEFORE UPDATE OF state ON public.fortnight FOR EACH ROW EXECUTE FUNCTION internal.fortnight_cycle_gate();


--
-- Name: grade grade_held_by_a_level; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER grade_held_by_a_level BEFORE DELETE ON public.grade FOR EACH ROW EXECUTE FUNCTION internal.grade_held_by_a_level();


--
-- Name: grade grade_renamed_under_a_level; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER grade_renamed_under_a_level BEFORE UPDATE OF code ON public.grade FOR EACH ROW WHEN ((old.code IS DISTINCT FROM new.code)) EXECUTE FUNCTION internal.grade_held_by_a_level();


--
-- Name: eval_case hand_check_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hand_check_kept BEFORE UPDATE ON public.eval_case FOR EACH ROW WHEN (((old.kind = 'hand_check'::text) OR (new.kind = 'hand_check'::text))) EXECUTE FUNCTION internal.forbid_change();


--
-- Name: eval_case hand_check_kept_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hand_check_kept_delete BEFORE DELETE ON public.eval_case FOR EACH ROW WHEN ((old.kind = 'hand_check'::text)) EXECUTE FUNCTION internal.forbid_change();


--
-- Name: item_result item_result_curriculum; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_result_curriculum BEFORE INSERT ON public.item_result FOR EACH ROW EXECUTE FUNCTION internal.result_names_its_curriculum();


--
-- Name: learning_objective learning_objective_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER learning_objective_change_kept AFTER UPDATE ON public.learning_objective FOR EACH ROW EXECUTE FUNCTION internal.change_kept('code', 'subject', 'subject_code', 'unit', 'title', 'band', 'also_bands', 'ord');


--
-- Name: learning_objective_skill learning_objective_skill_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER learning_objective_skill_change_kept AFTER INSERT OR DELETE OR UPDATE ON public.learning_objective_skill FOR EACH ROW EXECUTE FUNCTION internal.change_kept('lo_code', 'skill_code');


--
-- Name: skill level_band_is_keyed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER level_band_is_keyed BEFORE INSERT OR UPDATE OF level_band ON public.skill FOR EACH ROW EXECUTE FUNCTION internal.level_band_is_keyed();


--
-- Name: parent_note parent_note_sent_when_approved_twice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER parent_note_sent_when_approved_twice BEFORE INSERT OR UPDATE OF lines, sent_at ON public.parent_note FOR EACH ROW EXECUTE FUNCTION internal.parent_note_sent_when_approved_twice();


--
-- Name: tenant people_vocabulary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER people_vocabulary AFTER INSERT ON public.tenant FOR EACH ROW EXECUTE FUNCTION internal.people_vocabulary_on_new_school();


--
-- Name: tenant people_vocabulary_then_access; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER people_vocabulary_then_access AFTER INSERT ON public.tenant FOR EACH ROW EXECUTE FUNCTION internal.access_vocabulary_on_new_school();


--
-- Name: period period_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER period_change_kept AFTER UPDATE ON public.period FOR EACH ROW EXECUTE FUNCTION internal.change_kept('id', 'label', 'starts_at', 'ends_at', 'ord', 'fixed');


--
-- Name: plan_entry plan_entry_link_by_hand; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_entry_link_by_hand BEFORE UPDATE ON public.plan_entry FOR EACH ROW EXECUTE FUNCTION internal.plan_link_by_hand();


--
-- Name: plan_entry plan_entry_link_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_entry_link_on_insert BEFORE INSERT ON public.plan_entry FOR EACH ROW EXECUTE FUNCTION internal.plan_link_on_insert();


--
-- Name: approval retire_flagged_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER retire_flagged_item AFTER INSERT ON public.approval FOR EACH ROW WHEN (((new.kind = 'item'::text) AND (new.decision = 'retire'::text))) EXECUTE FUNCTION internal.retire_flagged_item();


--
-- Name: school_class school_class_label; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER school_class_label BEFORE INSERT ON public.school_class FOR EACH ROW EXECUTE FUNCTION internal.school_class_label();


--
-- Name: tenant school_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER school_settings AFTER INSERT ON public.tenant FOR EACH ROW EXECUTE FUNCTION internal.school_settings_on_new_school();


--
-- Name: tenant school_states; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER school_states AFTER INSERT ON public.tenant FOR EACH ROW EXECUTE FUNCTION internal.school_states_on_new_school();


--
-- Name: tenant school_vocabulary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER school_vocabulary AFTER INSERT ON public.tenant FOR EACH ROW EXECUTE FUNCTION internal.school_vocabulary_on_new_school();


--
-- Name: session session_leaves_materials; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER session_leaves_materials AFTER DELETE ON public.session FOR EACH ROW EXECUTE FUNCTION internal.session_leaves_materials();


--
-- Name: skill skill_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_change_kept AFTER UPDATE ON public.skill FOR EACH ROW EXECUTE FUNCTION internal.change_kept('code', 'rung_code', 'name', 'learning_objective', 'philosophy', 'formats', 'difficulty', 'eval_type', 'version');


--
-- Name: skill_level skill_level_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_change_kept AFTER UPDATE ON public.skill_level FOR EACH ROW EXECUTE FUNCTION internal.change_kept('skill_code,difficulty', 'learning_objective', 'looks_like', 'rule', 'version');


--
-- Name: skill skill_level_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_on_insert AFTER INSERT ON public.skill FOR EACH ROW EXECUTE FUNCTION internal.skill_level_from_skill_set();


--
-- Name: skill skill_level_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_on_update AFTER UPDATE ON public.skill FOR EACH ROW WHEN (((((((old.code IS DISTINCT FROM new.code) OR (old.rung_code IS DISTINCT FROM new.rung_code)) OR (old.difficulty IS DISTINCT FROM new.difficulty)) OR (old.level_band IS DISTINCT FROM new.level_band)) OR (old.level_approved IS DISTINCT FROM new.level_approved)) OR (old.grade IS DISTINCT FROM new.grade))) EXECUTE FUNCTION internal.skill_level_from_skill_set();


--
-- Name: item skill_level_question_type_on_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_question_type_on_item AFTER INSERT OR DELETE OR UPDATE OF status, fmt, template, source, skill_set_code, difficulty ON public.item FOR EACH ROW EXECUTE FUNCTION internal.skill_level_question_type_from_item();


--
-- Name: skill_level skill_level_question_type_on_skill_level; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_question_type_on_skill_level AFTER INSERT ON public.skill_level FOR EACH ROW EXECUTE FUNCTION internal.skill_level_question_type_from_skill_level();


--
-- Name: skill skill_level_question_type_on_skill_set; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_question_type_on_skill_set AFTER UPDATE OF formats ON public.skill FOR EACH ROW WHEN ((old.formats IS DISTINCT FROM new.formats)) EXECUTE FUNCTION internal.skill_level_question_type_from_skill_set();


--
-- Name: question_type skill_level_question_type_on_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_question_type_on_type AFTER INSERT OR DELETE OR UPDATE OF code, fmt ON public.question_type FOR EACH STATEMENT EXECUTE FUNCTION internal.skill_level_question_type_from_type();


--
-- Name: skill_level skill_level_version_on_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_level_version_on_change BEFORE UPDATE ON public.skill_level FOR EACH ROW EXECUTE FUNCTION internal.skill_level_version_on_change();


--
-- Name: skill skill_links_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_links_on_insert AFTER INSERT ON public.skill FOR EACH ROW EXECUTE FUNCTION internal.skill_links_from_skill_set();


--
-- Name: skill skill_links_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_links_on_update AFTER UPDATE ON public.skill FOR EACH ROW WHEN (((((old.code IS DISTINCT FROM new.code) OR (old.rung_code IS DISTINCT FROM new.rung_code)) OR (old.misconception_codes IS DISTINCT FROM new.misconception_codes)) OR (old.registry_codes IS DISTINCT FROM new.registry_codes))) EXECUTE FUNCTION internal.skill_links_from_skill_set();


--
-- Name: misconception skill_mistake_on_misconception; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_mistake_on_misconception AFTER INSERT ON public.misconception FOR EACH ROW EXECUTE FUNCTION internal.skill_mistake_from_misconception();


--
-- Name: skill_prerequisite skill_prerequisite_confirmation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_prerequisite_confirmation BEFORE INSERT OR UPDATE ON public.skill_prerequisite FOR EACH ROW EXECUTE FUNCTION internal.skill_link_confirmation();


--
-- Name: skill_prerequisite skill_prerequisite_no_circle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER skill_prerequisite_no_circle AFTER INSERT OR UPDATE ON public.skill_prerequisite NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION internal.skill_prerequisite_no_circle();


--
-- Name: skill skill_set_version_on_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skill_set_version_on_change BEFORE UPDATE ON public.skill FOR EACH ROW EXECUTE FUNCTION internal.skill_set_version_on_change();


--
-- Name: staff_note staff_note_words_stay; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER staff_note_words_stay BEFORE DELETE OR UPDATE ON public.staff_note FOR EACH ROW EXECUTE FUNCTION internal.staff_note_words_stay();


--
-- Name: staff_role_grant staff_role_grant_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER staff_role_grant_check BEFORE INSERT ON public.staff_role_grant FOR EACH ROW EXECUTE FUNCTION internal.check_role_grant();


--
-- Name: staff_role_grant staff_role_grant_never_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER staff_role_grant_never_deleted BEFORE DELETE ON public.staff_role_grant FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_delete();


--
-- Name: staff_role_grant staff_role_grant_not_edited; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER staff_role_grant_not_edited BEFORE UPDATE ON public.staff_role_grant FOR EACH ROW EXECUTE FUNCTION internal.refuse_grant_edit();


--
-- Name: stock_move stock_move_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_move_append_only BEFORE DELETE OR UPDATE ON public.stock_move FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: approval timetable_approval_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_approval_guard BEFORE INSERT ON public.approval FOR EACH ROW WHEN ((new.kind = 'timetable'::text)) EXECUTE FUNCTION internal.timetable_approval_guard();


--
-- Name: timetable_rule timetable_rule_change_kept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_rule_change_kept AFTER INSERT OR DELETE OR UPDATE ON public.timetable_rule FOR EACH ROW EXECUTE FUNCTION internal.change_kept('school_class_id,id');


--
-- Name: timetable_run timetable_run_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_run_append_only BEFORE DELETE OR UPDATE ON public.timetable_run FOR EACH STATEMENT EXECUTE FUNCTION internal.forbid_change();


--
-- Name: academic_year touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.academic_year FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: access_log touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.access_log FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: access_reach touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.access_reach FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: access_table touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.access_table FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: activity touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.activity FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: activity_material touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.activity_material FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: activity_objective touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.activity_objective FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: activity_observation touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.activity_observation FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: activity_skill touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.activity_skill FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: approval touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.approval FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: ask touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.ask FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: attendance touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: campus touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.campus FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: capture touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.capture FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: case_dimension touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.case_dimension FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: change_log touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.change_log FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: child touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.child FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: child_skill_state touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.child_skill_state FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: child_state touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.child_state FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: config touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.config FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: consent touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.consent FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: curriculum_proposal touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.curriculum_proposal FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: curriculum_version touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.curriculum_version FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: data_register touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.data_register FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: difficulty touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.difficulty FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: english_sample touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.english_sample FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: enrolment touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.enrolment FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: eval_case touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.eval_case FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: evidence_event touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.evidence_event FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: expense touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.expense FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: flow_run touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.flow_run FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: fortnight touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.fortnight FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: framework touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.framework FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: framework_statement touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.framework_statement FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: grade touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.grade FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: item touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.item FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: item_exposure touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.item_exposure FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: item_result touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.item_result FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: learning_objective touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.learning_objective FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: learning_objective_skill touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.learning_objective_skill FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: level_rule touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.level_rule FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: material_item touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.material_item FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: materials_line touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.materials_line FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: materials_list touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.materials_list FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: misconception touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.misconception FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: objective_statement touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.objective_statement FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: parent_note touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.parent_note FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: passage touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.passage FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: password_ask touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.password_ask FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: password_link touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.password_link FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: period touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.period FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: plan_entry touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.plan_entry FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: prescription touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.prescription FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: prompt touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.prompt FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: question_type touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.question_type FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: read_correction touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.read_correction FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: registry_skill touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.registry_skill FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: report_item touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.report_item FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: role touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.role FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: rubric touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.rubric FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: school_class touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.school_class FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: school_day touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.school_day FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: session touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.session FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: sheet_instance touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.sheet_instance FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: sheet_template touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.sheet_template FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: sign_in_failure touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.sign_in_failure FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: skill touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.skill FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: skill_level touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.skill_level FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: skill_level_question_type touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.skill_level_question_type FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: skill_mistake touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.skill_mistake FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: skill_prerequisite touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.skill_prerequisite FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: skill_profile_group touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.skill_profile_group FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: skill_registry_link touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.skill_registry_link FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: staff touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: staff_note touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.staff_note FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: staff_role_grant touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.staff_role_grant FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: stock_move touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.stock_move FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: subject touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.subject FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: taxonomy_case touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.taxonomy_case FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: tenant touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.tenant FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: timetable_rule touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.timetable_rule FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: timetable_run touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.timetable_run FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: topic touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.topic FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: web_error touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.web_error FOR EACH ROW EXECUTE FUNCTION internal.touch_updated_at();


--
-- Name: child child_child_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.child
    ADD CONSTRAINT child_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: child child_tenant_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.child
    ADD CONSTRAINT child_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: educator_note educator_note_class_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.educator_note
    ADD CONSTRAINT educator_note_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.school_class(id);


--
-- Name: educator_note educator_note_session_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.educator_note
    ADD CONSTRAINT educator_note_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(id);


--
-- Name: educator_note educator_note_staff_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.educator_note
    ADD CONSTRAINT educator_note_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: educator_note educator_note_tenant_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.educator_note
    ADD CONSTRAINT educator_note_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: note_claim note_claim_decided_by_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.note_claim
    ADD CONSTRAINT note_claim_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.staff(id);


--
-- Name: note_claim note_claim_note_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.note_claim
    ADD CONSTRAINT note_claim_note_id_fkey FOREIGN KEY (note_id) REFERENCES pii.educator_note(id);


--
-- Name: note_claim note_claim_tenant_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.note_claim
    ADD CONSTRAINT note_claim_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: staff staff_staff_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.staff
    ADD CONSTRAINT staff_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff staff_tenant_id_fkey; Type: FK CONSTRAINT; Schema: pii; Owner: -
--

ALTER TABLE ONLY pii.staff
    ADD CONSTRAINT staff_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: academic_year academic_year_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_year
    ADD CONSTRAINT academic_year_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: access_log access_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_log
    ADD CONSTRAINT access_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: access_reach access_reach_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_reach
    ADD CONSTRAINT access_reach_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity_material activity_material_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_material
    ADD CONSTRAINT activity_material_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.curriculum_proposal(id);


--
-- Name: activity_material activity_material_tenant_id_activity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_material
    ADD CONSTRAINT activity_material_tenant_id_activity_code_fkey FOREIGN KEY (tenant_id, activity_code) REFERENCES public.activity(tenant_id, code) ON DELETE CASCADE;


--
-- Name: activity_material activity_material_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_material
    ADD CONSTRAINT activity_material_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity_material activity_material_tenant_id_material_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_material
    ADD CONSTRAINT activity_material_tenant_id_material_code_fkey FOREIGN KEY (tenant_id, material_code) REFERENCES public.material_item(tenant_id, code);


--
-- Name: activity_objective activity_objective_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_objective
    ADD CONSTRAINT activity_objective_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.curriculum_proposal(id);


--
-- Name: activity_objective activity_objective_tenant_id_activity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_objective
    ADD CONSTRAINT activity_objective_tenant_id_activity_code_fkey FOREIGN KEY (tenant_id, activity_code) REFERENCES public.activity(tenant_id, code) ON DELETE CASCADE;


--
-- Name: activity_objective activity_objective_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_objective
    ADD CONSTRAINT activity_objective_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity_objective activity_objective_tenant_id_lo_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_objective
    ADD CONSTRAINT activity_objective_tenant_id_lo_code_fkey FOREIGN KEY (tenant_id, lo_code) REFERENCES public.learning_objective(tenant_id, code) ON DELETE CASCADE;


--
-- Name: activity_observation activity_observation_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id);


--
-- Name: activity_observation activity_observation_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.school_class(id);


--
-- Name: activity_observation activity_observation_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.staff(id);


--
-- Name: activity_observation activity_observation_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_note_id_fkey FOREIGN KEY (note_id) REFERENCES pii.educator_note(id);


--
-- Name: activity_observation activity_observation_observed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_observed_by_fkey FOREIGN KEY (observed_by) REFERENCES public.staff(id);


--
-- Name: activity_observation activity_observation_supersedes_tenant_id_child_id_activit_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_supersedes_tenant_id_child_id_activit_fkey FOREIGN KEY (supersedes, tenant_id, child_id, activity_code) REFERENCES public.activity_observation(id, tenant_id, child_id, activity_code);


--
-- Name: activity_observation activity_observation_tenant_id_activity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_tenant_id_activity_code_fkey FOREIGN KEY (tenant_id, activity_code) REFERENCES public.activity(tenant_id, code);


--
-- Name: activity_observation activity_observation_tenant_id_curriculum_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_tenant_id_curriculum_version_fkey FOREIGN KEY (tenant_id, curriculum_version) REFERENCES public.curriculum_version(tenant_id, number);


--
-- Name: activity_observation activity_observation_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_observation
    ADD CONSTRAINT activity_observation_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity_skill activity_skill_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_skill
    ADD CONSTRAINT activity_skill_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.curriculum_proposal(id);


--
-- Name: activity_skill activity_skill_tenant_id_activity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_skill
    ADD CONSTRAINT activity_skill_tenant_id_activity_code_fkey FOREIGN KEY (tenant_id, activity_code) REFERENCES public.activity(tenant_id, code) ON DELETE CASCADE;


--
-- Name: activity_skill activity_skill_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_skill
    ADD CONSTRAINT activity_skill_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity_skill activity_skill_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_skill
    ADD CONSTRAINT activity_skill_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.registry_skill(tenant_id, code) ON DELETE CASCADE;


--
-- Name: activity activity_subject_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_subject_fk FOREIGN KEY (tenant_id, subject_code) REFERENCES public.subject(tenant_id, code);


--
-- Name: activity activity_tenant_id_band_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_tenant_id_band_fkey FOREIGN KEY (tenant_id, band) REFERENCES public.grade(tenant_id, code);


--
-- Name: activity activity_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: approval approval_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval
    ADD CONSTRAINT approval_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: ask ask_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ask
    ADD CONSTRAINT ask_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id);


--
-- Name: attendance attendance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: campus campus_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campus
    ADD CONSTRAINT campus_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: capture capture_sheet_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_sheet_instance_id_fkey FOREIGN KEY (sheet_instance_id) REFERENCES public.sheet_instance(id);


--
-- Name: capture capture_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.capture(id);


--
-- Name: capture capture_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: capture capture_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.staff(id);


--
-- Name: case_dimension case_dimension_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_dimension
    ADD CONSTRAINT case_dimension_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: change_log change_log_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_log
    ADD CONSTRAINT change_log_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: change_log change_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_log
    ADD CONSTRAINT change_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: child_skill_state child_skill_state_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_skill_state
    ADD CONSTRAINT child_skill_state_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: child_skill_state child_skill_state_tenant_id_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_skill_state
    ADD CONSTRAINT child_skill_state_tenant_id_difficulty_fkey FOREIGN KEY (tenant_id, difficulty) REFERENCES public.difficulty(tenant_id, code);


--
-- Name: child_skill_state child_skill_state_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_skill_state
    ADD CONSTRAINT child_skill_state_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: child_skill_state child_skill_state_tenant_id_grade_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_skill_state
    ADD CONSTRAINT child_skill_state_tenant_id_grade_code_fkey FOREIGN KEY (tenant_id, grade_code) REFERENCES public.grade(tenant_id, code);


--
-- Name: child_skill_state child_skill_state_tenant_id_state_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_skill_state
    ADD CONSTRAINT child_skill_state_tenant_id_state_fkey FOREIGN KEY (tenant_id, state) REFERENCES public.child_state(tenant_id, code);


--
-- Name: child_state child_state_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_state
    ADD CONSTRAINT child_state_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: child child_tenant_id_band_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child
    ADD CONSTRAINT child_tenant_id_band_fkey FOREIGN KEY (tenant_id, band) REFERENCES public.grade(tenant_id, code);


--
-- Name: child child_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child
    ADD CONSTRAINT child_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: config config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config
    ADD CONSTRAINT config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: consent consent_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent
    ADD CONSTRAINT consent_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: consent consent_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent
    ADD CONSTRAINT consent_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: curriculum_proposal curriculum_proposal_about_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_proposal
    ADD CONSTRAINT curriculum_proposal_about_fkey FOREIGN KEY (about) REFERENCES public.curriculum_proposal(id);


--
-- Name: curriculum_proposal curriculum_proposal_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_proposal
    ADD CONSTRAINT curriculum_proposal_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: curriculum_proposal curriculum_proposal_tenant_id_curriculum_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_proposal
    ADD CONSTRAINT curriculum_proposal_tenant_id_curriculum_version_fkey FOREIGN KEY (tenant_id, curriculum_version) REFERENCES public.curriculum_version(tenant_id, number);


--
-- Name: curriculum_proposal curriculum_proposal_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_proposal
    ADD CONSTRAINT curriculum_proposal_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: curriculum_version curriculum_version_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_version
    ADD CONSTRAINT curriculum_version_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: data_register data_register_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_register
    ADD CONSTRAINT data_register_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: difficulty difficulty_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.difficulty
    ADD CONSTRAINT difficulty_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: english_sample english_sample_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_sample
    ADD CONSTRAINT english_sample_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: english_sample english_sample_tenant_id_passage_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_sample
    ADD CONSTRAINT english_sample_tenant_id_passage_code_fkey FOREIGN KEY (tenant_id, passage_code) REFERENCES public.passage(tenant_id, code) ON UPDATE CASCADE;


--
-- Name: english_sample english_sample_tenant_id_question_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_sample
    ADD CONSTRAINT english_sample_tenant_id_question_type_fkey FOREIGN KEY (tenant_id, question_type) REFERENCES public.question_type(tenant_id, code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: english_sample english_sample_tenant_id_rubric_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_sample
    ADD CONSTRAINT english_sample_tenant_id_rubric_code_fkey FOREIGN KEY (tenant_id, rubric_code) REFERENCES public.rubric(tenant_id, code) ON UPDATE CASCADE;


--
-- Name: english_sample english_sample_tenant_id_skill_code_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.english_sample
    ADD CONSTRAINT english_sample_tenant_id_skill_code_difficulty_fkey FOREIGN KEY (tenant_id, skill_code, difficulty) REFERENCES public.skill_level(tenant_id, skill_code, difficulty) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: enrolment enrolment_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrolment
    ADD CONSTRAINT enrolment_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id);


--
-- Name: enrolment enrolment_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrolment
    ADD CONSTRAINT enrolment_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.school_class(id);


--
-- Name: enrolment enrolment_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrolment
    ADD CONSTRAINT enrolment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: eval_case eval_case_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_case
    ADD CONSTRAINT eval_case_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: eval_case eval_case_tenant_id_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_case
    ADD CONSTRAINT eval_case_tenant_id_difficulty_fkey FOREIGN KEY (tenant_id, difficulty) REFERENCES public.difficulty(tenant_id, code);


--
-- Name: eval_case eval_case_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_case
    ADD CONSTRAINT eval_case_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: evidence_event evidence_event_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_event
    ADD CONSTRAINT evidence_event_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: evidence_event evidence_event_item_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_event
    ADD CONSTRAINT evidence_event_item_result_id_fkey FOREIGN KEY (item_result_id) REFERENCES public.item_result(id);


--
-- Name: evidence_event evidence_event_observation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_event
    ADD CONSTRAINT evidence_event_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES public.activity_observation(id);


--
-- Name: evidence_event evidence_event_tenant_id_curriculum_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_event
    ADD CONSTRAINT evidence_event_tenant_id_curriculum_version_fkey FOREIGN KEY (tenant_id, curriculum_version) REFERENCES public.curriculum_version(tenant_id, number);


--
-- Name: evidence_event evidence_event_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_event
    ADD CONSTRAINT evidence_event_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: evidence_event evidence_event_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_event
    ADD CONSTRAINT evidence_event_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.registry_skill(tenant_id, code) NOT VALID;


--
-- Name: expense expense_campus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id);


--
-- Name: expense expense_claimant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_claimant_id_fkey FOREIGN KEY (claimant_id) REFERENCES public.staff(id);


--
-- Name: expense expense_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.staff(id);


--
-- Name: expense expense_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: flow_run flow_run_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_run
    ADD CONSTRAINT flow_run_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: flow_run flow_run_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_run
    ADD CONSTRAINT flow_run_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.staff(id);


--
-- Name: fortnight fortnight_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fortnight
    ADD CONSTRAINT fortnight_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_year(id);


--
-- Name: fortnight fortnight_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fortnight
    ADD CONSTRAINT fortnight_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: framework_statement framework_statement_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.framework_statement
    ADD CONSTRAINT framework_statement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: framework_statement framework_statement_tenant_id_framework_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.framework_statement
    ADD CONSTRAINT framework_statement_tenant_id_framework_code_fkey FOREIGN KEY (tenant_id, framework_code) REFERENCES public.framework(tenant_id, code);


--
-- Name: framework framework_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.framework
    ADD CONSTRAINT framework_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: grade grade_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: item item_corrected_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_corrected_from_fkey FOREIGN KEY (corrected_from) REFERENCES public.item(id);


--
-- Name: item_exposure item_exposure_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_exposure
    ADD CONSTRAINT item_exposure_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: item_exposure item_exposure_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_exposure
    ADD CONSTRAINT item_exposure_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(id) ON DELETE CASCADE;


--
-- Name: item_exposure item_exposure_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_exposure
    ADD CONSTRAINT item_exposure_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: item item_prompt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.prompt(id);


--
-- Name: item_result item_result_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_result
    ADD CONSTRAINT item_result_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES public.capture(id) ON DELETE CASCADE;


--
-- Name: item_result item_result_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_result
    ADD CONSTRAINT item_result_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(id);


--
-- Name: item_result item_result_tenant_id_curriculum_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_result
    ADD CONSTRAINT item_result_tenant_id_curriculum_version_fkey FOREIGN KEY (tenant_id, curriculum_version) REFERENCES public.curriculum_version(tenant_id, number);


--
-- Name: item_result item_result_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_result
    ADD CONSTRAINT item_result_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: item item_tenant_id_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_tenant_id_difficulty_fkey FOREIGN KEY (tenant_id, difficulty) REFERENCES public.difficulty(tenant_id, code);


--
-- Name: item item_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: item item_tenant_id_rung_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_tenant_id_rung_code_fkey FOREIGN KEY (tenant_id, rung_code) REFERENCES public.skill(tenant_id, rung_code) ON UPDATE CASCADE;


--
-- Name: learning_objective_skill learning_objective_skill_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_skill
    ADD CONSTRAINT learning_objective_skill_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.curriculum_proposal(id);


--
-- Name: learning_objective_skill learning_objective_skill_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_skill
    ADD CONSTRAINT learning_objective_skill_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: learning_objective_skill learning_objective_skill_tenant_id_lo_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_skill
    ADD CONSTRAINT learning_objective_skill_tenant_id_lo_code_fkey FOREIGN KEY (tenant_id, lo_code) REFERENCES public.learning_objective(tenant_id, code) ON DELETE CASCADE;


--
-- Name: learning_objective_skill learning_objective_skill_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_skill
    ADD CONSTRAINT learning_objective_skill_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.registry_skill(tenant_id, code) ON DELETE CASCADE;


--
-- Name: learning_objective learning_objective_subject_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective
    ADD CONSTRAINT learning_objective_subject_fk FOREIGN KEY (tenant_id, subject_code) REFERENCES public.subject(tenant_id, code);


--
-- Name: learning_objective learning_objective_tenant_id_band_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective
    ADD CONSTRAINT learning_objective_tenant_id_band_fkey FOREIGN KEY (tenant_id, band) REFERENCES public.grade(tenant_id, code);


--
-- Name: learning_objective learning_objective_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective
    ADD CONSTRAINT learning_objective_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: learning_objective learning_objective_topic_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective
    ADD CONSTRAINT learning_objective_topic_fk FOREIGN KEY (tenant_id, topic_code) REFERENCES public.topic(tenant_id, code);


--
-- Name: level_rule level_rule_tenant_id_band_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_rule
    ADD CONSTRAINT level_rule_tenant_id_band_fkey FOREIGN KEY (tenant_id, band) REFERENCES public.grade(tenant_id, code);


--
-- Name: level_rule level_rule_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_rule
    ADD CONSTRAINT level_rule_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: material_item material_item_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_item
    ADD CONSTRAINT material_item_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.curriculum_proposal(id);


--
-- Name: material_item material_item_proposed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_item
    ADD CONSTRAINT material_item_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES public.staff(id);


--
-- Name: material_item material_item_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_item
    ADD CONSTRAINT material_item_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: materials_line materials_line_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_line
    ADD CONSTRAINT materials_line_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.materials_list(id) ON DELETE CASCADE;


--
-- Name: materials_line materials_line_tenant_id_activity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_line
    ADD CONSTRAINT materials_line_tenant_id_activity_code_fkey FOREIGN KEY (tenant_id, activity_code) REFERENCES public.activity(tenant_id, code);


--
-- Name: materials_line materials_line_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_line
    ADD CONSTRAINT materials_line_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: materials_line materials_line_tenant_id_material_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_line
    ADD CONSTRAINT materials_line_tenant_id_material_code_fkey FOREIGN KEY (tenant_id, material_code) REFERENCES public.material_item(tenant_id, code);


--
-- Name: materials_list materials_list_school_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_list
    ADD CONSTRAINT materials_list_school_class_id_fkey FOREIGN KEY (school_class_id) REFERENCES public.school_class(id);


--
-- Name: materials_list materials_list_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_list
    ADD CONSTRAINT materials_list_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: misconception misconception_learned_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception
    ADD CONSTRAINT misconception_learned_from_fkey FOREIGN KEY (learned_from) REFERENCES public.curriculum_proposal(id);


--
-- Name: misconception misconception_skill_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception
    ADD CONSTRAINT misconception_skill_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.registry_skill(tenant_id, code);


--
-- Name: misconception misconception_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception
    ADD CONSTRAINT misconception_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: objective_statement objective_statement_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objective_statement
    ADD CONSTRAINT objective_statement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: objective_statement objective_statement_tenant_id_framework_code_statement_cod_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objective_statement
    ADD CONSTRAINT objective_statement_tenant_id_framework_code_statement_cod_fkey FOREIGN KEY (tenant_id, framework_code, statement_code) REFERENCES public.framework_statement(tenant_id, framework_code, code);


--
-- Name: objective_statement objective_statement_tenant_id_lo_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objective_statement
    ADD CONSTRAINT objective_statement_tenant_id_lo_code_fkey FOREIGN KEY (tenant_id, lo_code) REFERENCES public.learning_objective(tenant_id, code);


--
-- Name: parent_note parent_note_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_note
    ADD CONSTRAINT parent_note_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: parent_note parent_note_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_note
    ADD CONSTRAINT parent_note_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: passage passage_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passage
    ADD CONSTRAINT passage_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: password_ask password_ask_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_ask
    ADD CONSTRAINT password_ask_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: password_link password_link_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_link
    ADD CONSTRAINT password_link_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: period period_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period
    ADD CONSTRAINT period_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: period period_tenant_id_grade_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period
    ADD CONSTRAINT period_tenant_id_grade_code_fkey FOREIGN KEY (tenant_id, grade_code) REFERENCES public.grade(tenant_id, code);


--
-- Name: plan_entry plan_entry_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entry
    ADD CONSTRAINT plan_entry_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id);


--
-- Name: plan_entry plan_entry_fortnight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entry
    ADD CONSTRAINT plan_entry_fortnight_id_fkey FOREIGN KEY (fortnight_id) REFERENCES public.fortnight(id);


--
-- Name: plan_entry plan_entry_school_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entry
    ADD CONSTRAINT plan_entry_school_class_id_fkey FOREIGN KEY (school_class_id) REFERENCES public.school_class(id);


--
-- Name: plan_entry plan_entry_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entry
    ADD CONSTRAINT plan_entry_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: prescription prescription_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: prescription prescription_sheet_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_sheet_instance_id_fkey FOREIGN KEY (sheet_instance_id) REFERENCES public.sheet_instance(id);


--
-- Name: prescription prescription_tenant_id_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_tenant_id_difficulty_fkey FOREIGN KEY (tenant_id, difficulty) REFERENCES public.difficulty(tenant_id, code);


--
-- Name: prescription prescription_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: prompt prompt_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt
    ADD CONSTRAINT prompt_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: question_type question_type_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_type
    ADD CONSTRAINT question_type_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: read_correction read_correction_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.read_correction
    ADD CONSTRAINT read_correction_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES public.capture(id) ON DELETE CASCADE;


--
-- Name: read_correction read_correction_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.read_correction
    ADD CONSTRAINT read_correction_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id) ON DELETE CASCADE;


--
-- Name: read_correction read_correction_item_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.read_correction
    ADD CONSTRAINT read_correction_item_result_id_fkey FOREIGN KEY (item_result_id) REFERENCES public.item_result(id) ON DELETE CASCADE;


--
-- Name: read_correction read_correction_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.read_correction
    ADD CONSTRAINT read_correction_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: registry_skill registry_skill_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registry_skill
    ADD CONSTRAINT registry_skill_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: report_item report_item_tenant_id_band_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_item
    ADD CONSTRAINT report_item_tenant_id_band_fkey FOREIGN KEY (tenant_id, band) REFERENCES public.grade(tenant_id, code);


--
-- Name: report_item report_item_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_item
    ADD CONSTRAINT report_item_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: report_item report_item_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_item
    ADD CONSTRAINT report_item_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.registry_skill(tenant_id, code) ON DELETE CASCADE;


--
-- Name: role role_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: rubric rubric_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric
    ADD CONSTRAINT rubric_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: school_class school_class_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_class
    ADD CONSTRAINT school_class_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_year(id);


--
-- Name: school_class school_class_campus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_class
    ADD CONSTRAINT school_class_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id);


--
-- Name: school_class school_class_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_class
    ADD CONSTRAINT school_class_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: school_class school_class_tenant_id_grade_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_class
    ADD CONSTRAINT school_class_tenant_id_grade_code_fkey FOREIGN KEY (tenant_id, grade_code) REFERENCES public.grade(tenant_id, code);


--
-- Name: school_day school_day_campus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_day
    ADD CONSTRAINT school_day_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id);


--
-- Name: school_day school_day_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_day
    ADD CONSTRAINT school_day_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: session session_activity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_activity_code_fkey FOREIGN KEY (tenant_id, activity_code) REFERENCES public.activity(tenant_id, code);


--
-- Name: session session_led_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_led_by_staff_id_fkey FOREIGN KEY (led_by_staff_id) REFERENCES public.staff(id);


--
-- Name: session session_lo_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_lo_code_fk FOREIGN KEY (tenant_id, lo_code) REFERENCES public.learning_objective(tenant_id, code);


--
-- Name: session session_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.period(id);


--
-- Name: session session_plan_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_plan_entry_id_fkey FOREIGN KEY (plan_entry_id) REFERENCES public.plan_entry(id);


--
-- Name: session session_school_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_school_class_id_fkey FOREIGN KEY (school_class_id) REFERENCES public.school_class(id);


--
-- Name: session session_school_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_school_day_id_fkey FOREIGN KEY (school_day_id) REFERENCES public.school_day(id);


--
-- Name: session session_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: sheet_instance sheet_instance_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_instance
    ADD CONSTRAINT sheet_instance_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id);


--
-- Name: sheet_instance sheet_instance_replaced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_instance
    ADD CONSTRAINT sheet_instance_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES public.sheet_instance(id);


--
-- Name: sheet_instance sheet_instance_sheet_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_instance
    ADD CONSTRAINT sheet_instance_sheet_template_id_fkey FOREIGN KEY (sheet_template_id) REFERENCES public.sheet_template(id) ON DELETE CASCADE;


--
-- Name: sheet_instance sheet_instance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_instance
    ADD CONSTRAINT sheet_instance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: sheet_template sheet_template_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_template
    ADD CONSTRAINT sheet_template_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id);


--
-- Name: sheet_template sheet_template_tenant_id_band_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_template
    ADD CONSTRAINT sheet_template_tenant_id_band_fkey FOREIGN KEY (tenant_id, band) REFERENCES public.grade(tenant_id, code);


--
-- Name: sheet_template sheet_template_tenant_id_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_template
    ADD CONSTRAINT sheet_template_tenant_id_difficulty_fkey FOREIGN KEY (tenant_id, difficulty) REFERENCES public.difficulty(tenant_id, code);


--
-- Name: sheet_template sheet_template_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_template
    ADD CONSTRAINT sheet_template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: sign_in_failure sign_in_failure_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sign_in_failure
    ADD CONSTRAINT sign_in_failure_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill_level_question_type skill_level_question_type_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level_question_type
    ADD CONSTRAINT skill_level_question_type_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill_level_question_type skill_level_question_type_tenant_id_question_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level_question_type
    ADD CONSTRAINT skill_level_question_type_tenant_id_question_type_fkey FOREIGN KEY (tenant_id, question_type) REFERENCES public.question_type(tenant_id, code) ON UPDATE CASCADE;


--
-- Name: skill_level_question_type skill_level_question_type_tenant_id_skill_code_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level_question_type
    ADD CONSTRAINT skill_level_question_type_tenant_id_skill_code_difficulty_fkey FOREIGN KEY (tenant_id, skill_code, difficulty) REFERENCES public.skill_level(tenant_id, skill_code, difficulty) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: skill_level skill_level_tenant_id_difficulty_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT skill_level_tenant_id_difficulty_fkey FOREIGN KEY (tenant_id, difficulty) REFERENCES public.difficulty(tenant_id, code);


--
-- Name: skill_level skill_level_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT skill_level_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill_level skill_level_tenant_id_grade_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT skill_level_tenant_id_grade_fkey FOREIGN KEY (tenant_id, grade) REFERENCES public.grade(tenant_id, code);


--
-- Name: skill_level skill_level_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT skill_level_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.skill(tenant_id, code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: skill skill_lo_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_lo_fk FOREIGN KEY (tenant_id, lo_code) REFERENCES public.learning_objective(tenant_id, code);


--
-- Name: skill_mistake skill_mistake_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mistake
    ADD CONSTRAINT skill_mistake_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill_mistake skill_mistake_tenant_id_misconception_code_op_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mistake
    ADD CONSTRAINT skill_mistake_tenant_id_misconception_code_op_fkey FOREIGN KEY (tenant_id, misconception_code, op) REFERENCES public.misconception(tenant_id, code, op) ON UPDATE CASCADE;


--
-- Name: skill_mistake skill_mistake_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mistake
    ADD CONSTRAINT skill_mistake_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.skill(tenant_id, code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: skill_prerequisite skill_prerequisite_before_registry_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_before_registry_fkey FOREIGN KEY (tenant_id, before_registry_code) REFERENCES public.registry_skill(tenant_id, code) ON UPDATE CASCADE;


--
-- Name: skill_prerequisite skill_prerequisite_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.staff(id);


--
-- Name: skill_prerequisite skill_prerequisite_registry_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_registry_fkey FOREIGN KEY (tenant_id, registry_code) REFERENCES public.registry_skill(tenant_id, code) ON UPDATE CASCADE;


--
-- Name: skill_prerequisite skill_prerequisite_tenant_id_before_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_tenant_id_before_code_fkey FOREIGN KEY (tenant_id, before_code) REFERENCES public.skill(tenant_id, code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: skill_prerequisite skill_prerequisite_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill_prerequisite skill_prerequisite_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_prerequisite
    ADD CONSTRAINT skill_prerequisite_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.skill(tenant_id, code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: skill_profile_group skill_profile_group_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_profile_group
    ADD CONSTRAINT skill_profile_group_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.curriculum_proposal(id);


--
-- Name: skill_profile_group skill_profile_group_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_profile_group
    ADD CONSTRAINT skill_profile_group_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: skill_profile_group skill_profile_group_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_profile_group
    ADD CONSTRAINT skill_profile_group_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill_profile_group skill_profile_group_tenant_id_framework_code_statement_cod_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_profile_group
    ADD CONSTRAINT skill_profile_group_tenant_id_framework_code_statement_cod_fkey FOREIGN KEY (tenant_id, framework_code, statement_code) REFERENCES public.framework_statement(tenant_id, framework_code, code);


--
-- Name: skill_profile_group skill_profile_group_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_profile_group
    ADD CONSTRAINT skill_profile_group_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.registry_skill(tenant_id, code) ON DELETE CASCADE;


--
-- Name: skill_registry_link skill_registry_link_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_registry_link
    ADD CONSTRAINT skill_registry_link_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill_registry_link skill_registry_link_tenant_id_registry_skill_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_registry_link
    ADD CONSTRAINT skill_registry_link_tenant_id_registry_skill_fkey FOREIGN KEY (tenant_id, registry_skill) REFERENCES public.registry_skill(tenant_id, code) ON UPDATE CASCADE;


--
-- Name: skill_registry_link skill_registry_link_tenant_id_skill_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_registry_link
    ADD CONSTRAINT skill_registry_link_tenant_id_skill_code_fkey FOREIGN KEY (tenant_id, skill_code) REFERENCES public.skill(tenant_id, code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: skill skill_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: skill skill_tenant_id_grade_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_tenant_id_grade_fkey FOREIGN KEY (tenant_id, grade) REFERENCES public.grade(tenant_id, code);


--
-- Name: skill skill_tenant_id_topic_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_tenant_id_topic_code_fkey FOREIGN KEY (tenant_id, topic_code) REFERENCES public.topic(tenant_id, code);


--
-- Name: staff staff_campus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id);


--
-- Name: staff_note staff_note_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_note
    ADD CONSTRAINT staff_note_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: staff staff_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_role_fkey FOREIGN KEY (tenant_id, role_code) REFERENCES public.role(tenant_id, code);


--
-- Name: staff_role_grant staff_role_grant_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_role_grant
    ADD CONSTRAINT staff_role_grant_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child(id);


--
-- Name: staff_role_grant staff_role_grant_school_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_role_grant
    ADD CONSTRAINT staff_role_grant_school_class_id_fkey FOREIGN KEY (school_class_id) REFERENCES public.school_class(id);


--
-- Name: staff_role_grant staff_role_grant_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_role_grant
    ADD CONSTRAINT staff_role_grant_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: staff_role_grant staff_role_grant_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_role_grant
    ADD CONSTRAINT staff_role_grant_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: staff_role_grant staff_role_grant_tenant_id_role_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_role_grant
    ADD CONSTRAINT staff_role_grant_tenant_id_role_code_fkey FOREIGN KEY (tenant_id, role_code) REFERENCES public.role(tenant_id, code);


--
-- Name: staff_role_grant staff_role_grant_tenant_id_subject_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_role_grant
    ADD CONSTRAINT staff_role_grant_tenant_id_subject_code_fkey FOREIGN KEY (tenant_id, subject_code) REFERENCES public.subject(tenant_id, code);


--
-- Name: staff staff_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_move stock_move_campus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_move
    ADD CONSTRAINT stock_move_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campus(id);


--
-- Name: stock_move stock_move_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_move
    ADD CONSTRAINT stock_move_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expense(id);


--
-- Name: stock_move stock_move_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_move
    ADD CONSTRAINT stock_move_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: stock_move stock_move_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_move
    ADD CONSTRAINT stock_move_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_move stock_move_tenant_id_material_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_move
    ADD CONSTRAINT stock_move_tenant_id_material_code_fkey FOREIGN KEY (tenant_id, material_code) REFERENCES public.material_item(tenant_id, code);


--
-- Name: subject subject_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: taxonomy_case taxonomy_case_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_case
    ADD CONSTRAINT taxonomy_case_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: timetable_rule timetable_rule_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_rule
    ADD CONSTRAINT timetable_rule_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.period(id);


--
-- Name: timetable_rule timetable_rule_school_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_rule
    ADD CONSTRAINT timetable_rule_school_class_id_fkey FOREIGN KEY (school_class_id) REFERENCES public.school_class(id);


--
-- Name: timetable_rule timetable_rule_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_rule
    ADD CONSTRAINT timetable_rule_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: timetable_rule timetable_rule_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_rule
    ADD CONSTRAINT timetable_rule_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: timetable_run timetable_run_fortnight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_run
    ADD CONSTRAINT timetable_run_fortnight_id_fkey FOREIGN KEY (fortnight_id) REFERENCES public.fortnight(id);


--
-- Name: timetable_run timetable_run_school_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_run
    ADD CONSTRAINT timetable_run_school_class_id_fkey FOREIGN KEY (school_class_id) REFERENCES public.school_class(id);


--
-- Name: timetable_run timetable_run_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_run
    ADD CONSTRAINT timetable_run_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: topic topic_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic
    ADD CONSTRAINT topic_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: topic topic_tenant_id_subject_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic
    ADD CONSTRAINT topic_tenant_id_subject_code_fkey FOREIGN KEY (tenant_id, subject_code) REFERENCES public.subject(tenant_id, code);


--
-- Name: web_error web_error_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_error
    ADD CONSTRAINT web_error_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: child; Type: ROW SECURITY; Schema: pii; Owner: -
--

ALTER TABLE pii.child ENABLE ROW LEVEL SECURITY;

--
-- Name: educator_note; Type: ROW SECURITY; Schema: pii; Owner: -
--

ALTER TABLE pii.educator_note ENABLE ROW LEVEL SECURITY;

--
-- Name: child engine_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY engine_all ON pii.child TO app_engine USING (true) WITH CHECK (true);


--
-- Name: educator_note engine_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY engine_all ON pii.educator_note TO app_engine USING (true) WITH CHECK (true);


--
-- Name: note_claim engine_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY engine_all ON pii.note_claim TO app_engine USING (true) WITH CHECK (true);


--
-- Name: staff engine_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY engine_all ON pii.staff TO app_engine USING (true) WITH CHECK (true);


--
-- Name: note_claim; Type: ROW SECURITY; Schema: pii; Owner: -
--

ALTER TABLE pii.note_claim ENABLE ROW LEVEL SECURITY;

--
-- Name: child service_role_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY service_role_all ON pii.child TO service_role USING (true) WITH CHECK (true);


--
-- Name: educator_note service_role_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY service_role_all ON pii.educator_note TO service_role USING (true) WITH CHECK (true);


--
-- Name: note_claim service_role_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY service_role_all ON pii.note_claim TO service_role USING (true) WITH CHECK (true);


--
-- Name: staff service_role_all; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY service_role_all ON pii.staff TO service_role USING (true) WITH CHECK (true);


--
-- Name: staff; Type: ROW SECURITY; Schema: pii; Owner: -
--

ALTER TABLE pii.staff ENABLE ROW LEVEL SECURITY;

--
-- Name: child web_rule; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY web_rule ON pii.child TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('children'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('children'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('children'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('children'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('children'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('children'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: educator_note web_rule; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY web_rule ON pii.educator_note TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'own'::text) AND (class_id = ANY (( SELECT public.my_ids('notes'::text, 'class'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'own'::text) AND (class_id = ANY (( SELECT public.my_ids('notes'::text, 'class'::text) AS my_ids)::uuid[]))))));


--
-- Name: note_claim web_rule; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY web_rule ON pii.note_claim TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'own'::text) AND (note_id = ANY (( SELECT public.my_ids('notes'::text, 'note'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'own'::text) AND (note_id = ANY (( SELECT public.my_ids('notes'::text, 'note'::text) AS my_ids)::uuid[]))))));


--
-- Name: staff web_rule; Type: POLICY; Schema: pii; Owner: -
--

CREATE POLICY web_rule ON pii.staff TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'own'::text) AND (staff_id = ( SELECT public.signed_in_staff() AS signed_in_staff)))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'own'::text) AND (staff_id = ( SELECT public.signed_in_staff() AS signed_in_staff))))));


--
-- Name: academic_year; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.academic_year ENABLE ROW LEVEL SECURITY;

--
-- Name: access_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: access_reach; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_reach ENABLE ROW LEVEL SECURITY;

--
-- Name: access_table; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_table ENABLE ROW LEVEL SECURITY;

--
-- Name: activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_material; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_material ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_objective; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_objective ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_observation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_observation ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_skill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: approval; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval ENABLE ROW LEVEL SECURITY;

--
-- Name: ask; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ask ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: campus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campus ENABLE ROW LEVEL SECURITY;

--
-- Name: capture; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capture ENABLE ROW LEVEL SECURITY;

--
-- Name: case_dimension; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.case_dimension ENABLE ROW LEVEL SECURITY;

--
-- Name: change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

--
-- Name: child; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.child ENABLE ROW LEVEL SECURITY;

--
-- Name: child_skill_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.child_skill_state ENABLE ROW LEVEL SECURITY;

--
-- Name: child_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.child_state ENABLE ROW LEVEL SECURITY;

--
-- Name: config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

--
-- Name: consent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent ENABLE ROW LEVEL SECURITY;

--
-- Name: curriculum_proposal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curriculum_proposal ENABLE ROW LEVEL SECURITY;

--
-- Name: curriculum_version; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curriculum_version ENABLE ROW LEVEL SECURITY;

--
-- Name: data_register; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_register ENABLE ROW LEVEL SECURITY;

--
-- Name: difficulty; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.difficulty ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_year engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.academic_year TO app_engine USING (true) WITH CHECK (true);


--
-- Name: access_log engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.access_log TO app_engine USING (true) WITH CHECK (true);


--
-- Name: access_reach engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.access_reach TO app_engine USING (true) WITH CHECK (true);


--
-- Name: access_table engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.access_table TO app_engine USING (true) WITH CHECK (true);


--
-- Name: activity engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.activity TO app_engine USING (true) WITH CHECK (true);


--
-- Name: activity_material engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.activity_material TO app_engine USING (true) WITH CHECK (true);


--
-- Name: activity_objective engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.activity_objective TO app_engine USING (true) WITH CHECK (true);


--
-- Name: activity_observation engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.activity_observation TO app_engine USING (true) WITH CHECK (true);


--
-- Name: activity_skill engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.activity_skill TO app_engine USING (true) WITH CHECK (true);


--
-- Name: approval engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.approval TO app_engine USING (true) WITH CHECK (true);


--
-- Name: ask engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.ask TO app_engine USING (true) WITH CHECK (true);


--
-- Name: attendance engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.attendance TO app_engine USING (true) WITH CHECK (true);


--
-- Name: campus engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.campus TO app_engine USING (true) WITH CHECK (true);


--
-- Name: capture engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.capture TO app_engine USING (true) WITH CHECK (true);


--
-- Name: case_dimension engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.case_dimension TO app_engine USING (true) WITH CHECK (true);


--
-- Name: change_log engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.change_log TO app_engine USING (true) WITH CHECK (true);


--
-- Name: child engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.child TO app_engine USING (true) WITH CHECK (true);


--
-- Name: child_skill_state engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.child_skill_state TO app_engine USING (true) WITH CHECK (true);


--
-- Name: child_state engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.child_state TO app_engine USING (true) WITH CHECK (true);


--
-- Name: config engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.config TO app_engine USING (true) WITH CHECK (true);


--
-- Name: consent engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.consent TO app_engine USING (true) WITH CHECK (true);


--
-- Name: curriculum_proposal engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.curriculum_proposal TO app_engine USING (true) WITH CHECK (true);


--
-- Name: curriculum_version engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.curriculum_version TO app_engine USING (true) WITH CHECK (true);


--
-- Name: data_register engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.data_register TO app_engine USING (true) WITH CHECK (true);


--
-- Name: difficulty engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.difficulty TO app_engine USING (true) WITH CHECK (true);


--
-- Name: english_sample engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.english_sample TO app_engine USING (true) WITH CHECK (true);


--
-- Name: enrolment engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.enrolment TO app_engine USING (true) WITH CHECK (true);


--
-- Name: eval_case engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.eval_case TO app_engine USING (true) WITH CHECK (true);


--
-- Name: evidence_event engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.evidence_event TO app_engine USING (true) WITH CHECK (true);


--
-- Name: expense engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.expense TO app_engine USING (true) WITH CHECK (true);


--
-- Name: flow_run engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.flow_run TO app_engine USING (true) WITH CHECK (true);


--
-- Name: fortnight engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.fortnight TO app_engine USING (true) WITH CHECK (true);


--
-- Name: framework engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.framework TO app_engine USING (true) WITH CHECK (true);


--
-- Name: framework_statement engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.framework_statement TO app_engine USING (true) WITH CHECK (true);


--
-- Name: grade engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.grade TO app_engine USING (true) WITH CHECK (true);


--
-- Name: item engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.item TO app_engine USING (true) WITH CHECK (true);


--
-- Name: item_exposure engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.item_exposure TO app_engine USING (true) WITH CHECK (true);


--
-- Name: item_result engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.item_result TO app_engine USING (true) WITH CHECK (true);


--
-- Name: learning_objective engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.learning_objective TO app_engine USING (true) WITH CHECK (true);


--
-- Name: learning_objective_skill engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.learning_objective_skill TO app_engine USING (true) WITH CHECK (true);


--
-- Name: level_rule engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.level_rule TO app_engine USING (true) WITH CHECK (true);


--
-- Name: material_item engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.material_item TO app_engine USING (true) WITH CHECK (true);


--
-- Name: materials_line engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.materials_line TO app_engine USING (true) WITH CHECK (true);


--
-- Name: materials_list engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.materials_list TO app_engine USING (true) WITH CHECK (true);


--
-- Name: misconception engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.misconception TO app_engine USING (true) WITH CHECK (true);


--
-- Name: objective_statement engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.objective_statement TO app_engine USING (true) WITH CHECK (true);


--
-- Name: parent_note engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.parent_note TO app_engine USING (true) WITH CHECK (true);


--
-- Name: passage engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.passage TO app_engine USING (true) WITH CHECK (true);


--
-- Name: password_ask engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.password_ask TO app_engine USING (true) WITH CHECK (true);


--
-- Name: password_link engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.password_link TO app_engine USING (true) WITH CHECK (true);


--
-- Name: period engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.period TO app_engine USING (true) WITH CHECK (true);


--
-- Name: plan_entry engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.plan_entry TO app_engine USING (true) WITH CHECK (true);


--
-- Name: prescription engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.prescription TO app_engine USING (true) WITH CHECK (true);


--
-- Name: prompt engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.prompt TO app_engine USING (true) WITH CHECK (true);


--
-- Name: question_type engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.question_type TO app_engine USING (true) WITH CHECK (true);


--
-- Name: read_correction engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.read_correction TO app_engine USING (true) WITH CHECK (true);


--
-- Name: registry_skill engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.registry_skill TO app_engine USING (true) WITH CHECK (true);


--
-- Name: report_item engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.report_item TO app_engine USING (true) WITH CHECK (true);


--
-- Name: role engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.role TO app_engine USING (true) WITH CHECK (true);


--
-- Name: rubric engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.rubric TO app_engine USING (true) WITH CHECK (true);


--
-- Name: school_class engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.school_class TO app_engine USING (true) WITH CHECK (true);


--
-- Name: school_day engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.school_day TO app_engine USING (true) WITH CHECK (true);


--
-- Name: session engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.session TO app_engine USING (true) WITH CHECK (true);


--
-- Name: sheet_instance engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.sheet_instance TO app_engine USING (true) WITH CHECK (true);


--
-- Name: sheet_template engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.sheet_template TO app_engine USING (true) WITH CHECK (true);


--
-- Name: sign_in_failure engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.sign_in_failure TO app_engine USING (true) WITH CHECK (true);


--
-- Name: skill engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.skill TO app_engine USING (true) WITH CHECK (true);


--
-- Name: skill_level engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.skill_level TO app_engine USING (true) WITH CHECK (true);


--
-- Name: skill_level_question_type engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.skill_level_question_type TO app_engine USING (true) WITH CHECK (true);


--
-- Name: skill_mistake engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.skill_mistake TO app_engine USING (true) WITH CHECK (true);


--
-- Name: skill_prerequisite engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.skill_prerequisite TO app_engine USING (true) WITH CHECK (true);


--
-- Name: skill_profile_group engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.skill_profile_group TO app_engine USING (true) WITH CHECK (true);


--
-- Name: skill_registry_link engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.skill_registry_link TO app_engine USING (true) WITH CHECK (true);


--
-- Name: staff engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.staff TO app_engine USING (true) WITH CHECK (true);


--
-- Name: staff_note engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.staff_note TO app_engine USING (true) WITH CHECK (true);


--
-- Name: staff_role_grant engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.staff_role_grant TO app_engine USING (true) WITH CHECK (true);


--
-- Name: stock_move engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.stock_move TO app_engine USING (true) WITH CHECK (true);


--
-- Name: subject engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.subject TO app_engine USING (true) WITH CHECK (true);


--
-- Name: taxonomy_case engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.taxonomy_case TO app_engine USING (true) WITH CHECK (true);


--
-- Name: tenant engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.tenant TO app_engine USING (true) WITH CHECK (true);


--
-- Name: timetable_rule engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.timetable_rule TO app_engine USING (true) WITH CHECK (true);


--
-- Name: timetable_run engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.timetable_run TO app_engine USING (true) WITH CHECK (true);


--
-- Name: topic engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.topic TO app_engine USING (true) WITH CHECK (true);


--
-- Name: web_error engine_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_all ON public.web_error TO app_engine USING (true) WITH CHECK (true);


--
-- Name: english_sample; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.english_sample ENABLE ROW LEVEL SECURITY;

--
-- Name: enrolment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrolment ENABLE ROW LEVEL SECURITY;

--
-- Name: eval_case; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eval_case ENABLE ROW LEVEL SECURITY;

--
-- Name: evidence_event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evidence_event ENABLE ROW LEVEL SECURITY;

--
-- Name: expense; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expense ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_run; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flow_run ENABLE ROW LEVEL SECURITY;

--
-- Name: fortnight; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fortnight ENABLE ROW LEVEL SECURITY;

--
-- Name: framework; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.framework ENABLE ROW LEVEL SECURITY;

--
-- Name: framework_statement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.framework_statement ENABLE ROW LEVEL SECURITY;

--
-- Name: grade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grade ENABLE ROW LEVEL SECURITY;

--
-- Name: item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item ENABLE ROW LEVEL SECURITY;

--
-- Name: item_exposure; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_exposure ENABLE ROW LEVEL SECURITY;

--
-- Name: item_result; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_result ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_objective; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_objective ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_objective_skill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_objective_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: level_rule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.level_rule ENABLE ROW LEVEL SECURITY;

--
-- Name: material_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_item ENABLE ROW LEVEL SECURITY;

--
-- Name: materials_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials_line ENABLE ROW LEVEL SECURITY;

--
-- Name: materials_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials_list ENABLE ROW LEVEL SECURITY;

--
-- Name: misconception; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.misconception ENABLE ROW LEVEL SECURITY;

--
-- Name: objective_statement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.objective_statement ENABLE ROW LEVEL SECURITY;

--
-- Name: parent_note; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_note ENABLE ROW LEVEL SECURITY;

--
-- Name: passage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.passage ENABLE ROW LEVEL SECURITY;

--
-- Name: password_ask; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_ask ENABLE ROW LEVEL SECURITY;

--
-- Name: password_link; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_link ENABLE ROW LEVEL SECURITY;

--
-- Name: period; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.period ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_entry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_entry ENABLE ROW LEVEL SECURITY;

--
-- Name: prescription; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prescription ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt ENABLE ROW LEVEL SECURITY;

--
-- Name: question_type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_type ENABLE ROW LEVEL SECURITY;

--
-- Name: read_correction; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.read_correction ENABLE ROW LEVEL SECURITY;

--
-- Name: registry_skill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registry_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: report_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_item ENABLE ROW LEVEL SECURITY;

--
-- Name: role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;

--
-- Name: rubric; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubric ENABLE ROW LEVEL SECURITY;

--
-- Name: school_class; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_class ENABLE ROW LEVEL SECURITY;

--
-- Name: school_day; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_day ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_year service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.academic_year TO service_role USING (true) WITH CHECK (true);


--
-- Name: access_log service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.access_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: access_reach service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.access_reach TO service_role USING (true) WITH CHECK (true);


--
-- Name: access_table service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.access_table TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.activity TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_material service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.activity_material TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_objective service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.activity_objective TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_observation service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.activity_observation TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_skill service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.activity_skill TO service_role USING (true) WITH CHECK (true);


--
-- Name: approval service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.approval TO service_role USING (true) WITH CHECK (true);


--
-- Name: ask service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.ask TO service_role USING (true) WITH CHECK (true);


--
-- Name: attendance service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.attendance TO service_role USING (true) WITH CHECK (true);


--
-- Name: campus service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.campus TO service_role USING (true) WITH CHECK (true);


--
-- Name: capture service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.capture TO service_role USING (true) WITH CHECK (true);


--
-- Name: case_dimension service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.case_dimension TO service_role USING (true) WITH CHECK (true);


--
-- Name: change_log service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.change_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: child service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.child TO service_role USING (true) WITH CHECK (true);


--
-- Name: child_skill_state service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.child_skill_state TO service_role USING (true) WITH CHECK (true);


--
-- Name: child_state service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.child_state TO service_role USING (true) WITH CHECK (true);


--
-- Name: config service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.config TO service_role USING (true) WITH CHECK (true);


--
-- Name: consent service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.consent TO service_role USING (true) WITH CHECK (true);


--
-- Name: curriculum_proposal service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.curriculum_proposal TO service_role USING (true) WITH CHECK (true);


--
-- Name: curriculum_version service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.curriculum_version TO service_role USING (true) WITH CHECK (true);


--
-- Name: data_register service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.data_register TO service_role USING (true) WITH CHECK (true);


--
-- Name: difficulty service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.difficulty TO service_role USING (true) WITH CHECK (true);


--
-- Name: english_sample service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.english_sample TO service_role USING (true) WITH CHECK (true);


--
-- Name: enrolment service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.enrolment TO service_role USING (true) WITH CHECK (true);


--
-- Name: eval_case service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.eval_case TO service_role USING (true) WITH CHECK (true);


--
-- Name: evidence_event service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.evidence_event TO service_role USING (true) WITH CHECK (true);


--
-- Name: expense service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.expense TO service_role USING (true) WITH CHECK (true);


--
-- Name: flow_run service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.flow_run TO service_role USING (true) WITH CHECK (true);


--
-- Name: fortnight service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.fortnight TO service_role USING (true) WITH CHECK (true);


--
-- Name: framework service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.framework TO service_role USING (true) WITH CHECK (true);


--
-- Name: framework_statement service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.framework_statement TO service_role USING (true) WITH CHECK (true);


--
-- Name: grade service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.grade TO service_role USING (true) WITH CHECK (true);


--
-- Name: item service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.item TO service_role USING (true) WITH CHECK (true);


--
-- Name: item_exposure service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.item_exposure TO service_role USING (true) WITH CHECK (true);


--
-- Name: item_result service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.item_result TO service_role USING (true) WITH CHECK (true);


--
-- Name: learning_objective service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.learning_objective TO service_role USING (true) WITH CHECK (true);


--
-- Name: learning_objective_skill service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.learning_objective_skill TO service_role USING (true) WITH CHECK (true);


--
-- Name: level_rule service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.level_rule TO service_role USING (true) WITH CHECK (true);


--
-- Name: material_item service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.material_item TO service_role USING (true) WITH CHECK (true);


--
-- Name: materials_line service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.materials_line TO service_role USING (true) WITH CHECK (true);


--
-- Name: materials_list service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.materials_list TO service_role USING (true) WITH CHECK (true);


--
-- Name: misconception service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.misconception TO service_role USING (true) WITH CHECK (true);


--
-- Name: objective_statement service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.objective_statement TO service_role USING (true) WITH CHECK (true);


--
-- Name: parent_note service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.parent_note TO service_role USING (true) WITH CHECK (true);


--
-- Name: passage service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.passage TO service_role USING (true) WITH CHECK (true);


--
-- Name: password_ask service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.password_ask TO service_role USING (true) WITH CHECK (true);


--
-- Name: password_link service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.password_link TO service_role USING (true) WITH CHECK (true);


--
-- Name: period service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.period TO service_role USING (true) WITH CHECK (true);


--
-- Name: plan_entry service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.plan_entry TO service_role USING (true) WITH CHECK (true);


--
-- Name: prescription service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.prescription TO service_role USING (true) WITH CHECK (true);


--
-- Name: prompt service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.prompt TO service_role USING (true) WITH CHECK (true);


--
-- Name: question_type service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.question_type TO service_role USING (true) WITH CHECK (true);


--
-- Name: read_correction service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.read_correction TO service_role USING (true) WITH CHECK (true);


--
-- Name: registry_skill service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.registry_skill TO service_role USING (true) WITH CHECK (true);


--
-- Name: report_item service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.report_item TO service_role USING (true) WITH CHECK (true);


--
-- Name: role service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.role TO service_role USING (true) WITH CHECK (true);


--
-- Name: rubric service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.rubric TO service_role USING (true) WITH CHECK (true);


--
-- Name: school_class service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.school_class TO service_role USING (true) WITH CHECK (true);


--
-- Name: school_day service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.school_day TO service_role USING (true) WITH CHECK (true);


--
-- Name: session service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.session TO service_role USING (true) WITH CHECK (true);


--
-- Name: sheet_instance service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.sheet_instance TO service_role USING (true) WITH CHECK (true);


--
-- Name: sheet_template service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.sheet_template TO service_role USING (true) WITH CHECK (true);


--
-- Name: sign_in_failure service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.sign_in_failure TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.skill TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill_level service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.skill_level TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill_level_question_type service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.skill_level_question_type TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill_mistake service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.skill_mistake TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill_prerequisite service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.skill_prerequisite TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill_profile_group service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.skill_profile_group TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill_registry_link service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.skill_registry_link TO service_role USING (true) WITH CHECK (true);


--
-- Name: staff service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.staff TO service_role USING (true) WITH CHECK (true);


--
-- Name: staff_note service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.staff_note TO service_role USING (true) WITH CHECK (true);


--
-- Name: staff_role_grant service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.staff_role_grant TO service_role USING (true) WITH CHECK (true);


--
-- Name: stock_move service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.stock_move TO service_role USING (true) WITH CHECK (true);


--
-- Name: subject service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.subject TO service_role USING (true) WITH CHECK (true);


--
-- Name: taxonomy_case service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.taxonomy_case TO service_role USING (true) WITH CHECK (true);


--
-- Name: tenant service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.tenant TO service_role USING (true) WITH CHECK (true);


--
-- Name: timetable_rule service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.timetable_rule TO service_role USING (true) WITH CHECK (true);


--
-- Name: timetable_run service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.timetable_run TO service_role USING (true) WITH CHECK (true);


--
-- Name: topic service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.topic TO service_role USING (true) WITH CHECK (true);


--
-- Name: web_error service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.web_error TO service_role USING (true) WITH CHECK (true);


--
-- Name: session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;

--
-- Name: sheet_instance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sheet_instance ENABLE ROW LEVEL SECURITY;

--
-- Name: sheet_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sheet_template ENABLE ROW LEVEL SECURITY;

--
-- Name: sign_in_failure; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sign_in_failure ENABLE ROW LEVEL SECURITY;

--
-- Name: skill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_level; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_level ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_level_question_type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_level_question_type ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_mistake; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_mistake ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_prerequisite; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_prerequisite ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_profile_group; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_profile_group ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_registry_link; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_registry_link ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_note; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_note ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_role_grant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_role_grant ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_move; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_move ENABLE ROW LEVEL SECURITY;

--
-- Name: subject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subject ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_case; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taxonomy_case ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_rule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timetable_rule ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_run; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timetable_run ENABLE ROW LEVEL SECURITY;

--
-- Name: topic; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topic ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_year web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.academic_year TO app_web USING (true) WITH CHECK (true);


--
-- Name: access_reach web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.access_reach TO app_web USING (true) WITH CHECK (true);


--
-- Name: access_table web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.access_table TO app_web USING (true) WITH CHECK (true);


--
-- Name: activity web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.activity TO app_web USING (true) WITH CHECK (true);


--
-- Name: activity_material web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.activity_material TO app_web USING (true) WITH CHECK (true);


--
-- Name: activity_objective web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.activity_objective TO app_web USING (true) WITH CHECK (true);


--
-- Name: activity_skill web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.activity_skill TO app_web USING (true) WITH CHECK (true);


--
-- Name: ask web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.ask TO app_web USING (true) WITH CHECK (true);


--
-- Name: campus web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.campus TO app_web USING (true) WITH CHECK (true);


--
-- Name: case_dimension web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.case_dimension TO app_web USING (true) WITH CHECK (true);


--
-- Name: change_log web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.change_log TO app_web USING (true) WITH CHECK (true);


--
-- Name: child_state web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.child_state TO app_web USING (true) WITH CHECK (true);


--
-- Name: config web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.config TO app_web USING (true) WITH CHECK (true);


--
-- Name: curriculum_proposal web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.curriculum_proposal TO app_web USING (true) WITH CHECK (true);


--
-- Name: curriculum_version web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.curriculum_version TO app_web USING (true) WITH CHECK (true);


--
-- Name: data_register web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.data_register TO app_web USING (true) WITH CHECK (true);


--
-- Name: difficulty web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.difficulty TO app_web USING (true) WITH CHECK (true);


--
-- Name: english_sample web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.english_sample TO app_web USING (true) WITH CHECK (true);


--
-- Name: expense web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.expense TO app_web USING (true) WITH CHECK (true);


--
-- Name: fortnight web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.fortnight TO app_web USING (true) WITH CHECK (true);


--
-- Name: framework web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.framework TO app_web USING (true) WITH CHECK (true);


--
-- Name: framework_statement web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.framework_statement TO app_web USING (true) WITH CHECK (true);


--
-- Name: grade web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.grade TO app_web USING (true) WITH CHECK (true);


--
-- Name: item web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.item TO app_web USING (true) WITH CHECK (true);


--
-- Name: learning_objective web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.learning_objective TO app_web USING (true) WITH CHECK (true);


--
-- Name: learning_objective_skill web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.learning_objective_skill TO app_web USING (true) WITH CHECK (true);


--
-- Name: level_rule web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.level_rule TO app_web USING (true) WITH CHECK (true);


--
-- Name: material_item web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.material_item TO app_web USING (true) WITH CHECK (true);


--
-- Name: materials_line web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.materials_line TO app_web USING (true) WITH CHECK (true);


--
-- Name: materials_list web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.materials_list TO app_web USING (true) WITH CHECK (true);


--
-- Name: misconception web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.misconception TO app_web USING (true) WITH CHECK (true);


--
-- Name: objective_statement web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.objective_statement TO app_web USING (true) WITH CHECK (true);


--
-- Name: passage web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.passage TO app_web USING (true) WITH CHECK (true);


--
-- Name: password_ask web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.password_ask TO app_web USING (true) WITH CHECK (true);


--
-- Name: password_link web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.password_link TO app_web USING (true) WITH CHECK (true);


--
-- Name: period web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.period TO app_web USING (true) WITH CHECK (true);


--
-- Name: plan_entry web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.plan_entry TO app_web USING (true) WITH CHECK (true);


--
-- Name: prompt web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.prompt TO app_web USING (true) WITH CHECK (true);


--
-- Name: question_type web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.question_type TO app_web USING (true) WITH CHECK (true);


--
-- Name: registry_skill web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.registry_skill TO app_web USING (true) WITH CHECK (true);


--
-- Name: report_item web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.report_item TO app_web USING (true) WITH CHECK (true);


--
-- Name: role web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.role TO app_web USING (true) WITH CHECK (true);


--
-- Name: rubric web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.rubric TO app_web USING (true) WITH CHECK (true);


--
-- Name: school_class web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.school_class TO app_web USING (true) WITH CHECK (true);


--
-- Name: school_day web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.school_day TO app_web USING (true) WITH CHECK (true);


--
-- Name: session web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.session TO app_web USING (true) WITH CHECK (true);


--
-- Name: sign_in_failure web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.sign_in_failure TO app_web USING (true) WITH CHECK (true);


--
-- Name: skill web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.skill TO app_web USING (true) WITH CHECK (true);


--
-- Name: skill_level web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.skill_level TO app_web USING (true) WITH CHECK (true);


--
-- Name: skill_level_question_type web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.skill_level_question_type TO app_web USING (true) WITH CHECK (true);


--
-- Name: skill_mistake web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.skill_mistake TO app_web USING (true) WITH CHECK (true);


--
-- Name: skill_prerequisite web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.skill_prerequisite TO app_web USING (true) WITH CHECK (true);


--
-- Name: skill_profile_group web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.skill_profile_group TO app_web USING (true) WITH CHECK (true);


--
-- Name: skill_registry_link web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.skill_registry_link TO app_web USING (true) WITH CHECK (true);


--
-- Name: staff_note web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.staff_note TO app_web USING (true) WITH CHECK (true);


--
-- Name: stock_move web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.stock_move TO app_web USING (true) WITH CHECK (true);


--
-- Name: subject web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.subject TO app_web USING (true) WITH CHECK (true);


--
-- Name: taxonomy_case web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.taxonomy_case TO app_web USING (true) WITH CHECK (true);


--
-- Name: tenant web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.tenant TO app_web USING (true) WITH CHECK (true);


--
-- Name: timetable_rule web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.timetable_rule TO app_web USING (true) WITH CHECK (true);


--
-- Name: timetable_run web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.timetable_run TO app_web USING (true) WITH CHECK (true);


--
-- Name: topic web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.topic TO app_web USING (true) WITH CHECK (true);


--
-- Name: web_error web_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_all ON public.web_error TO app_web USING (true) WITH CHECK (true);


--
-- Name: web_error; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.web_error ENABLE ROW LEVEL SECURITY;

--
-- Name: access_log web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.access_log TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('who_looked'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('who_looked'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('who_looked'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('who_looked'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('who_looked'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('who_looked'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: activity_observation web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.activity_observation TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('notes'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('notes'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('notes'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: approval web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.approval TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND
CASE kind
    WHEN 'parent_note'::text THEN ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'own'::text) AND (target = ANY ((( SELECT public.my_ids('reports'::text, 'parent_note'::text) AS my_ids))::text[]))))
    WHEN 'sheet'::text THEN ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (target = ANY ((( SELECT public.my_ids('papers'::text, 'sheet'::text) AS my_ids))::text[]))))
    WHEN 'class_card'::text THEN ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'own'::text) AND ((detail ->> 'section'::text) = ANY (( SELECT public.my_sections('learning'::text) AS my_sections)::text[]))))
    ELSE true
END)) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND
CASE kind
    WHEN 'parent_note'::text THEN ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'own'::text) AND (target = ANY ((( SELECT public.my_ids('reports'::text, 'parent_note'::text) AS my_ids))::text[]))))
    WHEN 'sheet'::text THEN ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (target = ANY ((( SELECT public.my_ids('papers'::text, 'sheet'::text) AS my_ids))::text[]))))
    WHEN 'class_card'::text THEN ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'own'::text) AND ((detail ->> 'section'::text) = ANY (( SELECT public.my_sections('learning'::text) AS my_sections)::text[]))))
    ELSE true
END));


--
-- Name: attendance web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.attendance TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('children'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('children'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('children'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('children'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('children'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('children'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: capture web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.capture TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('papers'::text, 'capture'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('papers'::text, 'capture'::text) AS my_ids)::uuid[]))))));


--
-- Name: child web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.child TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('children'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('children'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('children'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('children'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('children'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('children'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: child_skill_state web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.child_skill_state TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('learning'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('learning'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: consent web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.consent TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('consent'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('consent'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('consent'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('consent'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('consent'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('consent'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: enrolment web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.enrolment TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('enrolment'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('enrolment'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('enrolment'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('enrolment'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('enrolment'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('enrolment'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: eval_case web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.eval_case TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'own'::text) AND ((child_id IS NULL) OR (child_id = ANY (( SELECT public.my_ids('answers'::text, 'child'::text) AS my_ids)::uuid[]))))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'own'::text) AND ((child_id IS NULL) OR (child_id = ANY (( SELECT public.my_ids('answers'::text, 'child'::text) AS my_ids)::uuid[])))))));


--
-- Name: evidence_event web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.evidence_event TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('learning'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('learning'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('learning'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: flow_run web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.flow_run TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('papers'::text, 'run'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('papers'::text, 'run'::text) AS my_ids)::uuid[]))))));


--
-- Name: item_exposure web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.item_exposure TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('papers'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('papers'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: item_result web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.item_result TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'own'::text) AND (capture_id = ANY (( SELECT public.my_ids('answers'::text, 'capture'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'own'::text) AND (capture_id = ANY (( SELECT public.my_ids('answers'::text, 'capture'::text) AS my_ids)::uuid[]))))));


--
-- Name: parent_note web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.parent_note TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('reports'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('reports'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('reports'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: prescription web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.prescription TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('papers'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('papers'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: read_correction web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.read_correction TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('answers'::text, 'child'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('answers'::text) AS my_reach) = 'own'::text) AND (child_id = ANY (( SELECT public.my_ids('answers'::text, 'child'::text) AS my_ids)::uuid[]))))));


--
-- Name: sheet_instance web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.sheet_instance TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('papers'::text, 'sheet'::text) AS my_ids)::uuid[])))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND (id = ANY (( SELECT public.my_ids('papers'::text, 'sheet'::text) AS my_ids)::uuid[]))))));


--
-- Name: sheet_template web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.sheet_template TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND ((child_id IS NULL) OR (child_id = ANY (( SELECT public.my_ids('papers'::text, 'child'::text) AS my_ids)::uuid[]))))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('papers'::text) AS my_reach) = 'own'::text) AND ((child_id IS NULL) OR (child_id = ANY (( SELECT public.my_ids('papers'::text, 'child'::text) AS my_ids)::uuid[])))))));


--
-- Name: staff web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.staff TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'own'::text) AND (id = ( SELECT public.signed_in_staff() AS signed_in_staff)))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'own'::text) AND (id = ( SELECT public.signed_in_staff() AS signed_in_staff))))));


--
-- Name: staff_role_grant web_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY web_rule ON public.staff_role_grant TO app_web USING (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'own'::text) AND (staff_id = ( SELECT public.signed_in_staff() AS signed_in_staff)))))) WITH CHECK (((tenant_id = ( SELECT public.my_tenant() AS my_tenant)) AND ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'all'::text) OR ((( SELECT public.my_reach('staff'::text) AS my_reach) = 'own'::text) AND (staff_id = ( SELECT public.signed_in_staff() AS signed_in_staff))))));


--
-- PostgreSQL database dump complete
--

\unrestrict Ll9SSpIQBG8nRCk0Zp1MxWg13u9YJL9ocgfxCIx94qKtAg8Lr9DqSqEirjpiRVr

