-- Issue 590: one access rule. Who may see which class is a person's open grants (the rule the engine already uses),
-- not the `staff.classes` / `staff.subjects` columns that only the old staff editor writes. The website's sign-in
-- reads the person's classes and subjects from `staff_list`; it now gets them from the grants.
--
-- No new table and no new function: `staff_list` is replaced (same columns), the backfill below is inline.
--
-- The rule `staff_sees` takes flat lists, so subjects are flat too: a person with a grant for a whole class (any role
-- of the own-classes group with no subject) is narrowed in no subject; otherwise their subjects are those of their
-- subject grants. A person whose role is `coordinator` sees every class (the rule `staff_sees` already has), so a class
-- or subject list means nothing for them: it is empty, and a class grant a coordinator also holds does not narrow the
-- site for them. The columns stay for now (the old editor still writes them; nothing reads them): dropping them is
-- the step after that editor is retired.

create or replace function public.staff_list(p_slug text)
returns table (id uuid, email text, name text, role text, password text, password_set_at timestamptz,
               classes text[], subjects text[])
language sql stable security definer set search_path = public, pg_temp as $$
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

-- The grants an old entry implied, for everyone who has none on that class today: a class and subjects → that subject
-- in that class (`subject_educator`); a class and no subject → its class teacher. The grant rules (one class teacher
-- to a class, D-039) are the table's own triggers: if one refuses, this migration stops, and nothing is half done.
insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code, valid_from, granted_by)
select s.tenant_id, s.id,
       case when u.subject is null then 'class_teacher' else 'subject_educator' end,
       sc.id, u.subject, d.day, 'migration 20270126110000'
from staff s
cross join lateral (select internal.school_day(s.tenant_id, now()) as day) d
cross join lateral unnest(s.classes) as lbl
join school_class sc on sc.tenant_id = s.tenant_id and sc.label = lbl
  and exists (select 1 from academic_year y where y.id = sc.academic_year_id and d.day between y.starts_on and y.ends_on)
cross join lateral (select unnest(case when cardinality(s.subjects) > 0 then s.subjects else array[null::text] end)
                           as subject) u
where s.active and cardinality(s.classes) > 0
  and not exists (
    select 1 from staff_role_grant g
    join role ro on ro.tenant_id = g.tenant_id and ro.code = g.role_code and ro.access_group = 'own_classes'
    where g.staff_id = s.id and g.school_class_id = sc.id and g.valid_from <= d.day
      and (g.valid_to is null or g.valid_to > d.day));

-- The checks. Nobody may sign in to fewer classes than their old entry named, or to a different narrowing.
do $$
declare
  short integer;
  moved integer;
begin
  select count(*) into short
  from tenant t
  cross join lateral public.staff_list(t.slug) l
  join staff s on s.id = l.id
  where s.role_code <> 'coordinator' and exists (select 1 from unnest(s.classes) c where c <> all (l.classes));
  if short > 0 then
    raise exception 'grants_one_source: % people would sign in to fewer classes than their staff entry names', short;
  end if;

  select count(*) into moved
  from tenant t
  cross join lateral public.staff_list(t.slug) l
  join staff s on s.id = l.id
  where s.role_code <> 'coordinator' and cardinality(s.subjects) > 0 and cardinality(s.classes) > 0
    and (select coalesce(array_agg(x order by x), '{}') from unnest(s.subjects) x) is distinct from l.subjects;
  if moved > 0 then
    raise exception 'grants_one_source: % people would sign in with different subjects than their staff entry names', moved;
  end if;

  raise notice 'grants_one_source: % people hold classes by grant, % open grants',
    (select count(*) from tenant t cross join lateral public.staff_list(t.slug) l where cardinality(l.classes) > 0),
    (select count(*) from staff_role_grant where valid_to is null);
end $$;
