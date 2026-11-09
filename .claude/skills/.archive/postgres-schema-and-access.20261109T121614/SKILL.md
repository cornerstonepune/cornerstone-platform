---
name: postgres-schema-and-access
category: database
description: Use when a Postgres migration, grant, RLS rule or test DB.
---

# Postgres schema, access and the local test database

Make each schema change one additive, numbered migration in `supabase/migrations/`, and prove every access rule as the restricted login, never the owner. A check run as the owner, service or admin login skips row-level security and passes whether or not the rule works; reject that proof.

## Schema
- Prefer a column or view on an existing table over a new base table. Every new base table needs `created_at` and `updated_at`: `internal.apply_conventions()` sets `updated_at` on every public table, so an UPDATE on a table without it errors.
- Default privileges already grant `app_engine` select, insert, update, delete and `app_web` select on new public tables. To withhold one, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard the neighbouring migration uses; a grant line alone adds nothing.
- A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- A new command group is its own `cli_` module under `packages/engine/engine/w2_print/`, a Typer app that `cli.py` mounts with `add_typer`, and its commands are listed in N4's `commands` in `workflows.json`. `cli.py` sits near its 400-line ceiling; do not grow it.

## Migration numbers
- Number a new migration just above the highest on origin/main and in every open pull request's `supabase/migrations/`. Never take it from the clock (`date -u`): main's files are dated 2027, so a clock stamp sorts first and `supabase db push` refuses it.
- When builders run in parallel, the coordinator assigns each its slot up front. If a locked proof names the old filename, stop and report instead of renaming.
- Before pushing a migration, run `bin/check --db` with `TEST_DATABASE_URL` set to a local Postgres. It builds every migration with the seed and fails on an ownerless table, a stale `rules.json`, or failing grade and rule tests.

## Access rules: prove them as the restricted login
Connect as the role the rule restricts and set identity the way the app does. Before a rules change is locked, go through `references/access-checklist.md`. The points that break most often: denied rows absent and allowed rows present, both through the restricted login; views need `with (security_invoker = true)`; unlisted tables default closed for the restricted role.

## Derived lists, links and timetables
Recomputable lists are views. Machine-made links record their run and undo by it. Matching stops at the first rule with candidates and never links past a tie. Every printed count is also given per fortnight. Details in `references/engine-data-rules.md`.

## Local test Postgres for proofs
Run every database-backed proof against the throwaway local cluster, never production. Check it with `pg_isready -h 127.0.0.1`: a refused connection means stopped, not lost. Restart and rebuild per `references/restart-test-postgres.md`. Build a fresh database per proof from the base template, apply the migration with `ON_ERROR_STOP=1`, and read back the seeded values before trusting a proof. Export `TEST_DATABASE_URL` only for the one command that needs it.
