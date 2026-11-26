# 0113 — G1–G4 objectives reach capable, kind and unafraid through their skills

Date: 2026-11-26. Status: accepted (Nimish, 26 Nov 2026: "Yes, through skills").
Goal: none yet — proved when the mapping tickets' check command shows every G1–G4 objective with a skill reaching a
group, and kind > 0.

## Context
Live data on 26 Nov (docs/loop/notes/mapping-explorer.md): no objective reaches "kind" (all 7 kind groups empty),
16 of 24 groups are empty, 527 character/routine objectives reach no group, and every Science and Global
Perspectives objective counts toward "Changing my mind" by the config default `lo.capability_default`
(supabase/seed/config.json). The profile report reads objective → group directly (`objective_statement`,
relation `counts_toward`, framework `CS-PROFILE`, one group per objective by a unique index); skills only shortlist
groups for the `capability-link` step. Nimish's understanding of the agreed design was objective → skill → group.

## Decision
- Scope: grades G1 to G4. K2 and K1 are out of this decision.
- A G1–G4 objective's profile group comes from its registry skills: each skill (~244) is mapped to a group once, and
  objectives inherit. A behavioural skill maps to one of the groups whose words include kind.
- Opus (`claude-opus-5-5`) PROPOSES a group and a reason per skill, from a seeded, versioned prompt that is scored with
  `engine eval` against a person-marked gold set before it is active. A person approves each proposal; the model never
  writes a mapping. Nothing is auto-applied: a wrong mapping changes the profile reports parents read.
- Every number (counts per issue class) is computed by code, never by the model.

## Open, for the planner (decide in `loop plan`, ask Nimish only if it is a product call)
- Where the skill → group link lives today (`chain_draft.capability` uses one) and how full it is.
- An objective with skills in two groups: derive all its groups, or one primary? The unique index allows one today;
  changing that is a migration.
- G1–G4 objectives with no skill (447 across all grades) reach nothing until given a skill: a separate proposal job.
- Who approves (today only a coordinator edits the curriculum) and whether the library page's proposals queue
  (`curriculum_proposal` + `decideProposal`) carries the new kind.

## Consequence
The SCI/GP → "Changing my mind" default stops deciding G1–G4 groups once skills do. Objectives without a skill get
no group until fixed, which the check command shows as a count, not a silence.
