-- Test fixture only (installed by global-setup.ts into the local copy, never a migration, never live).
--
-- The database's access rules (CP-3) show a person only the children of classes they hold a current grant for, through
-- an open enrolment. The specs predate that: they sign an invented educator in by adding an entry to the sign-in list
-- (config app.staff, with `classes`) and make children that carry only a class label. This stands in for what CP-1's
-- loader does on the live site, so the specs' rows are the rows the rule reads:
--   - a child with a class label gets a class and an open enrolment;
--   - a sign-in entry gets a staff row, and a current grant for each class it lists (the role `assistant`; a
--     `coordinator` entry gets the role `coordinator`).
-- The signed-in test user of global-setup.ts is left out: it is given its own role there.
create schema if not exists test_fixture;

create or replace function test_fixture.class_of(p_tenant uuid, p_section text, p_band text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare cls uuid; yr uuid; camp uuid; g record;
begin
  select id into camp from campus where tenant_id = p_tenant order by created_at limit 1;
  insert into academic_year (tenant_id, label, starts_on, ends_on) values (p_tenant, '2098-99', '2000-01-01', '2999-12-31')
    on conflict (tenant_id, label) do nothing;
  select id into yr from academic_year where tenant_id = p_tenant and label = '2098-99';
  -- a class label exists in every grade, so a child moved to another grade (move_child) finds the class it goes to
  for g in select code from grade where tenant_id = p_tenant loop
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)
      values (p_tenant, camp, yr, g.code, p_section) on conflict do nothing;
  end loop;
  select id into cls from school_class where tenant_id = p_tenant and section = p_section
    order by (grade_code = p_band) desc, created_at limit 1;
  return cls;
end $$;

create or replace function test_fixture.enrol(p_child uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c record; cls uuid;
begin
  select * into c from child where id = p_child;
  if c.id is null or c.section is null or exists (select from enrolment where child_id = c.id and to_date is null) then return; end if;
  cls := test_fixture.class_of(c.tenant_id, c.section, c.band);
  insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)
    values (c.tenant_id, c.id, cls, left(regexp_replace(coalesce(c.roll_no, c.id::text), '[^A-Za-z0-9-]', '', 'g'), 8),
            current_date - 30, 'test fixture')
    on conflict do nothing;
end $$;

create or replace function test_fixture.on_child() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform test_fixture.enrol(new.id);
  return null;
end $$;

drop trigger if exists test_fixture_enrol on child;
create trigger test_fixture_enrol after insert on child for each row execute function test_fixture.on_child();

create or replace function test_fixture.on_signin_list() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; sid uuid; camp uuid; cls uuid; lbl text; kid uuid; want text[]; want_role text; g record;
begin
  if jsonb_typeof(new.value) <> 'array' then return null; end if;
  select id into camp from campus where tenant_id = new.tenant_id order by created_at limit 1;
  for e in select x from jsonb_array_elements(new.value) x loop
    continue when lower(btrim(e ->> 'email')) = 'e2e@cornerstone.test';
    select p.staff_id into sid from pii.staff p where p.tenant_id = new.tenant_id and p.email = lower(btrim(e ->> 'email'));
    if sid is null then
      insert into staff (tenant_id, campus_id) values (new.tenant_id, camp) returning id into sid;
      insert into pii.staff (tenant_id, staff_id, name, email)
        values (new.tenant_id, sid, coalesce(nullif(btrim(e ->> 'name'), ''), 'Test educator'), lower(btrim(e ->> 'email')));
    end if;
    want := coalesce(array(select jsonb_array_elements_text(coalesce(e -> 'classes', '[]'::jsonb))), '{}');
    want_role := case when e ->> 'role' = 'coordinator' then 'coordinator' else 'assistant' end;
    -- end what the entry no longer names (a grant is ended, never deleted)
    for g in select gr.id, gr.school_class_id, gr.role_code from staff_role_grant gr
             where gr.staff_id = sid and gr.granted_by = 'test fixture' and gr.valid_to is null loop
      if g.role_code <> want_role
         or (want_role = 'assistant' and not exists (select from school_class sc where sc.id = g.school_class_id and sc.section = any (want))) then
        update staff_role_grant set valid_to = valid_from where id = g.id;
      end if;
    end loop;
    if want_role = 'coordinator' then
      if not exists (select from staff_role_grant where staff_id = sid and role_code = 'coordinator' and valid_to is null) then
        insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)
          values (new.tenant_id, sid, 'coordinator', current_date - 1, 'test fixture');
      end if;
    else
      foreach lbl in array want loop
        cls := test_fixture.class_of(new.tenant_id, lbl, (select c2.band from child c2 where c2.tenant_id = new.tenant_id and c2.section = lbl limit 1));
        for kid in select c3.id from child c3 where c3.tenant_id = new.tenant_id and c3.section = lbl loop
          perform test_fixture.enrol(kid);
        end loop;
        -- the label in every grade it exists in: a class's children may sit in more than one grade (move_child)
        for cls in select sc.id from school_class sc where sc.tenant_id = new.tenant_id and sc.section = lbl loop
          if not exists (select from staff_role_grant where staff_id = sid and school_class_id = cls and role_code = 'assistant' and valid_to is null) then
            insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
              values (new.tenant_id, sid, 'assistant', cls, current_date - 1, 'test fixture');
          end if;
        end loop;
      end loop;
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists test_fixture_signin on config;
create trigger test_fixture_signin after insert or update on config
  for each row when (new.key = 'app.staff') execute function test_fixture.on_signin_list();

-- A spec that enrols its own children (k2-rows.ts) after this fixture already did, on insert: the spec's enrolment takes over.
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
