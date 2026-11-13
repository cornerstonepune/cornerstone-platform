-- CP-48 (part 2): a plan line may be linked to its activity by a model, as well as by the loader's exact name or a
-- person. The model chooses only among activities code shortlists (same grade, the plan subject's strands) or says none;
-- its answer is a proposal in the one proposal list (kind 'plan_link'), and a run sets link_run, so `plan_link_undo`
-- undoes it whole. Each list gains its one word, added to the list as it stands (as CP-27 did), so no word another
-- migration added is lost. No table, no function. Written to run twice.

do $$
declare
  k record;
  d text;
begin
  for k in select * from (values ('plan_entry', 'plan_entry_link_rule_check', 'model'),
                                 ('curriculum_proposal', 'curriculum_proposal_kind_check', 'plan_link')) x(t, c, word)
  loop
    d := pg_get_constraintdef((select oid from pg_constraint where conrelid = k.t::regclass and conname = k.c));
    if position('ARRAY[' in d) = 0 then
      raise exception 'CP-48: % is not a list: %', k.c, d;
    end if;
    continue when position(quote_literal(k.word) in d) > 0;  -- already there: a second run changes nothing
    d := regexp_replace(d, 'ARRAY\[', format('ARRAY[%L::text, ', k.word));
    execute format('alter table %I drop constraint %I', k.t, k.c);
    execute format('alter table %I add constraint %I %s', k.t, k.c, d);
  end loop;
end $$;
