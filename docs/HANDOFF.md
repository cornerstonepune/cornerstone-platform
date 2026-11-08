# Handoff: where things stand
Under 50 lines. Rewritten at the end of every session. Orchestrator #2 starts from this (8 Nov 2026, ~11:15 UTC).

## Done (merged to main)
- CP-0 #468 (plan, CP prefix), CP-5 #469 (35 function paths pinned; box proofs 1 and 5b still to run after deploy),
  CP-20 #471 (throwaway Postgres in GitHub's athena job). Main is green (athena runs for all three succeeded).
  CP-5 is NOT live yet (checked 8 Nov ~11:15: advisor still shows 35 function_search_path_mutable; migration 20270110090000 absent from
  live list). It lands when Nimish deploys. Re-check the advisor after deploy. Orchestrator #2 is subscribed to #472.

## In flight (one DB scope at a time, in this order)
Merged 8 Nov: CP-20 proof-5 fix #474 (Nimish), CP-1 #472 (squash f5e7446; main run 42476724178 was still running, watch it).
1. CP-2 build: session_01KEBF29sGFc8njKT9gg3Nsu (started ~11:40 UTC). Merge its draft PR under the merge rule when green + VERIFY PASS.
2. CP-3 #451 and CP-4 #452 (locked): build after CP-2 merges, one at a time. Scoping session_01KEBF2A7DQSEjwZyyUgaLRE.
   CP-3 item 8 needs Nimish to set the restricted login's password.
- Archive CP-1 build session_01KEBF27Mw5y4RasFJXU7g4G: auto-mode classifier DENIED archive_session; Nimish to allow it or archive by hand.
- CP-6..CP-19 (#454-#467): drafts. Ask Nimish to lock CP-6, CP-8, CP-9 first so scoping can run while CP-2..4 build.
- Cloudflare guide: session_01KEBF26KbRoFUTYc423FUv4. Cut over the real domain only after CP-2 merges.

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
