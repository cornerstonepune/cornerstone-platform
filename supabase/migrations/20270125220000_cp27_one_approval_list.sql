-- CP-27, group 3, step 3A (specs/CP-27/spec.md Done when 10, docs/data-model.md): every yes or no a person gives is a
-- row in `approval`, the one approval list.
--
--   question_type_approval (a way of asking approved)  -> approval kind question_type, decision approved
--   item_feedback (a question flagged: retire or keep)  -> approval kind item, decision retire or keep, the note its
--                                                          reason; the trigger that retires a flagged question stays,
--                                                          on `approval` (internal.retire_flagged_item)
--   class_card_confirmation (a class card confirmed)    -> approval kind class_card, decision confirmed, the card as
--                                                          it was seen in `detail` (child ids: seen only by whoever
--                                                          sees that class, like a parent report's approval)
--   calibration_review ("I've looked at this")          -> approval kind calibration, decision looked_at, the counts
--                                                          it was looked at on in `detail`
--
-- The approvals still kept on the row they approve stay there until group 4 (who did it) drops them: a level's
-- (`skill.level_approved`, mirrored on `skill_level.confirmed_by`/`confirmed_at`), a parent report's
-- (`parent_note.approved_by`), a paper's (`sheet_instance.approved_by`/`approved_at`) and a micro-step link's
-- (`skill_prerequisite.confirmed_by`/`confirmed_at`). One trigger function, `internal.approval_from_stamp`, writes an
-- `approval` row each time one is given (approved) or taken back (withdrawn), so the list is read from `approval`
-- alone: `approval_list`, `drawable_item`'s "an approved way of asking" and `level_kind_choice` read it. Every stamp
-- already given is copied in first, with the time the list showed for it.
--
-- `approval.seq` is the order decisions were taken in (rows written in one transaction share a clock): the first
-- approval is the first one after the latest withdrawal. A second approval, by someone else, is needed only by what
-- reaches a parent (`approval_checked`, `parent_note_sent_when_approved_twice`, unchanged in what they refuse).
--
-- A table with rows on live is never dropped: its rows are copied, tagged in `detail ->> 'kept_in'`, a block raises
-- unless every row is in its new home with the same values, and the table moves to the schema `retired` (no grants,
-- keys, triggers or policies). What reads an approval (the list, the papers' draw, the kinds a level may be given, the
-- levels to review) is compared before and after, and any difference raises. One transaction under `db push`: any
-- raise leaves the database as it was.

-- 1. What the list could not keep, refused first; what it keeps, counted. -------------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(format('%s: %s', t, v), '; ') into bad from (
    select 'approval.kind' as t, kind as v from approval where kind not in ('skill_level', 'question_type', 'parent_note')
    union all select 'approval.decision', decision from approval where decision not in ('approved', 'sent_back')
    union all select 'item_feedback.verdict', verdict from item_feedback where verdict not in ('retire', 'keep')
    union all select 'item_feedback.actor blank', count(*)::text from item_feedback where btrim(actor) = ''
      having count(*) > 0
    union all select 'class_card_confirmation.by blank', count(*)::text from class_card_confirmation
      where btrim(coalesce("by", '')) = '' having count(*) > 0
    -- a level approved with no name or no time: the list showed it with neither, a stamp copied here would show both
    union all select 'skill.level_approved with no name or time', s.code || ' ' || e.key
      from skill s, jsonb_each(s.level_approved) e
      where btrim(coalesce(e.value ->> 'by', '')) = '' or e.value ->> 'at' is null
    union all select 'skill_level confirmed with no name or time', skill_code || ' ' || difficulty from skill_level
      where (confirmed_by is null) <> (confirmed_at is null) or btrim(confirmed_by) = ''
    union all select 'parent_note.approved_by blank', count(*)::text from parent_note where btrim(approved_by) = ''
      having count(*) > 0
    union all select 'sheet_instance.approved_by blank', count(*)::text from sheet_instance where btrim(approved_by) = ''
      having count(*) > 0
    union all select 'skill_prerequisite confirmed by no one', id::text from skill_prerequisite
      where (status = 'confirmed') <> (confirmed_by is not null)
  ) x;
  if bad is not null then
    raise exception 'CP-27: a row the approval list would not keep as it stands: %', bad;
  end if;
  raise notice 'CP-27 3A: % ways of asking approved, % question flags (% keep), % class cards, % levels looked at, '
               '% levels, % parent reports, % papers and % micro-step links approved on their row',
    (select count(*) from question_type_approval), (select count(*) from item_feedback),
    (select count(*) from item_feedback where verdict = 'keep'), (select count(*) from class_card_confirmation),
    (select count(*) from calibration_review), (select count(*) from skill_level where confirmed_by is not null),
    (select count(*) from parent_note where approved_by is not null),
    (select count(*) from sheet_instance where approved_by is not null),
    (select count(*) from skill_prerequisite where confirmed_by is not null);
end $$;

-- 2. What reads an approval today, kept to compare with after. Plain temporary tables (dropped at the end): the same
-- under `db push` (one transaction) and under `psql -f` (bin/testdb). -------------------------------------------------

create temporary table cp27_list as
  select tenant_id, kind, target, first_by, first_at, second_by, sent_back_because, state from approval_list;
create temporary table cp27_drawable as select id from drawable_item;
create temporary table cp27_kinds as select * from level_kind_choice;
create temporary table cp27_calibration as select * from level_calibration;
create temporary table cp27_items as select md5(coalesce(string_agg(id || ' ' || status, ',' order by id), '')) as m from item;

-- 3. The list widened: its kinds and decisions are rules on the columns; what a decision was taken on is `detail`. ---

alter table approval drop constraint approval_kind_check;
alter table approval add constraint approval_kind_check check (kind in (
  'skill_level', 'question_type', 'parent_note', 'sheet', 'skill_prerequisite', 'item', 'calibration', 'class_card'));
alter table approval drop constraint approval_decision_check;
alter table approval add constraint approval_decision_check check (case kind
  when 'item' then decision in ('retire', 'keep')          -- a question flagged, as a person or a rule of the bank says
  when 'calibration' then decision = 'looked_at'           -- "I've looked at this", on the counts in `detail`
  when 'class_card' then decision = 'confirmed'            -- the week's card confirmed, as seen (`detail`)
  else decision in ('approved', 'sent_back', 'withdrawn') end);
alter table approval add column detail jsonb;
alter table approval add column seq bigint;
comment on column approval.detail is
  'what the decision was taken on (a class card as seen, the counts a level was looked at on); kept_in: the table a row was moved from (CP-27)';
comment on column approval.seq is
  'the order decisions were taken in: the first approval is the first after the latest withdrawal';

-- 4. Every approval kept elsewhere, copied in; the rows moved in first, in the order they were made, then the decisions
-- the list already held. The list's own triggers are off while it is filled (they would check a first approval against
-- the list as it is being built), and back on before anything else writes. --------------------------------------------

