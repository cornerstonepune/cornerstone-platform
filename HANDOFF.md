# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~10:20 IST) · **By:** side session (finish K1 release) · **Model:** claude-sonnet-5-5
**Milestone:** M6 K1 pilot (presentation TODAY) · **Branch:** plan/k1-pilot-offers (PR #952)

## State
- PR #952 review of 8b5cf1568: FAIL. DO NOT MERGE. Findings: `~/Library/Application Support/Claude/side-session-notes/local_07a3d48e-bf4c-43ef-98fc-95c421cdfa35/review-pr952.md`.
- Nothing changed on live. Server reached read-only; temp key deleted. Today's rhyme (F001) still has no activity.
- Decision: ADR 0113 "Review, 26 Nov". Only done so far: new test `test_no_head_comes_to_teach_a_new_subject`, proved RED.
- Live: all 6 F00x activities and 6 skills exist; K2 has no `other` lessons (K1 3); K1 min_adults 2, K2 1.

## Next step (urgent, in order)
1. Migration: drop those 4 adds and the new-head `missing` CTE; drop `min_adults = k.min_adults`; raise if an existing F00x has no link.
2. `supabase/seed/config.json`: undo the same 4 groups and `other` head; fix its description.
3. Test: ADDED = the 5 kept groups; no `other` filter in `_before`; CHOICES keep music F001, rhymes F001, art 1202, memory_drawing 0630; assert K1 min_adults stays 2.
4. PROJECT.md: G6.7 = those offered, new G6.8 = the other choices (ticket). Rewrite ADR body, PR title/body.
5. `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/k1offers`, pytest that file from packages/engine (~6 min). Push, CI, loop:reviewer, `gh pr merge 952 --squash --delete-branch`; confirm `migrate live` + `deploy engine`.
6. Attach (ADR 0114 on plan/handoff): `attach.py` in the same notes folder, piped to `sudo docker exec -i deploy-engine-1 python -` on ubuntu@3.111.248.87; dry run first: expect 3 of 8 ok (26, 27, 30 Nov wild animals), then `--apply`.
7. Check a rubric on the live site; tick G6.x only as live proves; resolve HANDOFF clash; merge #949 (GitHub shows it BLOCKED, cause unchecked).
8. Then ticket: offer-only groups on a head (5 lessons, first on 30 Nov); plus the ticket list in plan/handoff HANDOFF.

## Ask Nimish
- K1 "secure": 1 adult or 2? Check the F001-F006 skill links and K1 weights = K2.

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov. Never print child names; passwords/keys typed by Nimish only.
