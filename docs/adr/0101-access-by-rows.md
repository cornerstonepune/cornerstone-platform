# 0101. Who sees children, enrolment, staff and notes is rows, applied by the database

Status: accepted for CP-3 (Nimish, scope locked 8 Nov 2026). Stacks on CP-2 (`public.current_staff()`).
Goal: none — the Athena scope CP-3 (locked scope: specs/CP-3); no goal file covers it.

## Decision
- Role → group (`access_role_group`), group → kind of data (`access_reach`: all / own / none), kind → tables
  (`access_table`) are rows. Changing a group is an insert or update.
- `internal.apply_conventions()` (it ends every migration) turns `access_table` into policies: `engine_all` for the
  engine, `web_rule` for the website; every other policy on a listed table except `service_role_all` is dropped.
  Tables not listed keep `app_all` until CP-4.
- Who is asking: the sign-in list entry id the website sets (`current_staff()`), matched by email to one active
  staff row (`internal.resolve_staff()`). Anything else sees nothing. The match is stored as `staff.signin_id`, kept
  by triggers on the sign-in list and on `pii.staff`, and not worked out from the list on every question: a function
  that reads a protected table asks again on every call, and worked out from the list a question cost 0.33 ms
  (a key lookup costs about 0.05 ms). Limit: a person listed twice on the sign-in list resolves by one of the entries.
- `own` = the classes of the person's current grants (ends on `valid_to`, the first day it no longer holds); for
  staff, their own row. The class decides, not the subject.

## Rejected
- Hand-written policies: `apply_conventions` re-runs every migration and would drop them; CP-4 needs the same list.
- Restrictive policies: they need a permissive `using (true)` base, the very thing the live check forbids.
- Trusting `staff.id` set directly: nothing sets one.

## Known limits
- Backstop against a website mistake, not against someone holding the `app_web` password (they can claim any identity).
- `pii.read_child` is not changed; a child's id seen through another table still leads to a name (CP-4).
- `special_educator` is seeded in `everything` (Nimish's lists did not place it); one update moves it.
- A sign-in email edited without `pii.staff` re-synced makes that person see nothing (fails closed).
