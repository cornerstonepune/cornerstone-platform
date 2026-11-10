-- CP-27, group 4 (specs/CP-27/spec.md Done when 8, 12, 13, 16, 20; issue #534, Amendments 2-4; docs/data-model.md):
-- one staff list, and a child's class in one place.
--
--   config key `app.staff` (the sign-in list: JSON with    -> `pii.staff` gains the password hash and `password_set_at`
--     each person's email, name, role, password hash,          (copied exactly: no session ends, no password changes);
--     password_set_at, classes, subjects; an entry id          `staff` gains `role_code`, `classes`, `subjects` (what the
--     the website signs a person in as)                        website shows; never grants: role grants stay as they
--                                                              are). The key is deleted from every school; the website
--                                                              reads and writes the list through four functions
--                                                              (`staff_list`, `staff_set_password`, `staff_add`)
--   `staff.signin_id` (the bridge from an entry id)         -> gone: `app.staff_id` and `current_staff()` hold `staff.id`;
--                                                              `capture.uploaded_by` / `flow_run.uploaded_by` are
--                                                              re-keyed to it first (every one maps, or this raises)
--   `child.section`, `child.roll_no`                        -> the child's open `enrolment` (class and roll), the class's
--                                                              new `school_class.label` (the text children carry today:
--                                                              K2's class is section 'A', its children say 'K2'); the
--                                                              classes of the other labels of active children are made
--                                                              as K2's was and their children enrolled; `child_now` is
--                                                              the view pages read. `child.band` stays (Amendment 2)
--   `child_move` (empty on live)                            -> a move is one `change_log` row (Done when 12). Dropped
--   `class_card` (ring B: the week's card, rebuilt)         -> nothing: the card is built from the graph when asked
--                                                              (`w4_close/card.py`); its 32 rows to `retired`
--   `class_skill` (a class's word that a skill is taught)   -> `school_class.taught` {skill: {taught, by, at}}, read by
--                                                              `skill_taught_in`; its rows to `retired`
--
-- Not here (Amendment 4): the "who did it" text of the history ledgers (`evidence_event`, `item_result`, `approval`,
-- `access_log`) and every other free-text "who" column stay as they are; `sheet_instance.section` stays.
--
-- One transaction under `db push`: a refusal or a count check that does not hold raises, and nothing changes. A table
-- with rows is never dropped: it moves to the schema `retired`. An empty one is checked empty here, then dropped.

-- 1. What the new homes could not keep, refused first; what they keep, counted. ---------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(format('%s: %s', t, v), '; ') into bad from (
    -- the sign-in list, entry by entry (no email or name is said: an entry is its position)
    select 'app.staff is not a list' as t, c.tenant_id::text as v from config c
      where c.key = 'app.staff' and jsonb_typeof(c.value) <> 'array'
    union all select 'an entry matches no pii.staff row, or two', format('school %s entry %s', c.tenant_id, e.n)
      from config c, jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]' end)
                     with ordinality e(p, n)
      where c.key = 'app.staff'
        and (select count(*) from pii.staff s where s.tenant_id = c.tenant_id
             and s.email = lower(btrim(e.p ->> 'email'))) <> 1
    union all select 'an email twice on the list', format('school %s', c.tenant_id)
      from config c where c.key = 'app.staff' and jsonb_typeof(c.value) = 'array'
        and (select count(distinct lower(btrim(p ->> 'email'))) from jsonb_array_elements(c.value) p)
            <> jsonb_array_length(c.value)
    union all select 'an entry''s role is no role', format('school %s entry %s', c.tenant_id, e.n)
      from config c, jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]' end)
                     with ordinality e(p, n)
      where c.key = 'app.staff'
        and not exists (select 1 from role r where r.tenant_id = c.tenant_id and r.code = e.p ->> 'role')
    union all select 'an entry''s password is not a scrypt hash', format('school %s entry %s', c.tenant_id, e.n)
      from config c, jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]' end)
                     with ordinality e(p, n)
      where c.key = 'app.staff' and coalesce(e.p ->> 'password', '') <> '' and e.p ->> 'password' !~ '^scrypt\$'
    union all select 'an entry''s password_set_at is not a time', format('school %s entry %s', c.tenant_id, e.n)
      from config c, jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]' end)
                     with ordinality e(p, n)
      where c.key = 'app.staff' and coalesce(e.p ->> 'password_set_at', '') <> ''
        and pg_input_is_valid(e.p ->> 'password_set_at', 'timestamptz') is not true
    union all select 'an entry''s classes or subjects are not a list of words', format('school %s entry %s', c.tenant_id, e.n)
      from config c, jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]' end)
                     with ordinality e(p, n)
      where c.key = 'app.staff' and exists (
        select 1 from (values (e.p -> 'classes'), (e.p -> 'subjects')) x(v)
        where x.v is not null and jsonb_typeof(x.v) <> 'null'
          and (jsonb_typeof(x.v) <> 'array'
               or exists (select 1 from jsonb_array_elements(x.v) w where jsonb_typeof(w) <> 'string')))
    union all select 'an active member of staff is not on the sign-in list', s.id::text
      from staff s join pii.staff p on p.staff_id = s.id
      where s.active and not exists (
        select 1 from config c, jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]' end) e
        where c.key = 'app.staff' and c.tenant_id = s.tenant_id and lower(btrim(e ->> 'email')) = p.email)
    -- an upload is kept by the id its person signed in as: each must be a member of staff's
    union all select 'an upload''s person is no member of staff', 'capture ' || count(*) from capture c
      where c.uploaded_by is not null and not exists (select 1 from staff s where s.signin_id = c.uploaded_by)
      having count(*) > 0
    union all select 'a run''s person is no member of staff', 'flow_run ' || count(*) from flow_run f
      where f.uploaded_by is not null and not exists (select 1 from staff s where s.signin_id = f.uploaded_by)
      having count(*) > 0
    -- a child's class: an enrolment and the child's own label must say the same
    union all select 'an enrolled child''s roll differs from their enrolment''s', count(*)::text
      from child c join enrolment e on e.child_id = c.id and e.to_date is null where c.roll_no <> e.roll_no
      having count(*) > 0
    union all select 'a class''s children carry two labels', sc.id::text
      from school_class sc join enrolment e on e.class_id = sc.id and e.to_date is null join child c on c.id = e.child_id
      group by sc.id having count(distinct c.section) > 1
    union all select 'not empty', 'child_move ' || count(*) from child_move having count(*) > 0
  ) x;
  if bad is not null then
    raise exception 'CP-27: a person or a class the new homes would not keep as it stands: %', bad;
  end if;
  raise notice 'CP-27 4: % on the sign-in list (% with a password, % with password_set_at), % active staff, % grants; '
               '% uploads and % runs by a person; % active children (% enrolled), % classes, % class cards, % class words',
    (select coalesce(sum(jsonb_array_length(value)), 0) from config where key = 'app.staff'),
    (select count(*) from config c, jsonb_array_elements(c.value) e where c.key = 'app.staff'
       and coalesce(e ->> 'password', '') <> ''),
    (select count(*) from config c, jsonb_array_elements(c.value) e where c.key = 'app.staff'
       and coalesce(e ->> 'password_set_at', '') <> ''),
    (select count(*) from staff where active), (select count(*) from staff_role_grant),
    (select count(*) from capture where uploaded_by is not null),
    (select count(*) from flow_run where uploaded_by is not null),
    (select count(*) from child where active),
    (select count(*) from child c where c.active and exists (select 1 from enrolment e where e.child_id = c.id
       and e.to_date is null)),
    (select count(*) from school_class), (select count(*) from class_card), (select count(*) from class_skill);
