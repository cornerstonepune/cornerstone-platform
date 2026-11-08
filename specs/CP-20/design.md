# CP-20 design: a throwaway database in the proofs job

Status: REVISED after the first goldfish review (implementation-readiness). Scope: `specs/CP-20/spec.md`. (R) marks a change forced by a finding.

## Problem
`.github/workflows/athena.yml` (harness-managed, "reinstalling overwrites this file") runs `bash .claude/athena/setup.sh`, then
`athena done --all --ci`. `setup.sh` only runs `uv sync --extra dev` and `npm ci`. Locked proofs that need a database fail there.
`ci.yml` already builds one: `bin/ci-postgres` (Postgres 17 from apt on 127.0.0.1:5432, postgres/postgres, refuses outside
GITHUB_ACTIONS) then `bin/testdb fresh <url>` (every migration, seed, bank, library, `vacuum analyze`; about 6 minutes).
`setup.sh` is the one file the harness says to edit per repository.

## Decisions (mechanical, recorded)
1. Edit only `.claude/athena/setup.sh`. Do not touch the managed workflow.
2. Everything new sits in one `if [ "${GITHUB_ACTIONS:-}" = true ]; then ... fi` block, so off CI the script behaves as today (R).
3. Order inside the block (R), after `uv sync --extra dev` has finished:
   a. `bin/ci-postgres` in the foreground (the server must be up first); then `export PATH="/usr/lib/postgresql/17/bin:$PATH"`
      so `psql` inside this script is the one just installed (ci-postgres only extends PATH for later steps).
   b. start `bin/testdb fresh "$URL"` in the background, its log and exit code written under `$RUNNER_TEMP` (the pattern in
      ci.yml: `( cmd >log 2>&1; echo $? >rc ) &`, which cannot trip `set -e`), using the repo-root path of `bin/testdb`.
   c. `npm ci` runs meanwhile.
   d. wait for the exit-code file, `cat` the log, and `exit` with that code if it is not 0 (so the proofs job goes red).
   e. only on code 0, `echo "TEST_DATABASE_URL=$URL" >> "$GITHUB_ENV"` (never before: half-built databases must not be visible).
4. `URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`, from a variable `CP20_TEST_DB_URL` that defaults to that value,
   so the guard has an input a test can feed (R). The guard (a `case` on `*@127.0.0.1:*|*@localhost:*`, copied from `bin/testdb`)
   runs before any database command and stops with a plain message for any other host.
5. Never set `DATABASE_URL` (the engine refuses a DATABASE_URL without a TEST one, box-only proofs read DATABASE_URL, and it
   must stay unset so the live database is unreachable). A static proof greps for an assignment, not the word (R).
6. `$GITHUB_ENV` only reaches later steps, so setup.sh's own commands do not see `TEST_DATABASE_URL`; that is fine.
7. Time: baseline is ci.yml's `testdb fresh` of about 6 minutes plus the apt install, overlapped with `npm ci`. The job allows 30
   minutes. If the measured job passes 25 minutes, stop and `athena block CP-20 "job time"`: shortening it needs a decision, since
   the limit lives in the managed workflow (R).
8. Chromium is not needed to build the database (ci.yml installs it for the tests, not for `testdb`); the builder confirms
   `library build` does not render and notes it in `docs/notes/CP-20.md` (R).

## Facts confirmed by the second review (codebase-details)
- `setup.sh` is called only by `athena.yml` in `.github`; the `GITHUB_ACTIONS` gate is a safety net for a local or cloud caller
  (and `bin/ci-postgres` refuses outside CI anyway). "Never overwritten" rests on setup.sh's own header and on `setup.sh` having
  no entry in `.claude/athena/MANIFEST.json`; it is not verified against the installer (athena-ops), so the builder says so in
  the PR (R).
- `$GITHUB_ENV` reaches later steps; `athena done` builds the proof environment from `os.environ`, so `checks.sh` sees
  `TEST_DATABASE_URL`. Real reason to set only that one: `packages/engine/tests/conftest.py` overwrites `DATABASE_URL` from
  `db.local_copy()` when `TEST_DATABASE_URL` is set and exits 4 if only `DATABASE_URL` is set (R). `db.local_copy()` already
  refuses non-loopback hosts; the guard in setup.sh duplicates that only so it fires before the database build (R).
- Consequence (R): once set job-wide, every fast check or proof that runs the engine's pytest, other than `bin/check`'s own
  no-database line (it blanks both variables), now runs against the throwaway database. That is intended. Each check keeps
  its own 900-second limit (`ATHENA_CHECK_TIMEOUT`), separate from the job's 30 minutes. The builder lists, in
  `docs/notes/CP-20.md`, which existing proofs and tests read the variable.
- `test_test_database.py` skips only its first test when the variable is unset; "0 skipped for the file" is a valid check.

## Proofs (the proof-writer decides the exact shape)
- Static: the block is gated on GITHUB_ACTIONS; no assignment to DATABASE_URL; GITHUB_ENV is written only after the rc check.
- Behavioural, off CI: run setup.sh in a copied repo tree with `bin/ci-postgres` and `bin/testdb` stubbed on a fake path and
  `GITHUB_ACTIONS` unset: no stub is called, nothing is written to a fake `$GITHUB_ENV`. With `GITHUB_ACTIONS=true`, a non-local
  `CP20_TEST_DB_URL` stops the script before any stub is called, and a stub `testdb` that exits 1 makes setup.sh exit 1 without
  writing `$GITHUB_ENV` (R).
- In the job: `pytest packages/engine/tests/test_test_database.py` passes with 0 skipped. Only GitHub's job can run this one.

## Implementation list
- Modify `.claude/athena/setup.sh` (the only tracked file outside `specs/CP-20/` and `docs/notes/CP-20.md`).
- Create `specs/CP-20/{spec.md,design.md,checks.sh,proofs/}` and `docs/notes/CP-20.md`.
