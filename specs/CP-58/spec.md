# CP-58: Time by subject shows planned and taught time per subject; Materials leaves the Timetable menu

Issue: https://github.com/cornerstonepune/cornerstone-platform/issues/791

## What
Nimish, 16 Nov: "Time by subject shows more classes/lessons; it should show how much of the timetable's allocation is for which subject (Maths, Science…), with a period picker: this week, this month, this quarter, this term."

Per subject: PLANNED minutes (the timetable's lessons in the period) and TAUGHT minutes (those whose state is done), each a bar and a number in hours and minutes, for one class, a grade or every class. Period: this week, this month, this quarter, this term, or two chosen dates. Materials leaves the Timetable group of the menu; its page stays.

## Done when
1. Choosing this week, this month or this quarter changes the dates shown and the figures; this term appears when `school.terms` is set and shows the term's dates.
2. Two chosen dates make the period.
3. Each subject's planned and taught minutes equal the sums of the seeded lessons' lengths (planned: all; taught: done), the totals are their sums, and the engine returns the same (`done_minutes`).
4. The class chooser offers one class, a grade and all classes (coordinator); an educator sees only her own classes.
5. A subject's row opens its lessons of the period in the right panel, each saying whether it was taught.
6. The Timetable group of the menu has no Materials item; the Materials page still opens, and the lesson panel's Materials tab links to it.

## Out of scope
Deleting or redesigning Materials; defining the school's term dates; any database migration.

## Proofs
`apps/web/tests/u93-time-by-subject.spec.ts` (lines 1, 2, 4, 5, 6 and the browser half of 3) and `packages/engine/tests/test_tt_time.py`
(`test_cp58_done_minutes_…`, the `everyone` route test).
