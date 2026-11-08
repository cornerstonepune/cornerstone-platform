# CP-21: A draft goes live

Source: DRAFT for Nimish (GitHub issue to follow). Not locked.

Split out of CP-12 by Nimish on 8 Nov ("yes to all, split it"). Waits for CP-11 (the generator makes the draft), CP-6 (the fortnight cycle and its freeze) and CP-4 (the access table list). CP-12 (moving lessons by hand) waits for this. Plan: docs/backend-plan.md (a new row, CP-21). Roadmap task M1-14. Tier 3 (data change). Design: specs/CP-21/design.md.

## What

A person puts one generated draft live for one class and one fortnight, so the educator's day shows the generated timetable. Every lesson keeps its plan line and its materials lines; nothing is silently deleted. A fortnight of any length works, including the 15-day Fortnight 10. Going live is kept with who, when and which draft, and it never overwrites a fortnight that a person changed since it last went live unless they say so, and that is recorded.

## Done when

1. Putting a placed draft live for a class and a fortnight makes the educator's day show, on every date of that fortnight, exactly the draft's lessons in the draft's periods; fortnights before and after are unchanged. (Test.)
2. Every date of a 15-day fortnight is live, including a weekday that comes twice; a holiday has no lessons. (Test.)
3. Each lesson that was already planned keeps its plan line and its materials lines when it moves, and the materials' dates move with it; week A plan lines stay in week A; circle, lunch and specialist lessons stay where they are; no materials line is lost. If a lesson with materials lines would be left with no place, would move outside its materials list's dates, or its list was already sent, or a lesson is already marked, the whole step stops with a list of those lessons, and nothing is written. (Test.)
4. A draft whose rules have changed since it was made, a draft that did not place every lesson, a fortnight that has already started, or a date with no school day on record is refused with the reason, and nothing is written. Putting one fortnight live does not make another fortnight's draft out of date. (Test.)
5. Only the coordinator group (a setting per school, that group by default) can put a draft live; anyone else is refused and nothing is written. Going live is kept with who, when and which draft; the record cannot be changed or deleted. (Test.)
6. Putting a draft live over a fortnight whose timetable a person changed since it last went live is refused, unless the person says to discard those changes; the discard is recorded with who. (Test.)
7. In a frozen fortnight, going live without a reason is refused; with a reason it is kept. (Test.)
8. A trial run shows what would change, date by date, and writes nothing. LIVE: on the box, a trial run for the K2 class's next teaching fortnight prints its counts and changes nothing (read-only). Loading the school's sheet again refuses a fortnight that is live. The existing website pages and engine tests pass unchanged.

## Out of scope

Making the draft (CP-11). Moving lessons by hand and clashes (CP-12). Undoing a fortnight back to the school's sheet (putting another draft live is the way back). Several classes at once. Which adult leads a lesson (added for grades 1 to 4 later; nothing here blocks it). Rooms. Any screen.

## Decided by Nimish (8 Nov)

Only the coordinator puts a draft live. The fortnight is the unit of the timetable; week and day views are derived later, so nothing here keeps a per-week or per-day store.
