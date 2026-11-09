---
name: database-work
category: database
description: Use when editing Postgres migrations, tables, or RLS.
---

# Database work: additive migrations, and access rules proven as the restricted role

Make each schema change one additive numbered migration in `supabase/migrations/`, prefer a column or view on an existing table over a new base table, and prove every access rule through the restricted login before the design locks.

## Migrations and conventions
- Every new base table carries `created_at` and `updated_at`. The `internal.apply_conventions()` trigger sets `updated_at` on UPDATE, so a table without the column errors on undo and relisting.
- Default privileges already grant `app_engine` select, insert, update, delete and `app_web` select on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard the neighbouring migration uses. A grant line alone adds nothing.
- A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- Derived lists (unmatched, candidate) are views. A stored list goes stale after a loader reload, a new activity or an undo.
- Machine-made links record `link_run uuid`, `link_rule text`, `linked_by`, and undo with `where link_run = $1`. After an undo, every row it touched must still appear on a list.
- Matching rules stop at the first rule that yields candidates. Exactly one links; two or more are listed with a reason such as `several_matches` and never linked. A looser later rule must not link past a tie.

## Engine commands
- A new command group goes in `packages/engine/engine/w2_print/cli_<name>.py` as a Typer app that `cli.py` mounts with `add_typer`, and its commands are listed in N4's `commands` in `workflows.json`. `cli.py` sits near its 400-line ceiling; do not grow it.

## Timetables
- The fortnight is the unit of planning (Nimish, 8 Nov). Give every count a command or proof prints also per fortnight (`fortnight.number` via `plan_entry.fortnight_id`, with `week_code` for week A/B). Reuse `fortnight`, `plan_entry.fortnight_id` and `week_code`; do not add a fortnight table.

## Row-level security and grants: prove as the restricted role
- A rule is proven only by a check that connects as the role the rule restricts and sets identity the way the app does. A check run as owner, service or admin skips row-level security and passes whether or not the rule works. Reject such proofs.
- Before a rules change is locked, walk the checklist in `references/rls-proof-checklist.md`: denied and allowed rows, closed-set classification, identity mapping, view and security-definer exposure, the CI login, and default-closed tables.
