# CP-8: Every period opens its activity

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/456
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 8 Nov 2026; issue edited by Nimish's instruction to work at fortnight level)

Waits for CP-4. Plan: docs/backend-plan.md. Roadmap tasks M1-06, M1-09. Tier 3 (data change).

## What

Today 40 of 375 K2 plan lines open their activity, so about one period in nine is clickable. This links the rest where a match exists and lists, for a person to decide, the lines where none does. The fortnight is the unit the timetable is planned in, so linking, the list and every count are kept per fortnight (weeks A and B within it).

## Done when

1. The share of K2 lesson lines linked to an activity, overall and in each fortnight, is at least the target Nimish sets with the school (recorded as a decision before locking; the default proposed is every line that has a match). (LIVE: read-only count, given per fortnight.)
2. Every K2 plan line, in every fortnight, is either linked or on a named "unmatched" list with a reason, and the list shows its fortnight. None is silently unlinked. (LIVE + Test.)
3. Every lesson period in Fortnight 10 (fortnight number 10, weeks A and B) opens an activity or is on the unmatched list. (LIVE: counted.)
4. A linking run records which rule linked each line, can be limited to one fortnight, and can be undone as a whole. (Test.)
5. A decision is recorded on whether a draft marked "not written yet" may be shown to educators.
6. The existing website pages and the speed tests pass unchanged.

## Out of scope

Writing the missing activities (CP-15). Changing the Monthly Planner. Any screen.
