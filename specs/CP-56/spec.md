# CP-56: the timetable test no longer fails on Mondays after 18:21 IST

Issue #784.

## What

`apps/web/tests/u75-timetable-b.spec.ts` ("a period recorded done carries Done, one over and not recorded Late, and a
period still to come none") failed every Monday from 18:21 to midnight IST. Its fixture starts on this week's Monday,
so on a Monday that day is today, and the fixture's last period (18:21, no end) is then "do now" for the rest of the
evening. The app is right; the test depended on the day and hour it ran.

## Done when

1. The three checks are made on a day that is never today, next week's Monday of the fixture:
   `apps/web/tests/u75-timetable-b.spec.ts` (the test named above).
2. The app's rule (`apps/web/lib/educator/chip.ts`) is unchanged and the test still checks Done, Late and none.

## Out of scope

The u66 and u68 speed limits that failed on slow runners the same day.
