# UI-6: Timetable pages (timetable, fortnight, draft, moves, rules)

Issue #580.

Tier 2. Waits for: CP-6, CP-11, CP-12 and CP-22 (all merged on main). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: docs/frontend/wireframes/ (timetable, fortnight, draft, moves, rules).

### In plain English

The timetable for everyone, and for the coordinator the fortnight's work: the rules, a draft built from them, moves by hand (a clash needs her reason), Approve and Go live. Educators see the same pages read-only.

### What

The timetable's day, week and fortnight views and the timetable rules, the fortnight node with Approve and Go live, the draft from the rules with its unmet rules, and moves by hand with clashes accepted by the coordinator only. Built only from the shared blocks (FortnightGrid, FilterBar, DataTable, Stepper, Cards, Form, Details) and the frame. A week is a date; a child's class and roll come from `child_now`. The existing `educator.timetable_enabled` gate and its tests are kept as they are. Until this merges the bar's Timetable door opens the page that exists today.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says, as educator (read-only) and as coordinator; the slice's last commit adds `UI-6` to `merged_slices`.
2. As educator, Approve, Go live, Make a draft, Accept the clash are absent and their requests are refused (test both).
3. The plan routes the backend exposes (the fortnight move, the timetable link apply and the timetable generate routes) check only that the actor is on the staff list, so the website checks the coordinator group itself before calling each: an educator's request to each is answered 403 by the web layer (test, one per route).
4. Go live updates sessions in place and lists every changed session on the fortnight page; a hand move after freeze is kept with who and why and shows amber on the grid (database and DOM).
5. The journey `e2e/the-coordinators-fortnight.spec.ts` passes: Today (coordinator) → the red clash row → Moves → accept with a reason → Fortnight → Approve → Go live → Timetable shows the change as educator; axe at each step.
6. Every one of the 42 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; controls whose backend piece is not on main sit on the inventory's pending list with a reason.
7. Timetable: its stated purpose holds: the fortnight is the unit, week A and week B, each period a block, a moved period marked, a clash red until the coordinator accepts it
8. Timetable: a hand move shows an amber outline and its details name who and why
9. Timetable: an educator never sees an accept-clash control; a clash cell is red for both roles
10. Timetable: the grid's cells equal the session rows for the day shown (count and names)
11. Timetable rules: the page sits under Timetable in the menu, not Setup
12. Timetable rules: every edit shows who and when, and the history fold lists it
13. Fortnight 9: Approve and Go live exist for the 'everything' group only and their requests are refused for others
14. Fortnight 9: a frozen fortnight shows no Approve, Go live or edit control
15. Fortnight 9: the what-changed table lists every session the go-live updated, and nothing else
16. Draft from the rules: the draft shown equals the slots the generator wrote (count and cells)
17. Draft from the rules: every unmet rule row names a rule row that exists
18. Draft from the rules: Make a draft never changes a live fortnight's sessions (count unchanged before and after)
19. Moves by hand: a move changes only its own fortnight's sessions
20. Moves by hand: as educator the page is read-only: no pick, no Accept, and the requests are refused
21. Moves by hand: every move is listed with who made it and when, and an undo is a new row

### Out of scope

Materials (UI-9); reports; any change to supabase/ or packages/engine; a new gate or a change to the `educator.timetable_enabled` behaviour.

