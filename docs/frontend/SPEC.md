# Cornerstone School OS: the frontend specification

Version 1, 9 Nov 2026. One file for the session that builds the site. It holds everything agreed in the four frontend-vision
passes with Nimish: the rules, the system, every screen as a wireframe with what it shows, what it calls and when it is done,
and the order to build in. `screens.json` beside it is the same inventory as data; `build-spec.mjs` regenerates the screen
catalogue below and the wireframes page from it. Change the JSON, run the script, never edit the catalogue by hand.

Companions: the design system "Cornerstone School OS" (tokens, brand book, icon map, first blocks):
https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514 · the clickable sketch:
https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74 · the wireframes of every screen:
(see docs/notes/frontend-landscape.md) · the notes `docs/notes/frontend-*.md` · the decision `docs/decisions/2026-11-09-white-ground-for-the-site.md`.

## 1. What is being built, in one paragraph

One site, one navigation, for a school of about 100 children and seven staff. Four doors on a slim top bar: Today, Timetable,
Children, Setup. Every screen is a node in a graph a person can walk: a period opens its activity, an activity its objective,
an objective its skill, a skill the children on it, a child the notes and papers behind each mark, and back. A trail at the
top goes back one step or to any earlier one; a rail at the right lists everything the current thing is connected to, and
carries the voice and photo buttons only where a lesson or a child is in view. The grades 1 to 4 assessment loop is rebuilt
on the same parts; its queries and its seven steps stay. Nimish, 9 Nov 2026: "We will completely change even this
assessment." Decided the same day: the ground is white; no ranking of educators; no graph database (one Postgres; the walk
on screen is the graph).

## 2. Rules that never bend (tests hold most of them)

1. A state is an icon, a word and a colour; never one alone. Every state comes from the `STATES` rows and `state_colour`.
2. Red is for work (do now, late, a clash, for you to judge), never for a child. A child below, not willing, not seen or at
   level 0 is grey or amber. If two things on a screen are red, one is wrong.
3. Three signals, never two: right, wrong, blank; a wrong answer with working is its own signal.
4. The school's words: educator never teacher; exchange or regroup never borrow; Easy / Medium / Hard / Advance; secure /
   practising / emerging / not seen; no rung, taxonomy code or kind on an educator's screen. Numbers are computed by code.
5. Nothing is ticked for her: an approval is a row's own action; no button over every row; a note is confirmed one at a
   time; a correction is a new row, never an edit.
