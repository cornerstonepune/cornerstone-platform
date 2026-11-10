# UI-13: The frame and the inventory test

Issue #525. Tier 2. Waits for: UI-14. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

After this, every page in the site sits inside one new top bar with four doors: Today, Timetable, Children, Setup. The old side menu is gone. Nothing new to do yet, but everything that exists can be reached from the bar, and from this point a test walks the site the way a person would: it clicks every link and button the list says should be there.

### What

One navigation for the whole site: the top bar with the school's logo, its four doors, search, acting-as, help and sign out, the trail and the rail (AppFrame), replacing the four shells and the K2 side menu; every existing page reachable from the bar; docs/ux-rules.md brought in line; and the inventory test that reads screens.json and drives every screen like a person, proved here on a small inventory of pages that already exist.

### Done when

1. AppFrame (bar, trail, main column, rail, Capture here) replaces `components/educator/shell.tsx`, `components/shell.tsx`, `components/page-shell.tsx`, `components/top-bar.tsx`, `components/educator/shell-nav.tsx` and `lib/educator/menu.ts`, all deleted; `components/educator/crumbs.tsx` becomes the trail; `components/icons.tsx` is merged into `lib/icons.tsx` (one icon file); `rg -l 'PageShell|TopBar|ShellNav'` over `apps/web` returns nothing; every existing page renders inside AppFrame.
2. On a phone (400 px) the four doors are a bottom tab bar (icon above word, at least 44 px tall, the chosen door's icon in brand clay and its word in ink), and the top bar keeps the mark, search and the person; at 1440 they are the top bar's doors (test at both widths).
3. The bar carries BrandMark as a link to Today: `lockup-colour` at 40 px high in a 64 px bar on a light ground and `lockup-for-dark-backgrounds` on a dark ground at 1440; `mark` alone (or `mark-on-white-tile` on dark) at 400; `components/logo.tsx` is replaced by `components/brand-mark.tsx` and deleted, and `public/brand/cornerstone-mark.svg` (a redrawn copy in slightly wrong colours, #B9572F and #262520) is deleted.
4. BrandMark's rules are tests, run on every screen the inventory opens and in both themes: the file served is byte-identical to its source in `docs/brand/cornerstone-logo/SVG-vector/` (a hash compare); the image and every ancestor up to the bar have `filter: none`, no `box-shadow`, no transform other than none, and a width-to-height ratio equal to the file's; the nearest other element is at least a quarter of the mark's height away on every side; under a dark colour scheme the dark-ground file is the one shown; the accessible name is 'Cornerstone Gurukul'.
5. `lib/menu.ts` GROUPS are exactly Today, Timetable, Children, Setup and carry the map of every existing route to its door (assessments, papers, capture and growth under Children; library, curriculum, skill-sets, school and rules under their `group` in screens.json); a test walks the app's route list and reaches each route by clicking from the bar in at most three clicks; `u53-the-menu.spec.ts` passes against it.
6. The trail is two fixed levels (the door, then the thing) plus the browser's Back; the door lit on the bar is the door the walk started from, so an Activity opened from Today lights Today, not Setup.
7. `docs/ux-rules.md` is rewritten in this slice and named in its changed files: rules 3, 7, 11 and 12 and the menu table now state the new frame (the rail replaces the side menu, acting-as replaces 'Viewing', four doors, 1440 px not 1280, four work states not five chips, the phone gate list); `test_ux_rules.py` and `u51` are updated to match.
8. AppFrame's search field is a typeahead, with no results page: typing a Sr. No. in the person's classes offers that child; one outside them offers nothing; a fake fixture name typed offers that child within their classes only; at most five suggestions; choosing one opens its screen; the typed term is sent in a POST body and is in no address, no log line and no analytics call (a test reads the request log); signed out, the request is refused.
9. `lib/built.ts` exports `isBuilt(screenId)` from `merged_slices` in screens.json; the doors, the rail and every link to another screen draw nothing for a target that is not built.
10. `tests/u70-inventory.spec.ts` reads `docs/frontend/screens.json` (or the file named by `INVENTORY=`) and, for every screen of a slice in `merged_slices` (a full run) or named by `SLICE=UI-n` / `SCREEN=<id>` (a pull request run), signs in as educator and as coordinator and runs the ten generic checks at 1440 and 400 and drives every control by its kind; dynamic routes take a concrete address from `tests/inventory-fixtures.ts`, built from the test's own rows; the `bar` list is driven once per run; every other screen is `test.fixme` and counted in the report.
11. The test is proved on `tests/fixtures/mini-inventory.json`, a two-screen inventory of pages that exist and are framed by this slice: it passes on them, and a deliberately broken copy (a missing control, a dead link, a name not in the allow-list) fails with the reason named.
12. `tests/fake-names.ts` is the one list of names in the repository; the inventory test fails on any rendered child name that is not in it.
13. The bare frame (logo and the form, no bar, no rail) exists for the screen marked `frame: bare`.
14. `bin/check`, `test_ux_rules.py`, `u51`, `u53` and `screens.spec.ts` pass; `ux.frozen` in workflows.json has not grown.

### Out of scope

New screens; the blocks other than AppFrame (UI-2); changed queries; the K2 switch; parents.
