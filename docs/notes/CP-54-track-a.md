# CP-54 track A: the chain's schema and roll-up (issue #775)

Track A is the only session writing migrations for CP-54. Packages: A1 subjects and columns, A2 G1–G4 activities,
A3 the child's picture rolls up the chain.

## Verified

### A1: one subject list (branch cp-54-a1-one-subject-list)
- Migration `20270130090000_cp54_a1_one_subject_list.sql`: `learning_objective.subject_code/topic_code/kind/stage/source_text`,
  `activity.subject_code`, `skill.lo_code`, with foreign keys. No new table.
- Seed: ten new `subject` rows (`supabase/seed/subjects.json`); the spelling map, routines, character areas and the
  placement list are the one config key `curriculum.subjects` (`supabase/seed/config.json`).
- `engine/core/subject_map.py` applies it on every deploy (`engine load --settings`) and at the end of a K2 upload; a
  spelling in none of the four lists raises `UnknownSubject` and fails the load.
- Proof: `cd packages/engine && pytest -q tests/test_subject_map.py` (6 tests).
- Decision for Nimish to confirm: K2 "Science & Geo" maps to Science (SCI); "Art" and "Clay" to the one Arts subject (ART),
  as does G3–G4 "Visual Arts".

## Handoff
- Placement list (left for track B, never guessed): BOB, PLS, I & D, VE, Block Room, Dance, Montessori Hr, Sensory,
  Sensomotoric, and K2's one activity with a blank strand. Routines (kind `routine`): Routines, Circle Time, Assembly.
  Character areas (kind `character`): Empathy & Happiness, Curiosity, Critical Thinking, Expression, Creativity.
