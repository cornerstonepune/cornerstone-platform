# CP-3: Role rules on children, enrolment, staff and notes

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/451
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 8 Nov 2026)

## What

Turns the database's access rules on for the four most sensitive kinds of data: children, enrolment, staff, and observation notes. After this, a person sees only what their group allows, decided by the database and not by the screen. Today every rule says "allow everyone".

The three groups (Nimish, 8 Nov 2026), each a row mapping role codes to a group, never a name in code:
- **Everything:** coordinator, deputy coordinator, mentor, head, curriculum team, ops. They see all children, classes and notes.
- **Own classes:** educator, class teacher, subject educator, cover educator, specialist, assistant. They see only the classes and subjects they hold a current grant for.
- **Everyone signed in** sees the question bank, curriculum, plan and timetable.

## Done when

1. The groups are stored as rows (role code to group, group to kinds of data); changing a group, or adding a role to one, is an insert or update with no code change. (Test.)
2. Every role code in the `role` table belongs to exactly one group. (Test.)
3. Run as an educator of class X, a query for class Y's children, enrolment and notes returns 0 rows. (Database test in CI.)
4. With no identity set, a query on children, enrolment, staff or notes returns 0 rows. (Database test.)
5. Run as a person in the "everything" group, the same queries return every row. (Database test.)
6. A staff member's private details are readable only by the "everything" group and by that person. (Test.)
7. The existing website pages and speed tests pass unchanged for a person who is allowed to see them.
8. LIVE: none of the four kinds of data has a rule that allows everyone, and the site connects with the restricted database login, not the owner login (the owner login skips every rule). Read-only counts, no names.

## Out of scope

Rules on any other table (CP-4). Letting the head and coordinator give and end roles from a screen (not decided). Safeguarding records (no table yet). Any screen. Changing how people sign in. Setting the restricted login's password (needs Nimish).
