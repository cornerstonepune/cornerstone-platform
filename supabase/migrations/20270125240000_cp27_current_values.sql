-- CP-27, group 3, step 3C (docs/notes/CP-27-plan.md, "current state that needs a column plus the log"; #551 revisions):
-- where a history table also held the current value, the current value is on the owning row and the history is the
-- one history log, `change_log` (docs/data-model.md). No column is added to `item` or `skill_level` (the `engine past`
-- fingerprints of a question and a level are fixed column lists since 3-prep, and #551 decided none is needed).
--
--   item_key_change (a question keyed again: old key, new  -> `item.item_key` is the key it has now, as it was; each
--     key, why)                                               change a `change_log` row of `item` (row: the question's
--                                                             id, op `rekey`, before/after {item_key}, reason the why);
--                                                             `current_item_key()` reads the log, same signature, same
--                                                             answer for every key. Rows: copied, then `retired`
--   key_correction (an educator's right answer for a        -> stored on the question as before (`keys._store`); each
--     paper question, put back over its file on deploy)       change a `change_log` row of `item` (row: its key,
--                                                             `legacy/<paper>/<question>`, op `correct_key`, before/
--                                                             after {answer}, origin who), which `keys.reapply` puts
--                                                             back after each entry of the paper. Empty: dropped
--   page_choice (a person's choice on a doubtful page)      -> `capture.page_choices` {file page: {problem, choice, by,
--                                                             at}}; each choice a `change_log` row. Empty: dropped
--   mistake_named (a person's naming of a wrong answer,     -> `item_result.named_mistakes` {the reading: {code,
--     against the reading it was named on)                    proposed, by, at}}; each naming a `change_log` row. Empty:
--                                                             dropped
--   skill_level_kind_stop (a kind stopped or started again  -> `skill_level_question_type.stopped_at`, `stopped_by`
--     at a level)                                             (the view `kind_stopped` reads them); each stop and
--                                                             restart, with the papers it sent back, a `change_log`
--                                                             row. Empty: dropped
--   skill_level_kind_change (a kind added to or taken from  -> `skill_level_question_type.removed_at`, `removed_by`: a
--     an English level)                                       kind taken stays a row, marked, so a load does not bring
--                                                             it back; each change a `change_log` row. Empty: dropped
--
-- The bank's links (`internal.skill_level_question_type_sync`) keep a row that carries a stop or a removal, which they
-- deleted when no active question held its kind: a stop is no longer lost the day its questions all leave the bank.
--
-- A table with rows on live is never dropped: its rows are copied, tagged (`change_log.origin`), a block raises unless
-- every row is in the log with the same values and every key leads where it led, and the table moves to the schema
-- `retired`. An empty table is checked empty inside the migration, then dropped. What reads a key, a stop or a level's
-- kinds (`current_item_key`, `drawable_item`, `level_kind_choice`, `kind_stopped`) is compared before and after. One
-- transaction under `db push`: any raise leaves the database as it was.

-- 1. What the new homes could not keep, refused first; what they keep, counted. ---------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(format('%s: %s', t, v), '; ') into bad from (
    -- a log row's reason is never blank
    select 'item_key_change.why blank' as t, count(*)::text as v from item_key_change where btrim(why) = ''
      having count(*) > 0
    -- copied once: a re-key or a correction already in the log would be a second copy
    union all select 'change_log already holds', op || ' ' || count(*) from change_log
      where table_name = 'item' and op in ('rekey', 'correct_key') group by op
    -- empty on live (census); each is read as "the latest row stands", which its new home holds as one value: checked
    -- empty here, in this transaction, so none written before this runs is lost
    union all select 'not empty', 'key_correction ' || count(*) from key_correction having count(*) > 0
    union all select 'not empty', 'page_choice ' || count(*) from page_choice having count(*) > 0
    union all select 'not empty', 'mistake_named ' || count(*) from mistake_named having count(*) > 0
    union all select 'not empty', 'skill_level_kind_stop ' || count(*) from skill_level_kind_stop having count(*) > 0
    union all select 'not empty', 'skill_level_kind_change ' || count(*) from skill_level_kind_change
      having count(*) > 0
  ) x;
  if bad is not null then
    raise exception 'CP-27: a row the current values or the history log would not keep as it stands: %', bad;
  end if;
  raise notice 'CP-27 3C: % key changes (% questions, % keys both left and taken: chains)',
    (select count(*) from item_key_change), (select count(distinct item_id) from item_key_change),
    (select count(*) from item_key_change a where exists (select 1 from item_key_change b where b.new_key = a.old_key));
end $$;

-- 2. What reads a key, a stop or a level's kinds today, kept to compare with after. ----------------------------------

