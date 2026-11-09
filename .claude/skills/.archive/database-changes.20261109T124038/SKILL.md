---
name: database-changes
category: database
description: Use when Postgres migrations, RLS, grants, or DB proofs.
---

# Database changes: migrations, grants, row rules and local proofs

Make each schema change one additive numbered migration in `supabase/migrations/`. Prove every access rule as the restricted login, never the owner: a check run as owner, service or admin skips row-level security and passes whether or not the rule works.

## Schema
- Prefer a column or a view on an existing table over a new base table.
- Every new base table needs `created_at` and `updated_at`. `internal.apply_conventions()` sets `updated_at` on every public table, so an UPDATE on a table without it errors.
- Default privileges already give `app_engine` select, insert, update and delete, and `app_web` select, on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard the neighbouring migration uses. A grant line alone adds nothing.
- A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- A new command group lives in `packages/engine/engine/w2_print/cli_*.py` as a Typer app that `cli.py` mounts with `add_typer`, and its commands are listed in N4's `commands` in `workflows.json`. `cli.py` sits near its 400-line ceiling; do not grow it.
- Migration numbers: take the next number above the highest on origin/main AND in every open pull request's `supabase/migrations/`. Never take it from the clock (`date -u`): main's files are dated 2027, so a clock timestamp sorts before them and `supabase db push` refuses it. When several builders run at once, the coordinator assigns each its slot up front. If a locked proof names the old filename, stop and report instead of renaming.
- Before pushing a migration, run `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres bin/check --db` against a local Postgres. It builds every migration with the seed and fails on an ownerless table, a stale `rules.json`, or failing grade and rule tests.

## Access and row-level security
- Prove denied rows are absent and allowed rows present, both through the restricted login with identity set the way the app sets it.
- Check `pg_class.reloptions` for `security_invoker = true` on every view that exposes restricted data. Never assert either way from memory.
- Unlisted tables default closed for the restricted role, so classify each new table or a test fails.

## Local proof database
Run every database-backed proof against the throwaway local cluster, never production. After a session resume the server is usually stopped but its data directory survives, so check first, restart, then build a fresh database per proof from the base template.
1. Check with `pg_isready -h 127.0.0.1`. A refused connection means stopped, not lost.
2. Restart and recreate the run database as described in `references/restart-test-postgres.md`. If the data directory is gone, rebuild it with `bin/testdb fresh`.
3. Apply the migration under test with `ON_ERROR_STOP=1`, then read back the seeded values before trusting any proof.
4. Export `TEST_DATABASE_URL` only for the one command that needs it.

The fsync and synchronous-commit settings in that restart file are for the throwaway cluster only; never use them on a real database.

## Engine data rules
- Derived lists, machine-made links, matching rules and the fortnight rule are in `references/engine-data-rules.md`. Read it before changing any command that links rows or prints a count.
- Machine-made links (undo by run), first-rule-wins matching with ties listed, and per-fortnight counts are in `references/links-matching-timetables.md`.
