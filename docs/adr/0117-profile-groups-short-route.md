# 0117 — G1–G4 profile groups: the short route (one list Nimish approves in chat, then seeded)

Date: 2026-11-26. Status: accepted (Nimish, 26 Nov 2026: chose the short route over ADR 0116's seven tickets).
Supersedes: ADR 0116's ticket plan (no S27/S35 redraw, no approval screen, no propose/decide queue, no activation guard now).
Goal: none — the M7 short-route ticket is not written yet; proved when `engine curriculum profile-check` on a seeded test database shows the word kind above 0.

## Context
ADR 0115 (merged) built `skill_profile_group` (one approved group per registry skill), the view
`objective_profile_group` and the `skill-group` skill with 32 gold cases (Nimish: "okay to all", 26 Nov). ADR 0116 then
planned seven tickets (propose, decide, guard, two redrawn screens). Six sessions stalled on that plan; no group reached
an objective. On 26 Nov Nimish chose the short route.

## Decision
1. **One list, approved in chat.** The planner drafts one group for every registry skill G1–G4 objectives use, with the
   same 24 options and "I can" lines as `skill-group/gold.json`, keeping its 32 choices. Nimish approves the list in chat;
   his words go in the commit and in the data file's note. That is the approval ADR 0115 asks for.
2. **Seeded, not proposed.** The approved list is a seed file written into `skill_profile_group` (`source='person'`,
   no proposal row). No model call, no queue, no screen.
3. **Readers use the view.** The child's report (`w3_read/chain_picture.py`, `apps/web/lib/objective-chain.ts`) reads an
   objective's groups from `objective_profile_group`: every group its skills reach; the subject default only when it has
   no skill with an approved group (ADR 0115 rule 1, unchanged).
4. **One count command.** `engine curriculum profile-check` prints, per grade G1–G4, how many objectives reach capable,
   kind and unafraid, and each group.
5. **Still one group per skill** (ADR 0115's primary key). An objective reaches several groups through several skills.
   A skill that needs two groups is a later ADR (primary key change), not this one.
6. Scope stays G1–G4. K1/K2 and the K1 pilot (ADR 0113/0114) are untouched.

## Consequences
- ADR 0116's contracts for the proposal shape, decide action and activation guard are not built; the `profile_approver`
  role and `skill_group` proposal kind from ADR 0115 stay for later changes to the list.
- `packages/engine/tests/profile_rows.py` (from ADR 0116's PR) stays as shared test rows.
- Changing a skill's group later = edit the seed file with Nimish's words in the commit, until a screen exists.
