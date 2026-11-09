# CP-7: The fortnight's timetable: one approval per fortnight, an unchanged fortnight rolls forward

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/487
Scope locked by: Nimish (the label scope-locked on pull request #488, 8 Nov 2026). Reduced to the lean version at his request: he typed UNLOCK CP-7 on 9 Nov 2026.

Waits for CP-6 (the fortnight cycle), and through it for CP-3 (the groups) and CP-4 (every new table listed as child
data or school-wide). Plan: docs/backend-plan.md. Roadmap task M1-06 (its approval step). Tier 3 (data change).
Design: specs/CP-7/design.md.

## What

Today the K2 timetable goes straight to the educators' screens and nobody approves it. This adds one approval at the
school's unit, the fortnight: each class's fortnight timetable is drafted and compared with its last approved
fortnight. If nothing differs, it rolls forward with no approval. If anything differs, one person approves the whole
fortnight with one yes. Weeks A and B, days and periods are views of the fortnight, with no approval of their own.
Fortnight 10 and December's fortnight (11) of 2026-27 are named exceptions that always need a yes. The fortnight cannot
be marked approved until every class's fortnight is settled. The system does not say which periods changed.

## Done when

1. Drafting a class's fortnight records one line per period of each school day of weeks A and B, each on its real date,
   with who drafted it and when. (Test.)
2. A fortnight whose every line matches the class's last approved or rolled-forward fortnight is recorded as rolled
   forward and writes no approval. A fortnight with any difference is recorded as waiting for approval. (Test.)
3. Approving a class's fortnight records exactly one approval, with who and when, on that fortnight, and it then counts
   as approved. A fortnight that rolled forward has none. (Test.)
4. Drafting a fortnight again with nothing changed writes nothing new. (Test.)
5. In a fortnight listed as an exception for its school year (a setting per school; default 2026-27 Fortnights 10 and
   11), nothing rolls forward: it always needs a yes. (Test.)
6. Anyone in the coordinator or "Everything" group (a setting per school) can approve; anyone else is refused by the
   database, by the function or by writing the tables directly. (Test.)
7. The fortnight cannot be marked approved (CP-6's step) while any class's fortnight is not settled or no longer matches
   the timetable. (Test.)
8. The existing timetable and approval-list tests and the timetable pages pass unchanged. (Test: existing suites.)
9. LIVE: the two settings rows exist for every school and the new tables exist. (Read-only count.)

## Out of scope

Any screen (the approve button, the coordinator's list). Showing which periods changed. A record of who approved which
period. Approval does not hide or change anything educators see yet. Approval per week, day or period. Approving the
planner's words inside a period (locked by CP-6's freeze). Moving a fortnight on its date. The materials list (CP-17,
CP-18). The timetable generator (CP-11). Reminders.