-- the key every key leads to: every key a question had, has now, or was given. Its unique key leads with the school,
-- so each step of a chain was a scan of the table (a rehearsal: 33,000 keys in 16 s); an index on the old key first.
create index item_key_change_old_key_idx on item_key_change (old_key);
analyze item_key_change;
create temporary table cp27_keys as
  select k, public.current_item_key(k) as now
  from (select old_key from item_key_change union select new_key from item_key_change union select item_key from item) x(k);
create temporary table cp27_drawable as select id from drawable_item;
create temporary table cp27_choice as select * from level_kind_choice;
create temporary table cp27_stopped as select tenant_id, skill_code, difficulty, question_type from kind_stopped;

-- 3. The current values, each on its own row. ------------------------------------------------------------------------

alter table capture add column page_choices jsonb
  constraint capture_page_choices_check check (jsonb_typeof(page_choices) = 'object');
comment on column capture.page_choices is
  'a person''s choice on each doubtful page of this capture, by file page: {problem, choice (theirs | not_theirs), by, '
  'at}; the one that stands (w3_read/whose_paper.py), each change kept in change_log';

alter table item_result add column named_mistakes jsonb
  constraint item_result_named_mistakes_check check (jsonb_typeof(named_mistakes) = 'object');
comment on column item_result.named_mistakes is
  'the mistake a person named for this wrong answer, by the reading it was named on: {code (or NONE), proposed, by, '
  'at} (w3_read/naming.py); each naming kept in change_log';

alter table skill_level_question_type add column stopped_at timestamptz;
alter table skill_level_question_type add column stopped_by text;
alter table skill_level_question_type add column removed_at timestamptz;
alter table skill_level_question_type add column removed_by text;
alter table skill_level_question_type add constraint skill_level_question_type_stopped_check
  check ((stopped_at is null) = (stopped_by is null) and btrim(stopped_by) <> '');
alter table skill_level_question_type add constraint skill_level_question_type_removed_check
  check ((removed_at is null) = (removed_by is null) and btrim(removed_by) <> '');