alter table approval disable trigger user;

insert into approval (tenant_id, kind, target, decision, "by", reason, detail, created_at, updated_at, seq)
select x.tenant_id, x.kind, x.target, x.decision, x."by", x.reason, x.detail, x.created_at, x.updated_at,
       row_number() over (order by x.created_at, x.kind, x.target, x.src_id)
from (
  select tenant_id, 'question_type' as kind, question_type as target, 'approved' as decision, approved_by as "by",
         null::text as reason, jsonb_build_object('kept_in', 'question_type_approval') as detail,
         approved_at as created_at, updated_at, id::text as src_id
  from question_type_approval
  union all
  select tenant_id, 'item', item_id::text, verdict, actor, case when btrim(note) = '' then null else note end,
         jsonb_build_object('kept_in', 'item_feedback'), created_at, updated_at, id::text
  from item_feedback
  union all
  select tenant_id, 'class_card', section || ' ' || week, 'confirmed', "by", null,
         jsonb_build_object('kept_in', 'class_card_confirmation', 'section', section, 'week', week, 'card', card),
         created_at, updated_at, id::text
  from class_card_confirmation
  union all
  select tenant_id, 'calibration', skill_code || ' ' || difficulty || ' ' || scope_kind || ' ' || scope_value,
         'looked_at', reviewed_by, null,
         jsonb_build_object('kept_in', 'calibration_review', 'assessed', assessed, 'secure', secure),
         reviewed_at, updated_at, id::text
  from calibration_review
  -- the approvals on their row: the time each showed in the list (a report's: the note's last change, as it did)
  union all
  select tenant_id, 'skill_level', skill_code || ' ' || difficulty, 'approved', confirmed_by, null,
         jsonb_build_object('kept_in', 'skill_level.confirmed_by'), confirmed_at, confirmed_at, id::text
  from skill_level where confirmed_by is not null
  union all
  select tenant_id, 'parent_note', id::text, 'approved', approved_by, null,
         jsonb_build_object('kept_in', 'parent_note.approved_by'), updated_at, updated_at, id::text
  from parent_note where approved_by is not null
  union all
  select tenant_id, 'sheet', id::text, 'approved', approved_by, null,
         jsonb_build_object('kept_in', 'sheet_instance.approved_by'), coalesce(approved_at, created_at),
         coalesce(approved_at, created_at), id::text
  from sheet_instance where approved_by is not null
  union all
  select tenant_id, 'skill_prerequisite', id::text, 'approved', confirmed_by::text, null,
         jsonb_build_object('kept_in', 'skill_prerequisite.confirmed_by'), confirmed_at, confirmed_at, id::text
  from skill_prerequisite where confirmed_by is not null
) x;

