-- CP-79 (#896, Money MM-3): a claim is approved or sent back by a person, which is an `approval` row of kind `expense` (target: the claim's id); it is
-- paid by a person, which is when it was paid, how and the reference, on the claim. Like a subject's order (`objective_order`), a claim's approval is one
-- person's own stamp, so the check that wants a first approval on a row names this kind with those. CP-74's function, with the one line added.
alter table approval drop constraint if exists approval_kind_check;
alter table approval add constraint approval_kind_check check (kind in (
  'materials_ack', 'fortnight', 'timetable', 'timetable_live', 'timetable_clash', 'week', 'skill_level', 'question_type',
  'parent_note', 'sheet', 'skill_prerequisite', 'item', 'calibration', 'class_card', 'report_line', 'curriculum_link',
  'objective_order', 'expense'));

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
    when 'objective_order' then new."by"
    when 'expense' then new."by"
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

alter table expense add column paid_on date, add column payment_mode text, add column payment_ref text, add column paid_by uuid references staff(id);
alter table expense add constraint expense_paid_check check ((paid_on is null) = (payment_ref is null) and (paid_on is null) = (paid_by is null));
comment on column expense.paid_on is 'When the claim was paid (CP-79); with the mode, the reference and who paid. An approval is an approval row, a payment is this.';

drop trigger if exists expense_change_kept on expense;
create trigger expense_change_kept after insert or update on expense
  for each row execute function internal.change_kept('id', 'amount', 'spent_on', 'vendor', 'category', 'status', 'reason', 'paid_on', 'payment_ref');

select internal.apply_conventions();
