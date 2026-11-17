-- CP-71 (Phase 1 of the timetable builder, specs/CP-71/spec.md S2): the one schema change.
-- No new table. Each column is argued in the spec against docs/data-model.md; the last block adds the Grade 1 to 4 heads as config rows.

-- 1. A day shape has dates: a year holds two to three of them (Done when 10: a layout with a valid_to is not offered after it).
alter table period add column valid_from date, add column valid_to date;
alter table period add constraint period_valid_order_check check (valid_to is null or valid_from is null or valid_to >= valid_from);

-- Two shapes may share a start time with a different length, so the start time alone no longer names a row.
alter table period drop constraint period_tenant_id_grade_code_starts_at_key;
alter table period add constraint period_tenant_id_grade_code_starts_at_key
  unique nulls not distinct (tenant_id, grade_code, starts_at, valid_from);

-- 2. A rule says who made it, whom it is about, and how firm it is.
alter table timetable_rule
  add column source text not null default 'person' check (source in ('machine', 'person')),
  add column staff_id uuid references staff (id),
  add column weight int check (weight is null or weight > 0);

alter table timetable_rule alter column school_class_id drop not null;

alter table timetable_rule drop constraint timetable_rule_kind_check;
alter table timetable_rule add constraint timetable_rule_kind_check check (kind in ('frame', 'block', 'limit', 'away'));
alter table timetable_rule drop constraint timetable_rule_span_check;
alter table timetable_rule add constraint timetable_rule_span_check check (span in ('week', 'fortnight', 'day'));

-- 3. The row check: the old three kinds as they were (plus: no person, and a frame is never a "try to"), and the new one.
--    away: an educator is not in school on a weekday of week A or B, or on a date, or in one period of either, and why.
alter table timetable_rule drop constraint timetable_rule_check;
alter table timetable_rule add constraint timetable_rule_check check (case kind
  when 'frame' then school_class_id is not null and staff_id is null and weight is null
    and period_id is not null and week_code is not null and weekday is not null and cell is not null
    and text is not null and (cell = 'empty' or btrim(text) <> '') and valid_from is not null
    and (valid_to is null or valid_to >= valid_from)
    and on_date is null and reason is null and span is null and fewest is null and most is null
  when 'block' then school_class_id is not null and staff_id is null
    and (on_date is null) <> (weekday is null) and (week_code is null or weekday is not null)
    and btrim(coalesce(reason, '')) <> '' and cell is null and subject_code is null and text is null
    and span is null and fewest is null and most is null and valid_from is null and valid_to is null
  when 'limit' then school_class_id is not null and staff_id is null
    and btrim(coalesce(subject_code, '')) <> '' and span is not null and (fewest is not null or most is not null)
    and (fewest is null or most is null or fewest <= most) and period_id is null and week_code is null
    and weekday is null and on_date is null and cell is null and text is null and reason is null
    and valid_from is null and valid_to is null
  when 'away' then school_class_id is null and staff_id is not null
    and (on_date is null) <> (weekday is null) and (week_code is null or weekday is not null)
    and btrim(coalesce(reason, '')) <> '' and cell is null and subject_code is null and text is null
    and span is null and fewest is null and most is null and valid_from is null and valid_to is null
end);

create unique index timetable_rule_away_once on timetable_rule (
  staff_id, coalesce(on_date, '0001-01-01'::date), coalesce(weekday, 0), coalesce(week_code, ''),
  coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid)) where kind = 'away';

-- The "who is it about" read of a rule: an educator's away rows.
create index timetable_rule_away_staff on timetable_rule (staff_id) where kind = 'away';


-- 4. A lesson's head for Grades 1 to 4 is the subject table's code (specs/CP-71/spec.md S1): rows of two settings, never code.
--    The seed loader never overwrites a live row (`seed_once`), so this adds the heads and looks live does not hold yet and leaves
--    every one the school already has (or has changed) alone. Written to run twice.
update config c
set value = c.value || coalesce((
      select jsonb_agg(h order by o) from jsonb_array_elements('[{"code": "NUM", "label": "Maths", "groups": ["Numeracy", "Maths", "Block Room"]}, {"code": "ENG", "label": "English", "groups": ["Literacy", "Literacy - English", "English", "Phonics", "Rhymes & Songs", "Story Telling"]}, {"code": "HIN", "label": "Hindi", "groups": ["Literacy - Hindi", "Hindi"]}, {"code": "MAR", "label": "Marathi", "groups": ["Literacy - Marathi"]}, {"code": "SCI", "label": "Science", "groups": ["Science", "Science & Geo", "BOB"]}, {"code": "GP", "label": "Global perspectives", "groups": ["Global perspectives"]}, {"code": "HSC", "label": "Home Science", "groups": ["Home Science"]}, {"code": "COM", "label": "Primary Computing", "groups": ["Primary Computing"]}, {"code": "ART", "label": "Visual Arts", "groups": ["Visual Arts", "Arts & Crafts", "Clay", "Art"]}, {"code": "MUS", "label": "Music", "groups": ["Music", "Dance"]}, {"code": "FMS", "label": "Fine motor skills", "groups": ["FMS"]}, {"code": "GMS", "label": "Gross motor skills", "groups": ["GMS"]}, {"code": "PE", "label": "Physical education", "groups": []}]'::jsonb) with ordinality t (h, o)
      where not exists (select 1 from jsonb_array_elements(c.value) e where e ->> 'code' = h ->> 'code')), '[]'::jsonb),
    updated_at = now()
where c.key = 'timetable.heads' and jsonb_typeof(c.value) = 'array';

update config
set value = '{"NUM": "numeracy", "ENG": "language", "HIN": "language2", "MAR": "language2", "SCI": "world", "GP": "world", "HSC": "life", "COM": "world", "ART": "arts", "MUS": "music", "FMS": "life", "GMS": "movement", "PE": "movement"}'::jsonb || value, updated_at = now()
where key = 'timetable.subject_looks' and jsonb_typeof(value) = 'object';