-- the send-backs and second approvals the list held, after them, in the order they were made
update approval a set seq = o.n
from (select id, (select count(*) from approval where seq is not null)
                 + row_number() over (order by created_at, id) as n
      from approval where seq is null) o
where o.id = a.id;

alter table approval enable trigger user;

alter table approval alter column seq set not null;
alter table approval alter column seq add generated by default as identity;
select setval(pg_get_serial_sequence('public.approval', 'seq'), coalesce(max(seq), 1), max(seq) is not null)
from approval;

drop index if exists approval_target_idx;
create index approval_target_idx on approval (tenant_id, kind, target, seq);
-- counted now: before its statistics, a paper's draw (`drawable_item`) took 12 s against 56 ms after (a fresh build)
analyze approval;

-- 5. The list, read from `approval` alone. -----------------------------------------------------------------------

-- Everything a person approves that the coordinator's list shows (a level, a way of asking, a report for a parent), one
-- row each, draft beside approved. Its first approval: the first after the latest withdrawal; a second, someone else's
-- since then; a sending back counts when it came after the first approval (or there is none).
create or replace view approval_list with (security_invoker = true) as
with listed as (
  select l.tenant_id, 'skill_level' as kind, l.skill_code || ' ' || l.difficulty as target from skill_level l
  union all
  select q.tenant_id, 'question_type', q.code from question_type q
  union all
  select n.tenant_id, 'parent_note', n.id::text from parent_note n
), firsts as (
  select f.tenant_id, f.kind, f.target, a."by" as first_by, a.created_at as first_at, w.since
  from listed f
  cross join lateral (
    select coalesce(max(x.seq), 0) as since from approval x
    where x.tenant_id = f.tenant_id and x.kind = f.kind and x.target = f.target and x.decision = 'withdrawn'
  ) w
  left join lateral (
    select x."by", x.created_at from approval x
    where x.tenant_id = f.tenant_id and x.kind = f.kind and x.target = f.target and x.decision = 'approved'
      and x.seq > w.since
    order by x.seq limit 1
  ) a on true
), stood as (
  select f.*, f.kind = 'parent_note' as reaches_parent,  -- what reaches a parent waits for a second person
         (select a.reason from approval a
          where a.tenant_id = f.tenant_id and a.kind = f.kind and a.target = f.target and a.decision = 'sent_back'
            and (f.first_at is null or a.created_at > f.first_at)
          order by a.created_at desc, a.seq desc limit 1) as sent_back_because,
         (select a.created_at from approval a
          where a.tenant_id = f.tenant_id and a.kind = f.kind and a.target = f.target and a.decision = 'sent_back'
            and (f.first_at is null or a.created_at > f.first_at)
          order by a.created_at desc, a.seq desc limit 1) as sent_back_at,
         (select a."by" from approval a
          where a.tenant_id = f.tenant_id and a.kind = f.kind and a.target = f.target and a.decision = 'approved'
            and a.seq > f.since and a."by" <> f.first_by
          order by a.seq desc limit 1) as second_by
  from firsts f
)
select tenant_id, kind, target, first_by, first_at, second_by, sent_back_because,
       case when sent_back_at is not null and (second_by is null) then 'sent_back'
            when first_by is null then 'draft'
            when reaches_parent and second_by is null then 'waiting_second'
            else 'approved' end as state
