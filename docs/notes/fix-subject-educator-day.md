# fix-subject-educator-day: a subject educator's Today shows her class, in her subject

## Verified

- `educator.timetable_roles` (supabase/seed/config.json) now names `subject_educator`; the row is not `seed_once`, so the
  next `engine load --settings` brings live across.
- A grant records its subject in `staff_role_grant.subject_code` (FK to `subject`: NUM, ENG, HIN, MUS, GMS...). A lesson's
  head is the timetable's own code (`session.subject_code`: math, phonics, english...). They meet through config only:
  `timetable.heads` (head -> activity groups) and `curriculum.subjects.spellings` (group -> subject code).
  `k2_day.my_classes` gives a class `subjects` (None when any of her grants on it names no subject: the whole class);
  `k2_day.days` keeps only periods whose head teaches one of them (`tt_heads.heads_in`).
- `uv run python -m pytest -q tests/test_k2_day.py tests/test_tt_heads.py tests/test_timetable_go_live.py
  tests/test_materials_list.py tests/test_subject_map.py tests/test_layout.py` against a local Postgres 16 built by
  `bin/testdb schema`: 85 passed. Timetable, tt_*, grants, core budget and seed tests: 189 passed. `bin/check`: 64 passed, 4 skipped.

## Handoff

- Not in the core: it fixes a wrong screen, not a privacy or marking harm.
- `materials_list` reads the same roles row, so a subject educator may now also build and be reminded of her class's
  materials list (whole class), as a class teacher is.
