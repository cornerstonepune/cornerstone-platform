# UI-7 frame fidelity: plan only (no code until the orchestrator releases merges)

Owner: the UI-7 builder. Ruling (orchestrator, 2026-11-11): the wireframes are the agreed design and win, unless the page has a
function the wireframe lacks, in which case the function is added to the wireframe too. Evidence: `docs/screens/compare-2026-11-11/`
(finding 5 there). This note says what changes in the shared frame, in what order, and which screens each step touches.

## What the wireframe frame is (kit.css, `docs/frontend/wireframes/kit.css`)

- **One bar.** The door bar and a breadcrumb; no second row of tabs.
- **Rail** (`.rail`, `.rail-box`): at the right of the page, in this order: the child **peek** (`.peek`) when a child is chosen, **Connected to**
  (each edge an icon and two lines: the name, then a caption that says what it is or where it stands), a **facts card** where the screen has one
  (This fortnight, Latest notes, Grants open now, Pages by door), **Capture here**.
- **Buttons** (`.btn`, `.btn-main`): a rounded filled control with a leading icon; the one main action is dark; capture buttons are tinted.
- **Page head**: an icon before the small-caps line, a larger purpose line; tables sit in a rounded card with state chips.

## What the built frame does today (`apps/web/components/`)

`app-frame.tsx` `Rail` draws underlined links with an icon and no caption, then Capture here; no peek slot, no facts card.
`frame/doors.tsx` `DoorPages` draws a second tab row under the bar (Setup's has 13 tabs and runs off the edge).
`parts.tsx` `PageHeader` has no icon. Buttons are `.chip` (thin outline, no icon) from `app/globals.css`. `Screen` ends every page with an
outlined "next step →" chip (`data-ux="next"`), required by `docs/ux-rules.md` rule 1 and `test_ux_rules`. The peek is
`components/children/peek.tsx` (client, `PeekProvider`) and is used only by Children, the class picture and Skill.

## Order of work (each step is its own PR, additive first, so no other builder's page breaks)

1. **Rail**: `Edge` gets an optional `line` (the caption); `Rail` draws icon, name, caption, and a `facts` slot (`RailFacts`: a titled list of
   label/value rows) and a `peek` slot above Connected to. All optional, so every page keeps compiling and drawing as now.
   Touches: `app-frame.tsx`, `components/blocks.css`. Screens touched: none yet.
2. **Peek in the rail**: lift `PeekProvider` so a `Screen` can take a `peek` prop; the rail places it first. Children, picture and skill move
   to the slot (same behaviour). Today (educator), Notes, Confirm and Period adopt it in their own slices (UI-7c, UI-3a); I do not edit those
   pages. Touches: `components/children/peek.tsx`, `app-frame.tsx`. Screens touched: children, picture, skill (call-site move only).
3. **Buttons and tables**: restyle at the token level (`.chip` and `.btn` classes, `DataTable`) so every page follows without edits: filled
   rounded control, leading icon where the page passes one, dark main action. Touches: `app/globals.css`, `components/blocks.css`,
   `components/data-table.tsx`. All screens change look; none changes markup. CI draws new gallery and screenshot baselines.
4. **Page head**: `PageHeader` takes an optional `icon`; `Screen` passes the screen's group icon. One component, no page edits.
5. **Captions and facts, door by door**: each page supplies `line` on its edges and a `facts` card where its wireframe has one. This touches
   the pages, so it goes through each screen's owner: Today (UI-7), Timetable (UI-6), Children, Assessments (UI-3b, UI-4), Setup (UI-5, UI-11).
   I send each owner the exact list (screen id, edge, caption text from its wireframe); they add it in their next PR.
6. **One nav row** (needs the decision below): remove `DoorPages` once every page it reaches has a link from a wireframe-drawn place.

## Decisions needed before step 6 and for "next step"

- **Second nav row.** It is the only way today to reach: Notes, Your day, Assessments, Papers to approve, Upload papers, Check answers,
  Class results, Across classes, Setup's 13 pages. The wireframe draws no row, so each page needs a drawn link first: Notes (Today rail,
  exists), Assessments and Reports (Children rail), Setup pages (the Setup cards, which the wireframe has and the built Setup lacks two of).
  Proposal: audit table in the step-6 PR, one line per page: page, wireframe link that reaches it, or "no link: add to the wireframe".
  Retire the row only when the table has no "no link" line. `u13-route-walk` (reach by click) is the guard.
- **"Next step →" chip on every page.** The wireframes do not draw it; `docs/ux-rules.md` rule 1 and `test_ux_rules` require it. Proposal:
  the rail's Connected to already satisfies "no dead end"; change rule 1 to say so and drop the chip. That edits an engine test, so it needs the
  backend orchestrator's sign-off. Until then the chip stays.

## What each step can clash with

Open PRs touching the same files: #648, #652 (children pages, peek call sites), #633 (timetable), #645, #641 (screens.json, help.json).
Steps 1, 3 and 4 touch only frame files and CSS, so they merge after those without a conflict beyond the generated `built.json`
(`node apps/web/scripts/tokens.mjs`). Step 2 waits for #648 and #652. Step 5 rides on the owners' own PRs. Nothing here changes
`screens.json` elements, so the inventory (`u70`) is unaffected except where a caption adds a link (then the owner adds the element).

## Proof per step

Step 1 and 2: a test that the rail draws caption and peek in the wireframe's order (`u76-frame.spec.ts`, new). Step 3 and 4: screenshots
at 1440 and 400 for the same 34 screens, compared with the wireframes as in `docs/screens/compare-2026-11-11/`; `u43` (phone) and the
touch-target checks unchanged. Step 6: `u13-route-walk` and the audit table.

## Not in this plan

Subject colours in the Timetable grid, the Period page failure, the 404 on a skill row and the one-letter Curriculum column are defects,
not frame fidelity; they are with their owners (see FINDINGS.md).

## Where this stands (2026-11-11, work stopped: token budget)

Built, not merged: branch `ui-7-frame` (pushed; it sits on top of #651's branch `ui-7b-swap`, so it waits for #651).

- **Done on `ui-7-frame`:** steps 1 to 4 (rail with kind tiles, captions, facts and a peek slot; the wireframes' buttons and cards links; the page-head icon); Today educator: "Lay out for…" card, "to do" chips, "Your class" with the child panel; Today school: rail facts and captions.
- **Not done:** step 5 captions and facts on the other doors' pages (Timetable, Children, Assessments, Setup); step 6 nav row (kept on purpose: the audit table of pages that only it reaches is not written); the final wireframe-against-built comparison on the merged result.
- **Before `ui-7-frame` can merge:** the block screenshot baselines (`tests/u71-blocks.spec.ts-snapshots`) change for about 8 blocks (AppFrame, Form, Cards, ChildPeek, EmptyState, KanbanBoard, KindTile, BrandMark). They must be taken from CI, not locally (fonts differ): dispatch `ci.yml` by hand on the branch, download the `browser-shard-*-screenshots` artifact (`actions_get download_workflow_run_artifact`, then `curl` the URL), commit the `*-actual.png` files as the baselines, run once more.
- **Today gaps still open against the wireframes:** the educator's "Your class" children grouped by the lesson's own skill only when the activity builds a skill the class was seen on (otherwise the most recently seen skill); coordinator Today's "last week" heat grid and "New activities" card need real data to judge; school rail facts are counts only.
- **Defects found in the comparison, with other owners:** Period page fails to load (React error 441); Timetable subject colours; Skills-to-approve rows link to `/setup/skills/<skill-set code>` and 404; Curriculum table's first column is one letter wide; Setup tab row.
