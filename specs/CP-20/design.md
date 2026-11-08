# CP-20 design: a throwaway database in the proofs job

Status: DRAFT for review. Scope: `specs/CP-20/spec.md`.

## Problem
`.github/workflows/athena.yml` (harness-managed, "reinstalling overwrites this file") runs `bash .claude/athena/setup.sh`
then `athena done --all --ci`. `setup.sh` only installs the engine (`uv sync`) and the web app (`npm ci`). Any locked proof
that needs a database (CP-1's move/edit-history tests, CP-5's guard test) fails there. `ci.yml` already builds such a
database: `bin/ci-postgres` (Postgres 17 from apt, 127.0.0.1:5432, postgres/postgres, refuses outside GITHUB_ACTIONS) then
`bin/testdb fresh <url>` (every migration, seed, bank, library, `vacuum analyze`). setup.sh is the one file the harness
says to edit per repository ("written once, never overwritten").

## Decisions
1. Edit only `.claude/athena/setup.sh`; do not touch the managed workflow (it would be overwritten).
2. Gate on `GITHUB_ACTIONS=true` (the same test `bin/ci-postgres` uses). Outside it, setup.sh behaves exactly as today.
3. Order: after `uv sync` (the engine venv is needed by `bin/engine`, which `testdb fresh` calls), run `bin/ci-postgres`,
   then `bin/testdb fresh postgresql://postgres:postgres@127.0.0.1:5432/postgres`, then append only
   `TEST_DATABASE_URL=<that url>` to `$GITHUB_ENV`. Never set `DATABASE_URL` (the engine refuses a DATABASE_URL without a
   TEST one, box-only proofs read DATABASE_URL, and it must stay unset so the live database is unreachable).
4. A guard in setup.sh refuses any URL whose host is not 127.0.0.1 or localhost, with a plain message.
5. Time: `testdb fresh` takes several minutes; the athena job allows 30 minutes today. ci.yml starts it in the background
   while installs run; here, start it in the background after `uv sync` and wait for it at the end of setup.sh, so npm ci
   overlaps. If the measured job time passes ~20 minutes, say so in the PR (the limit is in the managed workflow and is
   out of scope to change).
6. No new dependency; no new file under `bin/`.

## Proofs (what the builder must write; the proof-writer decides the exact shape)
- Static: setup.sh's CI branch is gated on GITHUB_ACTIONS, never sets DATABASE_URL, exports only a loopback TEST url.
- Behavioural, off CI: run setup.sh's database section with GITHUB_ACTIONS unset against a stubbed environment and assert
  no database command ran and nothing was written to $GITHUB_ENV.
- In the job: `pytest packages/engine/tests/test_test_database.py` passes with 0 skipped (it skips when TEST_DATABASE_URL
  is unset). This item can only truly run in GitHub's job.

## Implementation list
- Modify `.claude/athena/setup.sh`.
- Create `specs/CP-20/{spec.md,design.md,checks.sh,proofs/}` and `docs/notes/CP-20.md`.
