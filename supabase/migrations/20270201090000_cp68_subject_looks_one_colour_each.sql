-- CP-68: one fixed colour per subject. `timetable.subject_looks` names a look for every lesson head the school has (the looks are
-- the design tokens `subject-<look>`: numeracy, language, language2, arts, music, movement, world, life), where before only maths and
-- the English heads had one and everything else was drawn as arts. The seed loader never overwrites a live row (`seed_once`), so this
-- brings live's row across, and only while it is still exactly what the seed last wrote: a look the school has changed is left alone.
-- No table, column or function. Written to run twice.

update config
set value = '{"math": "numeracy", "english": "language", "phonics": "language", "reading": "language", "story": "language",
              "rhymes": "language", "rhymes_dance": "language", "hindi": "language2", "art": "arts", "clay": "arts",
              "memory_drawing": "arts", "music": "music", "music_guest": "music", "pe": "movement",
              "general_awareness": "world", "projects": "world", "circle_time": "world", "practical_life": "life",
              "fine_motor": "life", "me_time": "life", "routine": "life", "cleanup": "life"}'::jsonb,
    updated_at = now()
where key = 'timetable.subject_looks'
  and value = '{"math": "numeracy", "english": "language", "hindi": "language", "phonics": "language",
                "reading": "language", "story": "language", "rhymes": "language", "rhymes_dance": "language"}'::jsonb;
