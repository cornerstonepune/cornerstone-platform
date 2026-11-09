# The frontend slices as scopes

Generated from `screens.json` by `build-spec.mjs`; never edit by hand. Each section below is one GitHub issue in the Scope form,
titled with its id (for example `UI-1: Tokens, frame and the inventory test`). Nimish adds `scope-locked`; the proof-writer turns
every Done-when line into an executable check in `specs/<ID>/`; then the build starts. Lines that name a screen come from that
screen's own `done_when`; the generic checks of SPEC §7 apply to every screen a slice builds, and are what the inventory test runs.

## UI-1: Tokens, frame and the inventory test

Tier 2. Waits for: nothing (type and colours decided 9 Nov). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### What

One navigation and one source of colour, type and space for the whole site. tokens.css generated from tokens.json; shadcn/ui primitives restyled by the tokens; AppFrame (top bar, trail, rail) replacing PageShell, TopBar and the K2 side menu; and the inventory test that reads screens.json and drives every screen like a person.

### Done when

1. `apps/web/design-system/tokens.json` is byte-identical to `docs/frontend/tokens.json`, and `apps/web/design-system/tokens.css` is produced from it by `apps/web/scripts/tokens.mjs`; a test regenerates and diffs, so the two cannot drift.
2. No hex colour literal remains in `apps/web/app`, `apps/web/components` or `apps/web/lib` outside `tokens.css` (a grep test; the count today is the baseline and must be 0 at the end of this slice).
3. Every text-on-fill and border-on-ground pair named in tokens.json's usage notes measures at least 4.5:1 (text) or 3:1 (borders, icons) in both themes by the WCAG formula; the script lives in the suite and its table is committed as `docs/design-tokens-contrast.md`.
4. shadcn/ui is initialised at the pinned version into `components/ui/` with Button, Badge, Table, Tabs, Collapsible, Dialog, Sheet, Select, Tooltip, Progress and Command; each file references `var(--` and no hex; the stock look is gone (screenshot baseline).
5. `lib/menu.ts` GROUPS are exactly Today, Timetable, Children, Setup; `u53-the-menu.spec.ts` passes against them; `components/educator/shell-nav.tsx` and `lib/educator/menu.ts` are deleted; every K2 page renders inside AppFrame.
6. `tests/u70-inventory.spec.ts` exists, reads `docs/frontend/screens.json`, and runs the ten generic checks for every screen whose `exists` is not `no`, as educator and as coordinator, at 1440 and 400; dynamic routes take a concrete address from `tests/inventory-fixtures.ts`, built from the test's own rows; screens with `exists: "no"` are `test.fixme` and counted in the report.
7. The computed font-family first names across every page are within {Source Serif 4, Source Sans 3} (the R4 check adapted); both load from Google Fonts with `display=swap`.
8. `bin/check`, `test_ux_rules.py`, `u51` and `screens.spec.ts` pass; `ux.frozen` in workflows.json has not grown.

### Out of scope

New screens, changed queries, the K2 switch, parents.

## UI-2: The blocks

Tier 2. Waits for: UI-1. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### What

The school's blocks of SPEC §5 built once, each with sample data on a staff-only gallery page and screenshots in both themes; the blocks that exist today moved onto the tokens; every chart drawn to scale from its data.

### Done when

