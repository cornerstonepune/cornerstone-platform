# The frontend slices as scopes

Generated from `screens.json` by `build-spec.mjs`; never edit by hand. Each section below is one GitHub issue in the Scope form,
titled with its id (for example `UI-13: The frame and the inventory test`). Nimish adds `scope-locked`; the proof-writer turns
every Done-when line into an executable check in `specs/<ID>/`; then the build starts. Lines that name a screen come from that
screen's own `done_when`; the generic checks of SPEC §7 apply to every screen a slice builds, and are what the inventory test runs.

## UI-1: The test harness

Tier 2. Waits for: nothing. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

Nothing changes on screen. This adds the testing tools every later slice needs, so that finished backend work can be marked built and every later screen is checked in a real browser, including for accessibility. It should merge within hours.

### What

Only what the Athena loop demands before any interface change can be marked built (`athena finish` is refused repo-wide without it): the axe dependency, the journey harness and one passing journey spec, and shadcn/ui initialised with the two primitives used first. No page changes in this slice.

### Done when

1. `@axe-core/playwright` is a dependency of `apps/web`, and the journey spec runs axe on every step it visits.
2. `apps/web/e2e/athena-journey.ts` exists and one journey spec imports it, signs in, opens an existing page and passes, so `athena ui-ready` passes for the slice.
3. shadcn/ui is initialised (`npx shadcn@4.23.0 init`; `components/ui/` does not exist today) with Button and Tabs only; every other primitive is added by the first slice that uses it, and none is added unused. The stock look is left as installed; UI-14 restyles it.
4. `bin/check`, `test_ux_rules.py`, `u51` and `screens.spec.ts` pass; `ux.frozen` in workflows.json has not grown.

### Out of scope

Any change to a page, a colour or a font (UI-14); the frame and the inventory test (UI-13); new screens, blocks or queries.

## UI-14: Tokens, fonts and the existing parts on them

Tier 2. Waits for: UI-1, and PR #528 (the logo pack) merged. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

Nothing new to do yet except the look. Every colour in the site now comes from one list, and the two chosen typefaces load from the site itself. After this a change of colour is one edit in one place. What Nimish sees: the same pages in the new white and type.

### What

One source of colour, type, shape, elevation and motion for the whole site, in the look Nimish chose on 9 Nov 2026 (the rich draft, B). tokens.css is generated from tokens.json; every colour literal in the app is replaced by a token, including in the blocks that exist today (StatusChip, DataTable, FilterBar, EmptyState, Count) and in the shadcn files from UI-1; the fonts are self-hosted. No page changes shape in this slice.

### Done when

