-- ADR 0117: a K1 lesson is offered activity groups its head does not teach (PROJECT.md G6.8). The setting
-- `timetable.offers` is seed_once (a load writes it once), so a migration puts it on a loaded database;
-- `supabase/seed/config.json` says the same for a new one. Only adds the row when it is missing: safe to run twice.
-- `timetable.heads` is not touched, so no head comes to teach a new subject.
do $$
declare n int;
begin
  perform set_config('app.changed_by', 'K1 offer-only groups (Nimish, 26 Nov 2026)', true);
  perform set_config('app.change_reason', 'ADR 0117', true);

  insert into config (tenant_id, key, value, description)
  select t.id, 'timetable.offers',
    '{"K1": {"rhymes": ["Music"], "clay": ["English"], "other": ["Block Room"], "music": ["Maths"]}}'::jsonb,
    'Activity groups a lesson is OFFERED without its head TEACHING them (ADR 0117): grade, then the lesson''s subject code, then the activity.strand values.'
  from tenant t where t.slug = 'cornerstone-pune'
  on conflict (tenant_id, key) do nothing;
  get diagnostics n = row_count;

  raise notice 'K1 offer-only groups (ADR 0117): % setting added', n;
end $$;
