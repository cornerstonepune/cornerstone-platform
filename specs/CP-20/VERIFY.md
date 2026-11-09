PASS

Independent verifier (athena-verifier, read-only), written verbatim from its report. Head e6435290; CI run 42470291712.

1. Is every Done-when line met? Yes.
- 1 MET. Proof 1 passed locally and in CI. In `.claude/athena/setup.sh` the new block runs only when `GITHUB_ACTIONS` is `true`. The check that the database is on the runner (127.0.0.1 or localhost) comes before `bin/ci-postgres` and `bin/testdb fresh`; any other host stops setup with a clear message. `TEST_DATABASE_URL` is written to `$GITHUB_ENV` only after `bin/testdb fresh` exits 0. The CI log shows `TEST_DATABASE_URL: ***127.0.0.1:5432/postgres`.
- 2 MET. Proof 2 passed. `setup.sh` never assigns `DATABASE_URL`; it is named only in a comment.
- 3 MET. Proof 3 passed. Outside the job only the old `uv sync` and `npm ci` run, and no database variable is set.
- 4 MET. Proof 4 passed in the CI job ("4 test_test_database.py runs and passes in the job with none skipped"). The proof reads pytest's own report and fails if any test was skipped or none ran.
- 5 MET, with one caveat. Proof 5 passed and the job took 5 min 50 s against its 30-minute limit, which is unchanged. The spec says `setup.sh` is the only tracked file changed outside `specs/CP-20/`, but `docs/notes/CP-20.md` (prose only) also changed. Accepted: the repo's CLAUDE.md requires a `docs/notes/<spec ID>.md` note on every branch; the approved `design.md` names this file; and the locked proof allows it. No product, workflow or config file outside `setup.sh` changed.
- 6 MET. Proof 6 (the fast checks) passed.

2. Was anything built that was not asked for? Nothing of substance. One small extra: the `CP20_TEST_DB_URL` override (default `postgresql://postgres:postgres@127.0.0.1:5432/postgres`), which lets proof 1 show a non-local host is refused. No dependency was added, and `.github/workflows/athena.yml` and `ci.yml` are untouched.

3. Was anything promised but left out? No. Everything the scope and `design.md` describe is in the diff: run `ci-postgres`, build with `testdb fresh` in the background while `npm ci` runs, fail on a build error, then export the variable.

Risks: no secrets or real data involved; the password in the default URL is the throwaway CI password `bin/ci-postgres` already uses. Nothing reaches the live database. The host check matches text anywhere in the URL (`*@localhost:*`), so a crafted override could get past it; the URL only comes from the job's own environment, and `db.local_copy()` refuses a non-local host anyway. Not blocking.

Not checked by the verifier: it did not re-run `athena done CP-20` locally (proof 4 needs the throwaway database). It took the 5 min 50 s job time from the brief; the orchestrator and builder both read it from the job's own step timestamps (10:10:34 to 10:16:24).

VERDICT: PASS

## Follow-up: proof 5 scope (2026-11-08)

PASS. Independent read-only verifier (athena-verifier) on commit f348b4f against origin/main.

- Intent met: proof 5's file-scope check now runs only when the pull request changes `.claude/athena/setup.sh`; otherwise it prints a note and skips just that one check. When it runs, the rule is unchanged (setup.sh, `docs/notes/CP-20.md`, `specs/CP-20/`).
- No other proof-5 assertion was weakened: `bin/testdb fresh`, not in MANIFEST, header says never overwrites, `timeout-minutes: 30`, no wait of a minute or more, stubbed run under 30 s all still run every time.
- A pull request that changes setup.sh plus other files still fails (also if setup.sh is deleted). The new `extra_files()` self-check covers both cases.
- Shown on a CP-1-like diff (origin/cp-1-people-complete merged with this fix: 25 files, setup.sh untouched): proof 5 passes.
- Known gaps, not blocking: the exit status of `git diff --name-only` is not checked (pre-existing; a failure reads as "no changes"); proof 4 needs GitHub's throwaway Postgres, so it fails in a session without one and was not re-run here (proofs 1, 2, 3, 5, 6 pass locally).
