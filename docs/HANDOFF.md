# Handoff: where things stand
Under 50 lines. Rewritten at the end of every session. Orchestrator #2 starts from this (8 Nov 2026, ~11:15 UTC).

## Done (merged to main)
- CP-0 #468 (plan, CP prefix), CP-5 #469 (35 function paths pinned; box proofs 1 and 5b still to run after deploy),
  CP-20 #471 (throwaway Postgres in GitHub's athena job). Main is green (athena runs for all three succeeded).
  CP-5 is NOT live yet (checked 8 Nov ~11:15: advisor still shows 35 function_search_path_mutable; migration 20270110090000 absent from
  live list). It lands when Nimish deploys. Re-check the advisor after deploy. Orchestrator #2 is subscribed to #472.

## In flight (8 Nov ~12:30 UTC)
Merged: CP-0, CP-5, CP-20 + its proof-5 fix #474, CP-1 #472 (main green). Athena 2.14.0 is on main (#475): a code PR needs VERIFY.md = PASS.
1. CP-2 PR #476 (ready, head 545cfc9): first full CI (12 engine + 3 browser shards) running; then verifier re-run for PASS, then merge.
   Nimish ran bin/check-pooler on the real pooler: PASS (recorded in ADR 0100). Proofs 4 and 6 repeat on the box after deploy.
   Build session session_01KEBF29sGFc8njKT9gg3Nsu. Do not merge on a FAIL or red check.
2. CP-3 build (STACKED on cp-2-build): session_01KEBF27howCR1C6e5zKKBP6. Its PR bases on cp-2-build; after #476 merges, retarget to main,
   merge when green + PASS. CP-3 item 8 (restricted login password) is Nimish's own step. CP-4 (#452) starts when CP-3 is near merge.
3. Scoped and locked, waiting for CP-4 (specs on claude/bold-carson-f72yjv): CP-6 (fortnight cycle), CP-8, CP-9, CP-13.
   Before building CP-6 and CP-8, Nimish must type UNLOCK CP-6 / UNLOCK CP-8 in their sessions: CP-6's locked text says 'month' (he decided
   'freeze by fortnight'); CP-8's proof wants a decision file but he wants those as settings. CP-9: n8n nightly job import + 20 real notes (manual gate).
- Archive CP-1 build session_01KEBF27Mw5y4RasFJXU7g4G: classifier denied archive_session; Nimish archives by hand or allows it.
- CP-7, CP-10-12, CP-14-19 not scoped. Cloudflare guide: session_01KEBF26KbRoFUTYc423FUv4; cut over only after CP-2 merges.
- After 'update-live' (Nimish ran it): re-check live advisor (35 function_search_path_mutable should be gone; migration 20270110090000 applied).

## Nimish's rules (8 Nov)
The FORTNIGHT is the school's planning unit (week A/B inside it): scope everything from it, read the school's files before assuming month/week.
Values that may change are SETTINGS ROWS with a default; do not bring them to him as questions. Ask only for what changes what the school
sees or what is safe. Frontend is a separate session after the backend (CP-15/CP-16 wait for it). He wants parallel builds where safe.
Conway 'automaton' repo evaluated: not relevant; only idea worth a later scope is input-injection checks on prompts.

## How to build a scope (recipe that worked)
Child session via create_session (source = repo, revision claude/bold-carson-f72yjv), prompt `athena-build <ID>`: branch from origin/main,
bring over only specs/<ID>, no .claude/autoharness or plugin skill files in commits, draft PR `Closes #n`, verifier writes VERIFY.md. Never
build two DB scopes at once. Hooks in the first orchestrator session died ~09:34: do unlock/lock steps from a fresh session.

## Merge rule and the jev hook
Merge when our CI is green + VERIFY.md PASS + mergeable. Ignore Vercel (free plan limit, Nimish: "dont wait for vercel"; he will move to
Cloudflare). GitHub download errors (setup-uv 504): re-run failed jobs ONCE (only works when the whole run has finished). The jev hook
blocks PR writes: call once, read the tripwire id from the denial, then Bash `true # jev:intended <that id>: "<Nimish's sentence>"`, then
repeat the call. Real sentences: "You should have the power to merge all these PRs by yourself", "keep going, merge when green".

## Rules Nimish set (8 Nov)
Archive a child session once its PR is merged (done: CP-5 and CP-20 builds). Hand off to a new orchestrator at 50-60% context.
Access: coordinator, deputy, mentor, head, curriculum team, ops see all; educators and assistants their own classes; all see curriculum.
Test DB: throwaway copy, live checks read-only on the box, never write to live from a session. Load all 7 staff (CP-1). STATE.md scrub done.

## Waiting on Nimish
`scope-change` label on the CP-20 fix PR. CP-1 live steps after deploy: confirm all 7 sign-in entries are real people, name his staff entry as
signer for `engine staff import --apply`, a class for class-level roles, check every live section has a school_class row. PR #473 (ATH-29) is his.
Not yet drafted: three layouts of one activity page (CP-15), Sarvam no-retention request, mapping-bars decision text (CP-16).
