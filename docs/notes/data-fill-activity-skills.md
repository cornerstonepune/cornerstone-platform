# data-fill-activity-skills: fill the mapping gaps; what the machine linked is never evidence by itself

Nimish, 14 Nov: fill the remaining activity ↔ skill mapping gaps with model credits; machine rows must not feed rubric
evidence (handoff-2026-11-14-design, Backend: "Marking safety rule").

## Verified
- Live K2 before (curriculum run `chain`, 43558863517, 14 Nov 04:53 UTC): objective → skill 832 of 1082; lesson →
  activity 168 of 538; lesson → planner line 370 of 538; planner line → activity 170 of 375; every one of the 205 unlinked
  lines already answered "none" by the model (13 Nov run 40fd5f32); rubric marks 0; attendance → child 17 of 22.
- The rule was not enforced: `lesson_level._write_one`, `voice_confirm._write` and `voice_confirm.correct` wrote evidence
  on every `activity_skill` row, `source = 'machine'` included, and a lesson took its activity from a planner line the
  model matched (`plan_entry.link_rule = 'model'`) as if a person had chosen it. Objective → skill rows reach no evidence.
- Now: `voice_confirm.CHOSEN_SKILLS` (school's and person's links only) in all three writers; a lesson whose activity is
  only the model's match keeps its marks as observations, writes no evidence and says so (`activity_matched_by_machine`,
  shown on the lesson page). Tests: `test_voice_confirm.py` (4 new); `pytest -q tests/test_voice_confirm.py
  tests/test_lesson_level.py` 36 passed; related set (layout, voice, lesson, k2, chain, plan_match, links) 567 passed;
  `bin/check` 67 passed.

- Fill attempt (14 Nov): `map_lo_skills` run 49404b52 → "0 proposals", ₹0. The code-made objective → skill pairs were
  all applied on 13 Nov (run 63, applied 1349); the 250 left are objectives no single activity ties to one skill, which
  the engine refuses to guess (`map_eval.lo_skill_pairs`). `plan_match` not re-run: no unanswered line is left.

## Handoff
- 250 objectives need a new path (a model proposing objective → skill directly, with its prompt row and eval): a spec
  for Nimish, not built here. 168 lessons have no planner line; 205 lines name no activity on the school's list.
- No schema change. A machine link becomes evidence only once a person sets it: there is still no screen that lets a
  coordinator confirm a machine `activity_skill` row (CP-48 part 3 found none), so those skills wait.