1. For every block in screens.json `blocks`, a file `components/<kebab-name>.tsx` exists and its root element carries `data-block="<Name>"` (the inventory test checks the list against the folder).
2. `/setup/blocks` (staff only, behind Setup's details link) renders every block with sample data; `tests/u71-blocks.spec.ts` drives each block's behaviours from `element_kinds` (fold opens and closes; filter writes the address; grid cell acts; stepper states; chip icon+word) and screenshots each in light and dark at 1440 and 400 against committed baselines.
3. StatusChip draws every state in STATES with icon and word; a state without an icon does not compile (the existing test kept).
4. ClassGrid replaces `voice/board.tsx` and the voice form's tests pass unchanged.
5. Each chart block (StackBar, LevelBars, Spark, Trend, HeatGrid) is fed known data by a test and every text label in its SVG is a value or a date from that data; colours come from tokens only; a chart with no data renders its empty words, never an empty axis.
6. Details is a native `<details>`; a main action inside a closed Details fails the inventory test.
7. No file outside `lib/icons.tsx` imports from `lucide-react` (grep test).
8. AppFrame's search field: typing a Sr. No. that is in the person's classes offers that child; a Sr. No. outside them offers nothing; a child's name typed returns nothing (test).

### Out of scope

Pages and their data.

## UI-3: Node pages: the K2 walk

Tier 2. Waits for: UI-2; the K2 switch (a config row) on for the pages behind it. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### What

Period, record, confirm, notes, children, class picture, child, activity, objective and skill as node pages on the blocks, each walking to its neighbours through the rail and back through the trail; the old routes redirect.

### Done when

1. Every screen of this slice passes the ten generic checks in `u70-inventory.spec.ts` (its `exists` set to `yes` in screens.json) and every element in its list behaves as its kind says.
2. Every old route listed under `folds` for these screens answers 308 to the new address (test).
3. The journey `e2e/an-educators-tuesday.spec.ts` passes: Today → the lit period → Type the marks → a note written with one activity_observation per named child and none for a child not mentioned → Confirm → Class picture shows the change → the child → the skill → trail back to Today; axe at each step; at 1440 and 400.
4. A correction from Notes writes a superseding activity_observation row and never updates the old one (database assertion).
5. Every one of the 101 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
6. the session's name: a period with no activity shows no capture controls and the words 'Nothing to record here'
7. the session's name: the last-time bar's segments sum to the number of children named in the last session's observations
8. the session's name: the steps fold is open on load and the others closed
9. Record a note: Send writes exactly one educator_note with this session's id and nothing in activity_observation
10. Record a note: at 400 px the Start button is the full width and at least 56 px tall
11. Record a note: a denied microphone shows the typed path as the main action instead of an error
12. Confirm what the reader heard: Confirm writes one activity_observation per marked child, none for an unmarked child, all with one confirmation_id
13. Confirm what the reader heard: a changed or removed claim is kept as changed/removed in note_claim (reader accuracy)
14. Confirm what the reader heard: no control confirms more than one note
15. Confirm what the reader heard: a child's square is never red, whatever the mark
16. Notes: a correction writes a superseding row with a reason and never updates the old one
17. Notes: the coordinator sees every class, an educator their own (access fixture)
18. Notes: a note left unconfirmed past 48 hours carries the red 'late' chip and sorts first
19. Children: an educator with one class is taken straight to its picture; with several, picks; the coordinator picks from every class
20. Class picture: an empty square's title reads 'not seen yet', never 'not secure'
21. Class picture: no name or photo on any square (DOM scan)
22. Class picture: the stack bar's counts equal the squares by state
23. Class picture: the squares are in Sr. No. order, 10 per row at 1440, 8 at 400
24. Where this child is: a paper's result and a voice note appear on one timeline in date order
25. Where this child is: a correction shows as a new entry that names the entry it replaces
26. Where this child is: no name on the page: Sr. No. only (DOM scan)
27. Where this child is: the graph's node count equals the skills the child was seen on, and each node's state equals the table's
28. the activity's name: a drafted part carries the 'drafted' badge until Keep, Edit or Send back; an educator sees the badge but not the three buttons
29. the activity's name: every edit writes a curriculum_edit row with who
30. the activity's name: a photo attaches to the activity, never to a child
31. the objective's title: no number, percentage or state is shown for the objective itself (DOM scan)
32. the skill's name: a prerequisite or next skill is shown only when its link is confirmed (a proposed link in the fixture does not appear)
33. the skill's name: the spark's last value equals the grid's secure count
34. the skill's name: the grid's squares equal the class's enrolment in Sr. No. order

### Out of scope

Today (UI-7). Assessments (UI-4). The coordinator's actions (UI-6).

## UI-4: Node pages: assessments

Tier 2. Waits for: UI-2. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### What

Assessments, one assessment and one child's paper as node pages on the blocks; the seven old assessment pages and Class results fold in; the queries and the seven steps are unchanged.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says.
2. Every old route listed under `folds` answers 308 to the new address.
3. `lib/assessment-steps.ts` STEPS and STEP_WORDS and `lib/queries-papers.ts` exported names are unchanged (a test imports them and compares to the committed list).
4. The journey `e2e/a-paper-comes-back.spec.ts` passes: make a class assessment → approve the pack (per pack, the pack-level button; no all-packs button exists on any screen: `u62` kept) → upload a fixture scan → the paper shows right / wrong / blank / for you to judge with the fixture's counts → say what the child wrote for the one to judge → sign off → the child's timeline shows the paper result beside a voice note; axe at each step.
5. No approve-all control exists on any screen (the `ux.approveAll` list in workflows.json is empty at the end of this slice).
6. Every one of the 44 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
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

## UI-5: The coordinator's views: timetable, rules, staff, classes, setup, search

Tier 2. Waits for: UI-2 for the views; CP-1 merged for moving a child. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### What

The timetable's day, week and fortnight views for everyone; rules, staff and grants, classes and children, the Setup home and search; the small writes that exist today (a rule edit, a grant, a child move) through their own rows.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says, as educator and as coordinator.
2. Every old route listed under `folds` answers 308 to the new address.
3. `/setup/staff` has no column, sort or text that ranks people: the table cannot be sorted by the three numbers and no ordinal appears (test asserts absence).
4. A child move writes a child_move row and a new enrolment and deletes nothing; the class picture of both classes reflects it on the next render (database and DOM assertion).
5. Search never returns on a name: the fixture's child names typed return 'Nothing found'; a Sr. No. in scope returns that child.
6. Every one of the 43 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
7. Timetable: a hand move shows an amber outline and its details name who and why
8. Timetable: an educator never sees an accept-clash control; a clash cell is red for both roles
9. Timetable: the grid's cells equal the session rows for the day shown (count and names)
10. Timetable rules: the page sits under Timetable in the menu, not Setup
11. Timetable rules: every edit shows who and when, and the history fold lists it
12. Staff and classes: no sort, rank, ordinal or colour grading on the three numbers; the table cannot be sorted by them
13. Staff and classes: a grant edit is a new row or a valid_to, never a delete (row count never drops)
14. Staff and classes: no staff name appears unless the viewer is in the everything group (names are pii)
15. Classes and children: a move writes child_move and a new enrolment and deletes nothing
16. Classes and children: no child's name on the page; Sr. No. only (DOM scan)
17. Classes and children: the change log lists the move with who and when
18. Setup: every setup page is reachable in two clicks from the bar
19. Setup: an educator sees only the cards their group may open
20. '12' or 'counting': a child's name typed returns nothing; a Sr. No. in scope returns that child; a Sr. No. outside scope returns nothing

### Out of scope

Approve, go live, draft, moves (UI-6). Materials (UI-9).

## UI-6: The fortnight's actions: fortnight, draft, moves

Tier 2. Waits for: CP-6, CP-11, CP-12 and CP-21 merged. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### What

The fortnight node with Approve and Go live, the draft from the rules with its unmet rules, and moves by hand with clashes accepted by the coordinator only.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says, as educator (read-only) and as coordinator.
2. As educator, Approve, Go live, Make a draft, Accept the clash are absent and their requests are refused (test both).
3. Go live updates sessions in place and lists every changed session on the fortnight page; a hand move after freeze is kept with who and why and shows amber on the grid (database and DOM).
4. The journey `e2e/the-coordinators-fortnight.spec.ts` passes: Today (coordinator) → the red clash row → Moves → accept with a reason → Fortnight → Approve → Go live → Timetable shows the change as educator; axe at each step.
5. Every one of the 24 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
6. Fortnight 9: Approve and Go live exist for the 'everything' group only and their requests are refused for others
7. Fortnight 9: a frozen fortnight shows no Approve, Go live or edit control
8. Fortnight 9: the what-changed table lists every session the go-live updated, and nothing else
9. Draft from the rules: the draft shown equals the slots the generator wrote (count and cells)
10. Draft from the rules: every unmet rule row names a rule row that exists
11. Draft from the rules: Make a draft never changes a live fortnight's sessions (count unchanged before and after)
12. Moves by hand: a move changes only its own fortnight's sessions
13. Moves by hand: as educator the page is read-only: no pick, no Accept, and the requests are refused
14. Moves by hand: every move is listed with who made it and when, and an undo is a new row

### Out of scope

Materials; reports.

## UI-7: Today, both kinds

Tier 2. Waits for: UI-3 and UI-5; UI-6 for the coordinator's clash and draft rows (rows for a backend not yet merged simply do not appear). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### What

The educator's Today (the day, the attention strip, notes to confirm, the class) and the coordinator's Today (what waits, last week's heat grid, next week), composed from the blocks over the queries that exist; What needs doing folds in and its count moves to Setup where it belongs.

### Done when

1. Both screens pass the ten generic checks and every element in their lists behaves as its kind says, each for its role.
2. The one count on the site (the Today badge in the bar) equals the strip's do-now plus this-week numbers, computed by one query; no other page shows a count badge (test).
3. The skills-to-approve count (109 on the live copy) does not appear on either Today and does appear on Setup › Curriculum (test).
4. `/today` serves the educator's version to the own-classes group and the school's version to the everything group; the special educator gets the version the role→group rows say, with no code naming the role (test with the access fixture).
5. The educator's journey and the coordinator's journey both start from Today and pass.
6. Every one of the 23 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
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

### What

Each child's report, line by line, in the educator's words: two approvals per line, consent on file, then sent. The parent's copy says educator, Easy / Medium / Hard / Advance, no rung and no code.

### Done when

1. The screen passes the ten generic checks and every element behaves as its kind says, as educator and as coordinator.
2. A line sends only when the educator's approval, the coordinator's approval and consent are all present; the test tries each missing one and the send is refused.
3. The rendered parent copy contains none of: 'teacher', a rung code (R\d+), a skill code (NUM\.), 'borrow' (regex test over the PDF text).
4. Every one of the 10 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
5. Reports: nothing is sent without both approvals and consent (each missing case refused)
6. Reports: the parent's copy contains 'educator' and the four level words only, no rung or code (regex over the PDF text)

### Out of scope

Delivery channel (WhatsApp vs print): the backend scope's.

## UI-9: Materials

Tier 2. Waits for: CP-17 and CP-18 merged (Later). Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

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
