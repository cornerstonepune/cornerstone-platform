# CP-7: The fortnight's timetable: draft, approve only what changed, an unchanged fortnight rolls forward

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/487 (draft, not locked)
Scope status: DRAFT for Nimish. Not locked: no `scope-locked` label, no proofs.

Waits for CP-6 (the fortnight cycle), and through it for CP-3 (the groups) and CP-4 (every new table listed as child
data or school-wide). Plan: docs/backend-plan.md. Roadmap task M1-06 (its approval step). Tier 3 (data change).
Design: specs/CP-7/design.md.

## What

Today the K2 timetable goes straight to the educators' screens and nobody approves it. This adds the approval at the
school's unit, the fortnight: each class's fortnight timetable is drafted and compared with its last approved
fortnight, and only the periods that changed need a person's approval. An unchanged fortnight rolls forward with no
approval. Weeks A and B, days and periods are views of the fortnight, with no approval of their own. Fortnight 10 and
December's fortnight (11) of 2026-27 are named exceptions where every period needs a person. The fortnight cannot be
marked approved until every class's fortnight is settled.

## Done when

1. Drafting a class's fortnight records one line per period of each school day of weeks A and B, each on its real date,
   with who drafted it and when. (Test.)
2. A fortnight whose every line matches the class's last approved or rolled-forward fortnight is recorded as rolled
   forward and writes no approval. A period removed earlier and approved once does not count as a change again. (Test.)
3. Each line that differs, including a period removed, is marked changed. Approving it writes exactly one approval row
   with who and when; an approved line has exactly one. (Test.)
4. A class's fortnight counts as approved only when every changed line is approved; one action approves all open lines,
   still one row each; a line sent back (with a reason) can be approved later. (Test.)
5. Drafting a fortnight again with nothing changed writes nothing new; after a fix, lines already approved stay
   approved. (Test.)
6. In a fortnight listed as an exception for its school year (a setting per school; default 2026-27 Fortnights 10 and
   11), nothing rolls forward: every line needs approval. (Test.)
7. Anyone in the coordinator or "Everything" group (a setting per school) can approve; anyone else is refused by the
   database, by the functions or by writing the tables directly. (Test.)
8. The fortnight cannot be marked approved (CP-6's step) while any class's fortnight is not settled or no longer matches
   the timetable. (Test.)
9. The existing timetable and approval-list tests and the timetable pages pass unchanged. (Test: existing suites.)
10. LIVE: the two settings rows exist for every school and the new tables exist. (Read-only count.)

## Out of scope

Any screen (the approve button, the coordinator's list). Approval does not hide or change anything educators see yet.
Approval per week, day or period. Approving the planner's words inside a period (locked by CP-6's freeze). Moving a
fortnight on its date. The materials list (CP-17, CP-18). The timetable generator (CP-11). Reminders.
