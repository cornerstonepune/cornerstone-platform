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

### A2: G1–G4 activities (no source found)
- Scanned the G1–G4 Planning Sheets, "Curriculum Planning_All Grades" and the syllabus tabs. Their activity-list tabs
  are the SR KG (K2) list copied forward (G3's whole Year column: SR KG, one Nursery); the G1–G4 curriculum tabs are unit
  syllabi without levels; the monthly plans are prose. No G1–G4 activity list with rubric levels exists there; nothing
  was imported. The Google Docs "Cornerstone School Syllabus - G1..G4" and "Hindi syllabus.pdf" were not opened.

### A3: the picture rolls up the chain (branch cp-54-a3-the-picture-rolls-up, after A1)
- Migration `20270130100000_cp54_a3_picture_rolls_up.sql`: `skill.lo_source` (who made the skill → objective link) and the
  `evidence_for` relation (objective → one of the three words) on `objective_statement`. No new table.
- `engine/w3_read/chain_picture.py`: `picture(conn, child)` is a pure function of ring A (nothing stored, so a rebuild is
  a second call); `engine graph --child X --picture` prints it. Evidence reaches an objective from a confirmed written
  answer (item → engine skill → `skill.lo_code`) and from an observation (activity → `activity_objective`, a correction
  replaces its original). Blank, wrong and wrong-with-working are three counts at every level.
- `engine/checks/chain_layers.py` + invariant "every link of the chain is n of n" in `engine audit` (counted for K2 and
  G1–G4; listed with the invariants that await a run, so the suite stays green while `engine audit` stays red until
  track B's placement runs fill the links).
- Proof: `pytest -q tests/test_chain_picture.py` (7 tests).
