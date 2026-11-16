-- CP-54: every framework a learning objective is held against, in three tables. ADR 0041 drew fifteen; the crosswalk's
-- files (docs/crosswalk/tables) and the spine (docs/spine) fit three, because each of its other tables is either a kind of
-- statement or a kind of link:
--   * framework            NCF-SE 2023, NCERT 2017 and 2019, Cambridge Primary English, Maths and Science, and the school's
--                          own frameworks: its progressions (the skill threads by age) and its profile (the capabilities
--                          and the three words). A new framework (IGCSE, Cambridge Early Years) is a row, never a table.
--                          Its documents (the copy each import read, with fingerprint) are a column: no code reads them
--                          one by one.
--   * framework_statement  every statement as printed, with its kind: a level or stage (with its ages), a goal, a
--                          competency, an outcome, an objective; for the school, a progression, a step (with its ages), a
--                          capability, a word. A correction supersedes; a statement is never edited in place.
--   * objective_statement  a learning objective held against a statement: it meets, partly meets or extends an outside statement,
--                          it sits on a step, it counts toward a capability (exactly one, a partial unique index). Its
--                          origin is the three words every curriculum link already uses (CP-48): school, machine, person.
-- Why not columns or shared tables (docs/data-model.md): people add frameworks and code reads their attributes; statements
-- are thousands of rows with parents and ages; an objective has many links to statements, so a link is a row.
-- ADR 0041's claim, claim_decision and signatory are the shared homes: a model's proposal is `curriculum_proposal`, a
-- person's yes is `approval`, and a machine-made link is live with its origin 'machine' until a person checks it (CP-54,
-- Nimish 16 Nov). No child data in any of the three. Written to run twice.

create table if not exists framework (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  code       text not null check (code ~ '^[A-Z0-9][A-Z0-9-]*$'),
  name       text not null check (btrim(name) <> ''),
  publisher  text not null check (btrim(publisher) <> ''),
  kind       text not null check (kind in ('national', 'international', 'school')),
  edition    text,
  documents  jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
comment on table framework is 'A curriculum framework (CP-54): a national or international body''s, or the school''s own (its progressions, its graduate profile). documents: the copies an import read, each {url, sha256, bytes, provenance, reading, retrieved_at}.';

create table if not exists framework_statement (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  framework_code text not null,
  code           text not null check (btrim(code) <> ''),
  printed_code   text,
  parent_code    text,
  kind           text not null check (kind in (
                   'level', 'strand', 'substrand', 'curricular_goal', 'competency', 'learning_outcome',
                   'learning_objective', 'characteristic', 'note',
                   'progression', 'step', 'word', 'capability', 'group')),
  level_code     text,
  area           text,
  text           text,
  text_sha256    text,
  items          jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  ord            int,
  age_from       numeric check (age_from is null or age_from >= 0),
  age_to         numeric check (age_to is null or age_to >= age_from),
  pdf_page       int,
  note           text,
  supersedes     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, framework_code, code),
  foreign key (tenant_id, framework_code) references framework (tenant_id, code),
  -- a framework whose words may not be republished (Cambridge) keeps each statement's place and the fingerprint of its
  -- words (research/crosswalk_build.py, `public`); every other statement has its words
  check (text is not null or text_sha256 is not null)
);
create index if not exists framework_statement_kind_idx on framework_statement (tenant_id, framework_code, kind);
comment on table framework_statement is 'A statement of a framework as printed (CP-54): a level or stage with its ages, a goal, a competency, an outcome or objective; for the school, a progression and its steps (with ages), a capability, a word, a group. A correction is a new row naming the one it supersedes. text is null only where the publisher''s words may not be republished; text_sha256 then fingerprints them.';

create table if not exists objective_statement (
  tenant_id      uuid not null references tenant(id) on delete cascade,
  lo_code        text not null,
  framework_code text not null,
  statement_code text not null,
  relation       text not null check (relation in ('meets', 'partly_meets', 'extends', 'on_step', 'counts_toward')),
  source         text not null default 'person' check (source in ('school', 'machine', 'person')),
  proposal_id    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, lo_code, framework_code, statement_code),
  foreign key (tenant_id, lo_code) references learning_objective (tenant_id, code),
  foreign key (tenant_id, framework_code, statement_code) references framework_statement (tenant_id, framework_code, code)
);
-- one capability per objective, one step per objective on each progression framework
create unique index if not exists objective_statement_one_capability
  on objective_statement (tenant_id, lo_code) where relation = 'counts_toward';
create unique index if not exists objective_statement_one_step
  on objective_statement (tenant_id, lo_code, framework_code) where relation = 'on_step';
create index if not exists objective_statement_statement_idx
  on objective_statement (tenant_id, framework_code, statement_code);
comment on table objective_statement is 'A learning objective held against a framework statement (CP-54): meets, partly meets or extends an outside statement; sits on a step of a progression; counts toward its one capability. source: school, machine or person (CP-48''s three words); a machine link is live, marked, until a person checks it.';

do $$
begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert, update, delete on framework, framework_statement, objective_statement to app_engine;
  end if;
end $$;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'framework', null, null, null, 'school_wide', 'curriculum frameworks the school is held against, and its own; no child'),
  ('public', 'framework_statement', null, null, null, 'school_wide', 'the frameworks'' statements as printed; no child'),
  ('public', 'objective_statement', null, null, null, 'school_wide', 'the school''s objectives held against framework statements; no child')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code, key_column = excluded.key_column,
  key_type = excluded.key_type, data_class = excluded.data_class, reason = excluded.reason;

select internal.apply_conventions();