end $$;

-- 2. What reads a person or a class today, kept to compare with after. -----------------------------------------------

-- the sign-in list as the website reads it, one row per person
create temporary table cp27_signin as
select c.tenant_id, s.id as staff_id, nullif(e.p ->> 'id', '')::uuid as entry_id, lower(btrim(e.p ->> 'email')) as email,
       e.p ->> 'name' as name, e.p ->> 'role' as role,
       coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(e.p -> 'classes') = 'array'
                                                            then e.p -> 'classes' end)), '{}') as classes,
       coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(e.p -> 'subjects') = 'array'
                                                            then e.p -> 'subjects' end)), '{}') as subjects,
       nullif(e.p ->> 'password', '') as password, (nullif(e.p ->> 'password_set_at', ''))::timestamptz as set_at,
       e.n as ord
from config c
cross join lateral jsonb_array_elements(c.value) with ordinality e(p, n)
join pii.staff p on p.tenant_id = c.tenant_id and p.email = lower(btrim(e.p ->> 'email'))
join staff s on s.id = p.staff_id
where c.key = 'app.staff';

create temporary table cp27_uploads as
select 'capture' as t, c.id, s.id as staff_id from capture c join staff s on s.signin_id = c.uploaded_by
union all
select 'flow_run', f.id, s.id from flow_run f join staff s on s.signin_id = f.uploaded_by;