from stood;

-- An approval is checked as it is written. A first approval of what is approved on its own row (a level, a report, a
-- paper, a link) is the one its row names (`approval_from_stamp` writes it); a way of asking is approved here. Once
-- something stands approved, another approval is a second one, and is someone else's.
create or replace function internal.approval_checked() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_by text;
  stamp text;
begin
  if new.decision <> 'approved' then
    return new;
  end if;
  select a."by" into first_by from approval a
  where a.tenant_id = new.tenant_id and a.kind = new.kind and a.target = new.target and a.decision = 'approved'
    and a.seq > coalesce((select max(w.seq) from approval w
                          where w.tenant_id = new.tenant_id and w.kind = new.kind and w.target = new.target
                            and w.decision = 'withdrawn'), 0)
  order by a.seq limit 1;
  if first_by is not null then
    if first_by = new."by" then
      raise exception 'a second approval is someone else''s: % approved % first', new."by", new.target
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  stamp := case new.kind
    when 'question_type' then new."by"
    when 'parent_note' then (select approved_by from parent_note where tenant_id = new.tenant_id and id = new.target::uuid)
    when 'sheet' then (select approved_by from sheet_instance where tenant_id = new.tenant_id and id = new.target::uuid)
    when 'skill_prerequisite' then (select confirmed_by::text from skill_prerequisite
                                    where tenant_id = new.tenant_id and id = new.target::uuid)
    when 'skill_level' then (select confirmed_by from skill_level
                             where tenant_id = new.tenant_id and skill_code = split_part(new.target, ' ', 1)
                               and skill_code || ' ' || difficulty = new.target)
  end;
  if stamp is distinct from new."by" then
    raise exception 'nothing to approve a second time: % % has no first approval', new.kind, new.target
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- One trigger function for every approval still kept on the row it approves (until group 4 drops them). Arguments: the
-- kind; the column(s) naming the row, comma-separated (joined with a space, as the list names it); the column naming who
-- approved; the column of when (none: the row's last change, as the list showed a report's). An approval given writes
-- `approved`; taken back, or given again, or the row renamed, first writes `withdrawn` for what stood.
create function internal.approval_from_stamp() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  school uuid := (n ->> 'tenant_id')::uuid;
  named text;
  t text;
  who text := case when btrim(n ->> tg_argv[2]) <> '' then n ->> tg_argv[2] end;  -- as written; blank is no one
begin
  foreach t in array array[
    (select string_agg(o ->> k, ' ' order by i) from unnest(string_to_array(tg_argv[1], ',')) with ordinality u (k, i)),
    (select string_agg(n ->> k, ' ' order by i) from unnest(string_to_array(tg_argv[1], ',')) with ordinality u (k, i))]
  loop
    named := t;  -- the row's name now, once the loop ends
    if t is not null and (select a.decision = 'approved' from approval a
                          where a.tenant_id = school and a.kind = tg_argv[0] and a.target = t
                            and a.decision in ('approved', 'withdrawn')
                          order by a.seq desc limit 1) then
      insert into approval (tenant_id, kind, target, decision, "by")
      values (school, tg_argv[0], t, 'withdrawn',
              coalesce(nullif(btrim(current_setting('app.changed_by', true)), ''), session_user::text));
    end if;
  end loop;
  if who is not null then
    insert into approval (tenant_id, kind, target, decision, "by", created_at)
    values (school, tg_argv[0], named, 'approved', who,
            coalesce(case when tg_nargs > 3 then (n ->> tg_argv[3])::timestamptz end,
                     (n ->> 'updated_at')::timestamptz, now()));
  end if;
  return null;
