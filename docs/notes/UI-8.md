# UI-8: Reports

Branch `ui-8-reports`, issue #594. Scope: `specs/UI-8/spec.md`.

## State (10 Nov 2026)

Built: `/children/reports` (FilterBar class and state; DataTable child · class · report state · educator approved · consent; a fold per child with the report's words, read-only). Not in the menu yet: `tests/u60` pins the menu's exact items, so the entry moves with UI-8b (the route is listed in `u13` NOT_BY_CLICK with that reason). Reads only what main holds: the newest `parent_note` report and its one educator approval, `consent_now`. Old `/growth/reports` and `/growth/[id]/parent` stay live (they hold write, edit and approve). `UI-8` is NOT added to `merged_slices`: the inventory's completeness check lists 11 controls and 6 of them wait on CP-19.

## Pending list (controls and figures that wait on CP-19, with the reason)

| Item | Reason |
|---|---|
| Columns: lines drafted, coordinator approved, sent | no table holds a child's report lines, a coordinator approval or a sent time (DATA-GAPS.md, `reports`) |
| field: a line's words | there are no lines, only one whole report per child; editing stays on the old page |
| button: Approve (educator, a line) | today an educator approves the whole report on `/growth/[id]/parent` |
| button: Approve (coordinator, a line) | no coordinator approval exists |
| button: Send (a child) | no send, and no sent time |
| button: Preview the parent's copy | no PDF route of a parent's copy; its 'educator'/level-words/lockup tests (Done when 3, 4, 7 of the scope) come with it |
| link: rail: the child | `child` screen not built, so not drawn (never a dead link) |

## Decisions

| Choice | Reason |
|---|---|
| Consent column only for a viewer whose `my_reach('consent')` is not none | the school's access rule: the coordinator alone sees consent; an educator is shown no column rather than a guessed "not recorded" (first CI run caught this). A coordinator sees "none on record: needed" / "withdrawn: needed" and a line saying consent must be on record before any report can be sent (live has 0 consents, so no send can work yet) |
| Rows ordered by class and Sr. No. only | CP-19: educator figures are whole counts, never a score, rate, rank or ordering of a person |
| No Approve button drawn yet | an approve that means "whole report" would be replaced by a per-line one; the old page keeps it |