create temporary table cp27_counts as
select (select count(*) from staff_role_grant) as grants, (select count(*) from staff) as staff,
       (select count(*) from pii.staff) as pii_staff;

-- who sees what: every id each person reaches, by kind and key, as they sign in today (by their entry id)
create temporary table cp27_sees (staff_id uuid, kind text, key_type text, ids uuid[]);
do $$
declare
  p record;
  k record;
begin
  for p in select staff_id, entry_id from cp27_signin where entry_id is not null loop
    perform set_config('app.staff_id', p.entry_id::text, true);
    for k in select distinct r.kind_code as kind, x.key_type from access_reach r
             cross join unnest(array['class', 'child', 'note', 'sheet', 'capture', 'run', 'parent_note', 'item_result'])
                        x(key_type) loop
      insert into cp27_sees select p.staff_id, k.kind, k.key_type,
        array(select unnest(public.my_ids(k.kind, k.key_type)) order by 1);
    end loop;
  end loop;
  perform set_config('app.staff_id', '', true);
end $$;

-- each active child's class, roll and grade as the child row says them
create temporary table cp27_child as
select c.id, c.tenant_id, c.section, c.roll_no, c.band from child c where c.active;

-- each label's grade, and every skill's "taught" in each class a child or a word names
create temporary table cp27_band as
select x.tenant_id, x.section, public.class_band(x.tenant_id, x.section) as band
from (select distinct tenant_id, section from child where active) x;

create temporary table cp27_taught as
select s.tenant_id, s.code, x.section, public.skill_taught_in(s.tenant_id, s.code, x.section) as taught
from skill s
join (select tenant_id, section from child where active union select tenant_id, section from class_skill) x
  on x.tenant_id = s.tenant_id;

create temporary table cp27_class_skill as select * from class_skill;
create temporary table cp27_calibration as select * from level_calibration;

-- 3. One staff list. --------------------------------------------------------------------------------------------------

alter table pii.staff add column password_hash text check (password_hash is null or password_hash ~ '^scrypt\$');
alter table pii.staff add column password_set_at timestamptz;
alter table staff add column role_code text;
alter table staff add column classes text[] not null default '{}';
alter table staff add column subjects text[] not null default '{}';
alter table staff add constraint staff_role_fkey foreign key (tenant_id, role_code) references role (tenant_id, code);

-- the sign-in list's own triggers go first: from here nothing writes `app.staff` or `signin_id`
drop trigger staff_have_ids on config;
drop trigger staff_signin_from_list on config;
drop trigger staff_signin_from_list_gone on config;
drop trigger staff_signin_from_email on pii.staff;
drop function internal.staff_have_ids();
drop function internal.rebuild_staff_signin_trigger();
drop function internal.rebuild_staff_signin();
drop function public.staff_id(text);

update staff s set role_code = l.role, classes = l.classes, subjects = l.subjects
from cp27_signin l where l.staff_id = s.id;
-- the name the website shows beside each decision is the list's
update pii.staff p set password_hash = l.password, password_set_at = l.set_at, name = l.name
from cp27_signin l where l.staff_id = p.staff_id;

