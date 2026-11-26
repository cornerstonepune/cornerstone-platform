# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (context full; plan PR not opened yet) · **By:** Plan (loop plan, Opus) · **Model:** claude-opus-5-5
**Milestone:** profile mapping G1–G4 (ADR 0115) · **Branch:** plan/profile-groups

## State
- Migration `20270218090000_skill_profile_group.sql` finished: table `skill_profile_group`, view `objective_profile_group`,
  proposal kind `skill_group`, role `profile_approver` (may_grant founder; added to `internal.people_vocabulary` so new
  schools get it). `people.decides.skill_groups = ["profile_approver"]`. Proved on a fresh DB (`bin/testdb fresh` into
  database `pg_profile` on 54329): applies, re-runs clean, view returns 30 rows all origin `default` on the seed.
  `rules.json` and `db/schema.sql` regenerated. Engine core tests green on that DB.
- Skill folder `supabase/seed/skills/skill-group/` (CHOOSE, v1, active:false), 5 bars `skill_bar.skill-group.*`.
  Gold: 32 DRAFT cases covering all 24 groups (every kind group), each `marked_by: "draft"` with a `doubt` line.
- GLOSSARY: profile group, skill group, on default, profile approver.

## Needs Nimish
- Mark the draft gold in `supabase/seed/skills/skill-group/gold.json` (fix `choice`, set `marked_by`), esp. the 12 with a `doubt`.
- After merge and deploy: `engine staff grant <his email> profile_approver --by …` (nobody holds the role yet).

## Next step
1. Rerun engine core + lint on the fresh DB (last full run: 188 pass, 1 fail = rules.json drift, since regenerated;
   test_skills + test_rules then 55 pass; the final full rerun's result was not read). Open the plan PR, `loop ci`, merge.
2. Tickets a–g (see ADR 0115 §Consequence and the issue list) with seed branches `plan/t<N>`.

## Don't repeat
- ADR numbers 0113/0114 are taken twice on other branches. Don't touch PR #952 or plan/k1-pilot-offers.
- Use a separate test database (not `postgres`, which other sessions use): `create database pg_profile`, then `bin/testdb fresh`.
