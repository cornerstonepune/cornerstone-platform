---
name: school-dates-one-clock
category: database
description: Use when code reads current_date, date.today, school zone.
---

# School dates: one clock, the school's zone

A school date is the school's day in `school.time_zone`, never the server's date. Take it from `internal.school_day(...)` in SQL, from the `school.time_zone` setting in Python, and from `schoolWeek()` (`apps/web/lib/school-clock.ts`) on the web.

- A new migration never uses `current_date`. `move_child` and `hand_check.checked_on` use `internal.school_day(...)`.
- The zone string lives only in `supabase/seed/`. Code reads the setting.
- Every new SQL function sets `search_path`.
- Server-only moments (storage folder names, idempotency hours, nightly stamps) stay UTC and are not school dates.
- `tests/test_one_clock.py` fails on `date.today(`, a zone-less `datetime.now()` or `current_date` in engine, `apps/web/lib` or `apps/web/app`. Run it after any date change.
- Known gap, not a pattern to copy: `created_at::date` in `apps/web/lib/queries-results.ts`, `queries-check-groups.ts` and the feedback page still reads the server date for past events.
