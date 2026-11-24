# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Planner (K1 at Gurukul) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/k1-gurukul · ADR 0109 applied, ADR 0110 written, #939 seeded

## State
- Checked before touching the seed: with K1 under both campuses in `school.campus_grades`, `people._class_ids` (main and #938) matches two campuses and refuses with "no campus holds grade K1". The seed was **not** changed on main.
- Also found: `school_class_label_key` allows one class of a label per school year, and the import labels a class by its grade, so Gurukul K1 and Neev K1 cannot both exist in one year (ADR 0110).
- #939 written: `enrol class --campus`; refuse in words when two campuses hold the grade, or when the other campus already has that year's class. Seed `plan/t939`, **branched from #938's head** (`t923-people-py-reads-school-campus-`), carries the seed change (K1 at Gurukul too; ASSUMED wording now excludes K1) and an updated `test_enrol_grade.py` (K1 → `--campus Gurukul`). Proven red: 11 fail, 1 passes (existing behaviour); lint clean.
- #940 (`load-k1 --campus`) written then closed: two K1-A classes in one year can't exist, so it isn't needed now.
- PROJECT.md: G6.1–G6.3 ticked; the K1 campus open question is removed; M6 now depends on #939.

## Next step
1. Merge #938, then `loop run-ticket 939` (it merges main into the seed).
2. Then ADR 0108 ticket 4 (K1 form mark → activity_observation + evidence_event); the rubric-words goal from ADR 0109 goes into M6.
3. Still open from the last handoff: the follow-up for "engine enrol k2 (dry run)" wording; flaky #936; PR #931.

## Blocked / open questions (Nimish; block going live, not tickets)
- Radhika's sign-off on the F.N 10 rubric words (`docs/loop/notes/fn10-rubric-draft.md`). Radhika's Children List CSV + email.
- When Neev K1 joins in the same year: how are the two classes called (the class label)? See ADR 0110.

## Don't repeat
- A seed branch built in a scratch worktree still needs the main checkout off `main`, or the guard hook refuses the commit.
- `bin/testdb fresh` needs an empty database; tests need both DATABASE_URL and TEST_DATABASE_URL set to it.