end $$;

create trigger approval_given after insert on skill_level for each row when (new.confirmed_by is not null)
  execute function internal.approval_from_stamp('skill_level', 'skill_code,difficulty', 'confirmed_by', 'confirmed_at');
create trigger approval_changed after update of skill_code, difficulty, confirmed_by, confirmed_at on skill_level
  for each row when (row(old.skill_code, old.difficulty, old.confirmed_by, old.confirmed_at)
                     is distinct from row(new.skill_code, new.difficulty, new.confirmed_by, new.confirmed_at))
  execute function internal.approval_from_stamp('skill_level', 'skill_code,difficulty', 'confirmed_by', 'confirmed_at');
create trigger approval_given after insert on parent_note for each row when (new.approved_by is not null)
  execute function internal.approval_from_stamp('parent_note', 'id', 'approved_by');
create trigger approval_changed after update of approved_by on parent_note
  for each row when (old.approved_by is distinct from new.approved_by)
  execute function internal.approval_from_stamp('parent_note', 'id', 'approved_by');
create trigger approval_given after insert on sheet_instance for each row when (new.approved_by is not null)
  execute function internal.approval_from_stamp('sheet', 'id', 'approved_by', 'approved_at');
create trigger approval_changed after update of approved_by, approved_at on sheet_instance
  for each row when (row(old.approved_by, old.approved_at) is distinct from row(new.approved_by, new.approved_at))
  execute function internal.approval_from_stamp('sheet', 'id', 'approved_by', 'approved_at');
create trigger approval_given after insert on skill_prerequisite for each row when (new.confirmed_by is not null)
  execute function internal.approval_from_stamp('skill_prerequisite', 'id', 'confirmed_by', 'confirmed_at');
create trigger approval_changed after update of confirmed_by, confirmed_at on skill_prerequisite
  for each row when (row(old.confirmed_by, old.confirmed_at) is distinct from row(new.confirmed_by, new.confirmed_at))
  execute function internal.approval_from_stamp('skill_prerequisite', 'id', 'confirmed_by', 'confirmed_at');

-- A flagged question is retired by whoever flags it: the trigger that did it on `item_feedback`, on `approval` (made
-- after the flags were copied, so none of them touched a question again).
create or replace function internal.retire_flagged_item() returns trigger
language plpgsql set search_path = public as $$
begin
  update item set status = 'retired' where id = new.target::uuid;
  return new;
end $$;
drop trigger retire_flagged_item on item_feedback;
create trigger retire_flagged_item after insert on approval
  for each row when (new.kind = 'item' and new.decision = 'retire') execute function internal.retire_flagged_item();

-- 6. What read the moved tables reads the list. ------------------------------------------------------------------

-- A paper draws an active question at a confirmed level, of an approved way of asking (its latest approval or withdrawal
-- an approval: what `approval_list` calls a first approval), not stopped there. The way's standing is read once per
-- question, beside its kind, from `approval` itself: joined as a list (through `approval_list`, or as a semi-join) the
-- planner put the ways before the questions' kinds were known (a fresh build, 2026-11-09: the whole draw 975 ms against
-- 44 ms before; the shelf's per-skill reading 15 s against 0.28 s); this way 69 ms and 0.28 s.
create or replace view drawable_item with (security_invoker = true) as
  select i.*, q.question_type
  from item i
  cross join lateral (select question_type_of(i.fmt, i.template) as question_type offset 0) q
  join skill_level l on l.tenant_id = i.tenant_id and l.skill_code = i.skill_set_code and l.difficulty = i.difficulty
  cross join lateral (
    select a.decision from approval a
    where a.tenant_id = i.tenant_id and a.kind = 'question_type' and a.target = q.question_type
      and a.decision in ('approved', 'withdrawn')
    order by a.seq desc limit 1
  ) w
  where i.status = 'active' and l.confirmed_at is not null and w.decision = 'approved'
    and not exists (select 1 from kind_stopped k
                    where k.tenant_id = i.tenant_id and k.skill_code = i.skill_set_code and k.difficulty = i.difficulty
                      and k.question_type = q.question_type);

