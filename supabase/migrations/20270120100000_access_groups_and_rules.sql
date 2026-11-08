-- CP-3: who may see children, enrolment, staff and observation notes is decided by the database, from rows.
--
-- Three groups (Nimish, 8 Nov 2026): everything (coordinator, deputy coordinator, mentor, head, curriculum team, ops);
-- own classes (educator, class teacher, subject educator, cover educator, specialist, assistant); everyone signed in
-- (the question bank, curriculum, plan and timetable, which CP-4 governs). Role -> group and group -> kinds of data are
-- rows; changing either is an insert or an update, never a code change. special_educator is in `everything` until
-- Nimish says otherwise (one update). `access_table` lists the tables of each kind; `internal.apply_conventions()`
-- (called at the end of every migration) turns the list into policies for the website's login. The engine keeps its
-- full access. A table not listed keeps `app_all` until CP-4. Needs CP-2's public.current_staff().

-- 1. The rows ----------------------------------------------------------------------------------------------------------

create table if not exists access_group (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  code       text not null,
  label      text not null,
  by_role    boolean not null,  -- true: a person is in it by a role they hold; false: by being signed in
  ord        integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, code),
  unique (tenant_id, code, by_role)
);

create table if not exists access_kind (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  code       text not null,
  label      text not null,
  ord        integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, code)
);

-- a role is in at most one group (the primary key); only a group of roles can hold a role (the foreign key)
create table if not exists access_role_group (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  role_code  text not null,
  group_code text not null,
  by_role    boolean not null default true check (by_role),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, role_code),
  foreign key (tenant_id, role_code) references role (tenant_id, code),
  foreign key (tenant_id, group_code, by_role) references access_group (tenant_id, code, by_role)
);

