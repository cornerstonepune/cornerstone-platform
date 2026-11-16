-- CP-54 A3: what the child's picture needs to roll up the chain and to say how much of it rests on unchecked links.
--   skill.lo_source  who made the link from an engine skill to its objective: school, machine or person (CP-48's three
--                    words). Every other link of the chain already carries its origin (activity_objective.source,
--                    learning_objective_skill.source, objective_statement.source).
--   objective_statement.relation 'evidence_for': an objective is evidence for one of the three words (a statement of the
--                    profile with kind 'word'). An objective counts toward exactly one capability but may be evidence for
--                    several words (the spine's behaviours name one to three), so a word is a link of its own.
-- No new table. Written to run twice.

alter table skill add column if not exists lo_source text not null default 'machine';
do $$ begin
  if not exists (select from pg_constraint where conname = 'skill_lo_source_check') then
    alter table skill add constraint skill_lo_source_check check (lo_source in ('school', 'machine', 'person'));
  end if;
end $$;
comment on column skill.lo_source is 'Who made the link skill.lo_code: school, machine or person (CP-54). Meaningless while lo_code is null.';

alter table objective_statement drop constraint if exists objective_statement_relation_check;
alter table objective_statement add constraint objective_statement_relation_check
  check (relation in ('meets', 'partly_meets', 'extends', 'on_step', 'counts_toward', 'evidence_for'));
