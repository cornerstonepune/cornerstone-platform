# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 · **By:** Plan (loop plan, Opus) · **Model:** claude-opus-5-5
**Milestone:** profile mapping G1–G4 (ADR 0115) · **Branch:** plan/profile-groups (pushed, no PR yet)

## State
- ADR 0115 written: groups derive from each skill's approved group (table `skill_profile_group`, view `objective_profile_group`);
  one-group index KEPT (assumption recorded in the ADR, against the brief's "drop it"); decider = role `profile_approver`
  granted to Nimish only; no-skill objectives stay on default, skills suggested by existing `engine curriculum propose --kind lo_skill`.
- On this branch, NOT yet run against a test DB: migration `20270218090000_skill_profile_group.sql` (table, view, proposal kind
  `skill_group`, grants, access_table) and config row `profile.skill_bands`. No tickets or seed branches yet. Context ran out.

## Next step (next plan session)
1. Migration: add the `profile_approver` role insert (pattern: 20270207090000_founder_role.sql); config `people.decides` gains
   `"skill_groups": ["profile_approver"]`. Run `bin/testdb fresh …` + engine core tests; add GLOSSARY terms (skill group,
   on default); open the plan PR, `loop ci`, merge.
2. Skill folder `supabase/seed/skills/skill-group/` (copy capability-link's shape; CHOOSE; active:false) + bars
   `skill_bar.skill-group.*` in thresholds.json + draft gold (`marked_by: "draft"`, ≥1 case per group, all kind groups). Flag for Nimish.
3. Tickets (one builder each), seeds `plan/t<N>`:
   a. `engine curriculum profile-check` (w1_bank/profile_check.py, pattern cli_counts.py): skills used by G1–G4 with no approved group;
      objectives reaching no group; on default needing a skill; on default with skills waiting; per group (skill/default split); per word, kind always shown; empty groups.
   b. `learn.decide` kind skill_group: approve writes skill_profile_group, role check via `money_rules.roles_of`. c. web card + VERDICTS in
      library proposals.tsx/actions.ts (S27 frozen: check wireframe first). d. `engine curriculum profile-propose` (pattern
      chain_choose.capability_jobs; active prompt only). e. `engine skill eval --record` → scored.json + CI test: active skill needs a
      passing score for its version and gold; refuses draft gold; `placement` grandfathered. f. chain_picture.py reads the view
      (several groups). g. objective-chain.ts + S35 several groups (wireframe check).
- workflows.json must list every new engine file before its ticket (tests/test_layout.py).

## Don't repeat
- ADR numbers: 0113 and 0114 are taken twice on other branches; 0115 is this one. Don't touch PR #952 or plan/k1-pilot-offers.
- Live counts_toward rows for G1–G4 are all source='machine' (checked 26 Nov), so keeping person rows in the view changes nothing today.