-- an upload names the member of staff, not the sign-in entry
update capture c set uploaded_by = u.staff_id from cp27_uploads u where u.t = 'capture' and u.id = c.id;
update flow_run f set uploaded_by = u.staff_id from cp27_uploads u where u.t = 'flow_run' and u.id = f.id;
alter table capture add constraint capture_uploaded_by_fkey foreign key (uploaded_by) references staff (id);
alter table flow_run add constraint flow_run_uploaded_by_fkey foreign key (uploaded_by) references staff (id);

delete from config where key = 'app.staff';
drop index staff_signin_id_idx;
alter table staff drop column signin_id;

-- who is asking: `app.staff_id` is the member of staff's own id
create or replace function internal.resolve_staff() returns table (staff_id uuid, tenant_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.tenant_id from staff s where s.id = public.current_staff() and s.active
$$;

-- The website's sign-in reads the list before it knows who is asking (the anonymous pool), and `app_web` has no right
-- on `pii.staff`: these three are its only door to it. The list as the sign-in reads it: active people with a role, in
-- the order they were put on, each with the hash `lib/auth.ts` checks (as the old list gave it, to the server only).
create function public.staff_list(p_slug text)
returns table (id uuid, email text, name text, role text, password text, password_set_at timestamptz,
               classes text[], subjects text[])
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, p.email, p.name, s.role_code, p.password_hash, p.password_set_at, s.classes, s.subjects
  from tenant t
  join staff s on s.tenant_id = t.id and s.active and s.role_code is not null
  join pii.staff p on p.staff_id = s.id
  where t.slug = p_slug
  order by s.created_at, s.id
$$;

-- A new password, and the moment it was set (the website's clock, which its session cookies carry): every session
-- signed before it ends. → whether an active member of staff has that email.
create function public.staff_set_password(p_slug text, p_email text, p_hash text, p_at timestamptz)
returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with done as (
    update pii.staff p set password_hash = p_hash, password_set_at = p_at
    from tenant t, staff s
    where t.slug = p_slug and p.tenant_id = t.id and p.email = lower(btrim(p_email)) and s.id = p.staff_id and s.active
    returning 1)
  select exists (select 1 from done)
$$;

-- A person put on the staff list with no password (they set their own from a link). Someone removed before is put
-- back (the same id, so what they did stays theirs). → false when an active member of staff has that email already.
create function public.staff_add(p_slug text, p_email text, p_name text, p_role text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
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

do $$ begin
  if exists (select from pg_roles where rolname = 'app_web') then
    grant execute on function public.staff_list(text) to app_web;
    grant execute on function public.staff_set_password(text, text, text, timestamptz) to app_web;
    grant execute on function public.staff_add(text, text, text, text) to app_web;
    -- the Staff page says which classes and subjects a person teaches (its row rule: the staff editor's reach)
    grant update (classes, subjects) on staff to app_web;
  end if;
end $$;

-- 4. A child's class in one place. ------------------------------------------------------------------------------------

alter table school_class add column label text;
alter table school_class add column taught jsonb not null default '{}'
  check (jsonb_typeof(taught) = 'object');
-- a class with children: the label they carry (step 1: one); one with none: its grade and section
update school_class sc set label = coalesce(
  (select min(c.section) from enrolment e join child c on c.id = e.child_id where e.class_id = sc.id and e.to_date is null),
  sc.grade_code || sc.section);

-- the school year a class of today is in, made as `engine enrol k2` makes it (April to March) when there is none
insert into academic_year (tenant_id, label, starts_on, ends_on)
select distinct c.tenant_id, y.label, y.starts_on, y.ends_on
from child c
cross join lateral (select internal.school_day(c.tenant_id, now()) as d) d
cross join lateral (select make_date(extract(year from d.d - interval '3 months')::int, 4, 1) as starts_on) s
cross join lateral (select to_char(s.starts_on, 'YYYY') || '-' || to_char(s.starts_on + interval '1 year', 'YY') as label,
                           s.starts_on, (s.starts_on + interval '1 year' - interval '1 day')::date as ends_on) y
where c.active and not exists (select 1 from enrolment e where e.child_id = c.id and e.to_date is null)
  and not exists (select 1 from academic_year a where a.tenant_id = c.tenant_id and d.d between a.starts_on and a.ends_on)
on conflict (tenant_id, label) do nothing;

-- every other label an active child carries becomes a class of this year, as K2's was made: the school's one campus,
-- the label's grade (`class_band`), section A
insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label)
select b.tenant_id, (select id from campus m where m.tenant_id = b.tenant_id order by created_at limit 1), a.id,
       b.band, 'A', b.section
from cp27_band b
join academic_year a on a.tenant_id = b.tenant_id
  and internal.school_day(b.tenant_id, now()) between a.starts_on and a.ends_on
where not exists (select 1 from school_class sc where sc.tenant_id = b.tenant_id and sc.academic_year_id = a.id
                  and sc.label = b.section)
  and exists (select 1 from child c where c.tenant_id = b.tenant_id and c.section = b.section and c.active
              and not exists (select 1 from enrolment e where e.child_id = c.id and e.to_date is null));

-- and each active child not yet enrolled is enrolled there, from the year's start, at the roll number they carry
insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)
select c.tenant_id, c.id, sc.id, c.roll_no, a.starts_on, 'CP-27 group 4: from child.section and roll_no'
from child c
join academic_year a on a.tenant_id = c.tenant_id
  and internal.school_day(c.tenant_id, now()) between a.starts_on and a.ends_on
join school_class sc on sc.tenant_id = c.tenant_id and sc.academic_year_id = a.id and sc.label = c.section
where c.active and not exists (select 1 from enrolment e where e.child_id = c.id and e.to_date is null);

alter table school_class alter column label set not null;
-- a class made without a label is called by its section (a K2 class the engine makes names its own: `engine enrol k2`)
create function internal.school_class_label() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.label := coalesce(nullif(btrim(new.label), ''), new.section);
  return new;
end $$;
create trigger school_class_label before insert on school_class
  for each row execute function internal.school_class_label();
alter table school_class add constraint school_class_label_check check (btrim(label) <> '');
alter table school_class add constraint school_class_label_key unique (tenant_id, academic_year_id, label);

-- a class's word that a skill is taught (or not), on the class, with who said it and when
update school_class sc set taught = w.words
from (select k.tenant_id, k.section,
             jsonb_object_agg(k.skill_set_code, jsonb_build_object('taught', k.taught, 'by', k.taught_by,
                                                                   'at', k.taught_at)) as words
      from cp27_class_skill k group by k.tenant_id, k.section) w
where sc.tenant_id = w.tenant_id and sc.label = w.section
  and sc.id = (select x.id from school_class x join academic_year y on y.id = x.academic_year_id
               where x.tenant_id = w.tenant_id and x.label = w.section
               order by y.starts_on desc limit 1);

-- What a page reads of a child: the child row, and the class (its label as `section`) and roll number of their open
-- enrolment, else of their latest one. A child never enrolled has none. One row a child, in three branches that a
-- class asked for by label (`class_band`, a grade's classes, a class's papers) reaches from the class: written as one
-- "latest enrolment" lateral per child, it read every child's enrolments for each class asked (PR #561's browser
-- shards, 10 Nov 2026: the topics query 19 s against 2.4 s for the same rows read from `child`, at 43 classes).
create view child_now with (security_invoker = true) as
select c.id, c.tenant_id, c.band, c.active, c.created_at, c.updated_at, e.class_id, sc.label as section, e.roll_no
from enrolment e
join child c on c.id = e.child_id
join school_class sc on sc.id = e.class_id
where e.to_date is null
union all
select c.id, c.tenant_id, c.band, c.active, c.created_at, c.updated_at, e.class_id, sc.label as section, e.roll_no
from enrolment e
join child c on c.id = e.child_id
join school_class sc on sc.id = e.class_id
where e.to_date is not null
  and not exists (select from enrolment o where o.child_id = e.child_id
                  and (o.to_date is null or (o.to_date, o.from_date, o.id) > (e.to_date, e.from_date, e.id)))
union all
select c.id, c.tenant_id, c.band, c.active, c.created_at, c.updated_at, null::uuid, null::text, null::text
from child c
where not exists (select from enrolment o where o.child_id = c.id);

create index enrolment_child_idx on enrolment (child_id);

-- the class of a label now: the one of the newest year (a label names one class a year)
create or replace function public.skill_taught_in(tenant uuid, skill text, section text) returns boolean
language sql stable set search_path = public as $$
  select coalesce(
    (select (sc.taught -> $2 ->> 'taught')::boolean from school_class sc
       join academic_year y on y.id = sc.academic_year_id
      where sc.tenant_id = $1 and sc.label = $3
      order by y.starts_on desc limit 1),
    (select s.taught from skill s where s.tenant_id = $1 and s.code = $2),
    false)
$$;

-- a person says a class has (or has not) been taught a topic — every skill in it — or, with `skill`, one skill of it.
-- A class no active child is in is no class: nothing is said. Returns how many skills were said.
create or replace function public.say_taught(tenant uuid, section text, topic text, skill text, taught boolean,
                                             said_by text) returns integer
language sql security definer set search_path = public as $$
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
$$;

create or replace function public.class_band(tenant uuid, section text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select c.band from child_now c
  join grade g on g.tenant_id = c.tenant_id and g.code = c.band
  where c.tenant_id = $1 and c.section = $2 and c.active
  group by c.band, g.ord
  order by count(*) desc, g.ord
  limit 1
$$;

create or replace function public.grade_is_wholly(p_grade text, p_sections text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.my_tenant() is not null and not exists (
    select 1 from child_now c
    where c.tenant_id = public.my_tenant() and c.band = p_grade and c.active and c.section <> all (p_sections))
$$;

create or replace function public.my_sections(p_kind text) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct sc.label), '{}'::text[])
  from school_class sc where sc.id = any (public.my_ids(p_kind, 'class'))
$$;

create or replace function public.staff_sees_sheet(p_role text, p_classes text[], p_subjects text[], p_staff uuid,
                                                   p_sheet uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select staff_sees(p_role, p_classes, p_subjects, p_staff, null, null, null)
    or exists (select 1 from capture c
               where c.sheet_instance_id = p_sheet and c.superseded_by is null
                 and staff_sees(p_role, p_classes, p_subjects, p_staff, null, null, c.uploaded_by))
    or coalesce((
      select case when staff_sees(p_role, p_classes, p_subjects, p_staff, coalesce(si.section, ch.section), null, null)
                  then staff_sees(p_role, p_classes, p_subjects, p_staff, coalesce(si.section, ch.section),
                                  sheet_subject(si.sheet_template_id), null)
                  else false end
      from sheet_instance si left join child_now ch on ch.id = si.child_id
      where si.id = p_sheet), false)
$$;

create or replace function pii.find_child(p_section text, p_first_name text, p_actor text) returns setof uuid
language plpgsql security definer set search_path = pii, public as $$
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

create or replace function public.my_ids(p_kind text, p_key_type text) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
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

-- A move: the class is found by its label in this year, so an enrolled K2 child can be moved (the old lookup asked
-- for a class whose section was the label: K2's says 'A', and every K2 move was refused). The grade is the child's
-- own (Amendment 2); the class and roll are their enrolment's: one closed, one opened, in one step. One `change_log`
-- row says what moved, from what to what, why and who. The papers not yet made for the weeks ahead are withdrawn.
create or replace function public.move_child(p_child uuid, p_band text, p_section text, p_roll text, p_by text,
                                             p_reason text default '', p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c child_now%rowtype;
  p_section_t text := btrim(coalesce(p_section, ''));
  p_roll_t    text := btrim(coalesce(p_roll, ''));
  withdrawn   integer;
  made        integer;
  today       date;   -- the school's day of p_at, never the server's
  this_week   text;
  here        uuid;   -- the campus the child is on now
  there       uuid;   -- the class they are going to
  who         uuid;
begin
  perform 1 from child where id = p_child for update;
  select * into c from child_now where id = p_child;
  if not found then return jsonb_build_object('moved', false, 'refused', 'no_such_child'); end if;
  today := internal.school_day(c.tenant_id, p_at);
  this_week := to_char(today, 'IYYY-"W"IW');
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
end $$;

-- the levels to review read a child's class from their enrolment
do $$
declare
  v text := pg_get_viewdef('level_calibration'::regclass);
begin
  if v !~ 'JOIN child c ON' then
    raise exception 'CP-27: level_calibration no longer reads child as c';
  end if;
  execute 'create or replace view level_calibration with (security_invoker = true) as '
          || replace(v, 'JOIN child c ON', 'JOIN child_now c ON');
end $$;

-- 5. Every person and class in its new home; what reads them says what it said. -------------------------------------

do $$
declare
  n_old bigint;
  n_new bigint;
  diff text;
  who record;
begin
  -- each person on the list, joined back on every value the sign-in reads
  select count(*) into n_old from cp27_signin;
  select count(*) into n_new from cp27_signin l
    join staff s on s.id = l.staff_id and s.active and s.role_code = l.role and s.classes = l.classes
      and s.subjects = l.subjects
    join pii.staff p on p.staff_id = l.staff_id and p.email = l.email and p.name = l.name
      and p.password_hash is not distinct from l.password and p.password_set_at is not distinct from l.set_at;
  if n_old <> n_new then
    raise exception 'CP-27: % on the sign-in list, % on the staff list with the same values', n_old, n_new;
  end if;
  select count(*) into n_new from tenant t, public.staff_list(t.slug) l;
  if n_new <> n_old or n_new <> (select count(*) from staff where active) then
    raise exception 'CP-27: % on the sign-in list, % listed for sign-in, % active staff', n_old, n_new,
      (select count(*) from staff where active);
  end if;
  if (select (grants, staff, pii_staff) from cp27_counts)
     is distinct from (select (count(*), (select count(*) from staff), (select count(*) from pii.staff))
                       from staff_role_grant) then
    raise exception 'CP-27: staff, pii.staff or role grants changed in number';
  end if;
  if exists (select 1 from config where key = 'app.staff') then
    raise exception 'CP-27: a school still has the key app.staff';
  end if;
  -- every upload names a member of staff, the one it named before
  select count(*) into n_old from cp27_uploads;
  select (select count(*) from capture where uploaded_by is not null)
       + (select count(*) from flow_run where uploaded_by is not null) into n_new;
  if n_old <> n_new or exists (select 1 from cp27_uploads u where u.staff_id is distinct from
       case u.t when 'capture' then (select uploaded_by from capture where id = u.id)
                else (select uploaded_by from flow_run where id = u.id) end) then
    raise exception 'CP-27: % uploads by a person before, % after, or one names someone else', n_old, n_new;
  end if;
  -- each person sees what they saw, asking as their staff id; a spare paper of their class is theirs now that the
  -- class is found by its label (K2's says 'A'), so papers may only be added to
  for who in select distinct staff_id from cp27_sees loop
    perform set_config('app.staff_id', who.staff_id::text, true);
    select string_agg(format('%s %s %s', b.staff_id, b.kind, b.key_type), '; ') into diff
    from cp27_sees b
    cross join lateral (select array(select unnest(public.my_ids(b.kind, b.key_type)) order by 1) as ids) a
    where b.staff_id = who.staff_id
      and case when b.key_type in ('sheet', 'capture', 'item_result', 'run') then not (a.ids @> b.ids)
               else a.ids is distinct from b.ids end;
    exit when diff is not null;
  end loop;
  perform set_config('app.staff_id', '', true);
  if diff is not null then
    raise exception 'CP-27: someone sees other records than before: %', diff;
  end if;

  -- per label, the active children before are the open enrolments after: the same children, rolls and grades
  if exists (select id, tenant_id, section, roll_no, band from cp27_child
             except select n.id, n.tenant_id, n.section, n.roll_no, n.band from child_now n
                    join enrolment e on e.child_id = n.id and e.to_date is null and e.class_id = n.class_id
                    where n.active)
     or exists (select n.id, n.tenant_id, n.section, n.roll_no, n.band from child_now n
                join enrolment e on e.child_id = n.id and e.to_date is null where n.active
                except select id, tenant_id, section, roll_no, band from cp27_child) then
    raise exception 'CP-27: a child''s class, roll or grade is not what the child row said';
  end if;
  select string_agg(format('%s: %s children, %s enrolled', b.section, b.n, coalesce(a.n, 0)), '; ') into diff
  from (select tenant_id, section, count(*) as n from cp27_child group by 1, 2) b
  left join (select sc.tenant_id, sc.label, count(*) as n from enrolment e join school_class sc on sc.id = e.class_id
             join child c on c.id = e.child_id and c.active where e.to_date is null group by 1, 2) a
    on a.tenant_id = b.tenant_id and a.label = b.section
  where a.n is distinct from b.n;
  if diff is not null then
    raise exception 'CP-27: active children per label are not the open enrolments per class: %', diff;
  end if;
  if exists (select tenant_id, section, band from cp27_band
             except select tenant_id, section, public.class_band(tenant_id, section) from cp27_band) then
    raise exception 'CP-27: a class''s grade (class_band) changed';
  end if;
  -- every class word is on its class, and "taught" says what it said for every skill in every class
  select count(*) into n_old from cp27_class_skill;
  select count(*) into n_new from cp27_class_skill k join school_class sc on sc.tenant_id = k.tenant_id
    and sc.label = k.section and sc.taught -> k.skill_set_code
        = jsonb_build_object('taught', k.taught, 'by', k.taught_by, 'at', k.taught_at);
  if n_old <> n_new then
    raise exception 'CP-27: % class words, % on their class', n_old, n_new;
  end if;
  if exists (select * from cp27_taught
             except select tenant_id, code, section, public.skill_taught_in(tenant_id, code, section) from cp27_taught) then
    raise exception 'CP-27: whether a skill is taught in a class changed';
  end if;
  if exists (select * from level_calibration except select * from cp27_calibration)
     or exists (select * from cp27_calibration except select * from level_calibration) then
    raise exception 'CP-27: the levels to review changed';
  end if;
  raise notice 'CP-27 4: % on the staff list, % uploads re-keyed, % classes, % open enrolments, % class words',
    (select count(*) from staff where active), (select count(*) from cp27_uploads), (select count(*) from school_class),
    (select count(*) from enrolment where to_date is null), (select count(*) from cp27_class_skill);
end $$;

-- 6. What leaves: the child's own class and roll, the move table, the stored cards, the class words' table. ---------

alter table child drop constraint child_tenant_id_section_roll_no_key;
alter table child drop column section;
alter table child drop column roll_no;

delete from access_table where schema_name = 'public' and table_name in ('class_card', 'class_skill', 'child_move');
update data_register set tables = array_remove(tables, 'public.child_move') where 'public.child_move' = any(tables);
update data_register set tables = array_remove(tables, 'public.class_card') where 'public.class_card' = any(tables);
update data_register set tables = array_remove(tables, 'public.class_skill') where 'public.class_skill' = any(tables);

do $$
declare
  t text;
  k record;
  moved constant text[] := array['class_card', 'class_skill'];
begin
  if exists (select 1 from pg_constraint c where c.contype = 'f'
             and c.confrelid in (select ('public.' || x)::regclass from unnest(moved || array['child_move']) x)
             and c.conrelid not in (select ('public.' || x)::regclass from unnest(moved || array['child_move']) x)) then
    raise exception 'CP-27: a table that stays still has a key into one that leaves';
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

drop table public.child_move;  -- empty (step 1, in this transaction)
alter table public.class_card set schema retired;
alter table public.class_skill set schema retired;

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
