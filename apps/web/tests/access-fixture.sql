-- Test fixture only (installed by global-setup.ts into the local copy, never a migration, never live).
--
-- The database's access rules (CP-3) show a person only the children of classes they hold a current grant for, through
-- an open enrolment. The specs predate that: they put an invented educator on the staff list with the `classes` they
-- teach (tests/rows.ts `aPerson`, `teaches`) and make children by class label and roll (`aChildIn`). This stands in for
-- what CP-1's loader does on the live site, so the specs' rows are the rows the rule reads:
--   - a child put in a class label gets that class (one per label in this school year) and an open enrolment;
--   - a person put on the staff list gets a staff row and its pii.staff row, and a current grant for each class it
--     teaches (the role `assistant`; a `coordinator` gets the role `coordinator`).
-- The signed-in test user of global-setup.ts is left out: it is given its own role there.
-- Since CP-27 group 4 a child's class and roll live only in the enrolment, and the staff list only in the staff tables.
create schema if not exists test_fixture;

-- the class labelled p_section in this school year (April to March, as the engine makes one), made when there is none
create or replace function test_fixture.class_of(p_tenant uuid, p_section text, p_band text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare cls uuid; yr uuid; camp uuid; s date;
begin
  select id into camp from campus where tenant_id = p_tenant order by created_at limit 1;
  s := make_date(extract(year from internal.school_day(p_tenant, now()) - interval '3 months')::int, 4, 1);
  -- read first, made only when missing: an upsert would hold the year every spec's classes share
  select id into yr from academic_year where tenant_id = p_tenant and starts_on = s;
  if yr is null then
    insert into academic_year (tenant_id, label, starts_on, ends_on)
      values (p_tenant, to_char(s, 'YYYY') || '-' || to_char(s + interval '1 year', 'YY'), s,
              (s + interval '1 year' - interval '1 day')::date)
      on conflict (tenant_id, label) do nothing;
    select id into yr from academic_year where tenant_id = p_tenant and starts_on = s;
  end if;
  select id into cls from school_class where tenant_id = p_tenant and academic_year_id = yr and label = p_section;
  if cls is null then
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label)
      values (p_tenant, camp, yr, coalesce(p_band, 'G2'), p_section, p_section) returning id into cls;
  end if;
  return cls;
end $$;

-- a child at roll p_roll of the class labelled p_section: their open enrolment, from the year's start
create or replace function test_fixture.enrol(p_child uuid, p_section text, p_roll text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c record; cls uuid;
begin
  select * into c from child where id = p_child;
  if c.id is null or exists (select from enrolment where child_id = c.id and to_date is null) then return; end if;
  cls := test_fixture.class_of(c.tenant_id, p_section, c.band);
  insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)
    select c.tenant_id, c.id, cls, p_roll, y.starts_on, 'test fixture'
    from school_class sc join academic_year y on y.id = sc.academic_year_id where sc.id = cls;
end $$;

-- a person on the staff list, exactly as given (someone with the email already is that person, put back), → their id
create or replace function test_fixture.person(p_tenant uuid, p_email text, p_name text, p_role text, p_classes text[],
                                               p_subjects text[], p_hash text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid;
begin
  select p.staff_id into sid from pii.staff p where p.tenant_id = p_tenant and p.email = lower(btrim(p_email));
  if sid is null then
    insert into staff (tenant_id, campus_id, role_code, classes, subjects)
      values (p_tenant, (select id from campus where tenant_id = p_tenant order by created_at limit 1), p_role,
              coalesce(p_classes, '{}'), coalesce(p_subjects, '{}'))
      returning id into sid;
    insert into pii.staff (tenant_id, staff_id, name, email, password_hash)
      values (p_tenant, sid, coalesce(nullif(btrim(p_name), ''), 'Test educator'), lower(btrim(p_email)), p_hash);
  else
    update staff set active = true, role_code = p_role, classes = coalesce(p_classes, '{}'),
                     subjects = coalesce(p_subjects, '{}') where id = sid;
    update pii.staff set name = coalesce(nullif(btrim(p_name), ''), 'Test educator'), password_hash = p_hash,
                         password_set_at = null where staff_id = sid;
  end if;
  return sid;
end $$;

-- a person's grants follow the classes they teach and their role, whenever either is written
create or replace function test_fixture.on_staff() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare cls uuid; lbl text; want_role text; g record;
begin
  if exists (select from pii.staff p where p.staff_id = new.id and p.email = 'e2e@cornerstone.test') then return null; end if;
  want_role := case when not new.active then null when new.role_code = 'coordinator' then 'coordinator' else 'assistant' end;
  -- end what the person no longer has (a grant is ended, never deleted)
  for g in select gr.id, gr.school_class_id, gr.role_code from staff_role_grant gr
           where gr.staff_id = new.id and gr.granted_by = 'test fixture' and gr.valid_to is null loop
    if g.role_code is distinct from want_role
       or (want_role = 'assistant' and not exists (select from school_class sc where sc.id = g.school_class_id
                                                    and sc.label = any (new.classes))) then
      update staff_role_grant set valid_to = valid_from where id = g.id;
    end if;
  end loop;
  if want_role = 'coordinator' then
    if not exists (select from staff_role_grant where staff_id = new.id and role_code = 'coordinator' and valid_to is null) then
      insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)
        values (new.tenant_id, new.id, 'coordinator', current_date - 1, 'test fixture');
    end if;
  elsif want_role = 'assistant' then
    foreach lbl in array new.classes loop
      cls := test_fixture.class_of(new.tenant_id, lbl,
               (select c2.band from child_now c2 where c2.tenant_id = new.tenant_id and c2.section = lbl limit 1));
      if not exists (select from staff_role_grant where staff_id = new.id and school_class_id = cls
                     and role_code = 'assistant' and valid_to is null) then
        insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
          values (new.tenant_id, new.id, 'assistant', cls, current_date - 1, 'test fixture');
      end if;
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists test_fixture_signin on staff;
create trigger test_fixture_signin after insert or update of active, role_code, classes on staff
  for each row execute function test_fixture.on_staff();

-- A spec that enrols its own children (k2-rows.ts) after this fixture already did: the spec's enrolment takes over.
create or replace function test_fixture.yield_to_spec() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update enrolment set to_date = from_date
    where child_id = new.child_id and to_date is null and recorded_by = 'test fixture';
  return new;
end $$;

drop trigger if exists test_fixture_yield on enrolment;
create trigger test_fixture_yield before insert on enrolment
  for each row when (new.recorded_by <> 'test fixture') execute function test_fixture.yield_to_spec();
