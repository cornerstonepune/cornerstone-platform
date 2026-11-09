PASS - CP-2 independent verification, fourth pass, 2026-11-08, branch cp-2-build (head 3b856c4, PR #476, ready for review, with main's #480 merged in) against origin/main

(Verdict of the athena-verifier, copied verbatim by the builder; the builder did not edit it. Read-only agent: it cannot write files and cannot reach GitHub.)

`athena done CP-2` (run in that session at 3b856c4): CP-2 PASS. Proofs 1, 2, 3 and 5 pass. Proofs 4 and 6 are "box" proofs: they run only on the production box, so they were not run there. Result: "ALL DONE (1/1 specs pass)".

The diff against origin/main, excluding specs/, covers 11 files and only CP-2 work: apps/web/lib/{auth,db,queries}.ts, apps/web/scripts/{check-pooler,check-identity-once}.ts, bin/check-pooler, ADR 0100, docs/notes/CP-2.md, packages/engine/tests/{test_roles,test_web_identity}.py and supabase/migrations/20270112090000_current_staff.sql. The merge of main (3b856c4) brings no extra file into the CP-2 diff. Since the third pass (545cfc9..1cf0a84) only two lines changed: an error string in apps/web/lib/db.ts:166, and `current_staff` added to WEB_CALLS in packages/engine/tests/test_roles.py:64. The query-runs-once fix (7804e47) was already in the third pass's head.

1. Decision recorded, then amended with the real-connection result: MET.
   - Proof 1 passes.
   - docs/adr/0100-a-request-says-who-is-asking-in-one-transaction-per-query.md names the chosen option, A1. It rejects A2, A3, (b) and (c), each with a reason.
   - Its "Result" section records Nimish's run on the real pooler at 2f36a84 and names who reported it.
2. public.current_staff(): MET.
   - Proof 2 passes.
   - supabase/migrations/20270112090000_current_staff.sql:7-11 checks the uuid shape before the cast. It returns null when the setting is unset, empty, blank or not a uuid, and it never raises.
3. Identity set in one place, only from the verified cookie: MET.
   - Proof 3 passes.
   - The only set_config is at apps/web/lib/db.ts:131 and it is transaction-local.
   - The only resolver is registered in apps/web/lib/auth.ts:114, from the result of the verified-cookie function `currentStaff()`.
   - rawSql is used only in lib/queries.ts:197 (staffList) and in the two check scripts. packages/engine/tests/test_web_identity.py enforces that allow-list.
4. Real shared connection: MET for merge. The scope accepts "run in CI or on the box", and the check is on the box.
   - The harness in apps/web/scripts/check-pooler.ts covers every case the scope lists: one connection, A/B/nobody x200, 60 concurrent, after a failed query, after a timed-out query. It also checks that all three shared one backend.
   - The real-pooler pass was at 2f36a84, which is reported to the verifier and not seen by it. Since then, db.ts changed only how the query is dispatched (`handle`, single execution) and an error string. `asking()` is unchanged: reserve, begin, set_config(…, true), query, commit or rollback, release (db.ts:126-143).
   - PENDING ON THE BOX: proof 4 must be re-run with ATHENA_ON_BOX=1 at the merged head after deploy, and its output shown, before CP-2 is called done in production.
5. Existing browser and speed suites pass unchanged: MET, on facts reported to the verifier.
   - Proof 5 passes there, which shows the test files are unchanged.
   - Reported: GitHub Actions run 42487050854 on head 3b856c4: all 12 engine shards, browser shards 1-3 (including the speed spec p6-check-is-quick), web, the engine and browser gate jobs, plan and engine-checks all green. The only red check is "proofs", because this file held the old FAIL.
   - That answers exactly what the third pass asked for: a non-draft head with the shards actually run.
   - Not confirmed by the verifier: it cannot reach GitHub, so it did not see the run, its shard logs, or that its head SHA is 3b856c4. Before merging, confirm on the PR page that the browser shards ran (not skipped) on 3b856c4.
   - Known limit, unchanged: CI uses a local Postgres with no pooler, so the cost of 4 round trips per signed-in query through the pooler shows only in live use.
6. No rule switched on, no row made invisible: MET from the code.
   - The migration adds one function with grants and no policy, and nothing in the diff calls current_staff().
   - PENDING ON THE BOX: proof 6 is LIVE (it checks the policy count and definitions) and must run with ATHENA_ON_BOX=1 after deploy.

Unasked work: all small, and all in service of items 3-5. None is of substance:
- the DB_POOL_MAX override (db.ts:54)
- bin/check-pooler
- check-identity-once.ts and its pytest runner
- the uuid-shape test
- the WEB_CALLS line
- docs/notes/CP-2.md

There are no new dependencies and no renames beyond the `sql` to `rawSql` split the design calls for.

Missing: nothing for merge. After deploy, proofs 4 and 6 must be run on the box.

Risks:
- db.ts patches postgres.js internals (handle, executed, resolve, reject, isRaw, forEachFn), so a postgres.js upgrade could silently break single execution or .values(). check-identity-once.ts guards this only where TEST_DATABASE_URL and node are present.
- identity() turns any resolver error into "nobody". That hides the cause; it fails closed only once CP-3's rules exist.
- Calls that bypass the tagged template run anonymously: `sql.begin`, `sql.unsafe` and `sql.reserve` reach rawSql through the Proxy, and so does any code path that never loads lib/auth.ts. Harmless now; CP-3 must account for them.
- Each signed-in query holds one of 4 pool connections for 4 round trips.
- The migration is additive and non-destructive.
- bin/check-pooler is read-only and never prints DATABASE_URL.
- No secrets and no real client data are in the diff.
- No authentication or permission rule changes behaviour; the only grant is EXECUTE on the new function to app_web and app_engine.

VERDICT: PASS. Pending after deploy, not merge blockers: run proofs 4 (at the merged head) and 6 on the box with ATHENA_ON_BOX=1 and show the output before CP-2 is called done in production. Not checked by the verifier: the GitHub run 42487050854 itself and Nimish's box output, both reported to it second-hand.

--- Builder's note (not part of the verdict) ---
What the builder itself saw for item 5: the GitHub check-runs API for PR #476 at 3b856c4, run 42487050854: engine shards 1-12 success, browser shards 1, 2, 3 success (not skipped), web, engine, browser, plan and engine-checks success; "proofs" failure (the old FAIL verdict in this file). Proofs 4 and 6 repeat on the box after deploy; Nimish's pooler run was at head 2f36a84.
