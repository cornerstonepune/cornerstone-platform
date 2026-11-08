# CP-7: The week inside the fortnight: draft, approve only what changed, an unchanged week rolls forward

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/487 (draft, not locked)
Scope status: DRAFT for Nimish. Not locked: no `scope-locked` label, no proofs.

Waits for CP-6 (the fortnight cycle), and through it for CP-3 (the groups) and CP-4 (every new table listed as child
data or school-wide). Plan: docs/backend-plan.md. Roadmap task M1-06 (its approval step). Tier 3 (data change).
Design: specs/CP-7/design.md. Written for decision 1 option (a) and decision 2 "yes" (both below); Nimish edits before locking.

## What

Today the K2 timetable goes straight to the educators' screens and nobody approves it. This adds the approval at the
school's own unit: each fortnight has week A and week B, and each week of a class is drafted and compared with the same
week (A with A, B with B) of the class's last settled fortnight. Only the periods whose place in the timetable changed
need a person's approval; a week with no change rolls forward with no approval. Fortnight 10 and December's fortnight
(11) of 2026-27 are named exceptions where every period needs a person. A fortnight cannot be marked approved until all
its weeks are settled.

## Done when

1. Drafting a class's week A or week B of a fortnight records one line per period and weekday of that week, each on its
   real date, with who drafted it and when. (Test.)
2. A week whose every line matches the same week of the class's last approved or rolled-forward fortnight is recorded
   as rolled forward and writes no approval. A period removed earlier and approved once does not count as a change
   again. (Test.)
3. Each line that differs, including a period removed, is marked changed. Approving it writes exactly one approval row
   with who and when; an approved line has exactly one. (Test.)
4. A week counts as approved only when every changed line is approved; a line sent back (with a reason) can be approved
   later. (Test.)
5. Drafting a week again with nothing changed writes nothing new; after a fix, lines already approved stay approved.
   (Test.)
6. In a fortnight listed as an exception for its school year (a setting per school; default 2026-27 Fortnights 10 and
   11), nothing rolls forward: every line needs approval, and one action approves all open lines, still one row each.
   (Test.)
7. Only a member of the approving group (a setting per school; default the "Everything" group) can decide a line, by the
   function or by writing the tables directly; anyone else is refused by the database. (Test.)
8. A fortnight cannot be marked approved (CP-6's step) while any of its weeks is not settled or no longer matches the
   timetable. (Test.)
9. The existing timetable and approval-list tests and the timetable pages pass unchanged. (Test: existing suites.)
10. LIVE: the two settings rows exist for every school and the new tables exist. (Read-only count.)

## Out of scope

Any screen (the approve button, the coordinator's list). Approval does not hide or change anything educators see yet.
Approving the planner's words inside a period (decision 1 option (b)). Moving a fortnight on its date. The materials
list (CP-17, CP-18). The timetable generator (CP-11). Reminders.

## Decisions for Nimish before locking

1. What the coordinator approves: (a) only changes to the timetable grid, compared with the last approved fortnight
   (recommended: the planner's words are the school's own text, copied, and already locked by CP-6's freeze); or (b)
   every planner line of every new fortnight (roughly 20 to 25 lines a week; approximate). If (b), lines 1 to 3 and 6
   change.
2. A fortnight cannot be marked approved until all its weeks are settled: recommended yes. If no, line 8 is dropped.
