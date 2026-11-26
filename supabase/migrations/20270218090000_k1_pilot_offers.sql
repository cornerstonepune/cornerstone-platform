-- ADR 0113: the K1 pilot (F.N 10, loaded on live) needs three settings and six skill links the seed alone cannot reach:
-- `timetable.heads` and `observed.weights` are seed_once rows (a load writes them once and then leaves them), and no seed
-- loader links a skill to an existing activity (registry.json is generated, never hand-edited). So a migration says it
-- for a loaded database, as ADR 0111 did; `supabase/seed/config.json` says the same for a new one. Only adds: a group a
-- head already takes, a K1 weight already there, a rule already set and a link already made are left as they are.
-- No group added here makes a head teach a new subject. Safe to run twice.
do $$
declare h int; w int; r int; s int; unlinked text;
begin
  perform set_config('app.changed_by', 'K1 pilot offers (Nimish, 26 Nov 2026)', true);
  perform set_config('app.change_reason', 'ADR 0113', true);

  -- 1. timetable.heads: K1's own strand spellings, and the Music head taking K1's rhymes
  with adds(code, grp) as (values
    ('art', 'Art & Craft'),
    ('rhymes', 'Rhymes'),
    ('music', 'Rhymes'),
    ('general_awareness', 'Sci & Geo'),
    ('memory_drawing', 'Sci & Geo')
  ), cur as (
    select c.tenant_id, c.value as v from config c join tenant t on t.id = c.tenant_id
    where t.slug = 'cornerstone-pune' and c.key = 'timetable.heads'
  ), merged as (
    select m.tenant_id, jsonb_agg(
      case when exists (select 1 from adds a where a.code = e->>'code' and not (e->'groups') ? a.grp)
        then jsonb_set(e, '{groups}', (e->'groups') || (select jsonb_agg(a.grp order by a.grp) from adds a
                                                         where a.code = e->>'code' and not (e->'groups') ? a.grp))
        else e end order by n) as v
    from cur m, jsonb_array_elements(m.v) with ordinality x(e, n)
    group by m.tenant_id
  )
  update config c set value = merged.v, updated_at = now()
  from merged where c.tenant_id = merged.tenant_id and c.key = 'timetable.heads' and c.value is distinct from merged.v;
  get diagnostics h = row_count;

  -- 2. observed.weights: K1 counts a record as K2 does (an assumption for Nimish, ADR 0113)
  update config c set value = c.value || jsonb_build_object('K1', c.value -> 'K2'), updated_at = now()
  from tenant t
  where t.slug = 'cornerstone-pune' and c.tenant_id = t.id and c.key = 'observed.weights'
    and c.value ? 'K2' and not c.value ? 'K1';
  get diagnostics w = row_count;

  -- 3. K1's observed rule: none was set, so the observed picture left K1 out; K2's, min_adults included
  --    (Nimish, 26 Nov: 1 adult marks a K1 child secure, ADR 0113)
  update grade g set secure_level = k.secure_level, secure_days = k.secure_days, recheck_days = k.recheck_days,
    min_adults = k.min_adults
  from grade k, tenant t
  where t.slug = 'cornerstone-pune' and g.tenant_id = t.id and g.code = 'K1' and k.tenant_id = t.id and k.code = 'K2'
    and g.secure_level is null and k.secure_level is not null;
  get diagnostics r = row_count;

  -- 4. the six new F.N 10 activities, each linked to the closest skill other K1 activities already reach (ADR 0113)
  insert into activity_skill (tenant_id, activity_code, skill_code, source)
  select t.id, l.activity, l.skill, 'school'
  from (values
    ('ACT-K1-F001', 'LIT.SPK.05'),   -- The Sun And The Moon: rhymes & songs, joins in and recites
    ('ACT-K1-F002', 'MOT.PRW.05'),   -- number tracing 5 and 6: number formation
    ('ACT-K1-F003', 'MOT.PRW.04'),   -- trace and write R and D: letter formation on four lines
    ('ACT-K1-F004', 'HIN.VOC.01'),   -- names of farm animals: Hindi vocabulary
    ('ACT-K1-F005', 'HIN.VARN.01'),  -- swar ए: vowel & consonant letter recognition
    ('ACT-K1-F006', 'ART.VIS.03')    -- memory drawing: representational drawing with detail
  ) l(activity, skill)
  join tenant t on t.slug = 'cornerstone-pune'
  where exists (select 1 from activity a where a.tenant_id = t.id and a.code = l.activity)
    and exists (select 1 from registry_skill k where k.tenant_id = t.id and k.code = l.skill)
  on conflict do nothing;
  get diagnostics s = row_count;

  -- without a school (or person) link a mark on the activity writes no evidence: fail the release, do not skip quietly
  select string_agg(a.code, ', ' order by a.code) into unlinked
  from activity a join tenant t on t.id = a.tenant_id
  where t.slug = 'cornerstone-pune' and a.code ~ '^ACT-K1-F00[1-6]$'
    and not exists (select 1 from activity_skill x where x.tenant_id = a.tenant_id and x.activity_code = a.code
                    and x.source <> 'machine');
  if unlinked is not null then
    raise exception 'ADR 0113: no school skill link for %', unlinked;
  end if;

  raise notice 'K1 pilot (ADR 0113): % heads setting changed, % weights, % grade rule, % skill links', h, w, r, s;
end $$;
