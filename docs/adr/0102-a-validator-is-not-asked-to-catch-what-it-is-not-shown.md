# 0102: A validator is not asked to catch what it is not shown

Date: 2026-11-17. Status: accepted for the learning-objective skill (CP-54, #775); rulings A to C below are the orchestrator's to confirm.
Goal: none — CP-54 (issue #775) is scoped in its issue; the goal loop is retired and no goal file covers it. Proved by packages/engine/tests/test_lo_source.py.

## What happened
The learning-objective skill sat at catch 0.306 (bar 0.75) for days while gold was 0.933 and clean 1.0. The writer was
fine. The exam asked a model validator to fail planted answers whose fault was not in what it was given
(tune run 17 Nov 12:34 UTC, `flow_run`): a repeat of an objective that was not in its input (1 of 5 caught), a part of
a list dropped with no note when the standard has no note (1 of 8), an action assumed from a purpose (0 of 6).

## Decision
A fault goes to whoever can see it.
1. **A dropped part is prevented by code.** A list-type source line (label, ":", parts) is split by code into one write
   job a part (`skills/lo_source.parts`; the marks are rows in the skill's `lists.json`). Nothing is dropped, so no note
   is needed. The 16 planted cases moved to `code_cases.json` and are held by `tests/test_lo_source.py`.
2. **A repeat is judged by a reader who is shown the other objective.** Code shortlists the objectives of the same grade
   nearest in wording (`lo_source.nearest`, rare shared words counting for more) and shows them as `nearest`. Code
   itself refuses only the same wording again.
3. **The marked twins are good.** The 28 answers that state their assumption join `clean`.

## Rejected
- **Code decides repeats by word overlap** (the first brief). Measured on the 1,385 reviewed rewrites: only 1 of the 10
  planted repeats is in the same unit as what it repeats, 5 of 10 use a different verb, and their overlap runs 0.17 to
  0.60. A threshold loose enough to catch them refuses the school's own distinct objectives: at 0.8 it refuses "writes
  the number 1" against "writes the number 2", and it reads two Hindi vowel marks as one. The shortlist holds the
  repeated objective for all 10.
- **Lowering the catch bar, or deleting planted cases.** No case is deleted and no bar moves.
- **A `note` field for parts left out** (the v5 draft's standard 11): the split makes it unnecessary.
