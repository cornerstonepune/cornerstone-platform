# CP-20: A throwaway database in the proofs job

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/470 (locked by Nimish, 8 Nov 2026)

## What

GitHub's "athena" check job runs the locked proofs of every scope a pull request touches, but it has no database, so any proof that needs one fails there. This adds a throwaway Postgres to that job, built fresh from this repository's own migrations by the helpers the main CI job already uses (`bin/ci-postgres`, `bin/testdb fresh`). It holds no school data and is deleted with the job. The only file that changes is `.claude/athena/setup.sh`, which the harness never overwrites (the workflow file is harness-managed and is not touched).

## Done when

1. In the job, `TEST_DATABASE_URL` is set and points at a Postgres on the runner itself (127.0.0.1 or localhost), built by `bin/testdb fresh`. Any other host makes the setup stop with a clear message. (Test.)
2. In the job, `DATABASE_URL` stays unset, so box-only proofs stay skipped and nothing can reach the live database. (Test.)
3. Outside GitHub's job (a laptop, a cloud session), running `setup.sh` starts no database and sets no database variable. (Test.)
4. With it in place, the engine's database test file `packages/engine/tests/test_test_database.py` runs and passes in the job, with none skipped. (Test, in the job.)
5. The job stays within its existing 30-minute limit, and the only tracked file this changes outside `specs/CP-20/` is `.claude/athena/setup.sh`. (Test: the diff.)
6. The fast checks pass.

## Out of scope

Editing `.github/workflows/athena.yml` or `ci.yml`. Any access to the live database. Copying live rows anywhere. Changing the Supabase image. Making the other CP scopes' proofs pass (they pass when their features are built).
