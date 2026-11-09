---
name: database-changes
category: database
description: Use when editing Postgres migrations, tables, RLS or grants.
---

# Database and engine schema changes: additive, and proven as the restricted role

Make a schema change as one additive numbered migration in `supabase/migrations/`, preferring a column or view on an existing table over a new base table. Settle these points before the design locks, not in review. A rule is proven only by a check that connects as the restricted role.

## Migration shape
- **Timestamps.** Every new base table needs `created_at` and `updated_at`. `internal.apply_conventions()` attaches a trigger that sets `updated_at` on every public table, so an UPDATE on a table without that column errors (undo and relisting both UPDATE).
- **Grants.** Default privileges already give `app_engine` select, insert, update and delete, and `app_web` select, on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard the neighbouring migration uses; a grant line alone adds nothing.
- **Constraints.** A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- **Commands.** A new command group goes in its own `cli_` module under `packages/engine/engine/w2_print/`, a Typer app that `cli.py` mounts with `add_typer`; list its commands in N4's `commands` in `workflows.json`. `cli.py` sits near its 400-line ceiling, so do not grow it.
- **Derived lists are views.** A recomputable unmatched or candidate list is a view; a stored one goes stale after a loader reload, a new activity or an undo.

## Detail
- Access rules (row-level security, grants, views): `references/access-rules.md`. Prove them as the restricted role; a check run as owner, service or admin skips row-level security and passes whether or not the rule works. Reject such proofs.
- Machine-made links, matching rules and timetables: `references/links-matching-timetables.md`.
