# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (#952 merged with main) · **By:** Plan (Opus) · **Model:** claude-opus-5-5
**Lanes:** M6 K1 pilot (PR #952, plan/k1-pilot-offers) · profile mapping G1–G4 (ADR 0115, #953 merged)

## State
- K1: PR #952 NOT merged; nothing changed on live. `tests/test_k1_pilot_offers.py` on local DB `k1offers`: 9 passed;
  migration blanked: 8 failed, 1 passed. Nimish decided all of ADR 0113 (skill links, K1 = K2 observed rule, 1 adult).
- Profile mapping: #953 on main (migration `20270219090000_skill_profile_group.sql`, skill `skill-group` v1 inactive,
  32 DRAFT gold cases, GLOSSARY terms). No tickets yet.

## Next step (in order)
1. CI green on #952 → loop:reviewer → `gh pr merge 952 --squash --delete-branch`; confirm `migrate live` + `deploy engine`.
2. K1 attach (ADR 0114 on plan/handoff): `attach.py` in `~/Library/Application Support/Claude/side-session-notes/local_07a3d48e-bf4c-43ef-98fc-95c421cdfa35/`,
   piped to `sudo docker exec -i deploy-engine-1 python -` on ubuntu@3.111.248.87; dry run expects 3 of 8 ok, then `--apply`.
3. Check a rubric on the live site; tick G6.x only as live proves; merge #949 (BLOCKED, cause unchecked).
4. Ticket G6.8: offer-only groups on a head (5 lessons, first on 30 Nov).
5. Profile mapping: tickets a–g per ADR 0115 §Consequence, seed branches `plan/t<N>`.

## Ask Nimish
- Mark the draft gold in `supabase/seed/skills/skill-group/gold.json` (fix `choice`, set `marked_by`), esp. the 12 with a `doubt`.
- After deploy: `engine staff grant <his email> profile_approver --by …` (nobody holds the role yet).

## Don't repeat
- An ADR Goal line naming a PROJECT.md goal must read `Goal: none — proved by …`, or test_promises takes the rest as a path.
- Use a separate test database per session (`create database <name>`, then `bin/testdb fresh`); not `postgres`.
- Main checkout may be on another session's branch with uncommitted work: use a worktree, never switch it.

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
