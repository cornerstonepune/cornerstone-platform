# 0115 — G1–G4 profile groups come from each skill's approved group; Nimish alone approves

Date: 2026-11-26. Status: accepted (Nimish, 26 Nov 2026). Supersedes the unmerged copy on `plan/mapping-explorer`
(numbered 0113, then 0114; both numbers are taken on other branches). Goal: none yet — proved when `engine curriculum
profile-check` shows the word kind above 0 and the unmapped counts falling as proposals are approved.

## Context
Accepted already (Nimish, 26 Nov): a G1–G4 objective's capability-profile group comes through its registry skills; a
model only proposes; a person approves; code computes every count. Live, read-only, 26 Nov: 1,667 live G1–G4 objectives;
all 1,569 grouped ones sit on their subject default (`lo.capability_default`), every row `source='machine'`; 98 reach no
group (97 routine, 1 character); 282 have no registry skill (272 academic); 123 registry skills are used by G1–G4
objectives; no skill→group store exists; no group of the word kind holds an objective.

## Decision (Nimish's three answers of 26 Nov, on top of the accepted decision)
1. **An objective counts toward every group its skills reach.** Built as a derivation, not copies: a new table
   `skill_profile_group` (one approved group per registry skill, `source='person'`, naming its proposal and approver) and a
   view `objective_profile_group` (each objective's groups: from its skills' approved groups for bands in the setting
   `profile.skill_bands` = G1–G4, origin `skill`; else its own `counts_toward` row, origin `default`). An objective's own row
   with `source='person'` is always kept beside its skills' groups (a person's edit is never overridden by derived data).
   Assumption, recorded unattended: the one-group index `objective_statement_one_capability` STAYS. The coordinator's
   brief said to drop it; dropping it is only needed if several groups were copied into `objective_statement`, and copies
   would have to be rewritten on every approval and revert. The view gives several groups with nothing to keep in sync.
   Overturn by asking: if Nimish wants copies, a migration drops the index and writes `counts_toward` rows instead.
2. **Only Nimish approves skill→group proposals.** New `curriculum_proposal` kind `skill_group`, decided in the existing
   queue (`learn.decide`, the library page's `decideProposal`), verdicts approve / reject. The decider is a role, not an
   email in git: a seeded role `profile_approver`, granted to Nimish alone with `engine staff grant <email>
   profile_approver --by …`, and `people.decides.skill_groups = ["profile_approver"]`. The engine checks the role
   (`money_rules.roles_of`) before it writes; the coordinator's "may take any decision" does not reach this kind.
3. **An objective with no skill keeps its subject default group until it gets a skill**, counted by the check as
   "on default, needs a skill". Suggesting skills for them is the existing job `engine curriculum propose --kind lo_skill`
   (lo_match.py), not a new one.

## How the proposal is made
- Reuse the CP-54 skill harness: a new CHOOSE skill `supabase/seed/skills/skill-group/` (input: the registry skill's code,
  name, description, subject and grades; options: the groups under the capabilities the spine reaches from it, else every
  group; output: one group and a reason). Scored by `engine skill eval skill-group` against bars `skill_bar.skill-group.*`.
- Gold: drafted by the planner from each group's "I can" line, at least one case per group and every kind group, each case
  `marked_by: "draft"`. Nimish corrects and marks them; an eval refuses to record a score while any case is a draft.
- A version is made active only by `active: true` in its SKILL.md, and CI refuses an active skill without a recorded,
  passing score for that version and that gold (`scored.json` in the folder, written by `engine skill eval --record`).
  `placement` (active before this rule) is grandfathered by name.
- `engine curriculum profile-propose` writes `needs_person` proposals only, using the active prompt (none active: it refuses).

## Consequence
Readers change: `w3_read/chain_picture.py` and `apps/web/lib/objective-chain.ts` read `objective_profile_group` and handle
several groups (evidence counts in full for each, as words already do). The library proposals card gains a skill_group card
on frozen S27; the S35 objective page lists several groups: both need a wireframe check before their tickets run.
