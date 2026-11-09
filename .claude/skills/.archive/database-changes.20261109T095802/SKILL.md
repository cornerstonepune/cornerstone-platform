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
- Swapping two rows whose unique key is checked immediately cannot be two plain UPDATEs: the first write collides with the other row's value. Take both rows out and put them back in one transaction, keeping their ids (the timetable move does this), or make the key `deferrable initially deferred` in a migration.
- A new command group lives in `packages/engine/engine/w2_print/cli_*.py` as a Typer app that `cli.py` mounts with `add_typer`, and its commands are listed in N4's `commands` in `workflows.json`. `cli.py` sits near its 400-line ceiling; do not grow it.
- Migration filenames: the next number comes from the highest number on main AND in every open pull request's `supabase/migrations/`, not only main's newest. Two branches on one number break whichever merges second. When several builders run at once, the coordinator assigns each its slot up front; a rename is checked against the open list before pushing. If a locked proof names the old filename, stop and report instead of renaming.
- Never take a migration number from the clock (`date -u`): main's files are dated 2027, so a clock timestamp sorts before them and `supabase db push` refuses it. Number it just above the highest on origin/main, for example one hour later.
- Before pushing a migration, run `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres bin/check --db` against a local Postgres. It builds every migration with the seed and fails on an ownerless table, a stale `rules.json`, or failing grade and rule tests. Without it, CP-6, CP-8 and CP-11 each lost a CI round on 9 Nov.

## Access and row-level security
- Prove denied rows are absent and allowed rows present, both through the restricted login with identity set the way the app sets it. Full checklist: `references/access-proof-checklist.md`.
- Check `pg_class.reloptions` for `security_invoker = true` on every view that exposes restricted data. Never assert either way from memory.
- Unlisted tables default closed for the restricted role, so classify each new table or a test fails.

## Engine data rules
- Derived lists, machine-made links, matching rules and the fortnight rule are in `references/engine-data-rules.md`. Read it before changing any command that links rows or prints a count.
