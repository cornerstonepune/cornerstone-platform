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

## Amended by CP-4 (every other table)
- Every table is a row of `access_table`, `data_class` `child_data` (kind, key column, key type) or `school_wide`
  (one-line `reason`). `apply_conventions()` raises, naming the table, when a base table has no row: a new table fails
  in its own migration. `app_all` is gone; school-wide tables get `web_all` (the website login, as before).
- Why school-wide stays open to the website login: sign-in itself reads and writes seven of those tables before anyone is
  signed in (`config`, `sign_in_failure`, `threshold`, `tenant`, `password_ask`, `password_link`, `web_error`), so a rule
  needing an identity would switch brute-force protection off silently. Narrowing needs sign-in moved behind a
  function first (a separate scope). Nothing is opened that was not open.
- More kinds (`papers`, `answers`, `learning`, `reports`, `who_looked`, `consent`) and key types (`sheet`, `capture`,
  `item_result` through `public.my_ids`; `section` through `public.my_sections`, for the class card, whose key is the
  class label that `school_class.section` also carries). Rows with no such key are seen by `everything` only.
  `who_looked` and `consent`: the register says the coordinator alone sees them, so `own_classes` is `none`.
- Tables that only name a class (plan, timetable, materials) hold no child: school-wide, as the scope says of plan and
  timetable.

## Rejected
- Hand-written policies: `apply_conventions` re-runs every migration and would drop them; CP-4 needs the same list.
- Restrictive policies: they need a permissive `using (true)` base, the very thing the live check forbids.
- Trusting `staff.id` set directly: nothing sets one.

## Known limits
- Backstop against a website mistake, not against someone holding the `app_web` password (they can claim any identity).
- `pii.read_child` is not changed; a child's id seen through another table still leads to a name (CP-4).
- `special_educator` is seeded in `everything` (Nimish's lists did not place it); one update moves it.
- A sign-in email edited without `pii.staff` re-synced makes that person see nothing (fails closed).
