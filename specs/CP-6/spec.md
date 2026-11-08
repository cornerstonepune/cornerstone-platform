# CP-6: The month cycle

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/454
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 8 Nov 2026)

## What

Gives every month a state the coordinator can rely on: planning, frozen, aligned, approved, list sent. Step dates are settings per school, and a frozen month cannot be changed quietly. Today there is no month state and "frozen" is hard-coded to no.

## Done when

1. A month has one state from the list above, with who and when recorded for every step. (Test.)
2. Step dates are settings per school with the roadmap's defaults; a date that falls on a holiday moves to the working day before. (Test.)
3. Changing a frozen month's timetable or activities without a reason is refused by the database; with a reason it succeeds and the reason is recorded. (Test.)
4. A step cannot be skipped: approving a month that was never frozen is refused. (Test.)
5. Each state change writes an edit-history row. (Test.)
6. No hard-coded "frozen" remains in the engine or the website. (Test: search.)
7. LIVE: the current month has a state row and the settings rows exist. (Read-only count.)

## Out of scope

The weekly draft and approval (CP-7). The materials list (CP-17, CP-18). Any screen.
