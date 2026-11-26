# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (context full; no PR opened; ADR 0116 goal line and profile_rows.py format fixed; bin/check green) · **By:** Plan (loop plan, Opus) · **Model:** claude-opus-5-5
**Milestone:** M7 — G1–G4 profile groups (ADR 0115, 0116) · **Branch:** plan/profile-tickets (pushed, no PR)

## State
- On plan/profile-tickets: ADR 0116 (M7, the seven tickets, the skill_group proposal shape, undecided rule, approve =
  upsert into skill_profile_group, profile-check classes, scored.json + activation guard, S27/S35 must be redrawn);
  PROJECT.md M7 goals G7.1–G7.7; `packages/engine/tests/profile_rows.py` (shared test rows for every M7 seed).
- profile_rows.py is NOT yet proven: `a_staff(..., roles=["profile_approver"])` fails with FK
  staff_role_grant_tenant_id_role_code_fkey — the test tenant has no `profile_approver` role row. Fix: call
  `select internal.people_vocabulary(%s)` (t) in `a_staff` before granting, then re-run the probe below.
- No issues created, no seed branches yet. Wireframes S27/S35 not drawn yet.

## Next step
1. Fix and prove profile_rows.py (temporary `tests/test_zz_probe.py`; run pytest with
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/pg_profile; `python -c` can't import `tests`).
2. Open the PR from plan/profile-tickets (touches PROJECT.md → ADR 0116 is in it), `loop ci`, merge.
3. Issues + seeds `plan/t<N>`, in order a, b, d, e, f, per ADR 0116. Files: a `engine/w1_bank/profile_check.py`
   (`counts`, `lines`, command `curriculum profile-check`); b `engine/w1_bank/learn.py` (VERDICTS gains
   `skill_group: (approve, reject)`; role check via `money_rules.roles_of` vs `people.decides.skill_groups`);
   d `engine/w1_bank/profile_propose.py` (reuse `chain_choose._groups`, `chain_draft._capability_of_skill`,
   `machines.choose`; refuses when SKILL.md not active); e `engine/checks/cli_skill.py` `--record` +
   `core/skill_spec.activation_faults`; f `engine/w3_read/chain_picture.py` reads `objective_profile_group`.
   Seeds add the import to `engine/cli.py` and the file to workflows.json N1 (a next to cli_chain, d at the list end,
   to avoid merge conflicts); add one test per ticket to tests/core.txt (check test_core_budget). Test scope via
   `profile_rows.scope_to_test_band` (band T9) so seeded G1–G4 rows don't count. No blocked-by edges among a,b,d,e,f.
4. Redraw S27 (library proposals with a skill_group card: skill, proposed group + its "I can", reason, approve/reject)
   and S35 (an objective's several groups with origin skill/default) on a plan branch; c and g wait for approval.

## Needs Nimish
- Mark the draft gold in `supabase/seed/skills/skill-group/gold.json`; then `engine staff grant <email> profile_approver`.
- Approve the redrawn S27 and S35 once drawn.

## Don't repeat
- Don't touch PR #952 or plan/k1-pilot-offers. ADR 0116 is the next free number (0113/0114 are taken twice elsewhere).
- Use database `pg_profile` on 54329, not `postgres`.
