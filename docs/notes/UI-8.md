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

## Retiring /growth/reports (draft list, 11 Nov 2026; Batch 1 with #601 has merged, so the lines, two approvals and Send are on the new screen)

Owner: UI-8. Nothing here is built. The old pages stay live until every row of "Missing" is carried across or decided away, and each old spec moves with equal assertions, never dropped or loosened.

**Old pages:** `/growth/reports` (the list), `/growth/[id]/parent` (write, edit, approve, read the letter), `/growth/[id]/report` (the child's report with its skill map and a print button), the "Parent report" panel on the child's page (`/growth/[id]`, `report-panel.tsx`).

**Missing from the new Reports screen (needs a build, or a decision):**
1. **Write a report** (`writeParentReport` → engine `POST /child/{id}/parent-report`, with the run watched on `?writing=`, and a "Refresh" for a report out of date). The new screen only reads reports and has no way to ask for one.
2. **Make lines from a draft.** The engine writes a whole report (`parent_note.body`: facts + draft); CP-19's lines live in `parent_note.lines`. Nothing turns the one into the other, and the new screen can only edit lines that already exist (no add, remove or choose evidence). Decision needed (Nimish / backend): are lines made from the draft by the engine, or typed by the educator against evidence?
3. **Edit the whole report's words** held to the facts (engine `edit`: 422 with what the words broke, 409 once approved). Old: `edit-form.tsx`. New: per-line "Save words" only.
4. **The old single approval** (`approveParentReport`, an educator in their own name, once). CP-19 replaces it with two approvals per line; what the parent's copy shows (the draft, or the approved lines) is the same decision as 2.
5. **Read the letter as a parent would** (`letter.tsx`: the child's name put in, the counts beside the words, the child's own example) and **print it**. This is "Preview the parent's copy" (a PDF), which still needs a design decision (Nimish).
6. **The child's report page** `/growth/[id]/report` (skill map, print) and its link from the parent page. No screen of the inventory replaces it yet.
7. **Out-of-date and "to write" as things to act on.** The old list is ordered by who needs a person first (out of date, then to approve, then to write) with counts. The new screen shows the states but is in class and Sr. No. order only (CP-19's school rule: never an order of people), so a coordinator cannot sort by need. The class filter and the counts "n out of date · n to approve · n to write" are the part to carry (counts are whole numbers, not a ranking of educators).
8. **Links in:** Today's "Parent reports to approve" tile and each class's report link (`lib/todo.ts` lines 94 and 165 point at `/growth/reports?class=`), the Children menu entry "Parent reports" (`lib/menu.ts`), and the child's page panel "Write it →" and its state words.

**Old specs that must move at equal assertions** (each to the new screen, or to the screen that replaces what it tests):
- `u7-parent-report.spec.ts` (5 tests: reached from the child's page and says when the writer failed its check; the letter with the name, counts and own example; edit is the report and no name is stored; approve once, and out of date says so; reads on a phone).
- `u20-child-by-topic.spec.ts` (the "Parent report" panel on the child's page, its states and "Write it →"; the list page's heading "Parent reports", its table and a name opening `/growth/{id}/parent`; the class's report link).
- `u46-one-word.spec.ts` and `u24-no-long-lists.spec.ts` (the table named "Parent reports not up to date": the child's name, no long list); `u43-phone-and-words.spec.ts` (words and phone on `/growth/{id}/parent` and `/growth/reports`); `u51-ux-rules.spec.ts` (the page keeps every rule); `u49-one-role.spec.ts` (the route is listed for the one-role walk); `u15-menu-and-today.spec.ts` (Today's report tile lands on `/growth/reports?class=`); `u13-route-walk.spec.ts` (`/growth/[id]/parent` and `/growth/[id]/report` named as not reached by click).
- `workflows.json`: the step's `screens` and its guards list `/growth/[id]/report`, `/growth/[id]/parent` and `/growth/reports`; the map changes first (the layout test holds the code to it).
- Engine: `test_parent_report.py` stays (it tests the engine, not the page).

**Step 1, done in the first retirement PR (branch `ui-8d-reports-links`):** Today's "Parent reports to approve" tile and each class's report link now open `/children/reports?class=` (item 8, `lib/todo.ts`); the new screen shows the old list's counts as a line "n out of date · n to approve · n to write" for the chosen class (item 7: whole counts of reports; the class filter was already there). The two assertions that named the old address moved to the new one at equal strength (`u15` Today's tile lands on the class's reports; `u20` Today's line carries the class's report link). The menu entry still points at `/growth/reports` and the old pages are untouched.

**Step 2, the old list page retired (branch `ui-8e-retire-reports-list`):** `/growth/reports` answers 308 to `/children/reports` (its `?class=` kept); its page is deleted; the Children menu's "Parent reports" opens `/children/reports`; the guide page and `workflows.json` (the step's screens, and the old page's frozen guards) follow. Specs moved to the new screen: `u20` (each child's state on its own row; a child with nothing to report says "nothing yet" where the old list left her off), `u24` (the class filter narrows the rows), `u46` (what the screen lists, never "waits on a person"; its title is kept because a retired goal cites it), `u43` (phone and words), `u49` (one role), `u51` (the screen keeps the rules), `u13` (reached by the menu now), `u12` (the 308, with and without `?class=`). Rows are in Sr. No. order, not by who needs a person first (CP-19's school rule), so the old list's ordering assertions became per-child state assertions.

**Step 3, the wireframe (branch `ui-8f-reports-wireframe`, 11 Nov; docs/screens/compare-2026-11-11 named the gap: "three line cards per child, grouped tables by stage, the board, consent bar"):** `/children/reports` is now, as `reports.html` draws it: an eyebrow with the class and the number of children; the class and state filters (state is the stage a report stands at); a strip of three whole counts (lines waiting for the viewer's approval, consent missing, reports sent; a coordinator's strip only has the consent tile); an opened child's lines as cards three to a row (the skill, the system's state of it beside the educator's words read only, the words as a field, Approve for the stage it is at); the reports as one table for each stage (Drafted, Educator approved, Coordinator approved ready to send, Sent, No lines yet) with Sr. No. and name, Class, Lines, Educator approved "3 of 6", Coordinator approved, Consent, Sent; "The same reports as a board" of four lanes; and in the coordinator's rail a "Consent on file" bar. A report with no lines yet shows its whole-report state in the Lines column, and its old words in a fold, until the lines are written. Consent stays the coordinator's alone to see, so an educator's page has no consent tile, column or bar. A line card's skill is read from the evidence the line cites and the state's look and words from `child_state` (the school's rows, the written kind), never named in code. Not drawn, parked: the Preview button (the parent's-copy PDF). Proof: `u74` (11 tests), and `u20`, `u24`, `u46` read the stage tables.

**What is left, for last (Nimish, 11 Nov: the parent report and the lines/PDF decisions are parked):**
- *Report-line writing* (`/growth/[id]/parent`, and "Write it →" on the Parent report panel of `/growth/[id]`): ask the engine to write a report (`writeParentReport`, the run watched on `?writing=`, "Refresh" when out of date); how a drafted report becomes CP-19 lines (engine or educator: undecided); edit the report's words held to the facts (`edit-form.tsx`); the old single approval (`approveParentReport`).
- *The parent's-copy PDF*: the letter as a parent reads it (`letter.tsx`) and its print, the "Preview the parent's copy" button, and the child's report page `/growth/[id]/report` (skill map and print).
- Their specs, to move at equal assertions when they are built: `u7-parent-report.spec.ts` (5 tests), the Parent report panel tests in `u20`, the `/growth/[id]/parent` and `/growth/[id]/report` rows of `u43`, `u13`'s two NOT_BY_CLICK entries, and the two frozen entries in `workflows.json`.
- Everything else of the retirement is done: Today's links, the counts, the class filter, the menu, the 308, the specs.

**Order I propose:** (a) decide 2 and 5 with Nimish; (b) build 1 to 3 on the new screen and carry the Today links (8); (c) move each spec above with equal assertions; (d) 308 `/growth/reports` and `/growth/[id]/parent` to the new screen; (e) delete the old files and update `workflows.json` and the menu in the same change. Steps (b) to (e) are separate PRs, one at a time.

## Decisions

| Choice | Reason |
|---|---|
| Consent column only for a viewer whose `my_reach('consent')` is not none | the school's access rule: the coordinator alone sees consent; an educator is shown no column rather than a guessed "not recorded" (first CI run caught this). A coordinator sees "none on record: needed" / "withdrawn: needed" and a line saying consent must be on record before any report can be sent (live has 0 consents, so no send can work yet) |
| Rows ordered by class and Sr. No. only | CP-19: educator figures are whole counts, never a score, rate, rank or ordering of a person |
| No Approve button drawn yet | an approve that means "whole report" would be replaced by a per-line one; the old page keeps it |

## Part 2 (branch `ui-8b-report-lines`, stacked on #596, built against backend PR #600, draft until #600 is live)

Adds, from CP-19's routes (`/reports/lines`, `/lines/set`, `/lines/approve`, `/send`): the Lines drafted / Educator approved / Coordinator approved / Sent columns (whole counts, read by the same rule as `report_lines._approvals`), a lines panel for the opened child (`?open=`) with the line's words as a field, the system's stage beside it, Approve (the first stage; the second for a coordinator who is not the first approver), and Send for a coordinator when every line holds both approvals and consent is on file. The engine refuses every other case in its own words, shown as the page's message. Nothing is delivered.
Still pending: Preview the parent's copy (PDF; the backend says it needs a design decision) and the rail link to the child. `/reports/counts` is not used on this screen: its per-educator figures are not a control here and the school rule keeps them whole counts only.
