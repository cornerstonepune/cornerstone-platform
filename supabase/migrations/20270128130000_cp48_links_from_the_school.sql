-- CP-48: where each curriculum link came from, in the school's three words (the spec's sheet | machine | person; stored
-- as school | machine | person, as `activity_part_source` already does). Until now a link was 'person' or 'machine',
-- and every link the school's sheets loaded read 'person'. Read on live (13 Nov): no screen or engine route lets a person
-- write these four tables, and the edit history (`change_log`) holds no person's change to any of them; every
-- 'person' row was written by the school-sheet loaders (`core/loaders.py`, `w1_bank/k2_upload.py`). So:
--   * activity_skill, activity_objective, learning_objective_skill: `source` takes 'school'; every 'person' row
--     becomes 'school'. 'person' stays the default: a row a person adds by hand is theirs.
--   * learning_objective gains `source` (the same three words); every row so far is the school's, except one the
--     machine made (a K2 objective code that only a machine proposal's apply created: none on live before this).
-- The loaders write 'school' from now on. No table, no function. Written to run twice.

do $$
declare
  k record;
  d text;
begin
  for k in select * from (values ('activity_skill'), ('activity_objective'), ('learning_objective_skill')) x(t)
  loop
    d := pg_get_constraintdef((select oid from pg_constraint where conrelid = k.t::regclass
                                                           and conname = k.t || '_source_check'));
    if position('ARRAY[' in d) = 0 then
      raise exception 'CP-48: %_source_check is not a list: %', k.t, d;
    end if;
    if position('''school''' in d) = 0 then
      d := regexp_replace(d, 'ARRAY\[', 'ARRAY[''school''::text, ');
      execute format('alter table %I drop constraint %I', k.t, k.t || '_source_check');
      execute format('alter table %I add constraint %I %s', k.t, k.t || '_source_check', d);
    end if;
    execute format('update %I set source = ''school'' where source = ''person''', k.t);
  end loop;
end $$;

alter table learning_objective add column if not exists source text not null default 'person'
  check (source in ('school', 'machine', 'person'));
comment on column learning_objective.source is
  'Where the objective came from: school (a sheet the school wrote), machine (a curriculum proposal applied), person (added by hand). CP-48.';
update learning_objective l set source = case
    when exists (select 1 from activity_objective ao where ao.tenant_id = l.tenant_id and ao.lo_code = l.code
                 and ao.source = 'machine') then 'machine'
    else 'school' end
  where l.source = 'person';
