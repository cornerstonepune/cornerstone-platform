# UI grid: two fixes

- A row's time is printed once. K2 period labels are themselves the range, so the label follows the range only when it says something else (`timeOf` in `lib/timetable-grid.ts`).
- A block's Activity link opens the lesson page `/period/<period>?class=&day=` (the activity in full and the class form), not the curriculum editor under `/setup/activities`.

Proof: `u75-timetable-b` (link shape, no repeated range) and `m1-09-calendar` (the link lands on a lesson page). Local note: `m1-09-calendar` "Day view" counts 15 periods and fails on a DB where `u76-period` has run; it passes on a fresh DB.
