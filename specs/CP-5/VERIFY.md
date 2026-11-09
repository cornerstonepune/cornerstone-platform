CP-5 verification. Spec: specs/CP-5/spec.md. I compared origin/main...HEAD with specs/ excluded: 2 commits, 7 files.

I re-ran `athena done CP-5` in this session: **CP-5: PASS**. Proofs 2, 3, 4 and 5 (tests unchanged) passed. Proof 1 and the second half of proof 5 are "box only" and did not run here. ALL DONE (1/1).

**1. Criteria**

1. **MET in the repo; the live check is still pending on the box.** Every function has a fixed search path.
   - supabase/migrations/20270110090000_pin_function_search_paths.sql:9-43 has 35 explicit `alter function … set search_path = public` lines.
   - Its timestamp is later than the newest existing migration (20270109…).
   - There is no `if exists`, so a missing signature makes the migration fail loudly, as the design asked.
   - I compared the 35 signatures one by one with the list in docs/notes/CP-5.md:7-15 (18 public, 17 internal). They match.
   - I spot-read 6 internal bodies (school_states, evidence_vocabulary, retire_flagged_item, staff_have_ids, level_samples, refuse_grant_edit). They name only public tables unqualified, so `public` is a correct path for them.
   - Proof 1 (`live_search_path.py`, the advisor's query, read-only) is box-only, so a 0 from the live advisor is not yet shown. The builder's local Postgres copy went from 35 unpinned to 0; I did not reproduce it.
2. **MET.** Proof 2 (`guard.py`) passed.
   - The new test is packages/engine/tests/test_db_privileges.py:47-58. It reuses `OURS` and fails on a missing, empty or `$user` search path.
   - Here the proof ran only its static part, because this sandbox has no test database. The behaviour (fails on the unpinned probe function and only on it) rests on the builder's local run, which I did not repeat.
3. **MET.** Proof 3 (`auth_unused.py`) passed.
   - The decision is docs/adr/0100-leaked-password-protection-does-not-apply.md:1-22. It says the protection does not apply because sign-in is the site's own, not Supabase Auth.
   - Outside docs/specs/goals, no tracked file reads `auth.users` or calls Supabase Auth's user or admin endpoints.
4. **MET.** Proof 4 (`project_ref.py`) passed: no tracked file matches. I did not print any reference.
   - The scrubs replace the reference with the placeholder `<project-ref>`: DECISIONS-LOG.md:43; STATE.md:57 (the one-line scrub Nimish allowed); docs/superpowers/plans/2026-09-17-phase-0-foundations.md, lines 7, 214, 215, 545, 748 and 3368.
   - None of the new files contains a reference.
5. **MET for what can run here.**
   - Proof 5a (`tests_unchanged.sh`) passed: no existing test line was removed or rewritten; test_db_privileges.py only gains 14 lines.
   - Proof 5b (`repinned_calls.py`, each re-pinned function called in a rolled-back transaction) is box-only. The builder reports a local run with 0 name failures; I did not reproduce it.
   - The full engine suite and the web speed tests passing is left to CI; the web suite cannot run in this sandbox.

**2. Unasked work:** none of substance.
- docs/notes/CP-5.md is the branch note that CLAUDE.md requires.
- The plan document, DECISIONS-LOG.md and STATE.md changes are only the reference scrubs that item 4 asks for.
- No new dependencies, no configuration changes, no deleted code.

**3. Missing:** nothing.
- There is no specs/CP-5/plan.md; I checked against specs/CP-5/design.md instead.
- Every item on its implementation list is present: the migration, the guard test, the three scrubbed files, the branch note with the body scan and smoke-call results, and the item 3 decision.
- The design listed "a repo check for the project reference" as an engine test. In the diff it is the locked proof `project_ref.py`, not an engine test. It is still enforced, because CI re-runs finished specs' proofs every night, so this is acceptable.
- .env.example is clean (proof 4 covers it).

**4. Risks**
- **Database change, not destructive:** the migration only changes function settings. No data or tables are touched, and it is reversible.
- **Speed:** a SQL function with a fixed search path can no longer be inlined into the calling query. The builder names this in docs/notes/CP-5.md:37-39: 17 functions lose inlining, including `staff_sees*`, which is on the access-rule path. The web speed tests in CI are the guard, so a green CI web job matters before merge.
- **Permissions:** none of the 35 functions is SECURITY DEFINER, and no grants change.
- **Secrets / client data:** none in the diff.

**5. Requirements:** I was not given an `athena requirements` list, so this section does not apply.

Two things must still happen after deploy: on the box, `ATHENA_ON_BOX=1 athena done --all` must pass for proof 1 (live advisor shows 0) and proof 5b (the re-pinned functions run). CI's web speed job must also be green.

VERDICT: PASS

## Re-verification: proof 5 applies only to CP-5's own change (branch cp-5-proof-5-applies-only-to-own-change)

Independent verifier, read-only, on the commit that edits `specs/CP-5/proofs/tests_unchanged.sh`; the spec was unlocked by Nimish and re-locked with `athena lock CP-5`.

- The unchanged-tests check now applies only when the diff against the merge-base adds or changes `supabase/migrations/20270110090000_pin_function_search_paths.sql` or changes a `specs/CP-5/` file other than VERIFY.md and RUN.json. Otherwise it prints one line saying it does not apply and exits 0. When it applies it behaves exactly as before.
- The self-check (`--self-check`, wired in as a second criterion-5 line in checks.sh) covers three cases in a scratch repository: an unrelated change that rewrites a test passes; CP-5's own change with a rewritten test line fails with the original message; CP-5's own change that only adds test lines passes.
- Only `specs/CP-5/` changed. The verifier found nothing unasked.
- Known gap: the self-check triggers "applies" only through the migration; the "specs/CP-5 changed" and "only VERIFY/RUN changed" branches are not tested separately.
- Re-run after building the engine venv: `athena done CP-5` shows proofs 2, 3, 4 and both proof-5 lines passing; proof 1 and the second half of proof 5 are box-only and did not run.

VERDICT: PASS
