# UI-6: Timetable pages (timetable, fortnight, draft, moves, rules)

Issue #580.

Tier 2. Waits for: CP-6, CP-11, CP-12 and CP-22 (all merged on main). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: docs/frontend/wireframes/ (timetable, fortnight, draft, moves, rules).

### In plain English

The timetable for everyone, and for the coordinator the fortnight's work: the rules, a draft built from them, moves by hand (a clash needs her reason), Approve and Go live. Educators see the same pages read-only.

### What

The timetable's day, week and fortnight views and the timetable rules, the fortnight node with Approve and Go live, the draft from the rules with its unmet rules, and moves by hand with clashes accepted by the coordinator only. Built only from the shared blocks (FortnightGrid, FilterBar, DataTable, Stepper, Cards, Form, Details) and the frame. A week is a date; a child's class and roll come from `child_now`. The existing `educator.timetable_enabled` gate and its tests are kept as they are. Until this merges the bar's Timetable door opens the page that exists today.

### Done when

1. Moved to UI-6b (#586).
2. As educator, Approve, Go live, Make a draft, Accept the clash are absent and their requests are refused (test both).
3. The plan routes the backend exposes (the fortnight move, the timetable link apply and the timetable generate routes) check only that the actor is on the staff list, so the website checks the coordinator group itself before calling each: an educator's request to each is answered 403 by the web layer (test, one per route).
4. Moved to UI-6b (#586).
5. Moved to UI-6b (#586).
6. Moved to UI-6b (#586).
7. Timetable: its stated purpose holds: the fortnight is the unit, week A and week B, each period a block, a moved period marked, a clash red until the coordinator accepts it
8. Timetable: a hand move shows an amber outline and its details name who and why
9. Timetable: an educator never sees an accept-clash control; a clash cell is red for both roles
10. Timetable: the grid's cells equal the session rows for the day shown (count and names)
11. Timetable rules: the page sits under Timetable in the menu, not Setup
12. Timetable rules: every edit shows who and when, and the history fold lists it
13. Fortnight 9: Approve and Go live exist for the 'everything' group only and their requests are refused for others
14. Fortnight 9: a frozen fortnight shows no Approve, Go live or edit control
15. Moved to UI-6b (#586).
16. Draft from the rules: the draft shown equals the slots the generator wrote (count and cells)
17. Draft from the rules: every unmet rule row names a rule row that exists
18. Draft from the rules: Make a draft never changes a live fortnight's sessions (count unchanged before and after)
19. Moves by hand: a move changes only its own fortnight's sessions
20. Moves by hand: as educator the page is read-only: no pick, no Accept, and the requests are refused
21. Moves by hand: every move is listed with who made it and when, and an undo is a new row

### Split

Go live, the what-changed table, the journey, the inventory drives, the rules page's per-row Edit and the phone Day default are UI-6b (#586): the engine's Go live route is not on main and #578 is not yet merged.

### Out of scope

Materials (UI-9); reports; any change to supabase/ or packages/engine; a new gate or a change to the `educator.timetable_enabled` behaviour.