-- The kinds a level may be given, by subject: approved, on a paper or read aloud (not observed), and asked by some level
-- of that subject. The engine accepts and the website offers from this one list.
create or replace view level_kind_choice with (security_invoker = true) as
select distinct t.tenant_id, t.subject_code, q.code, q.words, 'open_response' = any(q.marked) as open
from question_type q
join approval_list a on a.tenant_id = q.tenant_id and a.kind = 'question_type' and a.target = q.code
  and a.first_by is not null
join skill_level_question_type l on l.tenant_id = q.tenant_id and l.question_type = q.code
join skill s on s.tenant_id = l.tenant_id and s.code = l.skill_code
join topic t on t.tenant_id = s.tenant_id and t.code = s.topic_code
where q.reaches <> 'observed';

-- The levels to review: "I've looked at this" hides one until its counts move by `calibration.review_again_children`.
create or replace view level_calibration with (security_invoker = true) as
with kid as (
  select l.tenant_id, l.child_id, l.skill_code, l.difficulty, c.section, c.band,
         (st.enough and not st.needs_work) as is_secure
  from child_level_state l
  join child c on c.id = l.child_id and c.active
  join child_state st on st.tenant_id = l.tenant_id and st.code = l.state
), counted as (
  select tenant_id, 'class'::text as scope_kind, section as scope_value, class_band(tenant_id, section) as grade,
         skill_code, difficulty, count(*)::int as assessed, (count(*) filter (where is_secure))::int as secure
  from kid group by tenant_id, section, skill_code, difficulty
  union all
  select tenant_id, 'grade', band, band, skill_code, difficulty, count(*)::int, (count(*) filter (where is_secure))::int
  from kid group by tenant_id, band, skill_code, difficulty
), th as (
  select tenant_id,
         max(value::numeric) filter (where key = 'calibration.too_easy_share')          as share,
         max(value::numeric) filter (where key = 'calibration.min_children')            as min_children,
         max(value::numeric) filter (where key = 'calibration.review_again_children')   as again
  from config
  where key in ('calibration.too_easy_share', 'calibration.min_children', 'calibration.review_again_children')
  group by tenant_id
)
select n.tenant_id, n.scope_kind, n.scope_value, n.grade, n.skill_code, n.difficulty, n.assessed, n.secure,
       th.min_children::int as min_children, th.share as share_needed,
       case when n.assessed < th.min_children                   then 'too_few'
            when n.secure::numeric / n.assessed >= th.share     then 'review'
            else 'fine' end as verdict,
       r.reviewed_at as looked_at, r.reviewed_by as looked_by
from counted n
join th on th.tenant_id = n.tenant_id
left join lateral (
  select v.created_at as reviewed_at, v."by" as reviewed_by, (v.detail ->> 'assessed')::int as assessed,
         (v.detail ->> 'secure')::int as secure
  from approval v
  where v.tenant_id = n.tenant_id and v.kind = 'calibration'
    and v.target = n.skill_code || ' ' || n.difficulty || ' ' || n.scope_kind || ' ' || n.scope_value
  order by v.created_at desc, v.seq desc limit 1
) r on abs(n.assessed - r.assessed) < th.again and abs(n.secure - r.secure) < th.again
where th.share is not null and th.min_children is not null and th.again is not null;

-- The one-time start of B2 (every type in use approved, 2026-11-26) ran once; its rows are approval rows now.
drop function internal.question_types_start_approved();

-- 7. Every row in its new home, with the same values; everything that reads an approval says what it said. ---------

