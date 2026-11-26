# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 · **By:** Opus, direct (Nimish: "get out of the loop, just get this done")
**Branch:** plan/profile-map-data

## State
- G1–G4 learner-profile mapping is LIVE (written 26 Nov via the Supabase connector, then recorded as migration 20270222090000):
  - 399 objective→skill links for 257 G1–G4 objectives that had none (source 'person'). 25 unsure ones left out (Nimish).
  - skill_profile_group: all 244 skills → one profile group, approver = Nimish (staff 31f56cec…, role founder + profile_approver, no password).
- Verified on live through view objective_profile_group: G1–G4 kind 130 (was 0), capable 1,474, unafraid 424; 1,666 of 1,667 objectives reach a word.
- Drafts were model-made (subagents) and checked in code; 67 of 244 skill groups were marked unsure (mostly motor skills → My feelings and my body; values → Fairness and living together). No educator review yet.
- Mapping Explorer page: https://claude.ai/artifact/8Y939ggPhXLUuBS7p8Fopz (republished from live after this change).

## Next step
1. Merge this PR (CI green); migrate live will no-op (rows already there).
2. The 25 objectives still without a skill: the 244-skill list has no fitting skill (Hindi sandhi, keyboard notes, dyeing, …). Needs new skills or Nimish's call.
3. K2 and K1 are out of this scope (Nimish).
4. PRs #954 / #956 (loop plan for the same work) are superseded by this; close them.

## Don't repeat
- Nimish asked for this work to run directly, without loop tickets/planner/builder sessions. Six sessions stalled on the 150k budget doing process work.
- skill_profile_group.staff_id is NOT NULL: a skill group needs a named approver in staff.
