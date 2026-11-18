-- CP-74 (#867, specs/CP-74/spec.md; design D2, F2): a lesson's objective, who chose it, and the order objectives are taught in.
-- No new table (docs/data-model.md). Each column is argued in the spec:
--   session.lo_code          a lesson's objective exists nowhere; an activity cannot stand in (a Grade 1 to 4 lesson may have an objective
--                            and no activity).
--   session.source           `machine` or `person`, on the row a later job would overwrite: the suggestion job writes only `machine` rows.
--                            Every lesson there today was made by code (publish, go-live, the K2 loader), so the default is `machine`; a
--                            person's choice through the engine writes `person`.
--   learning_objective.ord   the teaching order inside a grade and subject; `topic.ord` cannot serve while no objective has a topic.
-- A coordinator's yes to a subject's order is an approval row (kind `objective_order`, target '<grade>~<subject>'): a rule on the
-- existing column, as CP-64 added `curriculum_link`. Until that row exists the picker shows the whole subject (the founder's fallback).

alter table session add column if not exists lo_code text;
alter table session add column if not exists source text not null default 'machine';
do $$
begin
  if not exists (select from pg_constraint where conname = 'session_source_check') then
    alter table session add constraint session_source_check check (source in ('machine', 'person'));
  end if;
  if not exists (select from pg_constraint where conname = 'session_lo_code_fk') then
    alter table session add constraint session_lo_code_fk foreign key (tenant_id, lo_code)
      references learning_objective (tenant_id, code);
  end if;
end $$;
create index if not exists session_lo_code_idx on session (school_class_id, lo_code) where lo_code is not null;
comment on column session.lo_code is 'The one objective this lesson is mainly about (CP-74); others are reached through its activity''s links.';
comment on column session.source is 'Who chose the lesson''s objective and activity: machine (the suggestion job, publish) or person (CP-74).';

alter table learning_objective add column if not exists ord integer;
comment on column learning_objective.ord is
  'Teaching order inside a grade and subject (CP-74). Seeded once from the source order (machine-made); a unit''s order is the smallest ord it holds.';

-- Seeded once, from the order the school's sources listed things: within a grade and subject, units by the smallest source number they hold
-- (a unit with none, after them), then four-digit codes by number, each N or M code at the end of its own unit. Steps of 10 leave room to
-- move one objective without renumbering. Only rows with no order yet, so a second run changes nothing.
with numbered as (
  select tenant_id, code, band, subject_code, unit,
         (substring(code from '^LO-[A-Z0-9]+-([0-9]{4})'))::int as n
  from learning_objective
), units as (
  select tenant_id, band, subject_code, unit, min(n) as first_n, min(code) as first_code
  from numbered group by 1, 2, 3, 4
), ranked as (
  select o.tenant_id, o.code,
         row_number() over (
           partition by o.tenant_id, o.band, o.subject_code
           order by u.first_n nulls last, u.first_code, o.n nulls last, o.code
         ) * 10 as ord
  from numbered o
  join units u on (u.tenant_id, u.band, u.unit) = (o.tenant_id, o.band, o.unit)
              and u.subject_code is not distinct from o.subject_code
)
update learning_objective l set ord = r.ord
from ranked r
where (l.tenant_id, l.code) = (r.tenant_id, r.code) and l.ord is null;

alter table approval drop constraint if exists approval_kind_check;
alter table approval add constraint approval_kind_check check (kind in (
  'materials_ack', 'fortnight', 'timetable', 'timetable_live', 'timetable_clash', 'week', 'skill_level', 'question_type',
  'parent_note', 'sheet', 'skill_prerequisite', 'item', 'calibration', 'class_card', 'report_line', 'curriculum_link',
  'objective_order'));

-- A yes to a subject's order is one coordinator's own stamp (as `curriculum_link` is), so the check that wants a first approval on the
-- row names this kind among them. CP-64's function, with the one line added.
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

-- A coordinator's reorder is an edit like any other: the one history log watches `ord` from here on (CP-70's list, plus ord).
drop trigger learning_objective_change_kept on learning_objective;
create trigger learning_objective_change_kept after update on learning_objective
  for each row execute function internal.change_kept('code', 'subject', 'subject_code', 'unit', 'title', 'band', 'also_bands', 'ord');

-- CP-75 (#868): a fourth word for how a solver run ended. `discarded`: the solver gave an answer and the checker threw it away because it
-- broke a Must rule; nothing was written. A rule on the existing column (docs/data-model.md: a short fixed list is a check).
alter table timetable_run drop constraint if exists timetable_run_outcome_check;
alter table timetable_run add constraint timetable_run_outcome_check
  check (outcome in ('placed', 'unmeetable', 'not_found_in_time', 'discarded'));
