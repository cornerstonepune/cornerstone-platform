---
name: database-schema-and-access
description: Use when editing Postgres migrations, tables or RLS grants.
category: database
---

# Database schema and access: additive migrations, access proven as the restricted role

Make every schema change one additive numbered migration in `supabase/migrations/`, and prove every access rule as the restricted login. A check run as the owner, service or admin login skips row-level security and passes whether or not the rule works; reject any such proof.

## Schema changes

- Prefer a column or a view on an existing table over a new base table.
- Timestamps: every new base table needs `created_at` and `updated_at`. `internal.apply_conventions()` attaches a trigger that sets `updated_at` on every public table, so an UPDATE on a table without that column errors.
- Grants: default privileges already give `app_engine` select, insert, update and delete, and `app_web` select, on new public tables. To withhold a privilege, add an explicit `revoke` inside the `if exists (select from pg_roles ...)` guard the neighbouring migration uses; a grant line alone adds nothing.
- Constraints: a new constraint means regenerating `packages/engine/engine/checks/rules.json` with `engine live rules --write`, or `tests/test_rules.py` fails.
- Commands: a new command group goes in `packages/engine/engine/w2_print/cli_<name>.py` as a Typer app that `cli.py` mounts with `add_typer`, and its commands are listed in N4's `commands` in `workflows.json`. `cli.py` is near its 400-line ceiling; do not grow it.
- Derived lists are views: an unmatched or candidate list that can be recomputed is a view. A stored list goes stale when a loader reload, new activity or an undo changes the rows.
- Machine-made links: record the run on each row (`link_run uuid`, `link_rule text`, `linked_by`) and undo with `where link_run = $1`. After an undo, every row it touched must still appear on a list.
- Matching rules: stop at the first rule that yields candidates. Exactly one links; two or more are listed with a reason such as `several_matches` and never linked. A looser later rule must not link past a tie.
- Timetables: the fortnight is the unit of planning. Every count a command or proof prints is also given per fortnight (`fortnight.number` via `plan_entry.fortnight_id`, with `week_code` for week A/B). Reuse `fortnight`, `plan_entry.fortnight_id` and `week_code`; do not add a fortnight table.

## Access rules: prove them as the restricted role

A rule is proven only by a check that connects as the role it restricts and sets identity the way the app does. Before a rules change is locked, confirm:

- Denied rows are absent and allowed rows are present, both asserted through the restricted login.
- Every member of the closed set the rule classifies (each role code, group, kind) sits in exactly one group. A code left out blanks its holders silently.
- When two systems name the same person (the sign-in id and the table's key), the rule resolves the id the request actually carries. A mismatch shows everyone nothing.
- Before a rule goes live, the data its users depend on exists (class records, grants, enrolments). Otherwise switching the rule on blanks their screens.
- Views: check `pg_class.reloptions` for `security_invoker = true` on each view that exposes restricted data; never assert either way from memory. A view without it runs with its owner's rights and skips row rules. Security-definer functions always run as owner: list each one that takes an id of restricted data, then cover it or name it out of scope.
- Before saying which login a suite, the site or a test uses, read its CI workflow and env file. A browser suite may already run as the restricted login, so a rules change turns it red on merge unless its test users hold the rows they read. Grep the test suite for the login's name: role tests that list grants or functions a login may hold also go red.
- Unlisted tables default to closed for the restricted role; a test fails until someone classifies each new table.
