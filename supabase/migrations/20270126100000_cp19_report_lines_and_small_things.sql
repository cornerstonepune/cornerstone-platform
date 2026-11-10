-- CP-19 (report lines, two approvals a line, consent before any send) and three small things the frontend asked for.
-- No new table.
--
--   * parent_note.lines            a report's lines, each standing on its own: [{id, words, evidence: [evidence ids]}].
--                                  A line may rest only on CONFIRMED evidence of THIS child dated within the report's period
--                                  (`report.period_days` after the report's week); a sent report's lines never change.
--   * approval kind `report_line`  a line's approvals: target `<report id>:<line id>`; the first approval needs no stamp, the
--                                  second must be someone else's (the existing `approval_checked`). Who may give which (an
--                                  educator of the child's class first, then a coordinator) is the engine's to hold.
--   * the report guard             one trigger on parent_note (the existing function, extended: no new function). Lines
--                                  are checked when they change; a report is marked sent only when consent is on record for the child (and the register
--                                  is as it was when given) and every line has two approvals by two people; a report with
--                                  no lines keeps the old rule (two approvals of the report). It is a trigger: any route.
--   * educator_note.photo_keys     keys into the private store of the photos of a lesson's work or board (never a child).
--   * role.label                   "Class educator", not "Class teacher" (the school's words).

-- 1. The school's words. -------------------------------------------------------------------------------------------

update role set label = 'Class educator' where code = 'class_teacher' and label = 'Class teacher';

-- 2. A line's approvals are a kind of approval. ---------------------------------------------------------------------

alter table approval drop constraint approval_kind_check;
alter table approval add constraint approval_kind_check check (kind = any (array[
  'materials_ack', 'fortnight', 'timetable', 'timetable_live', 'timetable_clash', 'week', 'skill_level',
  'question_type', 'parent_note', 'sheet', 'skill_prerequisite', 'item', 'calibration', 'class_card', 'report_line']));

-- the first approval of a line has no stamp on a row to match, as a question type's has none: it stands on its own
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
    when 'materials_ack' then new."by"
    when 'report_line' then new."by"
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

-- 3. A report's lines. ----------------------------------------------------------------------------------------------

alter table parent_note add column lines jsonb not null default '[]'::jsonb;
alter table parent_note add constraint parent_note_lines_array check (jsonb_typeof(lines) = 'array');

-- 4. Nothing reaches a parent without consent and its approvals. -----------------------------------------------------

create or replace function internal.parent_note_sent_when_approved_twice() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  seen text[] := '{}';
  ev text;
  who integer;
  days integer := coalesce((select (value #>> '{}')::integer from config
                            where tenant_id = new.tenant_id and key = 'report.period_days'), 14);
begin
  -- the lines: when they change, each stands on its own and rests only on this child's confirmed evidence in period
  if tg_op = 'INSERT' or new.lines is distinct from old.lines then
    if tg_op = 'UPDATE' and old.sent_at is not null then
      raise exception 'a report that was sent keeps its lines' using errcode = 'check_violation';
    end if;
    for l in select * from jsonb_array_elements(new.lines) loop
      if jsonb_typeof(l) <> 'object' or coalesce(btrim(l ->> 'id'), '') = '' or coalesce(btrim(l ->> 'words'), '') = ''
         or jsonb_typeof(l -> 'evidence') <> 'array' then
        raise exception 'a report line is {id, words, evidence: [..]}, each filled' using errcode = 'check_violation';
      end if;
      if (l ->> 'id') = any (seen) then
        raise exception 'a report''s lines have different ids: %', l ->> 'id' using errcode = 'check_violation';
      end if;
      seen := seen || (l ->> 'id');
      for ev in select * from jsonb_array_elements_text(l -> 'evidence') loop
        if not exists (
          select 1 from evidence_event e
          where e.id::text = ev and e.tenant_id = new.tenant_id and e.child_id = new.child_id
            and e.confirmed_by is not null and e.observed_at::date <= new.week + days
        ) then
          raise exception 'a line rests only on this child''s confirmed evidence within the report''s period: %', ev
            using errcode = 'check_violation';
        end if;
      end loop;
    end loop;
  end if;
  -- the send: consent on record, and every line approved twice by two people
  if new.sent_at is null or (tg_op = 'UPDATE' and old.sent_at is not null) then
    return new;
  end if;
  if not exists (select 1 from consent_now c where c.tenant_id = new.tenant_id and c.child_id = new.child_id
                 and c.decision = 'given' and c.register_unchanged) then
    raise exception 'a report is sent only when the child''s consent is on record (and the register has not changed since)'
      using errcode = 'check_violation';
  end if;
  if jsonb_array_length(new.lines) = 0 then
    if not exists (
      select 1 from approval_list
      where tenant_id = new.tenant_id and kind = 'parent_note' and target = new.id::text and state = 'approved'
    ) then
      raise exception 'a report reaches a parent after two approvals, by two people' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  for l in select * from jsonb_array_elements(new.lines) loop
    select count(distinct a."by") into who from approval a
    where a.tenant_id = new.tenant_id and a.kind = 'report_line' and a.decision = 'approved'
      and a.target = new.id::text || ':' || (l ->> 'id')
      and a.seq > coalesce((select max(w.seq) from approval w
                            where w.tenant_id = new.tenant_id and w.kind = 'report_line' and w.decision = 'withdrawn'
                              and w.target = new.id::text || ':' || (l ->> 'id')), 0);
    if who < 2 then
      raise exception 'every line of a report needs two approvals, by two people: line % has %', l ->> 'id', who
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists parent_note_sent_when_approved_twice on parent_note;
create trigger parent_note_sent_when_approved_twice before insert or update of lines, sent_at on parent_note
  for each row execute function internal.parent_note_sent_when_approved_twice();

-- 5. A lesson's photos: keys into the private store. ------------------------------------------------------------------

alter table pii.educator_note add column photo_keys text[] not null default '{}';

-- 6. Checks that raise. ------------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from role where label ilike '%teacher%') then
    raise exception 'cp19: a role label still says "teacher"';
  end if;
  if not exists (select from information_schema.columns where table_schema = 'public' and table_name = 'parent_note'
                 and column_name = 'lines') then
    raise exception 'cp19: parent_note.lines was not added';
  end if;
  if not exists (select from information_schema.columns where table_schema = 'pii' and table_name = 'educator_note'
                 and column_name = 'photo_keys') then
    raise exception 'cp19: educator_note.photo_keys was not added';
  end if;
  if exists (select 1 from parent_note where lines <> '[]'::jsonb) then
    raise exception 'cp19: a report already had lines before any were written';
  end if;
end $$;