-- all: every row of the kind; own: the classes the person holds a current grant for (for staff: their own row);
-- none: nothing. No row means none.
create table if not exists access_reach (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  group_code text not null,
  kind_code  text not null,
  reach      text not null check (reach in ('all', 'own', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, group_code, kind_code),
  foreign key (tenant_id, group_code) references access_group (tenant_id, code),
  foreign key (tenant_id, kind_code) references access_kind (tenant_id, code)
);

-- the tables each kind covers and the column that ties a row to a class, child, note or person
create table if not exists access_table (
  schema_name text not null check (schema_name in ('public', 'pii')),
  table_name  text not null,
  kind_code   text not null,
  key_column  text not null,
  key_type    text not null check (key_type in ('class', 'child', 'note', 'staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (schema_name, table_name)
);

-- the website may read these; the engine reads, adds and changes them, and deletes none
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on access_group, access_kind, access_role_group, access_reach, access_table from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on access_group, access_kind, access_role_group, access_reach, access_table from authenticated;
  end if;
  revoke all on access_group, access_kind, access_role_group, access_reach, access_table from public;
  if exists (select from pg_roles where rolname = 'app_web') then
    revoke all on access_group, access_kind, access_role_group, access_reach, access_table from app_web;
    grant select on access_group, access_kind, access_role_group, access_reach, access_table to app_web;
  end if;
  if exists (select from pg_roles where rolname = 'app_engine') then
    revoke all on access_group, access_kind, access_role_group, access_reach, access_table from app_engine;
    grant select, insert, update on access_group, access_kind, access_role_group, access_reach, access_table
      to app_engine;
  end if;
end $$;

-- 2. The seeds, for every school there is and every school added later ------------------------------------------------

create or replace function internal.access_vocabulary(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into access_group (tenant_id, code, label, by_role, ord) values
    (p_tenant, 'everything', 'Everything', true, 0),
    (p_tenant, 'own_classes', 'Own classes', true, 1),
    (p_tenant, 'signed_in', 'Everyone signed in', false, 2)
  on conflict do nothing;
  insert into access_kind (tenant_id, code, label, ord) values
    (p_tenant, 'children', 'Children', 0), (p_tenant, 'enrolment', 'Enrolment', 1),
    (p_tenant, 'staff', 'Staff', 2), (p_tenant, 'notes', 'Observation notes', 3)
  on conflict do nothing;
  insert into access_role_group (tenant_id, role_code, group_code)
  select p_tenant, v.role_code, v.group_code
  from (values
    ('coordinator', 'everything'), ('deputy_coordinator', 'everything'), ('mentor', 'everything'),
    ('head', 'everything'), ('curriculum_team', 'everything'), ('ops', 'everything'),
    ('special_educator', 'everything'),  -- in neither list Nimish gave; here until he says otherwise
    ('educator', 'own_classes'), ('class_teacher', 'own_classes'), ('subject_educator', 'own_classes'),
    ('cover_educator', 'own_classes'), ('specialist', 'own_classes'), ('assistant', 'own_classes')
  ) v (role_code, group_code)
  where exists (select from role r where r.tenant_id = p_tenant and r.code = v.role_code)
  on conflict do nothing;
  insert into access_reach (tenant_id, group_code, kind_code, reach)
  select p_tenant, g.code, k.code,
         case g.code when 'everything' then 'all' when 'own_classes' then 'own' else 'none' end
  from access_group g join access_kind k on k.tenant_id = g.tenant_id
  where g.tenant_id = p_tenant
  on conflict do nothing;
end $$;

create or replace function internal.access_vocabulary_on_new_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform internal.access_vocabulary(new.id);
  return new;
end $$;

-- Postgres fires same-event triggers in name order: this name sorts after `people_vocabulary`, which makes the roles
-- the role-group rows point at.
drop trigger if exists people_vocabulary_then_access on tenant;
create trigger people_vocabulary_then_access after insert on tenant
  for each row execute function internal.access_vocabulary_on_new_school();

select internal.access_vocabulary(id) from tenant;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type) values
  ('public', 'child', 'children', 'id', 'child'),
  ('pii', 'child', 'children', 'child_id', 'child'),
  ('public', 'enrolment', 'enrolment', 'class_id', 'class'),
  ('public', 'staff', 'staff', 'id', 'staff'),
  ('public', 'staff_role_grant', 'staff', 'staff_id', 'staff'),
  ('pii', 'staff', 'staff', 'staff_id', 'staff'),
  ('pii', 'educator_note', 'notes', 'class_id', 'class'),
  ('pii', 'note_claim', 'notes', 'note_id', 'note')
on conflict do nothing;

-- 3. Who is asking -----------------------------------------------------------------------------------------------------

-- Which staff row each sign-in list entry belongs to (matched by email, in the same school). The rules ask "who is
-- asking" on every statement, and a function that reads a protected table asks again on every call, so the answer is
-- a column looked up by key and not worked out from the list each time (measured: 0.33 ms a question worked out from
-- the list, against a key lookup). Only an entry whose email matches exactly one staff row is set. Kept by the
-- triggers below; the id is a key only, no name or email is kept here.
alter table staff add column if not exists signin_id uuid;
create unique index if not exists staff_signin_id_idx on staff (signin_id) where signin_id is not null;

create or replace function internal.rebuild_staff_signin() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  with want as (
    select min(p.staff_id::text)::uuid as staff_id, (e ->> 'id')::uuid as signin_id
    from config c
    cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]'::jsonb end) e
    join pii.staff p on p.tenant_id = c.tenant_id and p.email = lower(btrim(e ->> 'email'))
    where c.key = 'app.staff' and (e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    group by (e ->> 'id')::uuid, c.tenant_id
    having count(*) = 1
  )
  update staff s set signin_id = w.signin_id
  from (select st.id, x.signin_id from staff st left join want x on x.staff_id = st.id) w
  where w.id = s.id and s.signin_id is distinct from w.signin_id;
end $$;

create or replace function internal.rebuild_staff_signin_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.rebuild_staff_signin();
  return null;
end $$;

drop trigger if exists staff_signin_from_list on config;
create trigger staff_signin_from_list after insert or update on config
  for each row when (new.key = 'app.staff') execute function internal.rebuild_staff_signin_trigger();
drop trigger if exists staff_signin_from_list_gone on config;
create trigger staff_signin_from_list_gone after delete on config
  for each row when (old.key = 'app.staff') execute function internal.rebuild_staff_signin_trigger();
drop trigger if exists staff_signin_from_email on pii.staff;
create trigger staff_signin_from_email after insert or update or delete on pii.staff
  for each statement execute function internal.rebuild_staff_signin_trigger();

select internal.rebuild_staff_signin();

-- The one active staff row the sign-in list entry named by current_staff() belongs to; nothing otherwise. Nothing is
-- logged.
create or replace function internal.resolve_staff() returns table (staff_id uuid, tenant_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.tenant_id from staff s where s.signin_id = public.current_staff() and s.active
$$;

create or replace function public.signed_in_staff() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select staff_id from internal.resolve_staff()
$$;

create or replace function public.my_tenant() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select tenant_id from internal.resolve_staff()
$$;

-- all, own or none, for a kind: the best of the groups of the roles on the person's current grants. A grant holds from
-- valid_from and not on valid_to (the first day it no longer holds). No school clock, no grant: none.
create or replace function public.my_reach(p_kind text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case max(case r.reach when 'all' then 2 when 'own' then 1 else 0 end)
             when 2 then 'all' when 1 then 'own' else 'none' end
    from internal.resolve_staff() me
    cross join lateral (select internal.school_day(me.tenant_id, now()) as d) today
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= today.d and (g.valid_to is null or g.valid_to > today.d)
    join access_role_group rg on rg.tenant_id = g.tenant_id and rg.role_code = g.role_code
    join access_reach r on r.tenant_id = rg.tenant_id and r.group_code = rg.group_code and r.kind_code = p_kind
  ), 'none')
$$;

-- the ids a person with 'own' reach may see: class = their classes; child = the children enrolled in them now;
-- note = the notes of those classes. Only grants whose role's group gives 'own' for the kind count.
create or replace function public.my_ids(p_kind text, p_key_type text) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (
    select m.staff_id, m.tenant_id, internal.school_day(m.tenant_id, now()) as d from internal.resolve_staff() m
  ), cls as (
    select distinct g.school_class_id as id, me.tenant_id, me.d
    from me
    join staff_role_grant g on g.tenant_id = me.tenant_id and g.staff_id = me.staff_id
      and g.valid_from <= me.d and (g.valid_to is null or g.valid_to > me.d)
    join access_role_group rg on rg.tenant_id = g.tenant_id and rg.role_code = g.role_code
    join access_reach r on r.tenant_id = rg.tenant_id and r.group_code = rg.group_code
      and r.kind_code = p_kind and r.reach = 'own'
    where g.school_class_id is not null
  )
  select coalesce(case p_key_type
    when 'class' then (select array_agg(id) from cls)
    -- the children enrolled in those classes now, and (Nimish, 27 Oct 2026: "Achal should only see the papers he has
    -- uploaded") the children whose papers this person put in, whatever their class
    when 'child' then (select array_agg(distinct x.child_id) from (
                         select e.child_id from enrolment e join cls
                           on e.tenant_id = cls.tenant_id and e.class_id = cls.id
                         where e.from_date <= cls.d and (e.to_date is null or e.to_date > cls.d)
                         union
                         select si.child_id from capture c
                           join sheet_instance si on si.id = c.sheet_instance_id and si.child_id is not null
                         where c.uploaded_by = public.current_staff() and c.superseded_by is null  -- uploaded_by is the sign-in entry id, as current_staff() is
                           and c.tenant_id = (select tenant_id from me)) x)
    when 'note' then (select array_agg(n.id) from pii.educator_note n join cls
                        on n.tenant_id = cls.tenant_id and n.class_id = cls.id)
  end, '{}'::uuid[])
$$;

do $$
declare f text;
begin
  foreach f in array array['internal.resolve_staff()', 'public.signed_in_staff()', 'public.my_tenant()',
                           'public.my_reach(text)', 'public.my_ids(text,text)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
  end loop;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant execute on function public.signed_in_staff(), public.my_tenant(), public.my_reach(text),
      public.my_ids(text, text) to app_web;
  end if;
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant execute on function public.signed_in_staff(), public.my_tenant(), public.my_reach(text),
      public.my_ids(text, text) to app_engine;
  end if;
end $$;

-- 3b. A class's grade is not a child's record ---------------------------------------------------------------------------
-- `class_band` is the one rule every page asks for a class's grade (the most common grade among its active children).
-- Pages call it once per row of a long list (the Skill Map: some 6,000 times in one statement), and each call is a new
-- statement, so the row rule on `child` would be worked out 6,000 times (0.7 ms each: 4.3 s, and the site's 8-second limit
-- is the next step). It returns one grade, never a child, a name or a count; it is read as the owner, so the rule is
-- not worked out per call. Its body is unchanged.
create or replace function public.class_band(tenant uuid, section text) returns text
language sql stable security definer set search_path = public as $$
  select c.band from child c
  join grade g on g.tenant_id = c.tenant_id and g.code = c.band
  where c.tenant_id = $1 and c.section = $2 and c.active
  group by c.band, g.ord
  order by count(*) desc, g.ord
  limit 1
$$;

-- `staff_sees_sheet` is the website's one rule for whether a person sees a printed copy; it reads the copy's child only
-- for the child's class and answers yes or no from the role and classes it is given. The papers lists ask it once per
-- copy (one statement did so some 4,000 times, 22 s), and each call would work out the row rule on `child` again. It
-- reads as the owner, as `class_band` does. `staff_sees_capture` reaches `child` only through it.
alter function public.staff_sees_sheet(text, text[], text[], uuid, uuid) security definer;

-- 3c. A fact about the whole school, never a child --------------------------------------------------------------------
-- "Is every active class of this grade among these sections?" The levels page shows a grade's figures to an educator
-- only when the grade is wholly theirs. It was worked out by counting children of other classes, which the rule now
-- hides from an educator: they would see no other class and the answer would turn into "yes". The answer is one yes or
-- no and names no child, class or number. With nobody asking it is "no".
create or replace function public.grade_is_wholly(p_grade text, p_sections text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.my_tenant() is not null and not exists (
    select 1 from child c
    where c.tenant_id = public.my_tenant() and c.band = p_grade and c.active and c.section <> all (p_sections))
$$;

revoke all on function public.grade_is_wholly(text, text[]) from public;
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.grade_is_wholly(text, text[]) from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on function public.grade_is_wholly(text, text[]) from authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant execute on function public.grade_is_wholly(text, text[]) to app_web;
  end if;
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant execute on function public.grade_is_wholly(text, text[]) to app_engine;
  end if;
end $$;

-- 4. The rule, generated -----------------------------------------------------------------------------------------------

-- Today's body (row security, service_role_all, app_all, touch_updated_at, ledger revoke) with one change: a table
-- listed in access_table gets no app_all. Every policy but service_role_all is dropped (a stray permissive policy would
-- widen the rule), then engine_all (the engine's own full access) and web_rule (the website, by group) are made.
create or replace function internal.apply_conventions() returns void
language plpgsql set search_path = public as $$
declare t record; a record; p record; cond text; rule text;
begin
  for t in
    select n.nspname as s, c.relname as r
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'pii')
  loop
    execute format('alter table %I.%I enable row level security', t.s, t.r);
    execute format('alter table %I.%I force row level security', t.s, t.r);
    execute format('drop policy if exists service_role_all on %I.%I', t.s, t.r);
    execute format(
      'create policy service_role_all on %I.%I for all to service_role using (true) with check (true)',
      t.s, t.r);
    select * into a from access_table x where x.schema_name = t.s and x.table_name = t.r;
    if found then
      for p in select policyname from pg_policies
               where schemaname = t.s and tablename = t.r and policyname <> 'service_role_all' loop
        execute format('drop policy %I on %I.%I', p.policyname, t.s, t.r);
      end loop;
      if exists (select from pg_roles where rolname = 'app_engine') then
        execute format('create policy engine_all on %I.%I for all to app_engine using (true) with check (true)',
          t.s, t.r);
      end if;
      if exists (select from pg_roles where rolname = 'app_web') then
        cond := case a.key_type
          when 'staff' then format('%I = (select public.signed_in_staff())', a.key_column)
          else format('%I = any ((select public.my_ids(%L, %L))::uuid[])', a.key_column, a.kind_code, a.key_type)
        end;
        rule := format('tenant_id = (select public.my_tenant()) and ((select public.my_reach(%1$L)) = ''all'' '
                       'or ((select public.my_reach(%1$L)) = ''own'' and %2$s))', a.kind_code, cond);
        execute format('create policy web_rule on %I.%I as permissive for all to app_web using (%s) with check (%s)',
          t.s, t.r, rule, rule);
      end if;
    elsif exists (select from pg_roles where rolname = 'app_engine') then
      execute format('drop policy if exists app_all on %I.%I', t.s, t.r);
      execute format(
        'create policy app_all on %I.%I for all to app_web, app_engine using (true) with check (true)',
        t.s, t.r);
    end if;
    execute format('drop trigger if exists touch_updated_at on %I.%I', t.s, t.r);
    execute format(
      'create trigger touch_updated_at before update on %I.%I '
      'for each row execute function internal.touch_updated_at()',
      t.s, t.r);
  end loop;
  if exists (select from pg_roles where rolname = 'app_engine') then
    for t in
      select distinct tgrelid::regclass as ledger from pg_trigger where tgfoid = 'internal.forbid_change'::regproc
    loop
      execute format('revoke update, delete, truncate on %s from app_web, app_engine', t.ledger);
    end loop;
  end if;
end $$;

select internal.apply_conventions();
