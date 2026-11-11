# UI-9: Materials (read-only first)

Issue #593. Tier 2. Specification: docs/frontend/SPEC.md ("Materials, this fortnight"); inventory: docs/frontend/screens.json (`materials`); wireframe: docs/frontend/wireframes/materials.html.

### In plain English
The materials list for a fortnight on the new frame: what each class needs, which lines still need a quantity ("to confirm"), the school's list for the coordinator, and the notes the system could not read. This increment only reads. The old page keeps the buttons that change things.

### What
`/timetable/materials`: day / week / fortnight filter, the class's lines (item, quantity, activity, source) with an amber "to confirm" chip where there is no quantity, a "Notes to read" filter, a My class / School list tab for the coordinator, rail links to the activities and the fortnight.

### Done when
1. The day / week / fortnight filter changes which lines are shown.
2. A line with no quantity carries the amber "to confirm" chip; a line with one does not.
3. Each line's activity is a link to that activity.
4. The School list tab exists for the coordinator; for the educator it is absent and the address answers that the list is the coordinator's.
5. "Notes to read" shows only the notes the system could not read.
6. A class that is not the signed-in person's own is not found.
7. The old three materials pages still open and no old spec is changed.

### Out of scope
Stock counting, inventory valuation, sending and reminders (off), approval (CP-17), send records (CP-18), the photo control, and Quantity / Remove / Add on this screen (UI-9b). No database or engine change.
