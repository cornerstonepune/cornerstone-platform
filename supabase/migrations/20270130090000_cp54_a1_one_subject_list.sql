-- CP-54 A1: the chain's first columns. No new table: a subject is a row of `subject`, an objective's place is a column.
--   learning_objective.subject_code  the one subject list (FK). Null only for a routine, a character objective, or one
--                                    the placement skill has not placed yet (config `curriculum.subjects`).
--   learning_objective.topic_code    the topic of its own subject; null until the topic skill fills it (FK).
--   learning_objective.kind          academic | character | routine
--   learning_objective.stage         the stage a character objective is written for; null for the rest
--   learning_objective.source_text   the original wording, kept when a rewrite replaces `title`
--   activity.subject_code            the activity's subject, by the same map as its objective's
--   skill.lo_code                    the one school objective an engine skill tests (null until placed)
-- The text columns (subject, unit, strand) stay as the source. Written to run twice.

alter table learning_objective
  add column if not exists subject_code text,
  add column if not exists topic_code   text,
  add column if not exists kind         text not null default 'academic',
  add column if not exists stage        text,
  add column if not exists source_text  text;
alter table activity add column if not exists subject_code text;
alter table skill    add column if not exists lo_code text;

do $$ begin
  if not exists (select from pg_constraint where conname = 'learning_objective_kind_check') then
    alter table learning_objective add constraint learning_objective_kind_check
      check (kind in ('academic', 'character', 'routine'));
  end if;
  if not exists (select from pg_constraint where conname = 'learning_objective_subject_fk') then
    alter table learning_objective add constraint learning_objective_subject_fk
      foreign key (tenant_id, subject_code) references subject (tenant_id, code);
  end if;
  if not exists (select from pg_constraint where conname = 'learning_objective_topic_fk') then
    alter table learning_objective add constraint learning_objective_topic_fk
      foreign key (tenant_id, topic_code) references topic (tenant_id, code);
  end if;
  if not exists (select from pg_constraint where conname = 'activity_subject_fk') then
    alter table activity add constraint activity_subject_fk
      foreign key (tenant_id, subject_code) references subject (tenant_id, code);
  end if;
  if not exists (select from pg_constraint where conname = 'skill_lo_fk') then
    alter table skill add constraint skill_lo_fk
      foreign key (tenant_id, lo_code) references learning_objective (tenant_id, code);
  end if;
end $$;

create index if not exists learning_objective_subject_idx on learning_objective (tenant_id, subject_code);
create index if not exists activity_subject_idx on activity (tenant_id, subject_code);
create index if not exists skill_lo_idx on skill (tenant_id, lo_code);

comment on column learning_objective.subject_code is 'The one subject list (CP-54): a subject row. Null only for a routine, a character objective, or one placement has not placed (config curriculum.subjects).';
comment on column learning_objective.kind is 'academic, character (a behaviour or character area) or routine (CP-54).';
comment on column learning_objective.source_text is 'The original wording, kept when a rewrite replaces title (CP-54).';
comment on column skill.lo_code is 'The one school learning objective this engine skill tests (CP-54).';
