# CP-4: Role rules on every other table

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/452
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 8 Nov 2026)

## What

Finishes the access rules. Every remaining table is sorted into one of two kinds: child data (protected by the same three groups as CP-3) or school-wide data (open to every signed-in staff member, such as the skill registry, curriculum, plan and timetable). No rule that allows everyone is left on child data.

## Done when

1. Every table is listed in the repository as child data or school-wide, with a one-line reason for each school-wide table. (Test: the list covers every table in the database.)
2. No child-data table has a rule that allows everyone. (LIVE: read-only count of policies.)
3. Run as an educator of one class, a query for another class's children, answers and evidence on any child-data table returns 0 rows; the "everything" group sees all; no identity sees none. (Database tests, one per group, not one per role.)
4. A new table added without being listed fails a check in CI. (Test.)
5. The existing website pages and speed tests pass unchanged for people allowed to see them.
6. The engine's own jobs (nightly rebuild, typed-form pipeline) still run: the engine's full test suite passes unchanged.

## Out of scope

The groups themselves (CP-3). Rules for tables that do not exist yet (each later scope adds its own, under the check from item 4). Any screen.
