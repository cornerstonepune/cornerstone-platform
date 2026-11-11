-- The timetable grid drew every subject as arts: `timetable.subject_looks` was seeded with the keys NUM and ENG, but the
-- timetable's own subject codes (`session.subject_code`, `timetable_rule.subject_code`) are lowercase (math, english,
-- hindi, ...). The seed now uses them. The seed loader never overwrites a live row (`seed_once`), so this brings live's row
-- across, and only while it is still exactly what the seed first wrote: a look the school has changed is left alone.
-- No table, column or function. Written to run twice.

update config
set value = '{"math": "numeracy", "english": "language", "hindi": "language", "phonics": "language",
              "reading": "language", "story": "language", "rhymes": "language", "rhymes_dance": "language"}'::jsonb,
    updated_at = now()
where key = 'timetable.subject_looks'
  and value = '{"NUM": "numeracy", "ENG": "language"}'::jsonb;