do $$
declare
  n_old bigint;
  n_new bigint;
  n_tag bigint;
begin
  select count(*) into n_old from question_type_approval;
  select count(*) into n_new from question_type_approval x join approval a on a.tenant_id = x.tenant_id
     and a.kind = 'question_type' and a.target = x.question_type and a.decision = 'approved'
     and a."by" = x.approved_by and a.created_at = x.approved_at and a.detail ->> 'kept_in' = 'question_type_approval';
  select count(*) into n_tag from approval where detail ->> 'kept_in' = 'question_type_approval';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % ways of asking approved, % in approval (% tagged)', n_old, n_new, n_tag;
  end if;

  select count(*) into n_old from item_feedback;
  select count(*) into n_new from item_feedback x join approval a on a.tenant_id = x.tenant_id
     and a.kind = 'item' and a.target = x.item_id::text and a.decision = x.verdict and a."by" = x.actor
     and coalesce(a.reason, '') = case when btrim(x.note) = '' then '' else x.note end
     and a.created_at = x.created_at and a.updated_at = x.updated_at and a.detail ->> 'kept_in' = 'item_feedback';
  select count(*) into n_tag from approval where detail ->> 'kept_in' = 'item_feedback';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % question flags, % in approval (% tagged)', n_old, n_new, n_tag;
  end if;

  select count(*) into n_old from class_card_confirmation;
  select count(*) into n_new from class_card_confirmation x join approval a on a.tenant_id = x.tenant_id
     and a.kind = 'class_card' and a.target = x.section || ' ' || x.week and a.decision = 'confirmed'
     and a."by" = x."by" and a.detail -> 'card' = x.card and a.created_at = x.created_at
     and a.detail ->> 'kept_in' = 'class_card_confirmation';
  select count(*) into n_tag from approval where detail ->> 'kept_in' = 'class_card_confirmation';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % class cards confirmed, % in approval (% tagged)', n_old, n_new, n_tag;
  end if;

  select count(*) into n_old from calibration_review;
  select count(*) into n_new from calibration_review x join approval a on a.tenant_id = x.tenant_id
     and a.kind = 'calibration'
     and a.target = x.skill_code || ' ' || x.difficulty || ' ' || x.scope_kind || ' ' || x.scope_value
     and a.decision = 'looked_at' and a."by" = x.reviewed_by and a.created_at = x.reviewed_at
     and (a.detail ->> 'assessed')::int = x.assessed and (a.detail ->> 'secure')::int = x.secure
     and a.detail ->> 'kept_in' = 'calibration_review';
  select count(*) into n_tag from approval where detail ->> 'kept_in' = 'calibration_review';
  if n_old <> n_new or n_tag <> n_old then
    raise exception 'CP-27: % levels looked at, % in approval (% tagged)', n_old, n_new, n_tag;
  end if;

  -- each approval on its row: one approved row, the same person
  select count(*) into n_old from skill_level where confirmed_by is not null;
  select count(*) into n_new from skill_level x join approval a on a.tenant_id = x.tenant_id and a.kind = 'skill_level'
     and a.target = x.skill_code || ' ' || x.difficulty and a."by" = x.confirmed_by and a.created_at = x.confirmed_at
     and a.detail ->> 'kept_in' = 'skill_level.confirmed_by';
  if n_old <> n_new then
    raise exception 'CP-27: % levels approved, % in approval', n_old, n_new;
  end if;
  select count(*) into n_old from parent_note where approved_by is not null;
  select count(*) into n_new from parent_note x join approval a on a.tenant_id = x.tenant_id and a.kind = 'parent_note'
     and a.target = x.id::text and a."by" = x.approved_by and a.detail ->> 'kept_in' = 'parent_note.approved_by';
  if n_old <> n_new then
    raise exception 'CP-27: % parent reports approved, % in approval', n_old, n_new;
  end if;
  select count(*) into n_old from sheet_instance where approved_by is not null;
  select count(*) into n_new from sheet_instance x join approval a on a.tenant_id = x.tenant_id and a.kind = 'sheet'
     and a.target = x.id::text and a."by" = x.approved_by and a.detail ->> 'kept_in' = 'sheet_instance.approved_by';
  if n_old <> n_new then
    raise exception 'CP-27: % papers approved, % in approval', n_old, n_new;
  end if;
  select count(*) into n_old from skill_prerequisite where confirmed_by is not null;
  select count(*) into n_new from skill_prerequisite x join approval a on a.tenant_id = x.tenant_id
     and a.kind = 'skill_prerequisite' and a.target = x.id::text and a."by" = x.confirmed_by::text
     and a.detail ->> 'kept_in' = 'skill_prerequisite.confirmed_by';
  if n_old <> n_new then
    raise exception 'CP-27: % micro-step links confirmed, % in approval', n_old, n_new;
  end if;

  -- what reads an approval, before and after
  if exists (select tenant_id, kind, target, first_by, first_at, second_by, sent_back_because, state from approval_list
             except select * from cp27_list)
     or exists (select * from cp27_list except select tenant_id, kind, target, first_by, first_at, second_by,
                sent_back_because, state from approval_list) then
    raise exception 'CP-27: the approval list is not what it was';
  end if;
  if exists (select id from drawable_item except select id from cp27_drawable)
     or exists (select id from cp27_drawable except select id from drawable_item) then
    raise exception 'CP-27: a paper would draw other questions than it did';
  end if;
  if exists (select * from level_kind_choice except select * from cp27_kinds)
     or exists (select * from cp27_kinds except select * from level_kind_choice) then
    raise exception 'CP-27: the kinds a level may be given are not what they were';
  end if;
  if exists (select * from level_calibration except select * from cp27_calibration)
     or exists (select * from cp27_calibration except select * from level_calibration) then
    raise exception 'CP-27: the levels to review are not what they were';
  end if;
  if (select md5(coalesce(string_agg(id || ' ' || status, ',' order by id), '')) from item)
     <> (select m from cp27_items) then
    raise exception 'CP-27: a question''s status changed';
  end if;