1. `apps/web/design-system/tokens.json` is byte-identical to `docs/frontend/tokens.json`, and `apps/web/design-system/tokens.css` is produced from it by `apps/web/scripts/tokens.mjs`; a test regenerates and diffs, so the two cannot drift.
2. No hex colour literal remains in `apps/web/app`, `apps/web/components` or `apps/web/lib` outside `tokens.css` (a grep test; the count today is the baseline and must be 0 at the end of this slice). Each literal becomes the nearest token with no change of layout, and `screens.spec.ts` is re-baselined once, in this slice.
3. Every pair named in tokens.json's usage notes measures at least 4.5:1 (text) or 3:1 (borders, icons, outlines) in both themes by the WCAG formula, including link on ground, the main-action text on the basalt button, the amber outline on ground and each state text on its fill; and the four colours that sit near each other (the Language edge, the Arts edge, the wait amber and the late red) are at least 20 apart pairwise (CIE76 ΔE in light). The script lives in the suite and its table is committed as `docs/design-tokens-contrast.md`. A pair that fails is fixed in tokens.json, not exempted.
4. `tokens.css` carries every token of tokens.json: the colours in both themes (including the seven kind colours and their tints and the subject colours), radius-card 14 px, radius-control 10 px, radius-pill, shadow-card in both themes and the press motion; a test reads tokens.json and finds each name as a CSS custom property.
5. Press is the only motion: every button, link-row, tile and square scales to 0.97 on :active in 160 ms with the token's curve; hover changes colour only and only under `(hover: hover) and (pointer: fine)`; under `prefers-reduced-motion` nothing moves (a test reads the computed styles in both media settings).
6. The four official logo files are copied byte for byte from `docs/brand/cornerstone-logo/SVG-vector/` (PR #528) into `apps/web/public/brand/` by the tokens script, never edited; `app/icon.svg` (the browser tab) is `mark-on-white-tile`; the app icon is made at build time from `mark-on-white-tile` (PNG files are ignored by git), for example with `app/apple-icon.tsx`, verified against the installed Next.js version; a test compares the hashes.
7. Each shadcn file under `components/ui/` references `var(--` and no hex, and the stock look is gone (screenshot baseline).
8. next/font loads Source Serif 4 and Source Sans 3 from the build: no page makes a request to a font host or any host other than the site's own (a test records the requests of one page); the computed font-family first names across every page are within {Source Serif 4, Source Sans 3}.
9. `bin/check`, `test_ux_rules.py`, `u51` and `screens.spec.ts` pass; `ux.frozen` in workflows.json has not grown.

### Out of scope

The frame, the menu and the inventory test (UI-13); new blocks (UI-2); new screens, changed queries.

## UI-13: The frame and the inventory test

Tier 2. Waits for: UI-14. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

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

## UI-2: The blocks

Tier 2. Waits for: UI-13. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

A gallery page for the people who build the site, showing every part (the chips, the class grid, the charts, the folds) with sample data. Nothing a teacher uses yet; it is what the next slices are assembled from.

### What

The school's new blocks of SPEC §5, built once, each with sample data on a staff-only gallery screen (`blocks`) and screenshots in both themes; every chart drawn to scale from its data. AppFrame is built in UI-13 and the existing blocks moved onto the tokens in UI-1.

### Done when

1. For every block in screens.json `blocks` except AppFrame (UI-13), a file `components/<kebab-name>.tsx` exists and its root element carries `data-block="<Name>"` (the inventory test checks the list against the folder).
2. `/setup/blocks` (staff only, behind Setup's details link) renders every block with sample data; the inventory test on the `blocks` screen drives each block's behaviours from `element_kinds` (fold opens and closes; filter writes the address; grid cell acts; stepper states; chip icon+word) and screenshots each in light and dark at 1440 and 400 against committed baselines.
3. StatusChip draws every state in STATES with icon and word; a state without an icon does not compile (the existing test kept).
4. ClassGrid replaces `voice/board.tsx` and the voice form's tests pass unchanged.
5. Each chart block (StackBar, LevelBars, Spark, Trend, HeatGrid) is fed known data by a test and every text label in its SVG is a value or a date from that data; colours come from tokens only; a chart with no data renders its empty words, never an empty axis.
6. Details is a native `<details>`; a main action inside a closed Details fails the inventory test.
7. No file outside `lib/icons.tsx` imports from `lucide-react` (grep test).
8. KindTile exists and draws each of the seven kinds with its icon from lib/icons.tsx and its colour from the tokens; every rail link, card header and timeline entry in the gallery starts with one (DOM test).
9. A state chip placed on a tinted cell or square sits on the panel colour with a 1 px ring in its state colour (the gallery shows a Moved chip on an Arts cell and a To confirm chip on a Language cell; a screenshot baseline holds it), because those fills are within 5 of each other (CIE76) and the chip would otherwise vanish.
10. Every one of the 1 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
11. The blocks: there is one fold per entry of `blocks`, and a block with no sample fails the test
12. The blocks: the page is absent for an educator and linked only from Setup's details link
13. The blocks: its first section is the legend: every state with its icon, word and colour, every action with its tile, every kind of thing with its tile, the subjects and the shapes, all read from STATES and tokens.json, nothing typed
14. The blocks: the legend shows the four logo files with where each is used and the rules (no recolour, dark ground uses the tile, clear space a quarter of the mark, no stretch, rotate or shadow)

### Out of scope

Pages and their data.

## UI-3: Node pages: the K2 walk

Tier 2. Waits for: UI-2; the K2 switch (a config row) on for the pages behind it. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

The everyday walk for an educator. From a period she opens the activity, its objective and its skill, records a voice note or types marks, confirms what was heard one note at a time, sees the class picture change, and opens any child's page. Click anything and it goes where it says; Back returns.

### What

Period, record, confirm, notes, children, class picture, child, activity, objective and skill as node pages on the blocks, each walking to its neighbours through the rail and back through the trail; the old routes redirect.

### Done when

1. Every screen of this slice passes the ten generic checks in `u70-inventory.spec.ts` (run with `SLICE=UI-3`) and every element in its list behaves as its kind says; the slice's last commit adds `UI-3` to `merged_slices` in screens.json.
2. Every old route listed under `folds` for these screens answers 308 to the new address (test).
3. The journey `e2e/an-educators-tuesday.spec.ts` passes: Today → the lit period → Type the marks → a note written with one activity_observation per named child and none for a child not mentioned → Confirm → Class picture shows the change → the child → the skill → trail back to Today; axe at each step; at 1440 and 400.
4. A correction from Notes writes a superseding activity_observation row and never updates the old one (database assertion).
5. The period → note link: a note confirmed from a period carries that session's id, and the period page lists its notes. This line waits for CP-25 (to be scoped: `activity_observation.session_id` is free today); the slice starts and merges without it, and the line is proved when CP-25 lands.
6. Every one of the 101 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
7. the session's name: a period with no activity shows no capture controls and the words 'Nothing to record here'
8. the session's name: the last-time bar's segments sum to the number of children named in the last session's observations
9. the session's name: the steps fold is open on load and the others closed
10. Record a note: Send writes exactly one educator_note with this session's id and nothing in activity_observation
11. Record a note: at 400 px the Start button is the full width and at least 56 px tall
12. Record a note: a denied microphone shows the typed path as the main action instead of an error
13. Confirm what the reader heard: Confirm writes one activity_observation per marked child, none for an unmarked child, all with one confirmation_id
14. Confirm what the reader heard: a changed or removed claim is kept as changed/removed in note_claim (reader accuracy)
15. Confirm what the reader heard: no control confirms more than one note
16. Confirm what the reader heard: a child's square is never red, whatever the mark
17. Notes: a correction writes a superseding row with a reason and never updates the old one
18. Notes: the coordinator sees every class, an educator their own (access fixture)
19. Notes: a note left unconfirmed past 48 hours carries the red 'late' chip and sorts first
20. Children: an educator with one class is taken straight to its picture; with several, picks; the coordinator picks from every class
21. Class picture: an empty square's title reads 'not seen yet', never 'not secure'
22. Class picture: each square shows the Sr. No. and the child's name read from pii by child_id, and no photo (DOM scan)
23. Class picture: the stack bar's counts equal the squares by state
24. Class picture: the squares are in Sr. No. order, 10 per row at 1440, 8 at 400
25. Where this child is: a paper's result and a voice note appear on one timeline in date order
26. Where this child is: a correction shows as a new entry that names the entry it replaces
27. Where this child is: the header shows the child's name beside the Sr. No., read from pii by child_id; the address is by Sr. No. and carries no name; no photo (DOM scan)
28. Where this child is: the graph's node count equals the skills the child was seen on, and each node's state equals the table's
29. Where this child is: a table equivalent sits beside the graph: the DataTable lists the same skills with the same state words and times seen, the graph's SVG has role=img and an aria-label that names the counts by state, and axe reports no violation on it
30. Where this child is: keyboard order: Tab reaches the graph's nodes one by one, in the order of the table's rows (domain, then skill), each with a visible focus ring and each opening that skill; no node is reachable by pointer only, and every node's link target is at least 44 × 44 px
31. Where this child is: on a phone (400 px) the graph is not drawn: the list of skills shows each skill's name, times seen and its state chip (icon + word), each row a link of at least 44 px height, in the same order as the table
32. the activity's name: a drafted part carries the 'drafted' badge until Keep, Edit or Send back; an educator sees the badge but not the three buttons
33. the activity's name: every edit writes a curriculum_edit row with who
34. the activity's name: a photo attaches to the activity, never to a child
35. the objective's title: no number, percentage or state is shown for the objective itself (DOM scan)
36. the skill's name: a prerequisite or next skill is shown only when its link is confirmed (a proposed link in the fixture does not appear)
37. the skill's name: the spark's last value equals the grid's secure count
38. the skill's name: the grid's squares equal the class's enrolment in Sr. No. order

### Out of scope

Today (UI-7). Assessments (UI-4). The coordinator's actions (UI-6).

## UI-4: Node pages: assessments

Tier 2. Waits for: UI-2. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

The grades 1 to 4 assessment work on the same parts: the list of assessments, one assessment with its steps, and one child's paper with each answer marked right, wrong, blank or for you to judge. The old pages fold into these.

### What

Assessments, one assessment and one child's paper as node pages on the blocks; the seven old assessment pages and Class results fold in; the queries and the seven steps are unchanged.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says.
2. Every old route listed under `folds` answers 308 to the new address.
3. `lib/assessment-steps.ts` STEPS and STEP_WORDS and `lib/queries-papers.ts` exported names are unchanged (a test imports them and compares to the committed list).
4. The journey `e2e/a-paper-comes-back.spec.ts` passes: make a class assessment → approve the pack (per pack, the pack-level button; no all-packs button exists on any screen: `u62` kept) → upload a fixture scan → the paper shows right / wrong / blank / for you to judge with the fixture's counts → say what the child wrote for the one to judge → sign off → the child's timeline shows the paper result beside a voice note; axe at each step.
5. No approve-all control exists on any screen (the `ux.approveAll` list in workflows.json is empty at the end of this slice).
6. Every one of the 42 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
7. Assessments: the four old pages answer 308 to this one or to the Assessment node
8. Assessments: every row's name is built topic · skill · level · kind · class · day (regex)
9. Assessments: no approve-all control anywhere
10. Assessments: each tile's number equals the rows behind it
11. the built name: Approve acts on this pack only; no control acts on more than one pack or more than one row
12. the built name: the stepper's amber step equals the status word in the list
13. the built name: a replaced copy shows 'replaced by a newer one' and no action
14. the built name: the papers bar's three counts sum to the number of copies
15. Check the answers: right, wrong and blank are three different chips and three counts; a wrong-with-working reason is shown with its wrong chip
16. Check the answers: a person's answer writes a read_correction row and never overwrites the engine's read
17. Check the answers: Sign off is absent while any answer is 'for you to judge', and acts on one paper

### Out of scope

The question bank's content; making questions; reports.

## UI-5: The coordinator's views: staff, classes and setup

Tier 2. Waits for: UI-2 for the views; CP-1 merged for moving a child. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

The coordinator's people pages: who has access to what, which children are in which class (and moving one), and the Setup home with its cards. No ranking of educators anywhere.

### What

Staff and grants, classes and children and the Setup home; the small writes that exist today (a grant, a child move) through their own rows. Search is the bar's typeahead (UI-13); there is no results page.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says, as educator and as coordinator.
2. Every old route listed under `folds` answers 308 to the new address.
3. `/setup/staff` has no column, sort or text that ranks people: the table cannot be sorted by the three numbers and no ordinal appears (test asserts absence).
4. A child move writes a child_move row and a new enrolment and deletes nothing; the class picture of both classes reflects it on the next render (database and DOM assertion).
5. Every one of the 21 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
6. Staff and classes: no sort, rank, ordinal or colour grading on the three numbers; the table cannot be sorted by them
7. Staff and classes: a grant edit is a new row or a valid_to, never a delete (row count never drops)
8. Staff and classes: no staff name appears unless the viewer is in the everything group (names are pii)
9. Classes and children: a move writes child_move and a new enrolment and deletes nothing
10. Classes and children: each child row shows the name beside the Sr. No., read from pii by child_id; the address and the change log's stored text carry no name (DOM scan)
11. Classes and children: the change log lists the move with who and when
12. Setup: every setup page is reachable in two clicks from the bar
13. Setup: an educator sees only the cards their group may open

### Out of scope

Approve, go live, draft, moves (UI-6). Materials (UI-9).

## UI-6: Timetable, rules and the fortnight's actions

Tier 2. Waits for: CP-6, CP-11, CP-12 and CP-22 merged. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

The timetable for everyone, and for the coordinator the fortnight's work: the rules, a draft built from them, moves by hand (a clash needs her reason), Approve and Go live. It waits for the backend that builds timetables.

### What

The timetable's day, week and fortnight views and the timetable rules, the fortnight node with Approve and Go live, the draft from the rules with its unmet rules, and moves by hand with clashes accepted by the coordinator only. Until this merges the bar's Timetable door opens the page that exists today.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says, as educator (read-only) and as coordinator.
2. As educator, Approve, Go live, Make a draft, Accept the clash are absent and their requests are refused (test both).
3. The plan routes the backend exposes (the fortnight move, the timetable link apply and the timetable generate routes) check only that the actor is on the staff list, so the website checks the coordinator group itself before calling each: an educator's request to each is answered 403 by the web layer (test, one per route).
4. Go live updates sessions in place and lists every changed session on the fortnight page; a hand move after freeze is kept with who and why and shows amber on the grid (database and DOM).
5. The journey `e2e/the-coordinators-fortnight.spec.ts` passes: Today (coordinator) → the red clash row → Moves → accept with a reason → Fortnight → Approve → Go live → Timetable shows the change as educator; axe at each step.
6. Every one of the 42 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
7. Timetable: a hand move shows an amber outline and its details name who and why
8. Timetable: an educator never sees an accept-clash control; a clash cell is red for both roles
9. Timetable: the grid's cells equal the session rows for the day shown (count and names)
10. Timetable rules: the page sits under Timetable in the menu, not Setup
11. Timetable rules: every edit shows who and when, and the history fold lists it
12. Fortnight 9: Approve and Go live exist for the 'everything' group only and their requests are refused for others
13. Fortnight 9: a frozen fortnight shows no Approve, Go live or edit control
14. Fortnight 9: the what-changed table lists every session the go-live updated, and nothing else
15. Draft from the rules: the draft shown equals the slots the generator wrote (count and cells)
16. Draft from the rules: every unmet rule row names a rule row that exists
17. Draft from the rules: Make a draft never changes a live fortnight's sessions (count unchanged before and after)
18. Moves by hand: a move changes only its own fortnight's sessions
19. Moves by hand: as educator the page is read-only: no pick, no Accept, and the requests are refused
20. Moves by hand: every move is listed with who made it and when, and an undo is a new row

### Out of scope

Materials; reports.

## UI-7: Today, both kinds

Tier 2. Waits for: UI-3 and UI-5; UI-6 for the coordinator's clash and draft rows (rows for a backend not yet merged simply do not appear). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

The first screen each person sees. The educator sees her periods in order, what needs her attention and her class; the coordinator sees what waits for her, last week's heat grid and next week. Rows for work whose backend is not built simply do not appear yet.

### What

The educator's Today (the day, the attention strip, notes to confirm, the class) and the coordinator's Today (what waits, last week's heat grid, next week), composed from the blocks over the queries that exist; What needs doing folds in and its count moves to Setup where it belongs.

### Done when

1. Both screens pass the ten generic checks and every element in their lists behaves as its kind says, each for its role.
2. The one count on the site is the badge on the bar's Today door: it equals the strip's do-now plus this-week numbers (which never overlap), computed once by one query; no other page shows a count badge (test). Tiles and eyebrows state how many rows their own page lists, which is not a second count.
3. The skills-to-approve count (109 on the live copy) does not appear on either Today, on Setup's cards or on Curriculum; it is the eyebrow of Skills to approve only (test).
4. `/today` serves the educator's version to the own-classes group and the school's version to the everything group; the special educator gets the version the role→group rows say, with no code naming the role (test with the access fixture).
5. The educator's journey and the coordinator's journey both start from Today and pass.
6. Every one of the 21 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
7. Today: an educator sees only sessions of classes their grant names (the access fixture's second educator sees a different list)
8. Today: each tile's number equals the count of rows the tile opens
9. Today: the lit row is the session whose period contains the current time; before 08:30 none is lit
10. Today, the school: only the 'everything' group sees this version; an educator at /today sees the educator's
11. Today, the school: each waiting row leads to the screen that does the work and the work is listed there
12. Today, the school: no ranking of people anywhere on the page
13. Today, the school: the heat grid has one cell per class per teaching day and a dashed cell per holiday

### Out of scope

Reports. Materials approval.

## UI-8: Reports

Tier 2. Waits for: CP-19 merged (Next). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

Each child's report, line by line: two approvals per line, consent on file, then sent. The parent's copy uses the school's words (educator, Easy/Medium/Hard/Advance), no codes. It waits for the report backend.

### What

Each child's report, line by line, in the educator's words: two approvals per line, consent on file, then sent. The parent's copy says educator, Easy / Medium / Hard / Advance, no rung and no code.

### Done when

1. The screen passes the ten generic checks and every element behaves as its kind says, as educator and as coordinator.
2. A line sends only when the educator's approval, the coordinator's approval and consent are all present; the test tries each missing one and the send is refused.
3. The rendered parent copy contains none of: 'teacher', a rung code (R\d+), a skill code (NUM\.), 'borrow' (regex test over the PDF text).
4. The parent's copy and every printed page carry `lockup-colour` in their head, at its clear space, from the official file (the same hash test).
5. Every one of the 11 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
6. Reports: nothing is sent without both approvals and consent (each missing case refused)
7. Reports: the parent's copy contains 'educator' and the four level words only, no rung or code (regex over the PDF text)

### Out of scope

Delivery channel (WhatsApp vs print): the backend scope's.

## UI-9: Materials

Tier 2. Waits for: CP-17 and CP-18 merged (Later). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

The materials list for the fortnight: what each class needs laid out, quantities to confirm, the school's list, and the educator's approval of her own class's list. It waits for the materials backend.

### What

The class's materials list for a fortnight, the school's list, the notes the system could not read, and the educator's approval of her own class's list.

### Done when

1. The screen passes the ten generic checks and every element behaves as its kind says.
2. A line with no quantity shows the amber 'to confirm' chip; approval is possible only for the signed-in educator's own class (the other class's Approve is absent and refused).
3. Every one of the 10 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
4. Materials, this fortnight: a line with no quantity carries the amber 'to confirm' chip
5. Materials, this fortnight: approval (CP-17) exists only for the signed-in educator's own class and is refused for another

### Out of scope

Inventory valuation.

## UI-11: Setup content pages: curriculum, skills to approve, question bank, a question

Tier 2. Waits for: UI-2. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

The four Setup pages about content rather than people: Curriculum, Skills to approve, the Question bank and one question. Same approvals, one row at a time, now inside the same frame.

### What

The four existing Setup pages that carry content rather than people, rebuilt on the frame and the blocks: Curriculum (activities and skills under one filter row, with drafts and offers), Skills to approve, the Question bank and one question as it prints. Their queries and their one-row-at-a-time approvals are unchanged; the old routes fold in.

### Done when

1. Every screen of this slice passes the ten generic checks under `SLICE=UI-11` and every element in its list behaves as its kind says; the slice's last commit adds `UI-11` to `merged_slices`.
2. Every old route listed under `folds` for these screens answers 308 to the new address.
3. No approve-all control exists on any of these screens (Skills to approve and the offers act on one row each).
4. The skills-to-approve count is the eyebrow of Skills to approve and appears on no card, tile, badge or other page.
5. Every one of the 32 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
6. Curriculum: one list carries activities (K2) and skills (grades 1–4) under one filter row
7. Curriculum: Curriculum shows no count of skills to approve; that number is the eyebrow of Skills to approve and appears nowhere else
8. Curriculum: Yes / No act on one offer each; no control acts on all offers
9. Skills to approve: approval is per row; no control approves more than one
10. Skills to approve: the eyebrow count equals the rows across all pages, and it is the only place the number is shown
11. Question bank: statistics and taxonomy sit behind the details link, not on the first view (rule 8)
12. Question bank: the table shows ten rows then pages
13. the question as it prints: a correction keeps the old key in item_key_change and the old version readable
14. the question as it prints: Remove retires, never deletes (row count unchanged)

### Out of scope

Making questions; changing what a level asks; the curriculum upload.

## UI-12: The screens outside the bar: sign in, help, report a problem

Tier 1. Waits for: UI-13 (lands on Today once UI-7 is merged). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

Sign in (with forgot password), the help pages and the report-a-problem form on the new look. Help is generated from the screen list, so a new screen gets its section without anyone writing it.

### What

Sign in (with forgot and new password), the help pages and the feedback form, rebuilt on the tokens and the blocks; help is generated from screens.json so a new screen gets its section without a hand edit; the feedback form keeps names out of the public GitHub issue.

### Done when

1. Every screen of this slice passes the ten generic checks under `SLICE=UI-12` (sign in is tested signed out) and every element in its list behaves as its kind says; the slice's last commit adds `UI-12` to `merged_slices`.
2. Every old route listed under `folds` for these screens answers 308 to the new address.
3. The help page has one section per screen in screens.json, generated from it by a script, and every page's ? opens its own section (test over all screens).
4. After sign in the person lands on `/today` once `UI-7` is in `merged_slices`, and on the existing home page until then (test reads `merged_slices`); sign in uses the bare frame.
5. A used password link is refused the second time, and no development bypass exists in a production build (the existing gate tests kept).
6. Sign in shows the large `lockup-colour` (`lockup-for-dark-backgrounds` in dark) above the form with its clear space, and the help pages carry the lockup in their head; the BrandMark tests of UI-13 pass on both.
7. Every one of the 11 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
8. Sign in: lands on Today for the person's group
9. Sign in: no development bypass in production
10. Sign in: a used password link is refused the second time
11. Start here: every page's ? opens its own section
12. Start here: the sections are generated from screens.json so a new screen gets its help without a hand edit
13. Report a problem or suggest something: Send writes one staff_note and one issue; the issue body carries no child's name: the page warns not to type one, and a screenshot is kept on the private side, linked by id, never attached to the public GitHub issue (names now appear on some screens and the repository is public)

### Out of scope

A parent login; a new way to sign in.

## UI-10: The as-built milestone document

Tier 1. Waits for: UI-13 (it can be built early and re-run after every slice). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

A generated page that says exactly what exists: every screen, every control, whether it is built, and what each check reported. It is regenerated by every slice, so it is always true.

### What

A script that generates docs/frontend/AS-BUILT.md from screens.json plus the last inventory-test run: the milestone document Nimish asked for, so he can see exactly what exists, what each screen's controls are, and what the checks reported. Every slice adds its id to `merged_slices` in screens.json when its proofs pass, so the document is always true.

### Done when

1. `node docs/frontend/as-built.mjs` reads `docs/frontend/screens.json` and the inventory test's machine-readable report (`apps/web/test-results/inventory.json`, written by `u70-inventory.spec.ts`) and writes `docs/frontend/AS-BUILT.md`; it never edits screens.json.
2. AS-BUILT.md lists every screen: its address, its group, who sees it, every control, whether it is built (its slice is in `merged_slices`) and what old page exists today, the slice that built it, and what each of the ten generic checks reported (passed, failed with the reason, or not run because its slice is not merged yet).
3. AS-BUILT.md opens with counts: screens built of the inventory's total, controls built of the total, generic checks passed of those run, and the slices merged; a screen absent from the test report is shown as 'not run', never as passed.
4. A test feeds the script a screens.json and a report with known results and asserts the exact numbers and lines in the output, including a failed check and a screen that does not exist.
5. Every slice's scope includes the line 'this slice's id is in `merged_slices` in screens.json and AS-BUILT.md is regenerated in the same pull request'; a test fails if a slice listed in `merged_slices` has a screen the inventory test could not open.

### Out of scope

Any screen or app code.
