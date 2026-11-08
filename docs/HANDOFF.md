# Handoff: where things stand
Under 50 lines. Rewritten at the end of every session; the session-start hook shows the top lines.

## Live
- Main is green (ci, athena, migrate live, deploy engine on 6653a47f). Live database has all 130 migrations.
- Athena 2.13.0 here; `athena health` fails one check: Canny missing (~/.athena/bin/canny-hook), so no done-gate,
  secret or test-removal guard runs. teacher-os is still on Athena 2.6.0.

## Start here
- `docs/backend-plan.md` is the one list of what remains: scopes CP-1 to CP-19, their order and goalposts. It holds no
  status. Status is `athena status`, `specs/<ID>/`, and the nightly run. Backend done = all 19 finished + LIVE proofs pass.
- Drafted, not locked: [CP-1](https://github.com/cornerstonepune/cornerstone-platform/issues/448) (people),
  [CP-2](https://github.com/cornerstonepune/cornerstone-platform/issues/449) (who is asking). Next: EGM design review of
  each, then Nimish adds `scope-locked`. `id_prefix` is `CP` in .claude/athena/config.json.

- Canny: missing because the env setup script could not clone private athena-ops (no ~/.athena/ops), so tools.sh never
  ran. Env setup script now installs Canny inline at the pinned commit f2c5e53 (saved 2026-11-08). UNPROVEN until a fresh
  container starts: first check of the next session is `athena health` (Canny line must PASS). aislop and graphify are
  also missing for the same reason. The Athena guard blocks agents from writing ~/.athena; do not work around it.
- teacher-os is on Athena 2.13.0 (PR #49 merged).

## In flight
- Backend reconciliation of Teacher OS Roadmap v23 against code and live data (2026-11-08):
  https://claude.ai/code/artifact/10633d1c-438c-4f4f-8341-3ae82770e1ae
  Of the 26 build tasks: 0 done, 12 mostly, 10 partly, 4 not started (M0-07, M0-08, M1-12, M1-13). No proof receipts.
- Hard facts from live (read-only, 2026-11-08): all 310 RLS policies are `using (true)`; activity_observation 0;
  approval 0; consent 0; materials_list 0; timetable_block 0; skill_link 0; skill_prerequisite 282, all proposed;
  plan_entry with activity 40/375; parent_note sent 0/42; staff 3 vs 7 on the sign-in list.
- Roadmap task IDs drifted from repo labels: repo M1-12a..r = curriculum drafting campaign; repo M1-13 = curriculum
  screens; M1-04b screens were built under M1-17.

## Next
- Nimish approves the ten work packages on the reconciliation page as "backend done" for K2, then each becomes a
  locked Athena scope. Start with package 1 (access by role, M0-08): the role-based menu depends on it.
- Update teacher-os roadmap.toml to these statuses (needs write access to teacher-os).
- Frontend revamp waits until the backend packages are proved.

## Blocked (and the decision needed)
- Access grid for 13 roles (Nimish). Lowered M1-05 bars: amend roadmap or keep open. Staff scope 3 vs 7.
- Sarvam "no retention" in writing (blocks real voice notes). Merge #413 (FET). One model K2 activity page.
- Canny install comes from athena-ops harness setup, not this repo.
