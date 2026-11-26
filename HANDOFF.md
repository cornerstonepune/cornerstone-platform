# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (~10:15 IST or later) · **By:** Coordinator (side session) · **Model:** claude-sonnet-5-5
**Milestone:** M6 K1 pilot (presentation TODAY) · **Branch:** plan/handoff (PR #949)

## State
- PR #952 (plan/k1-pilot-offers, 8b5cf1568): CI all green, mergeable, NOT merged. Branch handoff records 11 tests passed locally (not re-run since). loop:reviewer was started 26 Nov; verdict not back when this was written.
- Nothing changed on live this session. The 8 lessons still have no activity (today's rhyme F001 included).
- Live K1: 21 children, 99 lessons, 9 with an activity, voice key set. Website voice note and Radhika sign-in unchecked.

## Next step (urgent)
1. Get the review verdict on #952 (rerun loop:reviewer if lost). PASS: `gh pr merge 952 --squash --delete-branch` (releases to live). Confirm `migrate live` and `deploy engine` succeed.
2. Attach script ready, never run: `~/Library/Application Support/Claude/side-session-notes/local_07a3d48e-bf4c-43ef-98fc-95c421cdfa35/attach.py`.
   Route (ADR 0114): `aws --profile cornerstone --region ap-south-1 lightsail download-default-key-pair --query privateKeyBase64 --output text` to a temp key file (chmod 600, delete after);
   pipe the script into `ssh -i KEY ubuntu@3.111.248.87 'sudo docker exec -i deploy-engine-1 python -'` (dry run, rolled back). If 8 of 8 ok, same with `python - --apply`.
3. Check one lesson's rubric on the live site. Tell Nimish ADR 0113's assumptions (K1 observed weights = K2; F001-F006 skill links).
4. Tick G6.4-G6.7 in PROJECT.md only as live proves them, here; resolve the HANDOFF.md clash with #952; merge #949.
5. Tickets: educator chooses activity on S3; voice confirm defaults to lesson's activity; 30 s recorder cap; silent voice failure; #948 review notes; "enrol k2" labels; heads not per grade; `ensure_offered` ignores also_bands (K1 clay M0018).

## Blocked / unverified
- `nightly` on main failed 25 and 26 Nov; cause not looked at.

## Don't repeat
- `loop build` passes --allowedTools space-joined: use the loop:builder(-small) subagent.
- Past days and not-planned lessons refuse an activity. Passwords and keys are typed by Nimish only.
