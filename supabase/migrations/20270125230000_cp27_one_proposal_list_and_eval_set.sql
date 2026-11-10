-- CP-27, group 3, step 3B (specs/CP-27/spec.md Done when 6, docs/data-model.md): a model's or the code's proposal
-- that a person decides is a row of the one proposal list, `curriculum_proposal`; hand-checked truth and a model's
-- verdicts kept to score it are cases of the one eval set, `eval_case` (new).
--
--   bank_proposal (a question far off its level; a mistake  -> curriculum_proposal kinds `mislevelled`, `new_mistake`,
--     learned from children's answers)                        the same id, its direction and evidence in `proposal`
--   bank_decision (a person's remove/keep, adopt/reject)     -> a follow-up row of it (`about`): `applied` (remove,
--                                                               adopt) or `rejected` (keep, reject), the note its
--                                                               reason, the member of staff by id. Empty: dropped
--   learned_mistake (an adopted mistake's rule)              -> `misconception.learned_rule`, `learned_from` (the
--                                                               proposal). Empty: dropped
--   material_item_proposal (an item an educator added)       -> `material_item.proposed_by`, `proposed_at`. Empty:
--                                                               dropped
--   gold_finding (a finding of an educator's report)         -> eval_case kind `report_finding`, the same id
--   item_review (a reviewer model's verdict, on a question   -> eval_case kind `item_review`, the same id
--     or on a level's rule, `template:<skill>:<level>`)
--   hand_check (a hand calculation of a child's state)       -> eval_case kind `hand_check`, never changed or removed
--                                                               (CP-9 item 7), its day given by the engine from the
--                                                               school's clock (CP-24): no default from the server's.
--                                                               Empty: dropped
--   gold (a page's truth: no code reads or writes it)        -> dropped, empty
--
-- A table with rows on live is never dropped: its rows are copied, tagged (`curriculum_proposal.reason`,
-- `eval_case.detail ->> 'kept_in'`), a block raises unless every row is in its new home with the same values, and the
-- table moves to the schema `retired` (no grants, keys, triggers or policies). An empty table is checked empty inside
-- the migration, then dropped: a row written before it runs makes it raise. What reads a proposal or an adopted
-- mistake (the bank's open proposals, the rules marking recognises) is compared before and after. One transaction under
-- `db push`: any raise leaves the database as it was.

-- 1. What the new homes could not keep, refused first; what they keep, counted. ---------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(format('%s: %s', t, v), '; ') into bad from (
    select 'bank_proposal.kind' as t, kind as v from bank_proposal where kind not in ('mislevelled', 'new_mistake')
    union all select 'bank_proposal.subject blank', count(*)::text from bank_proposal where btrim(subject) = ''
      having count(*) > 0
    union all select 'bank_proposal.id already a curriculum proposal', p.id::text
      from bank_proposal p join curriculum_proposal c on c.id = p.id
    union all select 'curriculum_proposal.kind', kind from curriculum_proposal
      where kind not in ('skill', 'objective', 'levels', 'lo_skill', 'page_part', 'material', 'skill_offer')
    union all select 'gold_finding.words', count(*)::text from gold_finding where words is null having count(*) > 0
    union all select 'gold_finding.source blank', count(*)::text from gold_finding where btrim(source) = ''
      having count(*) > 0
    union all select 'item_review.reviewer', reviewer from item_review
      where reviewer not in ('pedagogy_review', 'language_review')
    -- empty on live (census), and nothing here could copy a row of theirs as it stands: a decision names a person by
    -- a typed name, not a staff id
    union all select 'not empty', 'bank_decision ' || count(*) from bank_decision having count(*) > 0
    union all select 'not empty', 'learned_mistake ' || count(*) from learned_mistake having count(*) > 0
    union all select 'not empty', 'material_item_proposal ' || count(*) from material_item_proposal having count(*) > 0
    union all select 'not empty', 'gold ' || count(*) from gold having count(*) > 0
    union all select 'not empty', 'hand_check ' || count(*) from hand_check having count(*) > 0
  ) x;
  if bad is not null then
    raise exception 'CP-27: a row the proposal list or the eval set would not keep as it stands: %', bad;
  end if;
  raise notice 'CP-27 3B: % bank proposals (% mislevelled, % new mistakes), % report findings (% confirmed), '
               '% reviewer verdicts (% on a level''s rule)',
    (select count(*) from bank_proposal), (select count(*) from bank_proposal where kind = 'mislevelled'),
    (select count(*) from bank_proposal where kind = 'new_mistake'), (select count(*) from gold_finding),
    (select count(*) from gold_finding where confirmed_by is not null), (select count(*) from item_review),
    (select count(*) from item_review where ref like 'template:%');
end $$;

-- 2. What reads a proposal or an adopted mistake today, kept to compare with after. ----------------------------------

-- the bank's open proposals as `learn.refresh` lists them (id, kind, subject, direction, evidence, made)
create temporary table cp27_open as
  select p.id, p.kind, p.subject, p.direction, p.evidence, p.created_at from bank_proposal p
  where not exists (select 1 from bank_decision d where d.proposal_id = p.id);
-- the rules marking recognises (`learned.rules`)
create temporary table cp27_rules as select code, rule from learned_mistake;

-- 3. The one proposal list takes the bank's two kinds. -----------------------------------------------------------------

alter table curriculum_proposal drop constraint curriculum_proposal_kind_check;
alter table curriculum_proposal add constraint curriculum_proposal_kind_check check (kind in (
  'skill', 'objective', 'levels', 'lo_skill', 'page_part', 'material', 'skill_offer',
  'mislevelled',   -- a question far easier or harder than its level (`learn.refresh`); a person removes or keeps it
  'new_mistake')); -- a column rule children's unexplained answers point to (`learned.propose`); adopted or rejected

-- An adopted mistake keeps its rule on itself; the seed's load names its columns, so it never touches these two.
alter table misconception add column learned_rule jsonb;
alter table misconception add column learned_from uuid references curriculum_proposal(id);
alter table misconception add constraint misconception_learned_check check ((learned_rule is null) = (learned_from is null));
comment on column misconception.learned_rule is
  'a mistake learned from children''s answers: its column rule (assess/learned_rules.py), recognised by marking';
comment on column misconception.learned_from is 'the proposal (curriculum_proposal, kind new_mistake) it was adopted from';

-- An item an educator added names who and when; it waits for a person while it has no home and no value.
alter table material_item add column proposed_by uuid references staff(id);
alter table material_item add column proposed_at timestamptz;
alter table material_item add constraint material_item_proposed_check check ((proposed_by is null) = (proposed_at is null));

-- 4. The one eval set. --------------------------------------------------------------------------------------------

-- Why a table and not a row of a shared one (docs/data-model.md): it is the shared home itself ("hand-checked truth
-- used to score a model", specs/CP-27/target-tables.md). One row per case; `kind` says which, the columns every kind
-- names are columns, the rest is `detail`:
--   report_finding  a finding of an educator's report for one child (`w3_read/gold.py`): verdict strong or faulty, the
--                   question that shows it (`ref`), `detail` {expect_mark, child_answer, misconception_code, words};
--                   a person confirms the transcription (`confirmed_by`), and changing a finding withdraws that
--   hand_check      a hand calculation of a child's state (`w3_read/nightly.py`, CP-9 item 7): the state by hand
--                   (`verdict`), who did it (`confirmed_by`), the school's day (`checked_on`), `detail` {grade,
--                   system_state, matches}; never changed or removed
--   item_review     a reviewer model's verdict on a question or a level's rule (`w1_bank/review.py`): the reviewer
--                   (`source`), pass/revise/reject, `detail` {reasons, note, prompt_id, model, flow_run_id, acted_at};
--                   the person who agreed or overruled it (`confirmed_by`)
create table eval_case (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  kind          text not null check (kind in ('report_finding', 'hand_check', 'item_review')),
  child_id      uuid references child(id) on delete cascade,  -- whose; none for a review
  skill_code    text,                     -- the skill (a review: the skill set) it is about
  difficulty    text,                     -- the level a review judged
  ref           text,                     -- the question (its item_key), or template:<skill>:<level>
  verdict       text,                     -- what the case says
  source        text,                     -- where it came from: the reports transcribed, the reviewer
  confirmed_by  text,                     -- the person who stands behind it
  checked_on    date,                     -- the school's day of a hand check
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  foreign key (tenant_id, difficulty) references difficulty (tenant_id, code),
  constraint eval_case_kind_check_columns check (coalesce(case kind
    when 'report_finding' then child_id is not null and skill_code is not null and verdict in ('strong', 'faulty')
      and source is not null and detail ? 'words' and jsonb_typeof(detail -> 'words') = 'string'
      and coalesce(detail ->> 'expect_mark', 'correct') in ('correct', 'wrong')
    when 'hand_check' then child_id is not null and skill_code is not null and btrim(verdict) <> ''
      and btrim(confirmed_by) <> '' and checked_on is not null and detail ? 'grade'
      and jsonb_typeof(detail -> 'matches') = 'boolean'
    when 'item_review' then child_id is null and skill_code is not null and difficulty is not null and ref is not null
      and verdict in ('pass', 'revise', 'reject') and source in ('pedagogy_review', 'language_review')
  end, false))
);
comment on table eval_case is
  'the one eval set (CP-27): hand-checked truth used to score a model, and a model''s verdicts kept to be acted on';
-- a finding once per child, verdict, skill and question; a verdict once per reviewer and question
create unique index eval_case_finding_key on eval_case (tenant_id, child_id, verdict, skill_code, ref) nulls not distinct
  where kind = 'report_finding';
create unique index eval_case_review_key on eval_case (tenant_id, source, ref) where kind = 'item_review';
create index eval_case_child_idx on eval_case (tenant_id, child_id) where child_id is not null;
create index eval_case_ref_idx on eval_case (tenant_id, ref) where ref is not null;
create index eval_case_open_review_idx on eval_case (tenant_id, verdict)
  where kind = 'item_review' and confirmed_by is null and verdict <> 'pass';

-- A hand check is never changed or removed (CP-9 item 7): a row's guard, on that kind alone, so a finding is still
-- confirmed and a review run again. A statement's guard is a whole table's (a ledger: `apply_conventions`).
create trigger hand_check_kept before update on eval_case for each row
  when (old.kind = 'hand_check' or new.kind = 'hand_check') execute function internal.forbid_change();
create trigger hand_check_kept_delete before delete on eval_case for each row
  when (old.kind = 'hand_check') execute function internal.forbid_change();

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'eval_case', 'answers', 'child_id', 'child_open', 'child_data', null);

-- 5. Every row copied, tagged with where it came from. ------------------------------------------------------------

-- each bank proposal keeps its id (a decision, a page bookmarked, an adopted mistake name it) and is its own run
insert into curriculum_proposal (id, tenant_id, run_id, kind, subject_code, proposal, status, proposer, machine, reason,
                                 created_at, updated_at)
select id, tenant_id, id, kind, subject, jsonb_build_object('direction', direction, 'evidence', evidence),
       'needs_person', 'code', 'code:' || kind, 'CP-27: kept in bank_proposal until 2026-11', created_at, updated_at
from bank_proposal;

insert into eval_case (id, tenant_id, kind, child_id, skill_code, ref, verdict, source, confirmed_by, detail,
                       created_at, updated_at)
select id, tenant_id, 'report_finding', child_id, skill_code, item_key, verdict, source, confirmed_by,
       jsonb_build_object('expect_mark', expect_mark, 'child_answer', child_answer,
                          'misconception_code', misconception_code, 'words', words, 'kept_in', 'gold_finding'),
       created_at, updated_at
from gold_finding;

insert into eval_case (id, tenant_id, kind, skill_code, difficulty, ref, verdict, source, confirmed_by, detail,
                       created_at, updated_at)
select id, tenant_id, 'item_review', skill_set_code, difficulty, ref, verdict, reviewer, acted_on_by,
       jsonb_build_object('reasons', to_jsonb(reasons), 'note', note, 'prompt_id', prompt_id::text, 'model', model,
                          'flow_run_id', flow_run_id::text, 'kept_in', 'item_review')
         || jsonb_strip_nulls(jsonb_build_object('acted_at', acted_at)),
       created_at, updated_at
from item_review;

analyze eval_case;

-- 6. Every row in its new home, with the same values; what reads them says what it said. ----------------------------

do $$
declare
  n_old bigint;
  n_new bigint;
  n_tag bigint;
begin
  select count(*) into n_old from bank_proposal;
  select count(*) into n_new from bank_proposal x join curriculum_proposal c on c.id = x.id and c.tenant_id = x.tenant_id
     and c.about is null and c.run_id = x.id and c.kind = x.kind and c.subject_code = x.subject
     and c.proposal ->> 'direction' = x.direction and c.proposal -> 'evidence' = x.evidence
     and c.status = 'needs_person' and c.staff_id is null and c.machine = 'code:' || x.kind
     and c.created_at = x.created_at and c.updated_at = x.updated_at
     and c.reason = 'CP-27: kept in bank_proposal until 2026-11';
  select count(*) into n_tag from curriculum_proposal where reason = 'CP-27: kept in bank_proposal until 2026-11';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % bank proposals, % in the proposal list (% tagged)', n_old, n_new, n_tag;
  end if;

  select count(*) into n_old from gold_finding;
  select count(*) into n_new from gold_finding x join eval_case e on e.id = x.id and e.tenant_id = x.tenant_id
     and e.kind = 'report_finding' and e.child_id = x.child_id and e.verdict = x.verdict
     and e.skill_code = x.skill_code and e.ref is not distinct from x.item_key
     and e.detail ->> 'expect_mark' is not distinct from x.expect_mark
     and e.detail ->> 'child_answer' is not distinct from x.child_answer
     and e.detail ->> 'misconception_code' is not distinct from x.misconception_code
     and e.detail ->> 'words' = x.words and e.source = x.source and e.confirmed_by is not distinct from x.confirmed_by
     and e.difficulty is null and e.checked_on is null
     and e.created_at = x.created_at and e.updated_at = x.updated_at and e.detail ->> 'kept_in' = 'gold_finding';
  select count(*) into n_tag from eval_case where detail ->> 'kept_in' = 'gold_finding';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % report findings, % in the eval set (% tagged)', n_old, n_new, n_tag;
  end if;

  select count(*) into n_old from item_review;
  select count(*) into n_new from item_review x join eval_case e on e.id = x.id and e.tenant_id = x.tenant_id
     and e.kind = 'item_review' and e.child_id is null and e.skill_code = x.skill_set_code
     and e.difficulty = x.difficulty and e.ref = x.ref and e.verdict = x.verdict and e.source = x.reviewer
     and array(select jsonb_array_elements_text(e.detail -> 'reasons')) = x.reasons and e.detail ->> 'note' = x.note
     and e.detail ->> 'prompt_id' is not distinct from x.prompt_id::text
     and e.detail ->> 'model' is not distinct from x.model
     and e.detail ->> 'flow_run_id' is not distinct from x.flow_run_id::text
     and e.confirmed_by is not distinct from x.acted_on_by
     and (e.detail ->> 'acted_at')::timestamptz is not distinct from x.acted_at
     and e.created_at = x.created_at and e.updated_at = x.updated_at and e.detail ->> 'kept_in' = 'item_review';
  select count(*) into n_tag from eval_case where detail ->> 'kept_in' = 'item_review';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % reviewer verdicts, % in the eval set (% tagged)', n_old, n_new, n_tag;
  end if;

  -- the bank's open proposals as `learn.refresh` lists them now, before and after
  if exists (select * from cp27_open except
             select p.id, p.kind, p.subject_code, p.proposal ->> 'direction', p.proposal -> 'evidence', p.created_at
             from curriculum_proposal p where p.kind in ('mislevelled', 'new_mistake') and p.about is null
               and not exists (select 1 from curriculum_proposal d where d.about = p.id))
     or exists (select p.id, p.kind, p.subject_code, p.proposal ->> 'direction', p.proposal -> 'evidence', p.created_at
                from curriculum_proposal p where p.kind in ('mislevelled', 'new_mistake') and p.about is null
                  and not exists (select 1 from curriculum_proposal d where d.about = p.id)
                except select * from cp27_open) then
    raise exception 'CP-27: the bank''s open proposals are not what they were';
  end if;
  -- the rules marking recognises, before and after
  if exists (select * from cp27_rules except select code, learned_rule from misconception where learned_rule is not null)
     or exists (select code, learned_rule from misconception where learned_rule is not null
                except select * from cp27_rules) then
    raise exception 'CP-27: the mistakes marking recognises are not what they were';
  end if;
end $$;

drop table cp27_open, cp27_rules;

-- 7. A row's guard (one kind of a table) is no ledger: a ledger is a table a statement's guard refuses every edit of,
-- read and added to by both services and never changed, removed or emptied by them. --------------------------------

create or replace function internal.apply_conventions() returns void
language plpgsql set search_path = public as $$
declare t record; a record; p record; cond text; rule text;
begin
  for t in
    select n.nspname as s, c.relname as r
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname in ('public', 'pii')
  loop
    select * into a from access_table x where x.schema_name = t.s and x.table_name = t.r;
    if not found then
      raise exception 'table %.% is in no access_table row: list it as child_data or school_wide in the migration that creates it (CP-4)',
        t.s, t.r;
    end if;
    execute format('alter table %I.%I enable row level security', t.s, t.r);
    execute format('alter table %I.%I force row level security', t.s, t.r);
    execute format('drop policy if exists service_role_all on %I.%I', t.s, t.r);
    execute format(
      'create policy service_role_all on %I.%I for all to service_role using (true) with check (true)',
      t.s, t.r);
    for p in select policyname from pg_policies
             where schemaname = t.s and tablename = t.r and policyname <> 'service_role_all' loop
      execute format('drop policy %I on %I.%I', p.policyname, t.s, t.r);
    end loop;
    if exists (select from pg_roles where rolname = 'app_engine') then
      execute format('create policy engine_all on %I.%I for all to app_engine using (true) with check (true)',
        t.s, t.r);
    end if;
    if exists (select from pg_roles where rolname = 'app_web') then
      if a.data_class = 'school_wide' then
        execute format('create policy web_all on %I.%I as permissive for all to app_web using (true) with check (true)',
          t.s, t.r);
      elsif a.key_type = 'approval_target' then
        -- a report's approval through the report's child, a paper's through the paper, a class card's through its
        -- class, each by the reach of its own kind of record; every other kind is the school's (CP-27)
        rule := format(
          'tenant_id = (select public.my_tenant()) and case kind '
          'when ''parent_note'' then (select public.my_reach(''reports'')) = ''all'' or ((select public.my_reach(''reports'')) = ''own'' '
          'and %1$I = any ((select public.my_ids(''reports'', ''parent_note''))::text[])) '
          'when ''sheet'' then (select public.my_reach(''papers'')) = ''all'' or ((select public.my_reach(''papers'')) = ''own'' '
          'and %1$I = any ((select public.my_ids(''papers'', ''sheet''))::text[])) '
          'when ''class_card'' then (select public.my_reach(''learning'')) = ''all'' or ((select public.my_reach(''learning'')) = ''own'' '
          'and detail ->> ''section'' = any ((select public.my_sections(''learning''))::text[])) '
          'else true end', a.key_column);
        execute format('create policy web_rule on %I.%I as permissive for all to app_web using (%s) with check (%s)',
          t.s, t.r, rule, rule);
      else
        cond := case a.key_type
          when 'staff' then format('%I = (select public.signed_in_staff())', a.key_column)
          -- a row with no child named is open to everyone who reaches the kind (a spare paper blueprint)
          when 'child_open' then format('(%1$I is null or %1$I = any ((select public.my_ids(%2$L, ''child''))::uuid[]))',
                                        a.key_column, a.kind_code)
          when 'section' then format('%I = any ((select public.my_sections(%L))::text[])', a.key_column, a.kind_code)
          else format('%I = any ((select public.my_ids(%L, %L))::uuid[])', a.key_column, a.kind_code, a.key_type)
        end;
        rule := format('tenant_id = (select public.my_tenant()) and ((select public.my_reach(%1$L)) = ''all'' '
                       'or ((select public.my_reach(%1$L)) = ''own'' and %2$s))', a.kind_code, cond);
        execute format('create policy web_rule on %I.%I as permissive for all to app_web using (%s) with check (%s)',
          t.s, t.r, rule, rule);
      end if;
    end if;
    execute format('drop trigger if exists touch_updated_at on %I.%I', t.s, t.r);
    execute format(
      'create trigger touch_updated_at before update on %I.%I '
      'for each row execute function internal.touch_updated_at()',
      t.s, t.r);
  end loop;
  if exists (select from pg_roles where rolname = 'app_engine') then
    for t in
      select distinct tgrelid::regclass as ledger from pg_trigger
      where tgfoid = 'internal.forbid_change'::regproc and tgtype & 1 = 0  -- a statement's guard: the whole table
    loop
      execute format('revoke update, delete, truncate on %s from app_web, app_engine', t.ledger);
    end loop;
  end if;
end $$;

-- 8. The tables that leave. ---------------------------------------------------------------------------------------

delete from access_table where schema_name = 'public' and table_name in (
  'bank_proposal', 'bank_decision', 'learned_mistake', 'material_item_proposal', 'gold', 'gold_finding', 'hand_check',
  'item_review');
-- what is kept about a child: a report's finding and a hand check are cases of the eval set now
update data_register set tables = array_remove(tables, 'public.gold') where 'public.gold' = any(tables);
update data_register set tables = array_replace(tables, 'public.gold_finding', 'public.eval_case')
where 'public.gold_finding' = any(tables);
update data_register set tables = array_replace(tables, 'public.hand_check', 'public.eval_case')
where 'public.hand_check' = any(tables);

do $$
declare
  t text;
  k record;
  moved constant text[] := array['bank_proposal', 'gold_finding', 'item_review'];
  emptied constant text[] := array['bank_decision', 'learned_mistake', 'material_item_proposal', 'gold', 'hand_check'];
begin
  -- no table that stays still points at one that goes
  if exists (select 1 from pg_constraint c where c.contype = 'f'
             and c.confrelid in (select ('public.' || x)::regclass from unnest(moved || emptied) x)
             and c.conrelid not in (select ('public.' || x)::regclass from unnest(moved || emptied) x)) then
    raise exception 'CP-27: a table that stays still has a key into one that leaves';
  end if;
  foreach t in array moved loop
    for k in select conname from pg_constraint where contype = 'f' and conrelid = ('public.' || t)::regclass loop
      execute format('alter table public.%I drop constraint %I', t, k.conname);
    end loop;
    for k in select tgname from pg_trigger where not tgisinternal and tgrelid = ('public.' || t)::regclass loop
      execute format('drop trigger %I on public.%I', k.tgname, t);
    end loop;
    for k in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', k.policyname, t);
    end loop;
  end loop;
end $$;

-- the emptied ones (step 1: empty, in this transaction), the two that pointed at a bank proposal first
drop table public.bank_decision;
drop table public.learned_mistake;
drop table public.material_item_proposal;
drop table public.gold;
drop table public.hand_check;

alter table public.bank_proposal set schema retired;
alter table public.gold_finding set schema retired;
alter table public.item_review set schema retired;

do $$
declare
  t record;
  r text;
begin
  for t in select tablename from pg_tables where schemaname = 'retired' loop
    execute format('revoke all on retired.%I from public', t.tablename);
    foreach r in array array['app_web', 'app_engine', 'anon', 'authenticated'] loop
      if exists (select from pg_roles where rolname = r) then
        execute format('revoke all on retired.%I from %I', t.tablename, r);
      end if;
    end loop;
  end loop;
end $$;

select internal.apply_conventions();