6. One purpose, one main action, one next step per page; the purpose line at most 140 characters; one count on the site
   (Today's), computed once.
7. A list is a table with its filter row at six rows or more; ten rows shown, then grouped or paged; a class is a grid of
   squares, never a table.
8. A person sees their own: what their staff grant names; the coordinator group sees every class. A view, never a
   permission: the database's rules (CP-3, CP-4) are the permission.
9. Names (decided by Nimish, 9 Nov 2026: it is his school): a signed-in staff member sees a child's name where they need
   it: the class grid squares, the child page header, the confirm screen, notes and reports (what a parent's copy shows is
   the school's decision with CP-19). Names are read from the `pii` schema at render time and joined by `child_id`; the
   application tables keep carrying `child_id` only (CLAUDE.md rule 6 stays true); no name is ever typed into a screen, a
   state word, a log, a URL or an analytics call. One constraint stays, because the repository is public: no real child's
   name in git, tests, fixtures, screenshots or committed baselines; every fixture uses obviously fake names. Photos of
   children are not decided: none on any screen except the child's own page as photographed (PageImage).
10. Desktop first at 1440 px; a phone must not break; only recording and confirming a note are designed for the phone.

## 3. The system

**Tokens** (`tokens.json` in the design system; `tokens.css` generated from it, nothing retyped): ground white `#ffffff`;
surface `#f7f7f5`; ink `#1c1b19`; ink-muted `#5e5a52`; line `#e4e3df`; line-control `#8a8984`; link clay-700 `#9c4626`;
brand clay `#b8562f` (the mark, the active group, the one main action; never on a child); olive `#4a5435` ok; bamboo
`#9a7a3a` wait; haldi `#e2a43f` an outline on a part that needs a person; monsoon `#3f4d55`; bark `#8a6a45`; sand
`#ede3d3`. States: ok / wait / late / quiet with `-bg` fills. Subjects from the materials: Numeracy monsoon, Language bark,
Arts haldi, fixed sand. Dark follows the system; every pair has a dark value in `tokens.json`. The contrast table in
`docs/design-tokens.md` was measured on paper-warm and must be re-run on white before step 1 ships.

**Type** (decided by Nimish, 9 Nov 2026: `docs/decisions/2026-11-09-site-type-and-subject-colours.md`): Source Serif 4
for titles (32/24/20) and Source Sans 3 for everything else (18/16/14/12); weights 400/500/600; nothing under 14 px carries
a status, label or action; tabular figures in columns. The subject colours from the brand's materials are decided in the
same file. Nothing in the system is still open; the fonts and every colour are in `docs/frontend/tokens.json`, which the
build copies to `apps/web/design-system/tokens.json`.

**Space and shape**: 4 / 8 / 16 / 24 / 32 / 48 / 64 px; 44 px tap; square corners everywhere except the pill of a work-state
chip and a count badge; no shadows, no gradients; hairlines separate, a one-step surface groups.

**Icons**: Lucide only, stroke 1.9, 16 / 20 / 24 px, one icon per concept in `lib/icons.tsx`; the map is in the design
system's README. A screen never imports an icon by its Lucide name.

**Layers**: 0 tokens → 1 primitives from shadcn/ui (`npx shadcn@4.23.0 init` into `components/ui/`: Button, Badge, Table,
Tabs, Collapsible, Dialog, Sheet, Select, Tooltip, Progress, Command) → 2 the school's blocks (below) → 3 node pages
(one page shape per kind of thing) → Today composed last.

**Blocks** (`components/`): the list and one-line contract of each is in section 5. Existing blocks (`PageShell`+`TopBar` →
AppFrame, `DataTable`, `StatusChip`, `FilterBar`, `EmptyState`, `Count`, `voice/board` → ClassGrid, `voice/record` →
CaptureBar) move onto the tokens; the new ones are built once with a preview and a screenshot in both themes.

**Node contract**: a node page = AppFrame + eyebrow (the kind's icon and two or three facts) + title + purpose + its blocks +
its rail of edges (Connected to) + Capture here where a lesson or a child is in view. A new kind of thing is a new query
and a new rail list, not a new layout.

## 4. How to build it: order, tests, done

Order (each line one scoped change, tier 2 unless it changes a table):

1. Tokens and frame: `tokens.css` from the system; AppFrame replaces `PageShell`, `TopBar` and the K2 side menu; the four
   groups; every existing page reachable from the bar. The menu test (`u53`) and the UX-rule tests (`test_ux_rules.py`,
   `u51`) updated to the new frame. The font decision is taken (below).
2. Blocks: the new blocks of section 5, each with its preview page and one screenshot per theme in the suite; the existing
   blocks moved onto the tokens.
3. Node pages, the K2 walk: period, record, confirm, notes, picture, child, activity, objective, skill.
4. Node pages, assessments: assessments, assessment, paper (the four old pages and `/growth` fold in; queries reused).
5. Node pages, the coordinator: fortnight, draft, moves, rules, staff, classes (as CP-6, CP-11, CP-12, CP-22 merge).
6. Today, both kinds, from the blocks over the queries that exist.
7. Reports (CP-19, Next); materials approval (CP-17/18, Later).

UI-10 (the as-built document, `docs/frontend/AS-BUILT.md`, regenerated by every slice) can be built right after UI-1.

Steps 1 to 4 can start now (3 against the switched-on K2 pages); 5 waits for its backend scopes.

Tests that hold it: `packages/engine/tests/test_ux_rules.py` and `apps/web/tests/u51-ux-rules.spec.ts` (frame, table, chip,
filter row, 140 characters), `u53-the-menu.spec.ts` (four groups, tabs), one screenshot per block per theme, one journey
test per story (an educator's Tuesday; the coordinator's fortnight; what a parent receives) with `@axe-core/playwright` on
each, and the existing `screens.spec.ts` at laptop and phone. Every screen's `done_when` in section 6 is written as a proof
before its slice is built (the Athena loop). Server components by default; client code only for the class grid's tap, the
recorder and the details folds.

Folding: the catalogue marks which old pages fold into each new screen. A folded page keeps its address as a redirect for
one term, then goes. Nothing is deleted before its new screen's proofs pass.

**The inventory is the test oracle.** `screens.json` is read by one Playwright test, `tests/u70-inventory.spec.ts` (built in
UI-1), which opens every screen of a slice listed in the top-level `merged_slices` (a full run) or named by `SLICE=UI-n`
(a pull request run) at a concrete address (dynamic routes get theirs from a fixture map the test's own rows provide),
runs the generic checks of section 7, and drives every control in the screen's `elements` list by its kind. Every other
screen is a `test.fixme`, so the count of screens still to build is always visible in the test report. `exists` only
describes the old page that is there today; it never decides what the test runs. Every screen belongs to exactly one
slice (the script refuses a screen in no slice); a slice's last commit adds its id to `merged_slices`. Adding a screen
means adding it to the inventory and a slice first; the test fails until the screen is built.

## 7. Slices and their goal points

Each slice below is one scoped change in the Athena loop: pasted as a GitHub issue in the Scope form (`scopes.md` holds the
paste-ready text), locked by Nimish, proofs written first, built, verified, shipped. Every Done-when line is observable by a
test or a script named in it. The generic checks apply to every screen a slice builds, on top of the screen's own lines:

1. Renders at 1440 and 400 px: the eyebrow, one h1 equal to the title, a purpose line of at most 140 characters, exactly one main action, the trail, the rail; no console error; no sideways scroll.
2. Completeness: the set of interactive controls in the main column and the rail (a, button, [role=button], summary, input, select) equals this screen's element list for the signed-in role: nothing extra, nothing missing. A control that does nothing on click (no address change, no DOM change, no request) fails.
3. Navigation: every link and row lands on its target screen (h1 check) and Back returns to this screen with the same address; each earlier step of the trail returns to that screen; the four doors on the bar open their first screen from here.
4. Roles: an element marked for one group is absent for the others; the address or request behind it is refused for the others (redirect to /refused or 403), never silently ignored.
5. Keyboard: Tab reaches every control in reading order; Enter or Space activates it; the focused control shows a visible ring (outline at least 2 px); Escape closes an open Sheet or Dialog.
6. Touch: at 400 px every control is at least 44 × 44 px with at least 8 px to its neighbour.
7. Words: every state shown is a word from the STATES rows beside its icon, never colour alone; a child's name appears only on screens whose element list marks a `child_name` element, read from pii by child_id, and on no other screen; the page text and every URL carry no name where the spec says none; every fixture, test, screenshot and committed baseline uses obviously fake names (the repository is public; a test scans them against a list of real names kept off the repository); 'educator' never 'teacher'.
8. Accessibility: axe reports no serious or critical violation at either width, in light and in dark.
9. Empty: with the fixture's empty class or empty filter, the screen shows exactly its stated empty text and its next-step link, and no table head over no rows, no zero columns, no dash columns.
10. Themes: a screenshot in light and in dark at 1440 is committed as a baseline; sampled text nodes measure at least 4.5:1 against what is behind them in both.

What the test does with each kind of control:

| Kind | What the test does with it |
|---|---|
| link | click lands on the target screen: its h1 equals the target's title (or matches its pattern); Back returns |
| row | a table row or list row that is one link: as link |
| cell | a square of the ClassGrid: as link (a child) or as button (a mark, on the confirm screen) |
| tab | changes the view in place; the address carries the tab; the h1 does not change |
| button | click produces the stated effect: a row written, a state chip changed, a redirect; the test asserts the effect in the database or the DOM |
| fold | a Details: closed by default unless stated; click opens it and its content is visible; click again closes; the main action is never inside it |
| filter | changes the rows and writes itself into the address; × clears one; Clear clears all; a reload keeps them |
| field | a form field with a label; empty when required shows the stated message and submits nothing |
| switch | a two-state control; the state is spoken (aria-checked) and shown as a word, never colour alone |
| child_name | not a control: text. The child's name, read from the pii schema at render time and joined by child_id, shown only where an element of this kind is listed. The test asserts the name is present and, on every other screen, absent; it is never in a URL, a log line, a state word or an analytics call |
| upload | accepts the stated file kinds; a wrong kind shows a message; a right one shows the file's name before anything is sent |

| Slice | What | Screens | Waits for |
|---|---|---|---|
| UI-1 Tokens, frame and the inventory test | One navigation and one source of colour, type and space for the whole site. tokens.css generated from tokens.json; shadcn/ui initialised (it is not yet: `components/ui/` does not exist) and styled by the tokens; the journey-test harness the Athena loop demands; AppFrame (top bar, trail, rail) replacing PageShell, TopBar and the K2 side menu; and the inventory test that reads screens.json and drives every screen like a person. | the frame and the blocks | nothing (type and colours decided 9 Nov) |
| UI-2 The blocks | The school's blocks of SPEC §5 built once, each with sample data on a staff-only gallery page and screenshots in both themes; the blocks that exist today moved onto the tokens; every chart drawn to scale from its data. | the frame and the blocks | UI-1 |
| UI-3 Node pages: the K2 walk | Period, record, confirm, notes, children, class picture, child, activity, objective and skill as node pages on the blocks, each walking to its neighbours through the rail and back through the trail; the old routes redirect. | the session's name, Record a note, Confirm what the reader heard, Notes, Children, Class picture, Where this child is, the activity's name, the objective's title, the skill's name | UI-2; the K2 switch (a config row) on for the pages behind it |
| UI-4 Node pages: assessments | Assessments, one assessment and one child's paper as node pages on the blocks; the seven old assessment pages and Class results fold in; the queries and the seven steps are unchanged. | Assessments, the built name, Check the answers | UI-2 |
| UI-5 The coordinator's views: timetable, rules, staff, classes, setup, search | The timetable's day, week and fortnight views for everyone; rules, staff and grants, classes and children, the Setup home and search; the small writes that exist today (a rule edit, a grant, a child move) through their own rows. | Timetable, Timetable rules, Staff and classes, Classes and children, Setup, Search | UI-2 for the views; CP-1 merged for moving a child |
| UI-6 The fortnight's actions: fortnight, draft, moves | The fortnight node with Approve and Go live, the draft from the rules with its unmet rules, and moves by hand with clashes accepted by the coordinator only. | Fortnight 9, Draft from the rules, Moves by hand | CP-6, CP-11, CP-12 and CP-22 merged |
| UI-7 Today, both kinds | The educator's Today (the day, the attention strip, notes to confirm, the class) and the coordinator's Today (what waits, last week's heat grid, next week), composed from the blocks over the queries that exist; What needs doing folds in and its count moves to Setup where it belongs. | Today, Today, the school | UI-3 and UI-5; UI-6 for the coordinator's clash and draft rows (rows for a backend not yet merged simply do not appear) |
| UI-8 Reports | Each child's report, line by line, in the educator's words: two approvals per line, consent on file, then sent. The parent's copy says educator, Easy / Medium / Hard / Advance, no rung and no code. | Reports | CP-19 merged (Next) |
| UI-9 Materials | The class's materials list for a fortnight, the school's list, the notes the system could not read, and the educator's approval of her own class's list. | Materials, this fortnight | CP-17 and CP-18 merged (Later) |
| UI-11 Setup content pages: curriculum, skills to approve, question bank, a question | The four existing Setup pages that carry content rather than people, rebuilt on the frame and the blocks: Curriculum (activities and skills under one filter row, with drafts and offers), Skills to approve, the Question bank and one question as it prints. Their queries and their one-row-at-a-time approvals are unchanged; the old routes fold in. | Curriculum, Skills to approve, Question bank, the question as it prints | UI-2 |
| UI-12 The screens outside the bar: sign in, help, report a problem | Sign in (with forgot and new password), the help pages and the feedback form, rebuilt on the tokens and the blocks; help is generated from screens.json so a new screen gets its section without a hand edit; the feedback form keeps names out of the public GitHub issue. | Sign in, Start here, Report a problem or suggest something | UI-1 |
| UI-10 The as-built milestone document | A script that generates docs/frontend/AS-BUILT.md from screens.json plus the last inventory-test run: the milestone document Nimish asked for, so he can see exactly what exists, what each screen's controls are, and what the checks reported. Every slice adds its id to `merged_slices` in screens.json when its proofs pass, so the document is always true. | the frame and the blocks | UI-1 (it can be built early and re-run after every slice) |

## 5. The blocks

| Block | What it is |
|---|---|
| AppFrame | top bar (four groups, search, acting-as), trail, main column, rail (Connected to; Capture here) |
| AttentionStrip | three tiles: do now (red) · this week (amber) · done (green); number, icon+word, one sentence; each a link |
| PeriodRow | time · subject edge+tag · name · state chip; the row is the link |
| StatusChip | icon + word + colour from the STATES rows; pill for work, square for a child's mark |
| DataTable | ≤10 rows then grouped/paged; needs-you first; numbers right, status centred; cards on a phone |
| FilterBar | dropdowns + compact search over any table of 6+ rows; filters in the address |
| ClassGrid | squares by Sr. No. with the child's name beside it, on one skill; secure/practising/emerging/not seen; tap = act |
| Stepper | the steps of a thing; done green, waiting amber, late red, rest quiet |
| Details | a fold that opens on click, eye icon; never hides the main action |
| Timeline | what was seen, newest last; words beside the mark; a details fold each |
| ChildGraph | the child at the centre, skills as nodes coloured by state, sized by how often seen; each a link |
| StackBar | one bar split by state with a key of counts |
| LevelBars | four bars, levels 0–3, how many children at each |
| Spark | one line over six fortnights with the last value labelled |
| Trend | a child's level per sitting over dates |
| HeatGrid | classes × days: done / moved / not done / holiday, icon + word in each cell |
| FortnightGrid | week A and B × periods, cells coloured by subject; moved = amber outline, clash = red outline |
| CaptureBar | Voice note · Photo; the whole screen on a phone |
| DropZone | choose scans or drop them; or a Drive link |
| PageImage | the child's page as photographed, QR corner; the one picture of a child allowed on any screen (photos of children are otherwise not decided: none) |
| EmptyState | nothing to show, with the next step |
| Form | a short form of labelled fields; one main button |
| KeyValue | facts as label: value pairs, five lines at most |
| Cards | two to three bordered blocks side by side, each with a title, a few lines and one link |

## 6. Every screen

Each screen: its address, who sees it, its phase (Core / Next / Later) and the backend scopes it calls; the eyebrow, title
and purpose line as they appear; its blocks in order with what each shows and from where; the rail; the one main action and
the next step; the empty state; how it folds on a phone; which old pages fold into it; and what must be true before it is
done. Wireframes of all of them: (see docs/notes/frontend-landscape.md).

### Today

#### Today `/today`
Who: educator · Phase: Core · Backend: CP-8 · CP-10 · Old page today: part · Slice: UI-7
Eyebrow: Tuesday 18-Nov · K2 Red · Fortnight 9, week A
Purpose: Your periods in order. Tap one for what to teach, how, and what to lay out. After it, record a note.
Blocks, in order:
- **AttentionStrip**: do now = notes unconfirmed past 48 h; this week = notes to confirm; done = periods finished of planned, children seen this fortnight
- **PeriodRow**: one per session of the day, from `session` for my class; fixed parts of the day included, greyed
- **Cards**: Notes to confirm (count, oldest) · Your class (children not seen this fortnight on the skill being taught)
Rail (Connected to): Now: the current period · This fortnight · Class picture · Materials
Main action: the current period · Next step: Timetable
Data: session × plan_entry × activity for my class on this school_day; pii.educator_note status counts; child_observed_state gaps
Empty: No sessions today (a holiday or no timetable live): say which, link to the fortnight · Phone: same order; the strip stacks; the record button is one tap from the period
Folds in: /today (What needs doing), /educator (K2 Today)
Every control on the screen (10), and what the test does with each:
- **link** do now tile → Confirm what the reader heard (`/notes/[id]`) (the oldest unconfirmed note; absent (grey 0) when none)
- **link** this week tile → Notes (`/notes`)
- **link** done today tile → Class picture (`/children/[class]`)
- **row** each period row → the session's name (`/period/[id]`) (a fixed part of the day opens its period page with 'Nothing to record here')
- **link** Confirm the first → Confirm what the reader heard (`/notes/[id]`)
- **link** Class picture → Class picture (`/children/[class]`)
- **link** rail: Now: the current period → the session's name (`/period/[id]`)
- **link** rail: This fortnight → Timetable (`/timetable`)
- **link** rail: Class picture → Class picture (`/children/[class]`)
- **link** rail: Materials → Materials, this fortnight (`/timetable/materials`)
Done when (on top of the ten generic checks):
- an educator sees only sessions of classes their grant names (the access fixture's second educator sees a different list)
- each tile's number equals the count of rows the tile opens
- the lit row is the session whose period contains the current time; before 08:30 none is lit


#### Today, the school `/today`
Who: coordinator · Phase: Core · Backend: CP-6 · CP-12 · CP-22 · CP-10 · Old page today: no · Slice: UI-7
Eyebrow: Tuesday 18-Nov · every class
Purpose: What waits on you, each with its own button. Then the week ahead.
Blocks, in order:
- **AttentionStrip**: do now = clashes not accepted + notes unconfirmed past 48 h across classes; this week = drafts to approve, materials lines without quantity; done = sessions done of planned last week
- **HeatGrid**: last week, class × day
- **DataTable**: the waiting rows: clash, draft, late notes, sessions not done, materials; each row's own button
- **Cards**: Next week (events from school_day and fortnight) · New activities next week (plan_entry not taught before) · Does the system have what it needs (activities with steps/levels, materials with quantities, consent on file)
Rail (Connected to): Fortnight 9 · Staff and classes · Timetable
Main action: the first red row · Next step: Fortnight
Data: fortnight state; timetable clashes; sessions by state last week; educator_note status by class; materials_line without quantity; consent counts
Empty: Nothing waits on you: say so in one line, keep the heat grid and next week · Phone: strip stacks; heat grid scrolls sideways in its own box
Every control on the screen (13), and what the test does with each:
- **link** do now tile → Moves by hand (`/timetable/moves`)
- **link** this week tile → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** sessions done tile → Staff and classes (`/setup/staff`)
- **cell** each heat-grid cell → Timetable (`/timetable`) (opens that class's day)
- **row** clash row → Moves by hand (`/timetable/moves`) [coordinator only; absent and refused for others]
- **row** draft row → Draft from the rules (`/timetable/draft`) [coordinator only; absent and refused for others]
- **row** late notes row → Notes (`/notes`)
- **row** sessions not done row → Staff and classes (`/setup/staff`)
- **row** materials row → Materials, this fortnight (`/timetable/materials`)
- **link** each new activity next week → the activity's name (`/setup/activities/[code]`)
- **link** rail: Fortnight 9 → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** rail: Staff and classes → Staff and classes (`/setup/staff`)
- **link** rail: Timetable → Timetable (`/timetable`)
Done when (on top of the ten generic checks):
- only the 'everything' group sees this version; an educator at /today sees the educator's
- each waiting row leads to the screen that does the work and the work is listed there
- no ranking of people anywhere on the page
- the heat grid has one cell per class per teaching day and a dashed cell per holiday


#### the session's name `/period/[id]`
Who: educator · Phase: Core · Backend: CP-8 · Old page today: yes (/educator/period) · Slice: UI-3
Eyebrow: Period · 09:15 · K2 Red · Numeracy
Purpose: the activity's objective in one line
Blocks, in order:
- **Cards**: actions: Record a note (main) · Type the marks · Open the activity
- **StackBar**: last time this activity ran: above / as expected / below / not willing / absent, with the children below or not willing named by Sr. No.
- **Details**: The steps, short (open) · Lay out (materials with quantities) · Watch for (the thinking)
Rail (Connected to): The activity · its learning objectives · Materials · Its place in the fortnight · The class · Capture here: voice, photo
Main action: Record a note · Next step: the next period
Data: session → plan_entry → activity (+activity_material, activity_objective); activity_observation of this activity for this class, last session
Empty: A fixed part of the day: 'Nothing to record here' · Phone: actions first, then the fold; the record button fills the width
Every control on the screen (14), and what the test does with each:
- **link** Record a note → Record a note (`/period/[id]/record`)
- **link** Type the marks instead → Confirm what the reader heard (`/notes/[id]`) (opens the form path of the confirm screen)
- **link** Open the activity → the activity's name (`/setup/activities/[code]`)
- **link** each Sr. No. named under the last-time bar → Where this child is (`/children/[class]/[roll]`)
- **fold** The steps, short (open by default)
- **fold** Lay out
- **fold** Watch for
- **link** rail: The activity → the activity's name (`/setup/activities/[code]`)
- **link** rail: each learning objective → the objective's title (`/setup/objectives/[code]`)
- **link** rail: Materials → Materials, this fortnight (`/timetable/materials`)
- **link** rail: Its place in the fortnight → Timetable (`/timetable`)
- **link** rail: The class → Class picture (`/children/[class]`)
- **link** capture: Voice note → Record a note (`/period/[id]/record`)
- **link** capture: Photo → Record a note (`/period/[id]/record`) (opens record with the photo path)
Done when (on top of the ten generic checks):
- a period with no activity shows no capture controls and the words 'Nothing to record here'
- the last-time bar's segments sum to the number of children named in the last session's observations
- the steps fold is open on load and the others closed


#### Record a note `/period/[id]/record`
Who: educator · Phase: Core · Backend: CP-10 · Old page today: yes (/voice/record) · Slice: UI-3
Eyebrow: K2 Red · the session's name
Purpose: Say what happened and who, by Sr. number. The reader turns it into marks; you confirm them, one note at a time.
Blocks, in order:
- **CaptureBar**: Start recording (main) · Add a photo · Type the marks; while recording: Stop, Send; after: 'sent, the reader is listening'
- **KeyValue**: activity · class · time; audio and transcript kept 48 h on the private side, then deleted
Rail (Connected to): The period · The activity · The class · Capture here: voice, photo
Main action: Start recording · Next step: Notes to confirm
Data: the session; pii.educator_note insert via the engine; config: note retention
Empty: none · Phone: this is the phone screen: one button, the activity already known
Every control on the screen (8), and what the test does with each:
- **button** Start recording: microphone permission asked; the button becomes Stop; a timer counts
- **button** Stop: recording ends; Send and Record again appear
- **button** Send: one pii.educator_note row with the session id, status received; the page says 'sent, the reader is listening' and links to Notes
- **upload** Add a photo: jpg/png/heic accepted; the photo attaches to the session, never to a child
- **link** Type the marks → Confirm what the reader heard (`/notes/[id]`)
- **link** rail: The period → the session's name (`/period/[id]`)
- **link** rail: The activity → the activity's name (`/setup/activities/[code]`)
- **link** rail: The class → Class picture (`/children/[class]`)
Done when (on top of the ten generic checks):
- Send writes exactly one educator_note with this session's id and nothing in activity_observation
- at 400 px the Start button is the full width and at least 56 px tall
- a denied microphone shows the typed path as the main action instead of an error


#### Confirm what the reader heard `/notes/[id]`
Who: educator · Phase: Core · Backend: CP-9 · CP-10 · Old page today: yes (/voice/notes/[id]) · Slice: UI-3
Eyebrow: K2 Red · note of 09:15 · Counting to 20
Purpose: Left, your words line by line. Right, the class already marked from them. Nothing is ticked for you; 'the rest did as expected' is one switch. Confirm is for this note only.
Blocks, in order:
- **Cards**: You said: each claim line with its words → Sr. No.s and the mark as a chip; problems the reader flagged pinned on top in red
- **ClassGrid**: the class marked from the note; corner marks ▲ ▼ ✋ ○; tap a square to change a mark
- **Form**: 'the rest did as expected' switch · Confirm this note (main)
Rail (Connected to): The period · The activity · The class · Correct a confirmed note
Main action: Confirm this note · Next step: the next note waiting
Data: pii.educator_note + draft claims from the engine; activity_observation written at confirm, one row per child, confirmation_id
Empty: No note waiting: link to Record · Phone: the grid first, then her words; Confirm fixed at the bottom
Every control on the screen (9), and what the test does with each:
- **button** each claim line's × (remove): the claim is marked removed; its children's squares return to unmarked; recorded as her decision
- **cell** each square: opens the mark picker: above / as expected / below / not willing / absent / clear; the square's corner mark changes; the claim it came from is marked changed
- **switch** the rest did as expected: every unmarked present child gets as-expected with entry mode group; off removes them
- **button** Confirm this note: one activity_observation per marked child with one confirmation_id; the note's status becomes confirmed; lands on the next waiting note or Notes
- **link** rail: The period → the session's name (`/period/[id]`)
- **link** rail: The activity → the activity's name (`/setup/activities/[code]`)
- **link** rail: The class → Class picture (`/children/[class]`)
- **link** rail: Correct a confirmed note → Notes (`/notes`)
- **child_name** each square and each claim line (the name beside the Sr. No., so she can check the right child is marked)
Done when (on top of the ten generic checks):
- Confirm writes one activity_observation per marked child, none for an unmarked child, all with one confirmation_id
- a changed or removed claim is kept as changed/removed in note_claim (reader accuracy)
- no control confirms more than one note
- a child's square is never red, whatever the mark


### Timetable

#### Timetable `/timetable`
Who: both · Phase: Core · Backend: CP-22 · Old page today: part (/educator/week) · Slice: UI-5
Eyebrow: K2 Red
Purpose: The fortnight is the unit. Week A and week B, each period a block; a moved period is marked, a clash is red until the coordinator accepts it.
Blocks, in order:
- **FilterBar**: class (coordinator only) · Day / Week / Fortnight view · this / next fortnight
- **FortnightGrid**: from timetable_slot in force + session overrides; subject colours; moved/clash outlines; a cell is the period's link
- **Cards**: Fortnight 9: state · Materials for this fortnight
Rail (Connected to): Fortnight 9 · Materials · Today's period · Rules (coordinator)
Main action: Open today · Next step: Fortnight
Data: timetable_slot valid today; session for the fortnight's days; period times; school_day kinds
Empty: No timetable live for this class: coordinator sees 'Make a draft' · Phone: Day view by default; week scrolls sideways in its box
Folds in: /educator (day), /educator/week
Every control on the screen (11), and what the test does with each:
- **filter** class [coordinator only; absent and refused for others]
- **tab** Day / Week / Fortnight (Day by default at 400 px)
- **filter** this / next fortnight
- **cell** each grid cell → the session's name (`/period/[id]`)
- **fold** a moved cell's details (who, why, when) (hover shows it at 1440; tap at 400)
- **link** Fortnight 9 card → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** Materials card → Materials, this fortnight (`/timetable/materials`)
- **link** rail: Fortnight 9 → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** rail: Materials → Materials, this fortnight (`/timetable/materials`)
- **link** rail: Today's period → the session's name (`/period/[id]`)
- **link** rail: Rules → Timetable rules (`/timetable/rules`) [coordinator only; absent and refused for others]
Done when (on top of the ten generic checks):
- a hand move shows an amber outline and its details name who and why
- an educator never sees an accept-clash control; a clash cell is red for both roles
- the grid's cells equal the session rows for the day shown (count and names)


#### Fortnight 9 `/timetable/fortnight/[n]`
Who: both · Phase: Core · Backend: CP-6 · CP-22 · Old page today: no · Slice: UI-6
Eyebrow: 17-Nov to 28-Nov
Purpose: Its state, its plan lines, and what changed when the draft went live. Frozen once it starts; a move after that is a hand move, kept with who made it.
Blocks, in order:
- **Stepper**: drafted · approved · live · frozen
- **Cards**: State (chip + who/when) · Plan lines (plan_entry, each an activity link) · Hand moves (who, why, when)
- **DataTable**: coordinator: what changed at go-live, session by session
- **Form**: coordinator: Approve · Go live (main, one at a time)
Rail (Connected to): The grid · every activity in the plan · Materials · Draft (coordinator)
Main action: Approve / Go live (coordinator) · Open the grid (educator) · Next step: Timetable
Data: fortnight + fortnight_cycle state (CP-6); plan_entry; session diffs at go-live (CP-22); approval ledger
Empty: No plan lines yet: link to the planner upload · Phone: stepper wraps to two rows
Every control on the screen (8), and what the test does with each:
- **link** each plan line → the activity's name (`/setup/activities/[code]`)
- **link** each hand move → Moves by hand (`/timetable/moves`) [coordinator only; absent and refused for others]
- **button** Approve: approval row written; the stepper moves to approved; Go live appears; Approve disappears [coordinator only; absent and refused for others]
- **button** Go live: sessions updated in place; the what-changed table fills; the stepper moves to live [coordinator only; absent and refused for others]
- **link** rail: The grid → Timetable (`/timetable`)
- **link** rail: each activity in the plan → the activity's name (`/setup/activities/[code]`)
- **link** rail: Materials → Materials, this fortnight (`/timetable/materials`)
- **link** rail: Draft → Draft from the rules (`/timetable/draft`) [coordinator only; absent and refused for others]
Done when (on top of the ten generic checks):
- Approve and Go live exist for the 'everything' group only and their requests are refused for others
- a frozen fortnight shows no Approve, Go live or edit control
- the what-changed table lists every session the go-live updated, and nothing else


#### Draft from the rules `/timetable/draft`
Who: coordinator · Phase: Core · Backend: CP-11 · Old page today: no · Slice: UI-6
Eyebrow: Fortnight 10 · from the rules
Purpose: One command makes a draft from the period times, blocked days, fixed slots and limits. Rules it could not meet are listed in words.
Blocks, in order:
- **Form**: Make a draft (main) · which fortnight
- **FortnightGrid**: the draft, every class, tabs per class
- **DataTable**: rules not met: the rule in the school's words · where · what the draft did instead
- **Cards**: Next: hand moves · then Approve on the fortnight
Rail (Connected to): Rules · Fortnight 10 · Moves by hand
Main action: Make a draft · Next step: Moves by hand
Data: engine command (FET) → draft slots; unmet rules report
Empty: No rules for this grade yet: link to Rules · Phone: read-only; the button is desktop
Every control on the screen (9), and what the test does with each:
- **field** which fortnight (required; the next teaching fortnight by default)
- **button** Make a draft: the engine command runs; the grid fills with the draft; unmet rules list; a live fortnight is untouched
- **tab** each class (the grid shows that class)
- **cell** each grid cell → the session's name (`/period/[id]`) (a draft cell opens read-only)
- **link** each unmet rule's rule name → Timetable rules (`/timetable/rules`)
- **link** Next: hand moves → Moves by hand (`/timetable/moves`)
- **link** rail: Rules → Timetable rules (`/timetable/rules`)
- **link** rail: Fortnight 10 → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** rail: Moves by hand → Moves by hand (`/timetable/moves`)
Done when (on top of the ten generic checks):
- the draft shown equals the slots the generator wrote (count and cells)
- every unmet rule row names a rule row that exists
- Make a draft never changes a live fortnight's sessions (count unchanged before and after)


#### Moves by hand `/timetable/moves`
Who: coordinator · Phase: Core · Backend: CP-12 · Old page today: no · Slice: UI-6
Eyebrow: Fortnight 10 · draft
Purpose: Move a period; the clash it makes shows at once; only the coordinator accepts one, with a reason.
Blocks, in order:
- **FortnightGrid**: drag or pick-and-place; a moved cell amber; a clash red
- **DataTable**: moves made: what · from · to · who · why · clash accepted?
- **Form**: accept this clash: reason (required) · Accept
Rail (Connected to): Fortnight 10 · The grid · Rules
Main action: Accept the clash · Next step: Fortnight: Approve
Data: session moves kept with staff id and reason; clash detection from the engine
Empty: No moves yet · Phone: read-only
Every control on the screen (7), and what the test does with each:
- **cell** pick a cell, then a target cell: the session moves; the source and target cells redraw; a clash shows red; a move row appears with who
- **button** Undo the last move: the move is reversed as a new move row, never deleted
- **field** reason (required: empty shows 'Say why' and accepts nothing)
- **button** Accept the clash: the clash is marked accepted with the reason and who; the cell's outline turns amber
- **link** rail: Fortnight 10 → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** rail: The grid → Timetable (`/timetable`)
- **link** rail: Rules → Timetable rules (`/timetable/rules`)
Done when (on top of the ten generic checks):
- a move changes only its own fortnight's sessions
- as educator the page is read-only: no pick, no Accept, and the requests are refused
- every move is listed with who made it and when, and an undo is a new row


#### Timetable rules `/timetable/rules`
Who: coordinator · Phase: Core · Backend: CP-11 · Old page today: yes · Slice: UI-5
Eyebrow: Every grade
Purpose: Period times, blocked days, fixed slots and subject limits, kept as rows with who changed them.
Blocks, in order:
- **FilterBar**: grade · kind
- **DataTable**: rule · grade · value · changed by · when; each row its own Edit
- **Details**: history of edits (timetable_rule_edit)
Rail (Connected to): Draft from the rules · Timetable
Main action: Add a rule · Next step: Draft
Data: period, timetable_block, timetable_limit, timetable_rule_edit
Empty: No rules yet: 'Add the period times first' · Phone: cards
Every control on the screen (7), and what the test does with each:
- **filter** grade
- **filter** kind
- **button** Edit (a row): the row's value becomes a field; Save writes a timetable_rule_edit row with who and when; Cancel restores
- **button** Add a rule: a new row form; Save adds the rule and its edit row
- **fold** History of edits
- **link** rail: Draft from the rules → Draft from the rules (`/timetable/draft`)
- **link** rail: Timetable → Timetable (`/timetable`)
Done when (on top of the ten generic checks):
- the page sits under Timetable in the menu, not Setup
- every edit shows who and when, and the history fold lists it


#### Materials, this fortnight `/timetable/materials`
Who: both · Phase: Later · Backend: CP-17 · CP-18 · Old page today: yes (/educator/materials) · Slice: UI-9
Eyebrow: K2 Red · Fortnight 9
Purpose: Built from the activities in the plan. Each line knows which activity needs it. Set a quantity, remove a line, add from the catalogue.
Blocks, in order:
- **FilterBar**: day · week · fortnight
- **DataTable**: item · quantity (editable) · for which activity (link) · source
- **Cards**: School list (coordinator) · Notes to read (notes the system could not match to an item)
Rail (Connected to): every activity in the plan · Fortnight 9 · School list · Capture here: photo
Main action: Fill the quantities · Next step: School list
Data: materials_list, materials_line, activity_material, material_item
Empty: No plan lines with materials · Phone: cards
Every control on the screen (10), and what the test does with each:
- **filter** day / week / fortnight
- **field** quantity (each line): a number; saving writes materials_line_edit with who; the amber 'to confirm' chip clears
- **button** Remove (each line): the line is marked removed with who, never deleted
- **button** Add from the catalogue: a picker of material_item; never free text
- **link** each line's activity → the activity's name (`/setup/activities/[code]`)
- **link** School list → Materials, this fortnight (`/timetable/materials`) [coordinator only; absent and refused for others] (the school-wide view of this screen)
- **link** Notes to read → Materials, this fortnight (`/timetable/materials`) (the review list)
- **link** rail: each activity in the plan → the activity's name (`/setup/activities/[code]`)
- **link** rail: Fortnight 9 → Fortnight 9 (`/timetable/fortnight/[n]`)
- **upload** capture: Photo: a photo attaches to the list, never to a child
Done when (on top of the ten generic checks):
- a line with no quantity carries the amber 'to confirm' chip
- approval (CP-17) exists only for the signed-in educator's own class and is refused for another


### Children

#### Notes `/notes`
Who: both · Phase: Core · Backend: CP-9 · CP-10 · Old page today: no · Slice: UI-3
Eyebrow: K2 Red · this fortnight
Purpose: Every note of your classes: waiting, confirmed, left unconfirmed. Open one to confirm it or to correct a confirmed one.
Blocks, in order:
- **FilterBar**: class · state · week
- **DataTable**: when · activity · by voice/form · state chip · children named · its button (Confirm / Open / Correct)
Rail (Connected to): Record a note · Class picture · Today · Capture here: voice
Main action: Confirm the oldest · Next step: Class picture
Data: pii.educator_note joined to activity_observation counts; note_status rows
Empty: No notes yet this fortnight: link to Record · Phone: cards
Every control on the screen (14), and what the test does with each:
- **filter** class [coordinator only; absent and refused for others] (an educator with one class has no class filter)
- **filter** state
- **filter** week
- **child_name** the children named column (each named child's name beside the Sr. No.)
- **button** × on a filter chip: removes that filter from the address
- **button** Clear: removes every filter
- **row** Confirm (a waiting note) → Confirm what the reader heard (`/notes/[id]`)
- **row** Open (a confirmed note) → Confirm what the reader heard (`/notes/[id]`) (read-only view of a confirmed note)
- **button** Correct (a confirmed note): opens the confirm screen in correction mode; on Confirm a superseding activity_observation row is written with a reason; the old row is unchanged
- **link** page: Later → → Notes (`/notes`) (the next ten rows; the address carries the page)
- **link** rail: Record a note → Record a note (`/period/[id]/record`)
- **link** rail: Class picture → Class picture (`/children/[class]`)
- **link** rail: Today → Today (`/today`)
- **link** capture: Voice note → Record a note (`/period/[id]/record`)
Done when (on top of the ten generic checks):
- a correction writes a superseding row with a reason and never updates the old one
- the coordinator sees every class, an educator their own (access fixture)
- a note left unconfirmed past 48 hours carries the red 'late' chip and sorts first


#### Children `/children`
Who: both · Phase: Core · Backend: CP-13 · Old page today: part (/k2) · Slice: UI-3
Eyebrow: Your classes
Purpose: Where each child stands, two ways in: the class picture from notes (nursery to K2) and the papers (grades 1 to 4). Both feed the same child.
Blocks, in order:
- **Cards**: Class picture: my class, count, from confirmed notes · Assessments: grades, live count, answers to check · Notes
- **DataTable**: coordinator: every class with children count, seen this fortnight, not seen
Rail (Connected to): Class picture · Assessments · Notes
Main action: Open the class · Next step: Class picture
Data: school_class, enrolment counts, child_observed_state coverage
Empty: No class linked to you: 'The coordinator links you to the classes you teach' · Phone: cards
Every control on the screen (7), and what the test does with each:
- **link** Open the class → Class picture (`/children/[class]`)
- **link** Open the assessments → Assessments (`/children/assessments`)
- **link** Open the notes → Notes (`/notes`)
- **row** each class row → Class picture (`/children/[class]`) [coordinator only; absent and refused for others]
- **link** rail: Class picture → Class picture (`/children/[class]`)
- **link** rail: Assessments → Assessments (`/children/assessments`)
- **link** rail: Notes → Notes (`/notes`)
Done when (on top of the ten generic checks):
- an educator with one class is taken straight to its picture; with several, picks; the coordinator picks from every class


#### Class picture `/children/[class]`
Who: both · Phase: Core · Backend: CP-13 · CP-9 · Old page today: yes (/k2/[class]) · Slice: UI-3
Eyebrow: K2 Red · 24 children
Purpose: Each square a child by Sr. No., shown on one skill at a time. Tap a child. Change the skill from the rail.
Blocks, in order:
- **FilterBar**: skill (the skills anyone was seen on) · domain
- **ClassGrid**: state on the chosen skill; not seen = dashed
- **StackBar**: the class on this skill with counts
- **Spark**: secure over six fortnights
Rail (Connected to): Show: each skill seen · a child · Record a note · Assessments (grades 1–4: Class results folds here) · Capture here: voice, photo
Main action: a child · Next step: the skill
Data: child_observed_state (K2) or child_skill_state (grades 1–4) for the class by skill; graph_run date
Empty: No child seen yet: the grid of dashed squares with 'not seen yet, nothing more' · Phone: 8 columns
Folds in: /growth (Class results), /growth/class/[section]
Every control on the screen (10), and what the test does with each:
- **filter** skill
- **filter** domain
- **cell** each square → Where this child is (`/children/[class]/[roll]`)
- **child_name** each square (the name beside the Sr. No.)
- **link** rail: Show: each skill seen → Class picture (`/children/[class]`) (same screen, the skill filter changes)
- **link** rail: a child → Where this child is (`/children/[class]/[roll]`)
- **link** rail: Record a note → Record a note (`/period/[id]/record`)
- **link** rail: Assessments → Assessments (`/children/assessments`)
- **link** capture: Voice note → Record a note (`/period/[id]/record`)
- **link** capture: Photo → Record a note (`/period/[id]/record`)
Done when (on top of the ten generic checks):
- an empty square's title reads 'not seen yet', never 'not secure'
- each square shows the Sr. No. and the child's name read from pii by child_id, and no photo (DOM scan)
- the stack bar's counts equal the squares by state
- the squares are in Sr. No. order, 10 per row at 1440, 8 at 400


#### Where this child is `/children/[class]/[roll]`
Who: both · Phase: Core · Backend: CP-13 · CP-14 · Old page today: part (/k2/[class]/[roll], /growth/[id]) · Slice: UI-3
Eyebrow: K2 Red · Sr. No. 12 · the child's name
Purpose: The left is the shape: each skill seen, coloured by state, sized by how often. The right is every observation behind it, the educator's own words beside the mark.
Blocks, in order:
- **ChildGraph**: skills as nodes; notes and papers both feed it
- **Trend**: level per sitting on the skill chosen
- **Timeline**: every observation and paper result, newest last; details: observed by (role), confirmed by, clocks, route, counts toward secure?
- **DataTable**: skill · state · named days · last seen · ready next (CP-14, confirmed links only)
Rail (Connected to): each skill · Back to the class · Add a note about this child · Reports (Next) · Capture here: voice, photo
Main action: Add a note · Next step: the class
Data: child_observed_state + child_skill_state; activity_observation (+note words); evidence_event / item_result for papers; skill_link_confirmed
Empty: Not seen yet on any skill: the graph is the child alone with 'not seen yet' · Phone: graph, then timeline; table last
Folds in: /growth/[id], /k2/[class]/[roll]
Every control on the screen (14), and what the test does with each:
- **child_name** the page header (the child's name beside the Sr. No. in the eyebrow and the trail)
- **link** each graph node → the skill's name (`/setup/skills/[code]`)
- **filter** skill for the trend (the trend redraws; the address carries it)
- **fold** details on each timeline entry
- **link** a timeline entry's activity → the activity's name (`/setup/activities/[code]`)
- **link** a timeline entry's paper → Check the answers (`/children/assessments/[key]/[roll]`)
- **link** each skill row → the skill's name (`/setup/skills/[code]`)
- **link** page: more entries → Where this child is (`/children/[class]/[roll]`) (older entries, ten at a time)
- **link** rail: each skill → the skill's name (`/setup/skills/[code]`)
- **link** rail: Back to the class → Class picture (`/children/[class]`)
- **link** rail: Add a note about this child → Record a note (`/period/[id]/record`)
- **link** rail: Reports → Reports (`/children/reports`)
- **link** capture: Voice note → Record a note (`/period/[id]/record`)
- **link** capture: Photo → Record a note (`/period/[id]/record`)
Done when (on top of the ten generic checks):
- a paper's result and a voice note appear on one timeline in date order
- a correction shows as a new entry that names the entry it replaces
- the header shows the child's name beside the Sr. No., read from pii by child_id; the address is by Sr. No. and carries no name; no photo (DOM scan)
- the graph's node count equals the skills the child was seen on, and each node's state equals the table's


#### Assessments `/children/assessments`
Who: both · Phase: Core · Backend: none · Old page today: yes (/papers, /capture) · Slice: UI-4
Eyebrow: Grades 1 to 4 · your classes
Purpose: Each one goes through seven steps. Its row shows the step it waits at and the one thing to do next.
Blocks, in order:
- **AttentionStrip**: do now = answers for you to judge; this week = packs to approve, papers to sign off; done = results in
- **Cards**: Make an assessment (for a class · for each child · for one child · a ready-made worksheet) · Read an assessment (DropZone)
- **FilterBar**: class · topic · subject · kind · week · stage
- **DataTable**: assessment (built name) · class · papers back · waits for (chip) · next
Rail (Connected to): Answers to check · Pack to approve · A child with results in · The skills tested · Question bank · Capture here: photo
Main action: Check answers · Next step: an assessment
Data: existing queries-papers (assessmentList, paperList), STEP_WORDS, STATUS_WORDS
Empty: No assessments yet: Make one · Phone: cards; the drop zone becomes 'take photos'
Folds in: /papers, /papers/make, /capture, /capture/[id]
Every control on the screen (19), and what the test does with each:
- **link** do now tile → Check the answers (`/children/assessments/[key]/[roll]`) (the first paper with answers to judge)
- **link** this week tile → the built name (`/children/assessments/[key]`) (the first pack to approve)
- **link** results in tile → the built name (`/children/assessments/[key]`)
- **link** Make: For a class → the built name (`/children/assessments/[key]`) (a new assessment created at step Created)
- **link** Make: For each child → the built name (`/children/assessments/[key]`)
- **link** Make: For one child → the built name (`/children/assessments/[key]`)
- **link** Make: A ready-made worksheet → the built name (`/children/assessments/[key]`)
- **upload** Read: choose scans or drop them: pdf/jpg/png/heic; the QR names the sheet; a paper appears at Uploaded; a file with no QR shows 'could not find the QR' and nothing is written
- **field** a Google Drive link (a non-Drive address shows a message)
- **button** Read it: the Drive file is fetched and read as above
- **filter** class · topic · subject · kind · week · stage
- **row** each assessment row → the built name (`/children/assessments/[key]`)
- **link** each row's next action → the built name (`/children/assessments/[key]`) (lands on the step's action)
- **link** rail: Answers to check → Check the answers (`/children/assessments/[key]/[roll]`)
- **link** rail: Pack to approve → the built name (`/children/assessments/[key]`)
- **link** rail: A child with results in → Where this child is (`/children/[class]/[roll]`)
- **link** rail: The skills tested → the skill's name (`/setup/skills/[code]`)
- **link** rail: Question bank → Question bank (`/setup/question-bank`)
- **upload** capture: Photo: same as Read
Done when (on top of the ten generic checks):
- the four old pages answer 308 to this one or to the Assessment node
- every row's name is built topic · skill · level · kind · class · day (regex)
- no approve-all control anywhere
- each tile's number equals the rows behind it


#### the built name `/children/assessments/[key]`
Who: both · Phase: Core · Backend: none · Old page today: part (/papers/approve, /papers/card) · Slice: UI-4
Eyebrow: Grade 1 · 22 papers
Purpose: Where this assessment stands, and each child's copy. A copy is its own row with its own action; there is no button over all of them.
Blocks, in order:
- **Stepper**: Created · Approved · Printed · Uploaded · Read · Checked · Results in
- **Cards**: The papers (StackBar: settled / to check / not back) · What it asks (skills, levels; link to the skill)
- **DataTable**: Sr. No. · level (Easy/Medium/Hard/Advance) · answers settled · state · its action (Check this paper / Sign it off / The child / Change the level before print)
- **Form**: at the approve step: Approve the pack (main), then Print
Rail (Connected to): a child's paper · the skills · the class picture · all assessments · the printed pack · Capture here: photo
Main action: the step's action · Next step: Assessments
Data: sheet/paper rows, counts per step (Counts), prescriptions and reasons, approval ledger
Empty: No copies yet · Phone: stepper wraps; table becomes cards
Folds in: /papers/approve, /papers/card, /papers/review/[qr]
Every control on the screen (15), and what the test does with each:
- **link** Open the skill → the skill's name (`/setup/skills/[code]`)
- **field** Change the level (a row, before print): Easy / Medium / Hard / Advance; the row's reason updates; kept as an override with who
- **button** Approve the pack: approval row for this pack only; the stepper moves to Approved; Print appears; the rows' Change the level disappears
- **button** Print: the pack PDF opens in a new tab; the stepper moves to Printed
- **button** Rename: the educator's own name for the assessment is kept (assessment_name); the built name stays as the subtitle
- **row** Check this paper → Check the answers (`/children/assessments/[key]/[roll]`)
- **button** Sign it off (a row): the paper's results are confirmed; its chip becomes results in
- **row** The child → Where this child is (`/children/[class]/[roll]`)
- **link** page: Later → → the built name (`/children/assessments/[key]`) (the next ten copies, grouped by state)
- **link** rail: a child's paper → Check the answers (`/children/assessments/[key]/[roll]`)
- **link** rail: the skills → the skill's name (`/setup/skills/[code]`)
- **link** rail: the class picture → Class picture (`/children/[class]`)
- **link** rail: all assessments → Assessments (`/children/assessments`)
- **link** rail: the printed pack → the built name (`/children/assessments/[key]`) (the PDF in a new tab)
- **upload** capture: Photo: a scan of this assessment's paper; the QR must belong to it, else a message
Done when (on top of the ten generic checks):
- Approve acts on this pack only; no control acts on more than one pack or more than one row
- the stepper's amber step equals the status word in the list
- a replaced copy shows 'replaced by a newer one' and no action
- the papers bar's three counts sum to the number of copies


#### Check the answers `/children/assessments/[key]/[roll]`
Who: both · Phase: Core · Backend: none · Old page today: yes (/capture/check, /capture/[id]) · Slice: UI-4
Eyebrow: Grade 1 · Sr. No. 7 · Easy
Purpose: The page as photographed on the left; each answer as the engine read it on the right. Say what the child wrote where it was not sure; the engine marks it. Right, wrong and blank are kept apart, always.
Blocks, in order:
- **PageImage**: the scan, zoomable, the answer in focus outlined
- **DataTable**: question · read as · mark chip (right / wrong / blank / for you to judge) · the wrong-with-working reason
- **Form**: Say what the child wrote (main) · Sign this paper off (when nothing is left to judge)
Rail (Connected to): This child · The skill · The assessment · the next paper to check
Main action: Say what the child wrote · Next step: the next paper
Data: capture_page, item_result with status and confidence, key, misconception tags
Empty: Nothing left to judge on this paper: Sign it off · Phone: image above, answers below
Folds in: /capture/check, /capture/[id]
Every control on the screen (10), and what the test does with each:
- **button** zoom in / zoom out / fit: the page image scales; the answer in focus stays outlined
- **row** each answer row: the page scrolls to that answer and outlines it
- **field** what the child wrote (for the answer in focus; required when judging)
- **button** Say what the child wrote: a read_correction row; the engine marks it right / wrong / blank; the chip updates; the next judge answer comes into focus
- **button** Blank (the child wrote nothing): the answer is marked blank, never wrong
- **button** Sign this paper off: appears only when nothing is left to judge; confirms the results; lands on the assessment
- **link** rail: This child → Where this child is (`/children/[class]/[roll]`)
- **link** rail: The skill → the skill's name (`/setup/skills/[code]`)
- **link** rail: The assessment → the built name (`/children/assessments/[key]`)
- **link** rail: the next paper to check → Check the answers (`/children/assessments/[key]/[roll]`)
Done when (on top of the ten generic checks):
- right, wrong and blank are three different chips and three counts; a wrong-with-working reason is shown with its wrong chip
- a person's answer writes a read_correction row and never overwrites the engine's read
- Sign off is absent while any answer is 'for you to judge', and acts on one paper


#### Reports `/children/reports`
Who: both · Phase: Next · Backend: CP-19 · Old page today: part (/growth/reports) · Slice: UI-8
Eyebrow: Grade 1 · this term
Purpose: Each child's report, line by line, in the educator's words. Two approvals per line, consent on file, then sent. Nothing goes out otherwise.
Blocks, in order:
- **FilterBar**: class · state
- **DataTable**: child (Sr. No.) · lines drafted · educator approved · coordinator approved · consent · sent; each row its own action
- **Details**: a line: the system's state beside the educator's words
Rail (Connected to): the child · the class picture · Consent (Setup)
Main action: Approve my lines · Next step: the coordinator's list
Data: report_item, approval (two kinds), consent
Empty: No report lines drafted yet · Phone: cards
Every control on the screen (11), and what the test does with each:
- **filter** class · state
- **child_name** each report row (the child's name beside the Sr. No.; what a parent's copy shows is the school's decision with CP-19)
- **fold** each child's lines
- **field** a line's words: the educator edits her words; the system's state beside it is read-only
- **button** Approve (educator, a line): educator approval row; the line's chip moves to 'to approve (coordinator)'
- **button** Approve (coordinator, a line): coordinator approval row [coordinator only; absent and refused for others]
- **button** Send (a child): only with both approvals on every line and consent on file; otherwise absent and refused [coordinator only; absent and refused for others]
- **link** Preview the parent's copy → Reports (`/children/reports`) (a PDF in a new tab)
- **link** rail: the child → Where this child is (`/children/[class]/[roll]`)
- **link** rail: the class picture → Class picture (`/children/[class]`)
- **link** rail: Consent → Classes and children (`/setup/classes`)
Done when (on top of the ten generic checks):
- nothing is sent without both approvals and consent (each missing case refused)
- the parent's copy contains 'educator' and the four level words only, no rung or code (regex over the PDF text)


### Setup

#### the activity's name `/setup/activities/[code]`
Who: both · Phase: Core · Backend: CP-8 · CP-15 · Old page today: yes (/educator/activity/[code], /curriculum/fill/[code]) · Slice: UI-3
Eyebrow: Activity 112 · Numeracy
Purpose: the objective
Blocks, in order:
- **KeyValue**: levels 0–3 as four cells, the school's words
- **LevelBars**: where the class sat last time, by level
- **Details**: Steps (open) · How to think about it · Materials
- **Cards**: Builds toward: objectives (links) · Where each part came from (school / drafted / person) with Keep · Edit · Send back on a drafted part
Rail (Connected to): each objective · each material · next taught (a period) · the fortnights it is in · Capture here: photo
Main action: Keep / Edit a drafted part (curriculum team) · Open the period (educator) · Next step: an objective
Data: activity (+steps, thinking, levels, materials), activity_objective, activity_material, activity_part_source, curriculum_edit
Empty: a part with no text: shown empty and marked, never invented · Phone: levels as a 2×2
Folds in: /educator/activity/[code], /curriculum/fill/[code], /curriculum/fill/walk
Every control on the screen (13), and what the test does with each:
- **fold** Steps (open by default)
- **fold** How to think about it
- **fold** Materials
- **link** each objective → the objective's title (`/setup/objectives/[code]`)
- **link** each material → Materials, this fortnight (`/timetable/materials`)
- **button** Keep (a drafted part): activity_part_source becomes person with who; the 'drafted' badge goes [coordinator only; absent and refused for others]
- **button** Edit (a part): the part becomes a field; Save writes a curriculum_edit row; the source becomes person [coordinator only; absent and refused for others]
- **button** Send back (a drafted part): the part is emptied and marked; the proposal is rejected [coordinator only; absent and refused for others]
- **upload** capture: Photo: a photo of the set-up attaches to the activity
- **link** rail: each objective → the objective's title (`/setup/objectives/[code]`)
- **link** rail: each material → Materials, this fortnight (`/timetable/materials`)
- **link** rail: next taught → the session's name (`/period/[id]`)
- **link** rail: the fortnights it is in → Fortnight 9 (`/timetable/fortnight/[n]`)
Done when (on top of the ten generic checks):
- a drafted part carries the 'drafted' badge until Keep, Edit or Send back; an educator sees the badge but not the three buttons
- every edit writes a curriculum_edit row with who
- a photo attaches to the activity, never to a child


#### the objective's title `/setup/objectives/[code]`
Who: both · Phase: Core · Backend: none · Old page today: no · Slice: UI-3
Eyebrow: Learning objective · K2 · Numeracy
Purpose: An objective names the skills it builds. The system reads a child's state on those skills; it never scores the objective itself.
Blocks, in order:
- **Cards**: each skill: name, prerequisite confirmed?, link
- **DataTable**: activities that build toward it
Rail (Connected to): each skill · each activity
Main action: a skill · Next step: an activity
Data: learning_objective, learning_objective_skill, activity_objective
Empty: No skill linked yet: shown, no invention · Phone: cards
Every control on the screen (4), and what the test does with each:
- **link** Open the skill (each card) → the skill's name (`/setup/skills/[code]`)
- **row** each activity row → the activity's name (`/setup/activities/[code]`)
- **link** rail: each skill → the skill's name (`/setup/skills/[code]`)
- **link** rail: each activity → the activity's name (`/setup/activities/[code]`)
Done when (on top of the ten generic checks):
- no number, percentage or state is shown for the objective itself (DOM scan)


#### the skill's name `/setup/skills/[code]`
Who: both · Phase: Core · Backend: CP-13 · CP-14 · Old page today: part (/skill-sets/[code]) · Slice: UI-3
Eyebrow: Skill · Numeracy
Purpose: Where the class stands on this skill, from confirmed notes and papers. A child not seen on it is not seen, nothing more.
Blocks, in order:
- **Cards**: The class now (StackBar) · Secure, fortnight by fortnight (Spark)
- **ClassGrid**: the class on this skill; tap a child
- **Cards**: Comes after (confirmed links) · Ready next (confirmed links) · 'only links a person confirmed are read'
- **Details**: for grades 1–4: each level in a sentence, kinds of question, mistakes it watches for (today's skill-set page)
Rail (Connected to): the class picture on this skill · its objectives · after / next skills · Question bank for this skill
Main action: a child · Next step: the next skill
Data: child_observed_state / child_skill_state by skill; skill_link_confirmed; skill_level; misconception
Empty: nobody seen on it yet · Phone: grid 8 columns
Folds in: /skill-sets/[code], /skill-sets/[code]/edit
Every control on the screen (13), and what the test does with each:
- **filter** class [coordinator only; absent and refused for others]
- **cell** each square → Where this child is (`/children/[class]/[roll]`)
- **child_name** each square (the name beside the Sr. No. (same ClassGrid as the class picture))
- **link** Comes after: each skill → the skill's name (`/setup/skills/[code]`)
- **link** Ready next: each skill → the skill's name (`/setup/skills/[code]`)
- **fold** Each level in a sentence
- **fold** Kinds of question
- **fold** Mistakes it watches for
- **button** Change a level's sentence: a field; Save writes a skill_level_version row [coordinator only; absent and refused for others]
- **link** rail: the class picture on this skill → Class picture (`/children/[class]`)
- **link** rail: its objectives → the objective's title (`/setup/objectives/[code]`)
- **link** rail: after / next skills → the skill's name (`/setup/skills/[code]`)
- **link** rail: Question bank for this skill → Question bank (`/setup/question-bank`)
Done when (on top of the ten generic checks):
- a prerequisite or next skill is shown only when its link is confirmed (a proposed link in the fixture does not appear)
- the spark's last value equals the grid's secure count
- the grid's squares equal the class's enrolment in Sr. No. order


#### Curriculum `/setup/curriculum`
Who: both · Phase: Core · Backend: CP-15 · Old page today: yes (/, /curriculum/browse, /curriculum/fill) · Slice: UI-11
Eyebrow: Every grade
Purpose: Every activity and skill of every grade, with its levels and how much of each page is filled in. Open one to read it.
Blocks, in order:
- **FilterBar**: grade · subject · topic · status · search
- **DataTable**: activity or skill · grade · subject · topic · levels · filled (school / drafted / person / empty) · status chip
- **Cards**: Drafts to check (count, link) · Offers waiting (skills offered to activities: Yes / No per row)
Rail (Connected to): Skills to approve · Question bank · Drafts to check · Offers
Main action: Check the drafted parts · Next step: an activity
Data: activity, skill, skill_level, activity_part_source, curriculum_proposal
Empty: none · Phone: cards
Folds in: /, /curriculum/browse, /curriculum/fill, /curriculum/offers, /asks
Every control on the screen (11), and what the test does with each:
- **filter** grade · subject · topic · status
- **filter** search (matches names and codes, never children)
- **row** an activity row → the activity's name (`/setup/activities/[code]`)
- **row** a skill row → the skill's name (`/setup/skills/[code]`)
- **link** Drafts to check → the activity's name (`/setup/activities/[code]`) (the first activity with a drafted part)
- **button** Yes (an offer): the skill is linked to the activity; the offer closes [coordinator only; absent and refused for others]
- **button** No (an offer): the offer closes; nothing is linked [coordinator only; absent and refused for others]
- **link** page: Later → → Curriculum (`/setup/curriculum`)
- **link** rail: Skills to approve → Skills to approve (`/setup/skills/approve`)
- **link** rail: Question bank → Question bank (`/setup/question-bank`)
- **link** rail: Drafts to check → the activity's name (`/setup/activities/[code]`)
Done when (on top of the ten generic checks):
- one list carries activities (K2) and skills (grades 1–4) under one filter row
- the skills-to-approve count appears here and not on Today
- Yes / No act on one offer each; no control acts on all offers


#### Skills to approve `/setup/skills/approve`
Who: coordinator · Phase: Core · Backend: none · Old page today: yes · Slice: UI-11
Eyebrow: 109 waiting
Purpose: Read each skill's levels and approve them one at a time. What a wrong answer counts against is shown beside it.
Blocks, in order:
- **FilterBar**: grade · subject
- **DataTable**: skill · grade · levels · its own Approve
- **Details**: What a wrong answer counts against
Rail (Connected to): Curriculum · Levels to review
Main action: Read and approve the first · Next step: Curriculum
Data: skill.level_approved, skill_level, calibration_review
Empty: Nothing to approve · Phone: cards
Folds in: /skill-sets/approve, /skill-sets/levels
Every control on the screen (7), and what the test does with each:
- **filter** grade · subject
- **link** a skill's name → the skill's name (`/setup/skills/[code]`)
- **button** Approve (a row): level_approved set for that skill with who; the row leaves the list; the eyebrow's count drops by one
- **fold** What a wrong answer counts against
- **link** page: Later → → Skills to approve (`/setup/skills/approve`)
- **link** rail: Curriculum → Curriculum (`/setup/curriculum`)
- **link** rail: Levels to review → Skills to approve (`/setup/skills/approve`) (the review list of levels most children are secure at)
Done when (on top of the ten generic checks):
- approval is per row; no control approves more than one
- the eyebrow count equals the rows across all pages


#### Question bank `/setup/question-bank`
Who: both · Phase: Core · Backend: none · Old page today: yes (/library) · Slice: UI-11
Eyebrow: Grades 1 to 4
Purpose: What is in the bank for the skills taught in your classes, by level. Open a question to read it as it prints.
Blocks, in order:
- **Cards**: What the bank is · What is in the bank (ready / removed counts)
- **FilterBar**: grade · skill · difficulty · search
- **DataTable**: question · skill · level · kind · status
Rail (Connected to): a skill · Worksheets by taxonomy (details)
Main action: Open a question · Next step: Curriculum
Data: item, item_stat, bank_proposal/decision
Empty: No questions for this skill yet · Phone: cards
Folds in: /library, /worksheets, /worksheets/taxonomy
Every control on the screen (7), and what the test does with each:
- **fold** What the bank is
- **filter** grade · skill · difficulty
- **filter** search
- **row** each question row → the question as it prints (`/setup/question-bank/[key]`)
- **link** page: Later → → Question bank (`/setup/question-bank`)
- **link** details: statistics → Question bank (`/setup/question-bank`) (the counts and worksheets by taxonomy, behind a details link)
- **link** rail: a skill → the skill's name (`/setup/skills/[code]`)
Done when (on top of the ten generic checks):
- statistics and taxonomy sit behind the details link, not on the first view (rule 8)
- the table shows ten rows then pages


#### the question as it prints `/setup/question-bank/[key]`
Who: both · Phase: Core · Backend: none · Old page today: yes (/library/[key]) · Slice: UI-11
Eyebrow: Numeracy · Easy
Purpose: The question, its answer, the wrong answers it catches, and where it came from. Correct the wording or remove it.
Blocks, in order:
- **Cards**: As it prints · Answer · Wrong answers it catches
- **Details**: About it (source, versions)
- **Form**: Correct the wording · Remove (with reason)
Rail (Connected to): the skill · the bank
Main action: Correct the wording · Next step: the bank
Data: item, key_correction, item_key_change, item_review
Empty: none · Phone: stacked
Every control on the screen (7), and what the test does with each:
- **fold** About it
- **field** the wording [coordinator only; absent and refused for others] (required when correcting)
- **button** Correct the wording: a new item version; item_key_change keeps the old key; the page shows the new wording and 'corrected by' [coordinator only; absent and refused for others]
- **field** reason for removal [coordinator only; absent and refused for others] (required)
- **button** Remove: the item is retired with the reason, never deleted; the chip reads 'removed' [coordinator only; absent and refused for others]
- **link** rail: the skill → the skill's name (`/setup/skills/[code]`)
- **link** rail: the bank → Question bank (`/setup/question-bank`)
Done when (on top of the ten generic checks):
- a correction keeps the old key in item_key_change and the old version readable
- Remove retires, never deletes (row count unchanged)


#### Staff and classes `/setup/staff`
Who: coordinator · Phase: Core · Backend: CP-1 · CP-3 · Old page today: yes · Slice: UI-5
Eyebrow: This fortnight
Purpose: Who teaches which class, and three numbers the database can stand behind per class. No ranking: the school decides what they mean.
Blocks, in order:
- **DataTable**: role · class · sessions done of planned · notes late · reader accuracy; each row opens the person's grants
- **Details**: a person's grants: role, class, subject, from, to; Add a grant
Rail (Connected to): Fortnight 9 · Timetable · Classes and children
Main action: Add a grant · Next step: Classes and children
Data: staff, staff_role_grant, role; session states; educator_note statuses; note_claim decisions
Empty: none · Phone: cards
Every control on the screen (7), and what the test does with each:
- **row** each staff row: opens that person's grants fold
- **fold** a person's grants
- **button** Add a grant: a form: role (rows), class, subject, from; Save writes a staff_role_grant row; the trigger's checks show as messages (needs a class, holds it twice)
- **button** End a grant: valid_to set to today on that grant; nothing deleted
- **link** rail: Fortnight 9 → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** rail: Timetable → Timetable (`/timetable`)
- **link** rail: Classes and children → Classes and children (`/setup/classes`)
Done when (on top of the ten generic checks):
- no sort, rank, ordinal or colour grading on the three numbers; the table cannot be sorted by them
- a grant edit is a new row or a valid_to, never a delete (row count never drops)
- no staff name appears unless the viewer is in the everything group (names are pii)


#### Classes and children `/setup/classes`
Who: coordinator · Phase: Core · Backend: CP-1 · Old page today: part (/school) · Slice: UI-5
Eyebrow: The school
Purpose: Each class, its grade, its children by Sr. No., and who teaches it. Move a child to another class; every change is kept with who made it.
Blocks, in order:
- **DataTable**: class · grade · children · educators; open a class
- **DataTable**: a class: Sr. No. · since · moved from; Move (its own action)
- **Details**: change log (child_move, enrolment)
Rail (Connected to): Staff · Class picture · the fortnight
Main action: Move a child · Next step: Staff
Data: school_class, enrolment, child_move, names read from pii by child_id at render, never stored in these tables
Empty: none · Phone: cards
Folds in: /school
Every control on the screen (8), and what the test does with each:
- **row** each class row: opens that class's children table below
- **child_name** each child row (the name beside the Sr. No., so a person moving a child knows who it is)
- **button** Move (a child row): a picker of classes and a date; Save writes child_move and a new enrolment; the child appears in the new class
- **fold** change log
- **link** a class's picture → Class picture (`/children/[class]`)
- **link** rail: Staff → Staff and classes (`/setup/staff`)
- **link** rail: Class picture → Class picture (`/children/[class]`)
- **link** rail: the fortnight → Fortnight 9 (`/timetable/fortnight/[n]`)
Done when (on top of the ten generic checks):
- a move writes child_move and a new enrolment and deletes nothing
- each child row shows the name beside the Sr. No., read from pii by child_id; the address and the change log's stored text carry no name (DOM scan)
- the change log lists the move with who and when


#### Setup `/setup`
Who: both · Phase: Core · Backend: none · Old page today: part · Slice: UI-5
Eyebrow: Changed rarely
Purpose: The curriculum, the skills, the question bank, staff, classes and the school. Statistics and old scans sit behind details links.
Blocks, in order:
- **Cards**: Curriculum · Skills to approve (count) · Question bank · Staff · Classes and children · School (campus, academic year, fortnights)
Rail (Connected to): each card
Main action: Curriculum · Next step: none
Data: counts
Empty: none · Phone: one column
Every control on the screen (6), and what the test does with each:
- **link** Curriculum → Curriculum (`/setup/curriculum`)
- **link** Skills to approve → Skills to approve (`/setup/skills/approve`) [coordinator only; absent and refused for others]
- **link** Question bank → Question bank (`/setup/question-bank`)
- **link** Staff → Staff and classes (`/setup/staff`) [coordinator only; absent and refused for others]
- **link** Classes and children → Classes and children (`/setup/classes`) [coordinator only; absent and refused for others]
- **link** details: the blocks gallery → Setup (`/setup`) (/setup/blocks, staff only)
Done when (on top of the ten generic checks):
- every setup page is reachable in two clicks from the bar
- an educator sees only the cards their group may open


### Outside the bar

#### Search `/search`
Who: both · Phase: Core · Backend: none · Old page today: part (top bar search) · Slice: UI-5
Eyebrow: Search
Purpose: A child by name or Sr. No. in your classes, an activity, a skill, an assessment by its built name.
Blocks, in order:
- **DataTable**: kind icon · what · where · open
Rail (Connected to): none
Main action: the first result · Next step: none
Data: enrolment roll_no and pii names in the person's scope (matched on the server, joined by child_id); activity, skill names; assessment names
Empty: Nothing found: try a Sr. No. or part of a name · Phone: full screen
Every control on the screen (6), and what the test does with each:
- **field** the search field (in the bar) (Enter submits by POST; the term never appears in the address, a log line or an analytics call; typing offers up to five, from signed-in screens only)
- **row** a child result → Where this child is (`/children/[class]/[roll]`) (found by name or Sr. No., within the person's classes)
- **child_name** each child result (the name beside the Sr. No.)
- **row** an activity result → the activity's name (`/setup/activities/[code]`)
- **row** a skill result → the skill's name (`/setup/skills/[code]`)
- **row** an assessment result → the built name (`/children/assessments/[key]`)
Done when (on top of the ten generic checks):
- a name or Sr. No. of a child in the person's classes returns that child; one outside their classes returns nothing
- the search term never appears in the address, the server log or an analytics call (the test submits a name and inspects all three)
- search is available from signed-in screens only; signed out, the request is refused


#### Sign in `/login`
Who: both · Phase: Core · Backend: CP-2 · Old page today: yes · Slice: UI-12
Eyebrow: Staff only
Purpose: School email and password. Forgot it: a link by email, set by its owner.
Blocks, in order:
- **Form**: school email · password · Sign in (main) · Forgot your password?
Rail (Connected to): none
Main action: Sign in · Next step: Today
Data: auth; sign_in_failure; password_link
Empty: none · Phone: centred form
Folds in: /login/forgot, /login/new-password, /account/password
Every control on the screen (4), and what the test does with each:
- **field** School email (required; a non-email shows a message)
- **field** Password (required)
- **button** Sign in: lands on Today for the person's group; a wrong password shows one message and counts a sign_in_failure; after the limit the form says to wait
- **link** Forgot your password? → Sign in (`/login`) (the forgot form; sends one email; the link sets a new password once)
Done when (on top of the ten generic checks):
- lands on Today for the person's group
- no development bypass in production
- a used password link is refused the second time


#### Start here `/guide`
Who: both · Phase: Core · Backend: none · Old page today: yes · Slice: UI-12
Eyebrow: Start here
Purpose: What each page is for, the usual jobs, and what each button does; the school's steps in four stages. Reached from the ? on every page.
Blocks, in order:
- **Cards**: I want to… (jobs → pages)
- **Details**: one per page: what it is for, what you see where, what each button does
Rail (Connected to): none
Main action: the page you came from · Next step: none
Data: static, generated from screens.json
Empty: none · Phone: stacked
Folds in: /guide/[slug], /guide/workflows, /workflows
Every control on the screen (3), and what the test does with each:
- **link** each job → Today (`/today`) (lands on the page that does the job)
- **fold** each page's section
- **link** ? on any page → Start here (`/guide`) (opens this page at that page's section)
Done when (on top of the ten generic checks):
- every page's ? opens its own section
- the sections are generated from screens.json so a new screen gets its help without a hand edit


#### Report a problem or suggest something `/feedback`
Who: both · Phase: Core · Backend: none · Old page today: yes · Slice: UI-12
Eyebrow: To the team
Purpose: Tell us what is broken, what you would like, or ask a question. It reaches the team, who decide what is built.
Blocks, in order:
- **Form**: what · where (the page you were on, prefilled) · Send
Rail (Connected to): none · Capture here: photo
Main action: Send · Next step: back to the page
Data: staff_note → GitHub issue
Empty: none · Phone: full form
Every control on the screen (4), and what the test does with each:
- **field** what (required)
- **field** where (prefilled with the page you came from; editable)
- **upload** capture: a screenshot: png/jpg attached to the note
- **button** Send: a staff_note row and a GitHub issue; the page says it reached the team and links back
Done when (on top of the ten generic checks):
- Send writes one staff_note and one issue; the issue body carries no child's name: the page warns not to type one, and a screenshot is kept on the private side, linked by id, never attached to the public GitHub issue (names now appear on some screens and the repository is public)

