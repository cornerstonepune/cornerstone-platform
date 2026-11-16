-- CP-64: a coordinator's yes to a batch of what the machine made (Nimish, 16 Nov: the coordinators check the machine-made rows weekly).
-- One approval row per confirmed batch (a grade and subject): kind `curriculum_link`, target '<grade>~<subject>', decision approved,
-- detail the counts of what moved from machine to person. `approval.kind` is a rule on the column, so the kind is added to the rule; its
-- decisions are the default branch of approval_decision_check (approved, sent_back, withdrawn). Written to run twice.
alter table approval drop constraint if exists approval_kind_check;
alter table approval add constraint approval_kind_check check (kind in (
  'materials_ack', 'fortnight', 'timetable', 'timetable_live', 'timetable_clash', 'week', 'skill_level', 'question_type',
  'parent_note', 'sheet', 'skill_prerequisite', 'item', 'calibration', 'class_card', 'report_line', 'curriculum_link'));

-- A yes to a batch is one person's (the coordinator's own stamp, as a question type's, a materials list's and a report line's are), so the
-- check that wants a first approval on the row names this kind among them. Each confirmation is its own target (the batch's id ends it), so
-- the same coordinator may confirm the same grade and subject again next week.
CREATE OR REPLACE FUNCTION internal.approval_checked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when 'curriculum_link' then new."by"
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
end $function$;
