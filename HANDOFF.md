# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (context full; #956 green but merge refused; #954 needs a handoff line) · **By:** coordinator (loop run, Opus) · **Model:** claude-opus-5-5
**Milestone:** M7 — G1–G4 profile groups (ADR 0115, 0116) · **Branch:** plan/profile-tickets (PR #956, CI green, NOT merged)

## State
- On plan/profile-tickets: ADR 0116 (M7, the seven tickets, the skill_group proposal shape, undecided rule, approve =
  upsert into skill_profile_group, profile-check classes, scored.json + activation guard, S27/S35 must be redrawn);
  PROJECT.md M7 goals G7.1–G7.7; `packages/engine/tests/profile_rows.py` (shared test rows for every M7 seed).
- profile_rows.py proven (every helper, against pg_profile): `a_staff` runs `internal.people_vocabulary` before a grant;
  `scope_to_test_band` adds the T9 grade row. Run tests with TEST_DATABASE_URL=…54329/pg_profile (.env names `postgres`,
  which lacks the ADR 0115 migration).
- No issues created, no seed branches yet. Wireframes S27/S35 not drawn yet.

## Next step
1. #956 (this branch): CI green, but `gh pr merge 956 --squash` said requirements not met (cause unchecked: run
   `gh pr view 956 --json mergeStateStatus,reviewDecision`). Fix that, merge.
2. #954 (plan/skill-group-gold-marks, gold "okay to all"): loop-guard RED only for "HANDOFF.md was not updated". After
   #956 merges: merge origin/main into it in a worktree (never switch the main checkout), touch HANDOFF.md, push, `loop ci 954`, merge.
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

## K1 lane (other session; folded from main when #952 merged)
- #952 merged. Next there: confirm `migrate live` + `deploy engine`; K1 attach (ADR 0114 on plan/handoff, attach.py in
  side-session-notes/local_07a3d48e…); check a rubric live, tick G6.x only as live proves; #949 BLOCKED; ticket G6.8.
- `nightly` on main failed 25 and 26 Nov (cause unchecked).

## Needs Nimish
- After deploy: `engine staff grant <email> profile_approver` (nobody holds it yet). Gold marks done (#954).
- Approve the redrawn S27 and S35 once drawn.

## Don't repeat
- Don't touch plan/k1-pilot-offers. Main checkout may be on another session's branch: use a worktree, never switch it. ADR 0116 is the next free number (0113/0114 are taken twice elsewhere).
- Use database `pg_profile` on 54329, not `postgres`.
