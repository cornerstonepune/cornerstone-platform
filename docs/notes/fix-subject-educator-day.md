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

- Materials (follow-up): the grant lookup is one function, `educator_gate.held`, used by `k2_day.my_classes` and
  `materials_list.held_classes`. `k2_day.heads_of` gives the lesson heads she holds a class for; `materials_list.read`
  and the reminder inbox (`materials_remind.inbox`, its first-needed day) keep only lines whose source lessons are of
  those heads (`materials_list.HERS`). A hand-added line (no source lesson) stays visible to everyone who holds the class.
  `tests/test_materials_list.py::test_a_subject_educator_gets_only_her_subjects_materials`; materials, timetable, tt_*,
  k2_day and layout tests: 317 passed.

## Handoff

- Not in the core: it fixes a wrong screen, not a privacy or marking harm.
- The stored list is still one per class: a subject educator who sends it sends the class's list. Her view and her
  reminders are her subject's lines only.
