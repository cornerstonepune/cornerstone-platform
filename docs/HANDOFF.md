# Handoff: where things stand
Under 50 lines. Written by orchestrator #2 at ~14:35 UTC, 8 Nov 2026. Orchestrator #3 starts here. Verify every fact before acting.

## Done (merged to main, all 8 Nov)
CP-0 plan #468; CP-5 hygiene #469 (LIVE: advisor clean); CP-20 test DB in CI #471 + its proof-5 fix #474; CP-1 people #472 (LIVE) +
its bug fix #480 (seed writes labelled 'seed load'); CP-2 who-is-asking #476 (squash 5645583); CP-5 proof-5 fix #481 (proof now applies
only to CP-5's own change; unblocks CP-3, CP-13). Athena 2.14.0 on main (#475): a code PR needs specs/<ID>/VERIFY.md = PASS.

## Open PRs (merge order; one at a time; update branch with main first)
1. #477 CP-3 role rules (draft, session_01KEBF27howCR1C6e5zKKBP6). Retargeted to main. update_pull_request_branch FAILED (CP-2 was
   squash-merged, branch has its old commits): session was told to `git merge origin/main`, take main's CP-2 files, run guard tests, run the
   verifier (specs/CP-3/VERIFY.md), then I mark READY (a draft skips most CI). Item 8 (live, restricted login) is Nimish's own step.
2. #479 CP-13 min-adults as a setting (draft, session_01KEBF287fdT9CE7obpHQPCn): verifier PASS, 6/6 local. Merge main in (#481 fixes its
   'proofs' block), mark ready, full CI, merge. Item 4 (list of changed child states) is Nimish's separate approval, never applied by build.
3. #478 CP-9 observations to evidence (draft, session_01KEBF28jjY9zjqqD8bexQeL): no VERIFY.md yet. Needs access_table from CP-4 for one check.
   People's steps: import n8n flow f4 on the box, set cp9.real_notes_from, 20 real notes + 5 hand calculations (manual gate).
- Then CP-4 #452 (locked, scoped: session_01KEBF2A7DQSEjwZyyUgaLRE): build after CP-3 is near merge, as a child session (recipe below).
- Scoped, waiting: CP-6 (fortnight cycle, relocked) session_01KEBF2ATKNsoYRi1UU1QL8b; CP-8 (rewritten at fortnight level, check it is relocked)
  session_01KEBF27vass2Hk5iXWoehr3. Nimish typed UNLOCK for both. CP-7, CP-10..12, CP-14..19 not scoped. CP-15/16 wait for the frontend session.

## Rules from Nimish (his words, 8 Nov)
- MERGE POLICY (latest): "Once we know that it's safe to merge, you should merge. Don't wait for everything to go green... Record it accordingly,
  but take some judgment call." Example: CP-2 merged after the verifier PASS while a records-only re-run was pending (code identical to a
  fully green head). Record each judgment merge in the PR/handoff. Never merge with a real failing test on the change, or without the verifier PASS.
- The FORTNIGHT (week A/B inside) is the planning unit; read the school's files before assuming month/week.
- Values that may change are settings rows with defaults. Do not ask him about values; ask only what changes what the school sees or what is safe.
- Frontend is a separate session after the backend. He wants parallel builds where safe (own migration ranges per scope).
- Short plain answers; no jargon; challenge him; say when unsure.

## Lessons (cost us hours)
- A DRAFT PR skips most CI: its green 'engine'/'browser' is empty. Mark ready before trusting; I merged CP-1 that way and shipped a bug (#480).
- Builds must run the fast guard tests locally first: test_school_words ('carry'/'borrow' banned), test_roles (WEB_CALLS), test_layout, test_rules.
- Locked proofs that guard one scope but run on every PR (CP-20 p5, CP-5 p5) need a scoped fix + Nimish's UNLOCK and scope-change label.

## How to build a scope
create_session (source = repo, revision claude/bold-carson-f72yjv), prompt `athena-build <ID>`: branch from origin/main, bring only specs/<ID>, draft PR
`Closes #n`, verifier writes VERIFY.md, no .claude/autoharness or plugin skill files in commits, never write to live DB. Jev hook: read the tripwire id
from the denial, run Bash `true # jev:intended <id>: "<his real sentence>"`, repeat the call. The stop hook nags about plugin-written files: ignore.

## Waiting on Nimish
CP-1 box steps (staff load with his signer, K2-A roll check); restricted-login password (CP-3 item 8); archive finished sessions by hand
(classifier denied archive_session: CP-1 build, CP-1 fix, CP-20, CP-5 fix, CP-2 build); the pooler check repeat on the box after the CP-2 deploy;
deploy (update-live) for CP-2 migration 20270112090000. Not drafted: Sarvam no-retention request, mapping-bars text (CP-16).