-- `drawable_item` asks, for every question, whether its kind is stopped at its level: read from the few rows stopped,
-- the draw is as quick as before (a rehearsal: 65 ms; 140 ms with the planner merging every level's row, as it does
-- until the table's statistics know the new column)
create index skill_level_question_type_stopped_idx on skill_level_question_type
  (tenant_id, skill_code, difficulty, question_type) where stopped_at is not null;
analyze skill_level_question_type;
comment on column skill_level_question_type.stopped_at is
  'an educator stopped the kind at this level (w1_bank/retire.py): no new paper draws it here (kind_stopped)';
comment on column skill_level_question_type.removed_at is
  'a person took the kind from this English level (w1_bank/english_edit.py): kept, so a load does not bring it back';

-- The engine stops a kind on its row, as it added a stop's row before.
do $$ begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant update (stopped_at, stopped_by, removed_at, removed_by) on skill_level_question_type to app_engine;
  end if;
end $$;

-- The bank's links follow its questions, and keep a row that carries a stop or a removal: a person's word on a level's
-- kind is not lost the day no active question holds it.
create or replace function internal.skill_level_question_type_sync(p_tenant uuid, p_skill text, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_skill is null or p_level is null then
    return;
  end if;
  with held as (
    select distinct q.code, q.fmt from item i join question_type q
      on q.tenant_id = i.tenant_id and q.code = question_type_of(i.fmt, i.template)
    where i.tenant_id = p_tenant and i.skill_set_code = p_skill and i.difficulty = p_level
      and i.status = 'active' and i.source = 'generated'
  ), gone as (
    delete from skill_level_question_type l
    where l.tenant_id = p_tenant and l.skill_code = p_skill and l.difficulty = p_level and not l.declared
      and l.stopped_at is null and l.removed_at is null
      and not exists (select 1 from held h where h.code = l.question_type)
  )
  insert into skill_level_question_type as l (tenant_id, skill_code, difficulty, question_type, place, declared)
  select p_tenant, p_skill, p_level, h.code, array_position(s.formats, h.fmt) - 1, false
  from held h join skill_level sl on sl.tenant_id = p_tenant and sl.skill_code = p_skill and sl.difficulty = p_level
  join skill s on s.tenant_id = p_tenant and s.code = p_skill
  on conflict (tenant_id, skill_code, difficulty, question_type) do update set place = excluded.place
    where l.place is distinct from excluded.place;
end $$;

-- The kinds stopped now, one row per level and kind: the same columns, read from the level's row.
create or replace view kind_stopped with (security_invoker = true) as
select tenant_id, skill_code, difficulty, question_type, true as stopped, stopped_by as changed_by,
       stopped_at as created_at
from skill_level_question_type
where stopped_at is not null;

-- The kinds a level may be given, by subject: as before, of a level that asks it now (not one taken from it).
create or replace view level_kind_choice with (security_invoker = true) as
select distinct t.tenant_id, t.subject_code, q.code, q.words, 'open_response' = any(q.marked) as open
from question_type q
join approval_list a on a.tenant_id = q.tenant_id and a.kind = 'question_type' and a.target = q.code
  and a.first_by is not null
join skill_level_question_type l on l.tenant_id = q.tenant_id and l.question_type = q.code and l.removed_at is null
join skill s on s.tenant_id = l.tenant_id and s.code = l.skill_code
join topic t on t.tenant_id = s.tenant_id and t.code = s.topic_code
where q.reaches <> 'observed';

-- 4. A key change is a row of the history log, and the key a question has now is found through it. ------------------

insert into change_log (tenant_id, table_name, row_id, op, before, after, origin, reason, at)
select tenant_id, 'item', item_id::text, 'rekey', jsonb_build_object('item_key', old_key),
       jsonb_build_object('item_key', new_key), 'CP-27: kept in item_key_change until 2026-11', why, created_at
from item_key_change;

-- A key is left once, as `item_key_change` held (unique per school); and the old key leads the lookup, so following a
-- chain is an index read per step.
create unique index change_log_rekey_key on change_log ((before ->> 'item_key'), tenant_id)
  where table_name = 'item' and op = 'rekey';
analyze change_log;

-- The key a question has now, from any key it has had: the one rule every reader of an old key uses (the engine's
-- `inventory.current_key`, a gold file loaded, a printed copy read, the website's question page). A key with no change
-- is itself.
create or replace function public.current_item_key(p_key text)
returns text
language sql stable set search_path = public as $$
  with recursive k(key, n) as (
    select p_key, 0
    union all
    select c.after ->> 'item_key', k.n + 1 from change_log c join k on c.before ->> 'item_key' = k.key
    where c.table_name = 'item' and c.op = 'rekey' and k.n < 8
  )
  select key from k order by n desc limit 1
$$;

-- 5. Every row in its new home, with the same values; what reads them says what it said. ----------------------------

do $$
declare
  n_old bigint;
  n_new bigint;
  n_tag bigint;
begin
  select count(*) into n_old from item_key_change;
  select count(*) into n_new from item_key_change x join change_log c on c.tenant_id = x.tenant_id
     and c.table_name = 'item' and c.row_id = x.item_id::text and c.op = 'rekey'
     and c.before = jsonb_build_object('item_key', x.old_key) and c.after = jsonb_build_object('item_key', x.new_key)
     and c.reason = x.why and c.at = x.created_at and c.staff_id is null
     and c.origin = 'CP-27: kept in item_key_change until 2026-11';
  select count(*) into n_tag from change_log where origin = 'CP-27: kept in item_key_change until 2026-11';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % key changes, % in the history log (% tagged)', n_old, n_new, n_tag;
  end if;

  -- every key leads where it led
  select count(*) into n_new from cp27_keys where public.current_item_key(k) is distinct from now;
  if n_new > 0 then
    raise exception 'CP-27: % keys no longer lead to the key they led to (of %)', n_new, (select count(*) from cp27_keys);
  end if;

  -- what a paper may draw, the kinds a level may be given, the kinds stopped: before and after, both ways
  if exists (select * from cp27_drawable except select id from drawable_item)
     or exists (select id from drawable_item except select * from cp27_drawable) then
    raise exception 'CP-27: what a paper may draw is not what it was';
  end if;
  if exists (select * from cp27_choice except select * from level_kind_choice)
     or exists (select * from level_kind_choice except select * from cp27_choice) then
    raise exception 'CP-27: the kinds a level may be given are not what they were';
  end if;
  if exists (select * from cp27_stopped except select tenant_id, skill_code, difficulty, question_type from kind_stopped)
     or exists (select tenant_id, skill_code, difficulty, question_type from kind_stopped
                except select * from cp27_stopped) then
    raise exception 'CP-27: the kinds stopped are not what they were';
  end if;
end $$;

drop table cp27_keys, cp27_drawable, cp27_choice, cp27_stopped;

-- 6. The tables that leave. ---------------------------------------------------------------------------------------

delete from access_table where schema_name = 'public' and table_name in (
  'item_key_change', 'key_correction', 'page_choice', 'mistake_named', 'skill_level_kind_stop',
  'skill_level_kind_change');
-- what is kept about a child: a page's choice and a mistake named are on the capture and the answer now
update data_register set tables = array_remove(tables, 'public.page_choice') where 'public.page_choice' = any(tables);
update data_register set tables = array_remove(tables, 'public.mistake_named')
where 'public.mistake_named' = any(tables);

do $$
declare
  t text;
  k record;
  moved constant text[] := array['item_key_change'];
  emptied constant text[] := array['key_correction', 'page_choice', 'mistake_named', 'skill_level_kind_stop',
                                   'skill_level_kind_change'];
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

-- the emptied ones (step 1: empty, in this transaction)
drop table public.key_correction;
drop table public.page_choice;
drop table public.mistake_named;
drop table public.skill_level_kind_stop;
drop table public.skill_level_kind_change;

alter table public.item_key_change set schema retired;

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
