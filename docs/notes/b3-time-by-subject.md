# b3-time-by-subject: Time by subject (page charter B3), the engine read and the screen

No migration, no new table. The engine read is CP-41's `POST /timetable/time`, extended (CLAUDE.md rule 10), not a second route.

## Verified

- `/timetable/time` now also gives `weeks` (every week of the range from its Monday, each subject's minutes; an empty week is
  listed empty), `target_share_pct` per subject (the frame rules' share of the standing minutes; null when the rules give the
  subject none: none is invented), `read` (the classes counted) and `may_read` (the classes the person may ask for: a coordinator
  every class with lessons in the range, anyone else the classes she holds). A lesson's minutes count only for a lesson that is
  not fixed. The access rule is the timetable reads' own gate, unchanged.
- Root cause fixed on the way: the standing time joined every teaching fortnight over a day, of any year, so a second year's
  fortnight over the same days doubled it; it now reads only the class's own year (test
  `test_a_teaching_fortnight_of_another_year_over_the_same_days_does_not_count_the_frame_twice`).
- `TEST_DATABASE_URL=… pytest tests/test_tt_time.py` → 13 passed, one of them under `set local role app_engine`.
- Screen `/timetable/time` (`app/(app)/timetable/time/page.tsx`), in the sidebar under Timetable between the Fortnight and
  Materials; `docs/frontend/screens.json` `time` (slice UI-6) and `docs/frontend/wireframes/time.html` (check.mjs: PASS).
- Browser proofs: `apps/web/tests/u93-time-by-subject.spec.ts`, one test per charter line.

## Handoff

- B2's own "This fortnight, lessons by subject" table on `/timetable` still stands; the charter moves it here, so B2's PR removes it
  (and `lib/timetable-subjects.ts`, and the lines of `u79-timetable-wireframes.spec.ts` that read it).
- A subject's colour is one of the school's three looks (`timetable.subject_looks`): subjects of one look share a colour, told
  apart by the word on hover, in the ring's key and in the table.
