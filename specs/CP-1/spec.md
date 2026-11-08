# CP-1: People, complete

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/448 (DRAFT, not locked)

### What

The system knows every member of staff, which classes they teach, and keeps a full history of what changes. Today the people record has 3 staff against 7 on the sign-in list, moving a child does not touch enrolment, and adding an activity or an objective link leaves no edit-history row. This gives the access rules (CP-3, CP-4) real people to test against. Default decision (Nimish, 8 Nov 2026): load all 7.

### Done when

1. LIVE: the number of staff in the people record equals 7, the number on the sign-in list, and every staff row has an open role grant. (Read-only counts, no names.)
2. The sign-in list is left in place, unchanged by this work.
3. Moving a child to another class closes that child's open enrolment row and opens a new one, in one step; a child never has two open rows. (Test.)
4. K2-A roll numbers on open enrolments are 1 to 22 with no gap or repeat. (LIVE.)
5. Adding an activity, or adding or changing an activity-to-objective link, writes an edit-history row recording who and when. (Test.)
6. Every table added by this work has its owner named in the data register or the map, and no staff name appears outside the private schema.

### Out of scope

Access rules by role (CP-2 to CP-4). The sign-in system itself. Any screen. Parent or child accounts.
