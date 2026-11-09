---
name: postgres-database-work
category: database
description: Use when editing Postgres migrations or proving RLS/grants.
---

# Postgres work: one additive migration per change, and access proven as the restricted login

Make each schema change one additive numbered migration in `supabase/migrations/`, preferring a column or a view over a new base table. Prove each access rule through the restricted login only: a check run as the owner, service or admin login skips row-level security and passes whether or not the rule works.

## Schema changes

- **Timestamps.** Every new base table needs `created_at` and `updated_at`. `internal.apply_conventions()` sets `updated_at` on every public table, so an UPDATE on a table without that column errors.
- **Grants.** Default privileges already give `app_engine` select, insert, update and delete, and `app_web` select, on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard the neighbouring migration uses. A grant line alone adds nothing.
- **Constraints.** A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- **Commands.** Put a new command group in `packages/engine/engine/w2_print/` as a Typer app named for the group, mounted by `cli.py` with `add_typer`, and list its commands in N4's `commands` in `workflows.json`. `cli.py` is shared and near its 400-line ceiling, so do not grow it.
- **Derived lists are views.** A list that can be recomputed is a view. A stored list goes stale after a loader reload, a new activity or an undo.
- **Machine-made links.** Record the run on each row (`link_run`, `link_rule`, `linked_by`) and undo with `where link_run = $1`. After an undo, every row it touched must still appear on a list.
- **Matching rules.** Stop at the first rule that yields candidates. Exactly one links; two or more are listed with a reason such as `several_matches` and never linked.
- **Timetables.** The fortnight is the planning unit. Every count a command or proof prints is also given per fortnight, via `plan_entry.fortnight_id` and `week_code`. Reuse `fortnight`; do not add a fortnight table.

## Access rules and row-level security

Before a rules change is locked, work through `references/access-rules.md`. Its core tests: assert denied and allowed rows through the restricted login, classify every member of each closed set, check that the data users depend on exists before the rule goes live, and check every view and security-definer function that exposes restricted data.

## Migrations and checks

Run `.claude/athena/fast-checks.sh` after the last edit, as in `verify-before-done`.
