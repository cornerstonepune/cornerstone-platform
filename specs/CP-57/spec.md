# CP-57: Timetable in one place (no separate Fortnight page)

Issue: https://github.com/cornerstonepune/cornerstone-platform/issues/786

## What
Nimish, 16 Nov: "I don't see the merit of different tabs for week and fortnight: within the week there is already Day/Week/Fortnight. Remove the fortnight bit from the menu. Clicking any action/activity opens the activity page on the right side."

The menu has no "Fortnight" entry. What the Fortnight page and the Draft page did (state steps, Go live, conflicts, moving, the draft from the rules) lives in the Fortnight view of `/timetable`. Old addresses redirect there. In Day, Week and Fortnight a click on a lesson opens it in the right-hand panel. The Children tab says who marks, and links to that educator.

## Done when
1. The menu has no "Fortnight" item, and `?view=fortnight` falls under Timetable (Week).
2. `/timetable/fortnight/<n>?class=<c>&tab=…&from=…&to=…` redirects to `/timetable?view=fortnight&fn=<n>&class=<c>&…` with every parameter kept.
3. `/timetable/draft?fn=<n>&class=<c>` redirects to the Fortnight view on its Draft tab, and the draft's grid is shown there.
4. The Fortnight view shows the state stepper, the next step button, Go live and the Conflicts / Moves / Draft / Rules tabs; Freeze works there and comes back to it.
5. Moving works inside the Fortnight view: Move in the lesson panel, two choices on the grid, the move form.
6. A click on a lesson in each of Day, Week and Fortnight opens the panel with that lesson.
7. For a coordinator the Children tab names the class's educator and links to their staff page.

## Out of scope
Deleting the Materials page or its menu entry (CP-58); any database change; changing who may mark.

## Proofs
`apps/web/tests/u101-timetable-one-place.spec.ts`, one test per line (6 is three tests). The old fortnight, draft and go-live specs
(u74, u75, u77, u79, u80, u81, u82, u84, u93, u98) follow the new addresses.
