---
name: postgres-schema-and-access
category: database
description: Use when editing Postgres migrations, grants, or RLS rules.
---

# Postgres schema changes and access rules in cornerstone-platform

Make every schema or access change as one additive numbered migration in `supabase/migrations/`, and prove every access rule by a check that connects as the restricted role. Check the points below before the design locks, not after review.

## Schema change

- **Timestamps.** Every new base table needs `created_at` and `updated_at`. `internal.apply_conventions()` attaches a trigger that sets `updated_at` on every public table, so an UPDATE on a table without that column errors (undo and relisting both do UPDATEs).
- **Grants.** Default privileges already give `app_engine` select, insert, update and delete, and `app_web` select, on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard that the neighbouring migration uses; a grant line alone adds nothing.
- **Constraints.** A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- **Commands.** Put a new command group in `packages/engine/engine/w2_print/cli_<name>.py` as a Typer app that `cli.py` mounts with `add_typer`, and list its commands in N4's `commands` in `workflows.json`. `cli.py` is shared and near its 400-line ceiling; do not grow it.
- **Derived lists are views.** An unmatched or candidate list that can be recomputed is a view. A stored list goes stale when a loader reload, a new activity or an undo changes the rows.
- **Machine-made links.** Record the run on each row (`link_run uuid`, `link_rule text`, `linked_by`), and undo with `where link_run = $1`. After an undo, every row it touched must still appear on a list.
- **Matching rules.** Stop at the first rule that yields one or more candidates. Exactly one links; two or more are listed with a reason such as `several_matches` and never linked. A looser later rule must not link past a tie.
- **Timetables.** The fortnight is the unit of planning (Nimish, 8 Nov). Give every count a command or proof prints also per fortnight (`fortnight.number`, via `plan_entry.fortnight_id`, with `week_code` for week A/B). Reuse `fortnight`, `plan_entry.fortnight_id` and `week_code`; do not add a fortnight table.

## Access rules

A rule is proven only by a check that connects as the restricted role and sets identity the way the app does. A check run as the owner, service or admin login skips row-level security and passes whether or not the rule works. Reject any such proof.

- Assert denied rows absent and allowed rows present, both through the restricted login.
- Unlisted tables default closed for the restricted role, so a test fails until each new table is classified.
- Read `pg_class.reloptions` for every view that exposes restricted data and check for `security_invoker = true`; never assert either way from memory. Security-definer functions always run as owner: list each one that takes a restricted id, then cover it or name it out of scope.

The full checklist (closed-set membership, id resolution, data that must exist before a rule goes live, and CI login checks) is in `references/rls-proof-checklist.md`.
