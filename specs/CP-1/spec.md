# CP-1: People, complete

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/448 (locked by Nimish, 8 Nov 2026)

### What

The system knows every member of staff, which classes they teach, and keeps a full history of what changes. Today the people record has 3 staff against the sign-in list's 7, moving a child does not touch enrolment, and adding an activity or changing an activity-to-objective link leaves no edit-history row (the existing triggers fire on update of an activity and on insert or delete of a link only). This gives the access rules (CP-3, CP-4) real people to test against. Default decision (Nimish, 8 Nov 2026): load all 7. The load uses the existing staff-import tool; it does not touch the sign-in list.

### Done when

1. LIVE: the number of staff in the people record equals the number of entries on the sign-in list (7 on 8 Nov 2026, recounted and dated by the builder), and every staff row has an open role grant. (Read-only counts, no names.)
2. The sign-in list is left in place, unchanged by this work. (Test: a before-and-after hash of the list.)
3. Moving a child to another class closes that child's open enrolment row and opens a new one, in one step; a child never has two open rows; a refused move changes nothing. (Test.)
4. LIVE: for the 2026-27 K2-A class, the roll numbers on open enrolments are exactly 1 to 22, no gap, no repeat.
5. Adding an activity writes an edit-history row recording who and when; adding, changing or removing an activity-to-objective link writes one too. (Test.)
6. Every table added by this work has its owner named in the data register or the map, and no staff name appears outside the private schema.

### Out of scope

Access rules by role (CP-2 to CP-4). The sign-in system itself. Any screen. Parent or child accounts. A guard that stops enrolment rows being edited by hand (noted, left for later).
