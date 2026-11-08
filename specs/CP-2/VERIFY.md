FAIL - CP-2 independent verification, third pass, 2026-11-08, branch cp-2-build (head 2c89555, PR #476, still a draft) against origin/main

(Verdict of the athena-verifier, copied verbatim by the builder; the builder did not edit it. Read-only agent: it cannot write files.)

`athena done CP-2` (run in that session): CP-2 PASS. Proofs 1, 2, 3 and 5 pass. Proofs 4 and 6 are "box": they only run on the production box, so they were not run there.

1. Decision recorded, then amended with the real-connection result: MET.
   - Proof 1 passes. ADR 0100 names the chosen option, A1, and the rejected options A2, A3, (b) and (c), each with a reason.
   - Its "Result" section records the run on the real pooler: Nimish, on the box, 8 Nov, head 2f36a84. It says plainly that the orchestrator reported this run and that the builder did not see it. Recording a reported result, with its source named, is enough for this item.
   - Not confirmed: no output from the box was available to the verifier; the reported lines match what check-pooler.ts prints.
2. public.current_staff(): MET. Proof 2 passes. Returns a uuid or null and never raises.
3. Identity set in one place, only from the verified cookie: MET. Proof 3 passes; the rawSql allow-list test exists.
4. Real shared connection: UNCLEAR. Accepted for merge. The harness covers every case the scope lists. The only evidence it passed on Supabase's pooler is second-hand and at 2f36a84, not the head being merged; the only later change to db.ts runs the query through postgres.js's `handle` and leaves asking() (reserve, begin, set the setting, query, commit or rollback, release) unchanged. Proof 4 is check_box and must be re-run on the box after deploy, at the merged head, with its output shown, before CP-2 is called done in production. Nothing reads current_staff() yet, so a leak found after deploy would change no one's access.
5. Existing browser and speed suites pass unchanged: NOT MET (not yet shown). Proof 5 only shows the test files are unchanged. PR #476 is a draft: on head 2c89555 the browser and engine shards were SKIPPED; the "browser" check is green only because it passes when its shards are left out (ci.yml:357-389). `bin/ci-plan decide --draft false` on this diff returns engine=true web=true browser=true, so once the PR is ready, CI runs all 3 browser shards (including the speed spec p6-check-is-quick.spec.ts) and all 12 engine shards. Limit: CI uses a local Postgres with no pooler, so it cannot measure the extra cost through the pooler (a reserved connection plus 4 round trips per signed-in query).
6. No rule switched on, no row made invisible: MET from the code; the live check waits for deploy (proof 6, after merge).

Unasked work: all small, all serving items 4 and 5 (DB_POOL_MAX override, bin/check-pooler, check-identity-once.ts and its runner, uuid-shape test, docs/notes/CP-2.md).
Missing: a green browser and speed run on a non-draft PR (item 5); post-deploy box runs of proofs 4 and 6 (expected after merge).

Risks: db.ts patches postgres.js internals (handle, executed, resolve, reject, isRaw, forEachFn), so an upgrade could silently break single execution or .values(); check-identity-once.ts guards this only where TEST_DATABASE_URL and node exist. identity() turns any resolver error into "nobody", harmless today, fail-closed under CP-3 but it hides the cause. Code that never imports lib/auth.ts runs anonymously (all pages call requireStaff; a note for CP-3). Each signed-in query reserves one of 4 pool connections for 4 round trips; only live use shows the effect. Migration is additive and non-destructive. bin/check-pooler never prints DATABASE_URL and is read-only. No real client data in the diff. The "proofs" check fails on 2c89555 only because this file's last verdict is not PASS.

VERDICT: FAIL - mark PR #476 ready for review so CI's browser shards (with the speed spec) and engine shards run, and get them green at the head; then re-run the verifier. After merge, run proofs 4 and 6 on the box (ATHENA_ON_BOX=1) and show the output before CP-2 is called done in production.

Not checked by the verifier: the box output itself (no access), and the shard logs from earlier heads.