end $$;

drop table cp27_list, cp27_drawable, cp27_kinds, cp27_calibration, cp27_items;

-- 8. The website adds an approval (a way of asking, a level looked at) as it added one before. An approval of something
-- of a child's (a report, a paper, a class card) is seen by whoever sees that report, paper or class; the rest are the
-- school's, open to every educator of it, as the tables they came from were. ----------------------------------------

do $$ begin
  if exists (select from pg_roles where rolname = 'app_web') then
    grant insert on approval to app_web;
  end if;
end $$;

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
      select distinct tgrelid::regclass as ledger from pg_trigger where tgfoid = 'internal.forbid_change'::regproc
    loop
      execute format('revoke update, delete, truncate on %s from app_web, app_engine', t.ledger);
    end loop;
  end if;
end $$;

-- 9. The tables that leave. ---------------------------------------------------------------------------------------

delete from access_table where schema_name = 'public' and table_name in (
  'question_type_approval', 'item_feedback', 'class_card_confirmation', 'calibration_review');
-- what is kept about a child: a class card as an educator confirmed it is an approval row now
update data_register set tables = array_replace(tables, 'public.class_card_confirmation', 'public.approval')
where 'public.class_card_confirmation' = any(tables);

do $$
declare
  t text;
  k record;
  moved constant text[] := array['question_type_approval', 'item_feedback', 'class_card_confirmation', 'calibration_review'];
begin
  -- no table that stays still points at one that goes
  if exists (select 1 from pg_constraint c where c.contype = 'f'
             and c.confrelid in (select ('public.' || x)::regclass from unnest(moved) x)
             and c.conrelid not in (select ('public.' || x)::regclass from unnest(moved) x)) then
    raise exception 'CP-27: a table that stays still has a key into one that is retired';
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

alter table public.question_type_approval set schema retired;
alter table public.item_feedback set schema retired;
alter table public.class_card_confirmation set schema retired;
alter table public.calibration_review set schema retired;

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
