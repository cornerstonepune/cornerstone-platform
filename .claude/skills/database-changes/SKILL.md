---
name: database-changes
category: database
description: Use when writing Postgres migrations, grants, RLS or views.
---

# Database changes: migrations, grants and row rules

Make each schema change one additive numbered migration in `supabase/migrations/`. Prove every access rule as the restricted login, never the owner: a check run as owner, service or admin skips row-level security and passes whether or not the rule works.

## Schema
- Prefer a column or a view on an existing table over a new base table.
- Every new base table needs `created_at` and `updated_at`. `internal.apply_conventions()` sets `updated_at` on every public table, so an UPDATE on a table without it errors.
- Default privileges already give `app_engine` select, insert, update and delete, and `app_web` select, on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard the neighbouring migration uses. A grant line alone adds nothing.
- A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- Changing a seeded default (a value a migration inserts into `config` or another seed table): first grep `specs/*/proofs` for the old value. A locked proof that asserts it cannot be changed without unlocking the spec; a value no proof asserts can change. Then the migration header and the seed description cite the decision that set the new value (for example `D-072`) and drop the word "placeholder".
- A new command group lives in `packages/engine/engine/w2_print/cli_*.py` as a Typer app that `cli.py` mounts with `add_typer`, and its commands are listed in N4's `commands` in `workflows.json`. `cli.py` sits near its 400-line ceiling; do not grow it.

## Access and row-level security
- Prove denied rows are absent and allowed rows present, both through the restricted login with identity set the way the app sets it. Full checklist: `references/access-proof-checklist.md`.
- Check `pg_class.reloptions` for `security_invoker = true` on every view that exposes restricted data. Never assert either way from memory.
- Unlisted tables default closed for the restricted role, so classify each new table or a test fails.

## Engine data rules
- Derived lists, machine-made links, matching rules and the fortnight rule are in `references/engine-data-rules.md`. Read it before changing any command that links rows or prints a count.
