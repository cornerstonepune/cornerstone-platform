# Handoff: where things stand
Under 50 lines. Rewritten at the end of every session; the session-start hook shows the top lines.

## Live
- Main is green. Live database has all 130 migrations (as of the 8 Nov reconciliation). PR #413 (FET install) was merged
  by Nimish on 8 Nov 08:08 UTC, before CP-11 was locked: CP-11 now proves it after the fact.
- Athena 2.13.0. `athena health` 8 Nov (orchestrator session): Canny PASS (the setup-script fix worked). Still FAIL:
  usage ledger never written, plan usage not recorded, many components "never fired" (they fire as scopes run).

## Start here
- `docs/backend-plan.md` is the one list of what remains: CP-1..CP-19. No status in it; status is `athena status`,
  `specs/<ID>/`, the issues' labels and the nightly run. Backend done = all 19 finished + LIVE proofs pass.
- Issues drafted, none locked (no `scope-locked` label exists yet): CP-1 #448, CP-2 #449, CP-0 #450, CP-3 #451,
  CP-4 #452, CP-5 #453, CP-6 #454, CP-7 #455, CP-8 #456, CP-9 #457, CP-10 #458, CP-11 #459, CP-12 #460, CP-13 #461,
  CP-14 #462, CP-15 #463, CP-16 #464, CP-17 #465, CP-18 #466, CP-19 #467.
- Draft spec folders (spec.md only, unlocked) are in specs/CP-1, CP-2, CP-5 on this branch.
- The branch claude/bold-carson-f72yjv changes .claude/athena/config.json (tier 3): ships only through CP-0 once
  Nimish locks it. Do not merge it directly.

## Findings that change scopes (from the code, 8 Nov)
- CP-1 item 5 may already hold: triggers write `curriculum_edit` rows for activity edits and for activity-objective
  links (20261230090000). Prove it in the scope; do not rebuild it. `move_child` does not touch enrolment; a separate
  `enrol_child` does. The "sign-in list" is a config row `app.staff`, not a table.
- CP-2: one postgres.js pool (apps/web/lib/db.ts), transaction pooler port 6543, no sql.begin today; cookie `cs_staff`
  is HMAC-signed (lib/session-cookie.ts). Option (a) needs every query wrapped in a transaction that sets the identity.
- CP-5: no test scans function search paths; one tracked doc (docs/superpowers/plans/2026-09-17-phase-0-foundations.md)
  holds the live project reference. The 35-function list still has to be computed from the live database.

## Design reviews done (CP-1, CP-2, CP-5)
- specs/<ID>/design.md revised after 4 goldfish reviewers each (zoom-out, design, implementation-readiness,
  codebase-details). Preset used: stages 5-8 reviewers only; comprehension, structural, style, inventive-catalyst skipped.
- Issue text still to amend (jev tripwire blocked the edit; CP-1 #448 was updated): CP-2 #449 (function in `public` not
  `internal`; transport-only, not fail-closed; 200x test also concurrent/error/timeout) and CP-5 #453 (item 3 may become a
  recorded "not applicable"; item 4 includes STATE.md; item 5 wording). Text is in the design files and the 8 Nov chat.
- Decisions for Nimish: CP-1 live staff import needs his named signer, and class-scoped roles need a class; CP-5
  STATE.md one-line scrub and item 3; CP-2 only if option (c) is needed.

## Not done this session (and why)
- Access grid drafted (private artifact, 13 roles x 12 kinds of data): https://claude.ai/code/artifact/810b8620-1102-4d2a-afe7-351c42356117
  Waiting for Nimish's corrections (cell ids like E5) and 5 yes/no questions. Issue edits to #449 and #453 are applied.
- Layouts of one activity page, Sarvam request text, bars decision text: not drafted. CP-3..19 design reviews: not started.
- Step 3 gate loop: nothing is locked, so nothing to run.

## Blocked (the decisions needed from Nimish)
1. Lock CP-0 (#450) so the plan and the CP prefix can ship.
2. Allow read access to teacher-os so the access grid can be drafted.
3. Confirm: staff scope default "load all 7"; lowered bars only after a full 427 run; one model page (three layouts).
