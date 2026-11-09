# CP-24: the backend audit's Core fixes (India time, screen routes, job watch, backups)

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/510
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 9 Nov 2026)

## What

this fixes the backend audit's findings (9 Nov 2026, Fable reviewer) that belong in Core and are not already riding on another scope. It covers four things:
- one clock (India time) everywhere;
- a route for each Core action a screen will call;
- a watch that says when the nightly job stopped;
- a written backup and restore plan.

Lean: each item is the smallest working fix. The audit's evidence is quoted in each line.

## Done when

1. No migration or engine code computes the school's date from the server's clock:
   - `move_child` (20270111090000) and `hand_check.checked_on` (20270125090000) use `internal.school_day(...)`;
   - Python and web code read the time zone from the `school.time_zone` setting, not a hard-coded "Asia/Kolkata".
   A test fails if `current_date` appears in a new migration or the zone string appears outside the seed. (Audit F5.)
2. A move of a child made at 01:00 IST is dated that IST day, not the day before. (Test.)
3. Each of these has one thin keyed engine route beside its command:
   - reading and moving a fortnight's state (CP-6);
   - making a timetable draft (CP-11);
   - linking a fortnight's plan lines and listing unmatched lines (CP-8).
   Each route is in the website's generated route list. (Test per route.) (Audit F6.)
4. `engine live watch` reports a problem when the school's step settings are not in the order freeze > align > approve > list_sent (days before the fortnight starts, largest first); `step_date` keeps working with whatever values are set. (Test.) (Audit F9.)
5. `engine live watch` reports a problem when the newest ok nightly run in `graph_run` is older than `graph.nightly_stale_hours`. (Test; LIVE: box-only read.) (Audit F1.)
6. `docs/backup.md` states:
   - the Supabase backup or point-in-time setting in use (read from the project, not guessed);
   - the Lightsail snapshot retention for the box's data folder;
   - a restore drill onto the test database that has been run once, with its date.
   It also states the 48-hour voice promise next to the longest backup retention. (Audit F10.)
7. `docs/backend-plan.md` gains one rule: a Core scope that a screen will call ships one keyed route beside its command. (Audit F6.)

## Out of scope

- the access-rule cost (F7) and the child class columns (F4), which go with the restricted-login switch;
- the ring-A delete in move_child (F8);
- the two settings tables (F14);
- CORS (F15);
- the harness banner (F12);
- any screen.

The guard checks (F2, F3) are CP-23 (#508). The CP-21/CP-22 rename (F11) is #509. The voice clock fix (F13) rides on CP-10.

Tier 3 (migrations).
