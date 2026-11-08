# Handoff: where things stand
Under 50 lines. Rewritten at the end of every session. Orchestrator #2 starts from this (8 Nov 2026, ~11:15 UTC).

## Done (merged to main)
- CP-0 #468 (plan, CP prefix), CP-5 #469 (35 function paths pinned; box proofs 1 and 5b still to run after deploy),
  CP-20 #471 (throwaway Postgres in GitHub's athena job). CP-5 migration should be live: verify with the live advisor.

## In flight (one DB scope at a time, in this order)
1. CP-1 PR #472 (draft, head bc517d9, VERIFY.md PASS, its DB proofs PASS in CI). Its ONLY red is CP-20 proof 5, a locked proof that
   fails on every later PR (a tier 3 PR runs every finished spec; the proof says only setup.sh may change).
   Fix: session_01KEBF2AH2FeLBZHPpSYBVfT (branch cp-20-proof5-scope; Nimish typed UNLOCK CP-20 there). Its PR needs Nimish's
   `scope-change` label. Then: merge the fix, `update_pull_request_branch` #472, CI green, un-draft, merge #472.
2. CP-2 (locked, specs on claude/bold-carson-f72yjv): start its build in a child session the moment #472 merges.
3. CP-3 #451 and CP-4 #452 (locked, three-group access model): scoping session_01KEBF2A7DQSEjwZyyUgaLRE is writing design,
   proofs, locks (cost ~$17: keep reviews lighter). Build after CP-2 merges. CP-3 item 8 needs Nimish to set the restricted login's password.
- CP-6..CP-19: issues #454-#467 are drafts, not locked, no designs yet. Ask Nimish to lock in waves; scope each in a child session.
- Cloudflare guide: session_01KEBF26KbRoFUTYc423FUv4 (read-only helper for Nimish). Cut over the real domain only after CP-2 merges.

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
