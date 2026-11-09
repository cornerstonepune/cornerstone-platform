---
name: engine-schema-change
category: database
description: Use when editing Postgres migrations, tables or engine CLI.
---

# Engine schema change in cornerstone-platform

Make a schema change as one additive numbered migration in `supabase/migrations/`, and prefer a column or a view on an existing table over a new base table. Check these before the design locks, not after review.

- **Timestamps.** Every new base table needs `created_at` and `updated_at`. `internal.apply_conventions()` attaches a trigger that sets `updated_at` on every public table, so an UPDATE on a table without that column errors (undo and relisting both do UPDATEs).
- **Grants.** Default privileges already give `app_engine` select, insert, update and delete, and `app_web` select, on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard that the neighbouring migration uses; a grant line alone adds nothing.
- **Constraints.** A new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- **Commands.** Put a new command group in `packages/engine/engine/w2_print/cli_<name>.py` as a Typer app that `cli.py` mounts with `add_typer`, and list its commands in N4's `commands` in `workflows.json`. `cli.py` is shared and near its 400-line ceiling; do not grow it.
- **Derived lists are views.** An unmatched or candidate list that can be recomputed is a view. A stored list goes stale when a loader reload, a new activity or an undo changes the rows.
- **Machine-made links.** Record the run on each row (`link_run uuid`, `link_rule text`, `linked_by`), and undo with `where link_run = $1`. After an undo, every row it touched must still appear on a list.
- **Matching rules.** Stop at the first rule that yields one or more candidates. Exactly one links; two or more are listed with a reason such as `several_matches` and never linked. A looser later rule must not link past a tie.
- **Timetables.** The fortnight is the unit of planning (Nimish, 8 Nov). Give every count a command or proof prints also per fortnight (`fortnight.number`, via `plan_entry.fortnight_id`, with `week_code` for week A/B). Reuse `fortnight`, `plan_entry.fortnight_id` and `week_code`; do not add a fortnight table.
