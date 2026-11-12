-- CP-34 (#605): `staff_sees_sheet` answers the same, with less work per sheet. An educator's page of papers asks it of every
-- sheet, so its cost per call is the page's cost. Measured on a copy with 2,000 sheets: the old body took about 440 ms
-- for an educator (the coordinator: 60 ms), the new about 35 ms, the same answer on every sheet.
--
-- Same rule, same signature, same security definer and search path, so grants and callers are untouched. What changed:
--   * a coordinator is answered before any table is read (a CASE, which Postgres evaluates in order);
--   * the person's own uploads are one indexed look at `capture`, no `staff_sees` call per scan;
--   * the sheet's class is read straight from its own section, or its child's current enrolment (the same row
--     `child_now` picks: the open enrolment, else the latest closed one), not through the `child_now` view;
--   * the sheet's subject (the dearest part) is read only when the person has subjects listed and the class already passes.
-- No table, column or function is added or removed.
create or replace function public.staff_sees_sheet(p_role text, p_classes text[], p_subjects text[], p_staff uuid,
                                                   p_sheet uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
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
