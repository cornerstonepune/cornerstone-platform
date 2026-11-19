-- CP-76 and CP-77 (#891, #893): a database built from the migrations alone has no school when the two data migrations before this one run (the
-- school is made afterwards, by the loader), so they changed nothing there. The rows a school starts with are made by this function, for every school
-- when it is added; so it now makes the two campuses and the `founder` role. Run once for the schools there already, it changes nothing on live,
-- where the two migrations did the same.
create or replace function internal.people_vocabulary(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into role (tenant_id, code, label, scope, may_grant, one_per_class, ord)
  select p_tenant, v.code, v.label, v.scope, array['head', 'coordinator'], v.one_per_class, v.ord
  from (values
    ('subject_educator',  'Subject educator',                 'class_subject', false, 0),
    ('class_teacher',     'Class educator',                   'class',         true,  1),
    ('mentor',            'Mentor',                           'child',         false, 2),
    ('assistant',         'Assistant',                        'class',         false, 3),
    ('coordinator',       'Coordinator',                      'campus',        false, 4),
    ('deputy_coordinator','Deputy coordinator',               'campus',        false, 5),
    ('curriculum_team',   'Curriculum team',                  'campus',        false, 6),
    ('head',              'Head',                             'campus',        false, 7),
    ('ops',               'Ops',                              'campus',        false, 8),
    ('cover_educator',    'Cover educator',                   'class',         false, 9),
    ('special_educator',  'Special educator or counsellor',   'child',         false, 10),
    ('specialist',        'Specialist (PE, music, art)',      'class',         false, 11),
    -- the one role on the sign-in list (config app.staff) that D-026 does not name
    ('educator',          'Educator (as on the sign-in list)','campus',        false, 12),
    -- MM-1 (CP-77): the co-founders, who change the money rules; held besides the role a person has
    ('founder',           'Co-founder',                       'campus',        false, 13)
  ) v (code, label, scope, one_per_class, ord)
  on conflict (tenant_id, code) do nothing;
  update role set access_group = 'everything' where tenant_id = p_tenant and code = 'founder' and access_group is null;  -- as the first migration set it on live
  -- MM-0 (CP-76): the school is two campuses (it was one, named for the school)
  insert into campus (tenant_id, name) values (p_tenant, 'Gurukul'), (p_tenant, 'Neev')
  on conflict (tenant_id, name) do nothing;
end $$;

select internal.people_vocabulary(id) from tenant;
