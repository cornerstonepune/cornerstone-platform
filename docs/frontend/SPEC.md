# Cornerstone School OS: the frontend specification

Version 2, 9 Nov 2026 (v1 plus the fresh-reviewer design review). One file for the session that builds the site. It holds
everything agreed in the frontend-vision passes with Nimish: the rules, the system, every screen as a wireframe with what it
shows, what it calls and when it is done, and the order to build in. `screens.json` beside it is the same inventory as data;
`build-spec.mjs` regenerates the screen catalogue below and the wireframes page from it. Change the JSON, run the script,
never edit the catalogue by hand.

Companions: the design system "Cornerstone School OS" (tokens, brand book, icon map, first blocks):
https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514 · the clickable sketch:
https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74 · the wireframes of every screen:
(see docs/notes/frontend-landscape.md) · the notes `docs/notes/frontend-*.md` · the decision `docs/decisions/2026-11-09-white-ground-for-the-site.md`.
(The artifact links are private to Nimish; the repository copy of `tokens.json` is the master from now on.)

## 1. What is being built, in one paragraph

One site, one navigation, for a school of about 100 children and seven staff. Four doors on a slim top bar: Today, Timetable,
Children, Setup. Every screen is a node in a graph a person can walk: a period opens its activity, an activity its objective,
an objective its skill, a skill the children on it, a child the notes and papers behind each mark, and back. A trail at the
top goes back one step or to any earlier one; a rail at the right lists everything the current thing is connected to, and
carries the voice and photo buttons only where a lesson or a child is in view. The grades 1 to 4 assessment loop is rebuilt
on the same parts; its queries and its seven steps stay. Nimish, 9 Nov 2026: "We will completely change even this
assessment." Decided the same day: the ground is white; no ranking of educators; no graph database (one Postgres; the walk
on screen is the graph).

Where this specification and `docs/ux-rules.md` disagree, this specification wins from the day UI-13 merges; UI-13 rewrites
`ux-rules.md` (its rules 3, 7, 11 and 12 and its menu table) and the tests that hold it.

## 2. Rules that never bend (tests hold most of them)

1. A state is an icon, a word and a colour; never one alone. Every state comes from the `STATES` rows and `state_colour`.
2. Red is for work (do now, late, a clash, for you to judge), never for a child. A child below, not willing, not seen or at
   level 0 is grey or amber. If two things on a screen are red, one is wrong.
3. Three signals, never two: right, wrong, blank; a wrong answer with working is its own signal.
4. The school's words: educator never teacher; exchange or regroup never borrow; Easy / Medium / Hard / Advance; secure /
   practising / emerging / not seen; no rung, taxonomy code or kind on an educator's screen. Numbers are computed by code.
5. Nothing is ticked for her: an approval is a row's own action; no button over every row; a note is confirmed one at a
   time; a correction is a new row, never an edit.
6. One purpose, one main action, one next step per page; the purpose line at most 140 characters; one count badge on the
   site: the one on the bar's Today door, computed once, the sum of two numbers that never overlap (do now: notes
   unconfirmed past 48 h; this week: notes waiting to confirm that are younger). A tile or an eyebrow that says how many
   rows its own page lists is a statement about that page, not a second count.
7. A list is a table; DataTable carries its filter row by itself at six rows or more; ten rows shown, then grouped or
   paged. "Never a table" is for marking: a class being marked or read by child is a grid of squares (ClassGrid); a list
   of children to administer (Classes) or of assessments is a table.
8. A person sees their own: what their staff grant names; the coordinator group sees every class. A view, never a
   permission: the database's rules (CP-3, CP-4) are the permission. The UI lane tests that a control is absent for the
   wrong group; the refusal of the write behind it is tested once per write route, where the rule lives, not once per
   screen.
9. Names (decided by Nimish, 9 Nov 2026: it is his school): a signed-in staff member sees a child's name wherever a screen's
   element list in `screens.json` has a `child_name` element (the class grid squares, the child page header, the confirm
   screen, notes, reports, Classes, the search typeahead's suggestions, a skill's grid), and on no other screen. Names are read from the `pii`
   schema at render time and joined by `child_id`; the application tables keep carrying `child_id` only (CLAUDE.md rule 6
   stays true); no name is ever typed into a screen, a state word, a log or a URL. What a parent's copy shows is the school's
   decision with CP-19. One constraint stays, because the repository is public: no real child's name in git, tests,
   fixtures, screenshots or committed baselines; every fixture uses obviously fake names, and the inventory test fails on any
   rendered name that is not in `tests/fake-names.ts`, the one list of names. No page loads a script or a font from a host
   other than the site's own, so no name or search term can reach a third party. Photos of children are not decided: none on
   any screen except the child's own page as photographed (PageImage).
10. Desktop first at 1440 px. Every screen is smoke-tested at 400 px (it renders, no console error, no sideways scroll of the
    page). The screens designed for a phone are Record, Confirm, Period, Today (educator) and Sign in; only they carry the
    full 400 px gate (`phone_gate` in `screens.json`: 44 px targets, keyboard, empty states). A table scrolls sideways in its
    own box and is not redrawn as cards. On a phone the four doors are a bottom tab bar; a class grid has three columns (a
    name and a state word do not fit a 44 px square); the child graph becomes a list of skills.

## 3. The system

**The look** (decided by Nimish, 9 Nov 2026, from the clickable draft "Cornerstone look draft", variant B: "Whatever is
coming out in the B rich, that's the one I want"): white, colourful and calm at once. One colour means one thing, and the
colour families never overlap in meaning:

- **Work states** (red, amber, green, grey), only ever with their icon and word: late `#b42318`, wait `#8a4b00`, ok
  `#17663b`, quiet `#52525b`, each with a tint for its chip, tile or square. Red is for work, never for a child.
- **Kinds of thing** (seven, each with its icon in a KindTile, on card headers, rail links and timeline entries): period
  and fortnight slate `#475569`, child teal `#0f766e`, activity indigo `#4338ca`, objective violet `#7e22ce`, skill orchid
  `#a21caf`, assessment and paper sky `#0369a1`, note and material stone `#6b5e50`. None is red, amber or green.
- **Subjects**, always with their icon and word: Numeracy blue `#1d5f8f`, Language brown `#87402f`, Arts gold `#c27c0e`
  (its icon and word `#8a5a00`), the fixed parts of the day sand.
- **Everything else** is neutral: ground white `#ffffff`, surface `#f5f6f8`, ink `#18181b`, ink-muted `#5b5b66`, line
  `#e7e7ec`; links blue-grey `#3a5a73`, always underlined; the one main action a dark filled button (`action` `#1f1d1a`,
  white text); brand clay `#b8562f` only for the mark and the chosen door.

The brand's materials (olive, bamboo, monsoon, bark, sand, haldi, basalt) stay in `tokens.json` as the source of these hues
and appear on no screen themselves. Dark follows the system; every pair has a dark value. Checked by formula before this was
written (WCAG 2 contrast and CIE76 distance, both themes): every text colour is at least 4.5:1 on its own tint and on the
ground, every icon and edge at least 3:1, ink at least 4.5:1 on every tint; the Language edge, the Arts edge, the wait amber
and the late red are at least 21 apart. Two fills are not apart: the Arts tint and the amber tint (about 3), the Language
tint and the red tint (about 5), so a state chip on a tinted cell or square sits on the panel colour with a 1 px ring in
its state colour (StatusChip). UI-14's script repeats all of it and commits the table; dark is tested on the journeys and
the block gallery only.

**Type** (decided by Nimish, 9 Nov 2026: `docs/decisions/2026-11-09-site-type-and-subject-colours.md`): Source Serif 4 for
titles (32/24/20) and Source Sans 3 for everything else (18/16/14/12); weights 400/500/600; nothing under 14 px carries a
status, label or action (so the eyebrow, which carries facts, is 14 px; 12 px is for a timestamp or a source only); tabular
figures in columns. Both fonts are loaded by next/font from the build, never from a font host. One thing is open, for
Nimish: Source Sans 3 has no Devanagari and nothing in Devanagari is rendered today; if the school wants it, a fallback font
is added. The fonts and every colour are in `docs/frontend/tokens.json`, which the build copies to
`apps/web/design-system/tokens.json`.

**Space and shape**: 4 / 6 / 12 / 20 / 32 / 48 / 64 / 96 px, the more generous scale of wireframe revision 1 (Nimish, 9 Nov
2026, issue 546; `docs/frontend/spacing.json`, which the site adopts into `tokens.json` when it is built); 44 px tap. Three shapes, each with a meaning: a card (14 px corners:
cards, period rows, timetable cells, a child's square, the rail box), a control (10 px: buttons, inputs, tabs, icon tiles),
a pill (a state chip, the count badge, a name chip). One elevation, `shadow-card`, a faint ring and a soft shadow under a
card, a period row and the chosen tab; it replaces the card's border. No other shadow, no gradient; hairlines separate rows
inside a card, a surface box groups the rail.

**Revision 1** (Nimish, 9 Nov 2026, issue 546, applied to every wireframe, `DESIGN.md` §7 and §10): a page has no empty-looking
region (a second block of real data); what moves through stages is also a **KanbanBoard** beside its table (assessments,
the educator's what-waits-on-me, notes); wherever children are listed they can be **grouped** (by state, by skill and level,
by class, with a count; computed, not stored); the skill and class pictures show **clusters** of children who share a place
on a topic (computed by code from `child_skill_state` and `evidence_event`); and tapping a child anywhere opens
**ChildPeek**, that child's recent history newest first with who and when, whose "Open the child" is the one way from a
list to the child page. The school has no attendance register: the children list shows **absences noted**.

**The logo** (the school's logo pack, `docs/brand/cornerstone-logo/`, sent by Nimish on 9 Nov 2026: "that needs to be
incorporated everywhere"): "Cornerstone" with "गुरुकुल", the terracotta courtyard mark with its basalt dot. Four files, used
as given, never redrawn: `lockup-colour` on a light ground, `lockup-for-dark-backgrounds` on a dark ground, `mark` alone
where the space is small, `mark-on-white-tile` where it is small on a dark ground and as the tab and app icon. It appears on
the bar (a link to Today; the mark alone on a phone), on Sign in (large), at the head of the help pages, the parent's copy
and every printed page, and as the browser tab and app icon. The school's rules for it: never recoloured, stretched,
rotated or shadowed (so never inside a card and never under `shadow-card`), clear space a quarter of the mark's height, on
a dark ground always the white tile. The Devanagari in the wordmark is drawn as shapes inside the file, so it asks for no
font on the site. The BrandMark block holds these rules as tests (UI-13).

**Motion**: one, press. Anything pressable gives way to 0.97 in 160 ms (`cubic-bezier(0.23, 1, 0.32, 1)`); hover changes
colour only and only on a fine pointer; nothing fades in, slides or bounces; reduced motion removes the press. The reasons
are from the two references Nimish gave (Apple's interface guidance as summarised in `dickwu/apple-design-skill`, and
`emilkowalski/skills`): motion is never the only carrier of meaning, and what a person does a hundred times a day is not
animated.

**Icons**: Lucide only, stroke 1.9, 16 / 20 / 24 px, one icon per concept in `lib/icons.tsx`; the map is in the design
system's README. A screen never imports an icon by its Lucide name.

**Layers**: 0 tokens → 1 primitives from shadcn/ui (`npx shadcn@4.23.0 init` into `components/ui/`, adding a primitive only
when the first slice that uses it needs it: Button and Tabs first; DataTable, StatusChip, FilterBar and the native
`<details>` stay the school's own, so Table, Badge, Select and Collapsible are not installed) → 2 the school's blocks
(section 5) → 3 node pages (one page shape per kind of thing) → Today composed last.

**Blocks** (`components/`): the list and one-line contract of each is in section 5. The blocks that exist today (`StatusChip`,
`DataTable`, `FilterBar`, `EmptyState`, `Count`) move onto the tokens in UI-14; `PageShell`, `TopBar` and the K2 side menu
become AppFrame in UI-13; `voice/board` becomes ClassGrid and `voice/record` CaptureBar when their screens are built; the
new blocks are built once with a preview and a screenshot in both themes (UI-2).

**Node contract**: a node page = AppFrame + eyebrow (the kind's icon, in its kind colour, and two or three facts) + title + purpose + its blocks +
its rail of edges (Connected to) + Capture here where a lesson or a child is in view. The rail lists only edges that are not
already links in the main column, and is defined once per kind of node (a hub such as Children or Setup has none). The trail
is two fixed levels, the door and then the thing, plus the browser's Back; the door lit on the bar is the door the walk
started from (an Activity opened from Today lights Today). A new kind of thing is a new query and a new rail list, not a new
layout. A control whose target screen is not yet built is not drawn (`merged_slices`); a screen that needs no rail, or the
bare frame of Sign in, says so in `screens.json`.

## 4. How to build it: order, tests, done

The order is the slice table in section 7, the only list of what is built when and what each waits for: the test harness (UI-1, merges first), tokens and fonts (UI-14), the
frame and the inventory test (UI-13), the new blocks (UI-2), then the node pages and views (UI-3 to UI-6 and UI-11), Today
(UI-7), reports and materials (UI-8, UI-9), the screens outside the bar (UI-12), and the as-built document (UI-10, any time
after UI-13). The slices that wait for a backend scope (UI-6, UI-8, UI-9) wait for it; the others do not.

Tests that hold it: `packages/engine/tests/test_ux_rules.py` and `apps/web/tests/u51-ux-rules.spec.ts` (frame, table, chip,
filter row, 140 characters), `u53-the-menu.spec.ts` (four doors, tabs), one screenshot per block per theme, one journey test
per story (an educator's Tuesday; the coordinator's fortnight; what a parent receives) with `@axe-core/playwright` on each,
and the existing `screens.spec.ts` at laptop and phone. Every screen's `done_when` in section 6 is written as a proof before
its slice is built (the Athena loop). Server components by default; client code only for the class grid's tap, the recorder
and the details folds.

Folding: the catalogue marks which old pages fold into each new screen. A folded page keeps its address as a redirect for one
term, then goes. Nothing is deleted before its new screen's proofs pass.

**The inventory is the test oracle.** `screens.json` is read by one Playwright test, `tests/u70-inventory.spec.ts` (built in
UI-13 and proved there on a small inventory of pages that exist), which opens every screen of a slice listed in the top-level
`merged_slices` (a full run) or named by `SLICE=UI-n` (a pull request run) at a concrete address (dynamic routes get theirs
from a fixture map the test's own rows provide), runs the generic checks of section 7, and drives every control in the
screen's `elements` list by its kind. The bar (`bar` in the JSON) is driven once per run. Every other screen is a
`test.fixme`, so the count of screens still to build is always visible in the test report; a control whose target is not yet
built is not drawn and its test is a `fixme`. `exists` only describes the old page that is there today; it never decides
what the test runs. Every screen belongs to exactly one slice (the script refuses otherwise); a slice's last commit adds its
id to `merged_slices`. Adding a screen means adding it to the inventory and a slice first; the test fails until the screen is
built.

## 5. The blocks

| Block | What it is |
|---|---|
| AppFrame | top bar (BrandMark, a link to Today; four doors with their icons, search, acting-as), trail, main column, rail (Connected to; Capture here) in a surface box; on a phone the four doors are a bottom tab bar (icon above word, the chosen door filled in brand clay) |
| AttentionStrip | three tiles filled with their state's tint: do now (red) · this week (amber) · done (green); number, icon+word, one sentence; each a link; no border, no shadow |
| PeriodRow | time · the subject's icon tile and colour edge · name · subject and one fact · state chip; the row is the link, a panel with shadow-card; the current period carries the action outline; fixed parts of the day are a quiet sand row |
| StatusChip | pill: icon + word + colour from the STATES rows, on its tint; on a tinted cell (a subject cell, a child's square) the chip sits on the panel colour with a 1 px ring in its state colour, because a state's fill and a subject's fill can be near each other |
| DataTable | ≤10 rows then grouped/paged; needs-you first; numbers right, status centred; FilterBar built in at 6+ rows; on a phone it scrolls sideways in its own box; inside a card with shadow-card; where children are listed it can be grouped (a group heading with its count, the same rows under it) |
| FilterBar | dropdowns + compact search over any table of 6+ rows; filters in the address |
| ClassGrid | a tinted square per child by Sr. No., radius-card: Sr. No., the child's initials disc, the name, and the state's icon + word on the state's tint; not seen = an untinted square with a dashed ring; tap = open ChildPeek (on the confirm screen: change the mark); 8 columns at 1440, 3 on a phone |
| Stepper | the steps of a thing; done green, waiting amber, late red, rest quiet |
| Details | a fold that opens on click, eye icon; never hides the main action |
| Timeline | what was seen, newest last (ChildPeek keeps newest first); words beside the mark; a details fold each |
| ChildGraph | the child's initials at the centre in the child colour; a coloured ring around it marks each domain (Number, Language, Arts); each skill is a node on the outer ring, filled with its state's tint and edged in its state colour, sized by times seen, labelled with the skill name and the state word; every node and its label form one link with a 44 px target; a DataTable of the same skills sits beside it; on a phone the graph is replaced by that list |
| StackBar | one bar split by state with a key of counts |
| LevelBars | four bars, levels 0–3, how many children at each |
| Spark | one line over six fortnights with the last value labelled |
| Trend | a child's level per sitting over dates |
| HeatGrid | classes × days: done / moved / not done / holiday, icon + word in each cell |
| FortnightGrid | days across, periods down; each cell is filled with its subject's tint, a 3 px top edge in the subject colour, the subject's icon and word, the activity name and a Done tick once taught; the fixed parts of the day are full-width sand bands; today's column head is filled with the action colour; the current period has the action outline; moved = a dashed amber outline plus the Moved chip; clash = a red outline plus the Clash chip |
| CaptureBar | Voice note · Photo, two buttons on the panel colour with the note colour's icon; the whole screen on a phone |
| DropZone | choose scans or drop them; or a Drive link |
| PageImage | the child's page as photographed, QR corner; the one picture of a child allowed on any screen (photos of children are otherwise not decided: none) |
| EmptyState | nothing to show, with the next step |
| Form | a short form of labelled fields; one main button |
| KeyValue | facts as label: value pairs, five lines at most |
| Cards | two to three panels side by side, each with a header tinted in its kind's colour (kind tile + title) and a few lines and one link |
| KindTile | a 32 px tile, radius-control, filled with a kind's tint and holding that kind's icon in its colour (period slate, child teal, activity indigo, objective violet, skill orchid, assessment sky, note stone); every rail link, card header and timeline entry starts with one |
| BrandMark | the school's logo (Cornerstone Gurukul) as one of the four official files, drawn as given: `lockup-colour` on a light ground, `lockup-for-dark-backgrounds` on a dark ground, `mark` alone where the space is small on a light ground, `mark-on-white-tile` where it is small on a dark ground and for the tab and app icon; accessible name 'Cornerstone Gurukul'; never recoloured, stretched, rotated, filtered or shadowed, never inside a card; clear space on every side at least a quarter of the mark's height |
| KanbanBoard | what moves through stages, one lane per stage, each lane headed by its state's icon, word and count; each card a link (kind tile, one line, one fact, a state chip); lanes scroll sideways in their own box on a phone; offered next to the table of the same things by a Table | Board toggle (segmented tabs, the address carries the tab); a lane with no card says so in words |
| ChildPeek | one child's recent history in a panel, opened by tapping a child anywhere a child is listed: initials disc, Sr. No., name, class; the child's state counts as chips; then notes, observations, papers, state changes and corrections newest first, each with a kind tile, one line, who and when; Close and 'Open the child' (the one way to the child's own page); the top of the rail on a wide screen, a sheet over the bottom on a phone; Escape closes it and focus returns to the child that opened it |

## 6. Every screen

Each screen: its address, who sees it, its phase (Core / Next / Later) and the backend scopes it calls; the eyebrow, title
and purpose line as they appear; its blocks in order with what each shows and from where; the rail; the one main action and
the next step; the empty state; how it folds on a phone; which old pages fold into it; and what must be true before it is
done. Wireframes of all of them: (see docs/notes/frontend-landscape.md).

### Today

#### Today `/today/new`
Who: educator · Phase: Core · Backend: CP-8 · CP-10 · Old page today: part · Slice: UI-7
Eyebrow: Wednesday 18-Nov · K2 Red · Fortnight 9, week A
Purpose: Your periods in order. Tap one for what to teach, how, and what to lay out. After it, record a note.
Blocks, in order:
- **AttentionStrip**: do now = notes unconfirmed past 48 h; this week = notes waiting to confirm that are younger than 48 h (the two never overlap); done = periods finished of planned, children seen this fortnight
- **KanbanBoard**: what waits on me, by Table | Board toggle: Do now (notes past 48 h) · This week (notes waiting, younger than 48 h) · Done (periods taught and confirmed today); the List is the periods below
- **PeriodRow**: one per session of the day, from `session` for my class; fixed parts of the day included, greyed
- **Cards**: Notes to confirm (count, oldest) · Your class (children not seen this fortnight on the skill being taught)
- **ChildPeek**: the child chosen from 'Your class'
Rail (Connected to): This fortnight · Materials
Main action: the current period · Next step: Timetable
Data: session × plan_entry × activity for my class on this school_day; pii.educator_note status counts and ages (note status words are a config list); child_skill_state not-seen per child on the skill being taught (an open enrolment with no state row)
Empty: No sessions today (a holiday or no timetable live): say which, link to the fortnight · Phone: same order; the strip stacks; the record button is one tap from the period
Folds in: /today (What needs doing), /educator (K2 Today)
Every control on the screen (16), and what the test does with each:
- **link** do now tile → Confirm what the reader heard (`/notes/[id]`) (the oldest unconfirmed note; absent (grey 0) when none)
- **link** this week tile → Notes (`/notes`)
- **link** done today tile → Class picture (`/children/[class]`)
- **row** each period row → the session's name (`/period/[id]`) (a fixed part of the day opens its period page with 'Nothing to record here')
- **link** Confirm the first → Confirm what the reader heard (`/notes/[id]`)
- **link** Class picture → Class picture (`/children/[class]`)
- **link** rail: This fortnight → Timetable (`/timetable`)
- **link** rail: Materials → Materials, this fortnight (`/timetable/materials`)
- **tab** Board (what waits on me as lanes; the address carries the tab)
- **tab** List (what waits on me as the tiles and the period rows)
- **row** each note card on the board → Confirm what the reader heard (`/notes/[id]`)
- **row** each period card on the board → the session's name (`/period/[id]`)
- **peek** each Sr. No. in Your class: opens ChildPeek for that child
- **button** peek: Close: closes ChildPeek; focus returns to the child that opened it
- **link** peek: Open the child → Where this child is (`/children/[class]/[roll]`) (the one way from a list to the child's own page)
- **child_name** the name in the peek (the child's name beside the Sr. No., read from pii by child_id)
Done when (on top of the ten generic checks):
- an educator sees only sessions of classes their grant names (the access fixture's second educator sees a different list)
- each tile's number equals the count of rows the tile opens
- the lit row is the session whose period contains the current time; before 08:30 none is lit
- each board lane's card count equals the tile of the same name; a lane with no card says so in words
- tapping a child opens ChildPeek with that child's recent history newest first (notes, observations, papers, state changes), each entry with who and when; Escape closes it and focus returns; its 'Open the child' link lands on the child page


#### Today, the school `/today/new`
Who: coordinator · Phase: Core · Backend: CP-6 · CP-12 · CP-22 · CP-10 · Old page today: no · Slice: UI-7
Eyebrow: Wednesday 18-Nov · every class
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
Rail (Connected to): The activity · its learning objectives · Materials · Its place in the fortnight · The class
Main action: Record a note · Next step: the next period
Data: session → plan_entry → activity (+activity_material, activity_objective); activity_observation of this activity for this class, last session (the five outcome words are a config list)
Empty: A fixed part of the day: 'Nothing to record here' · Phone: actions first, then the fold; the record button fills the width
Every control on the screen (15), and what the test does with each:
- **link** Record a note → Record a note (`/record`) (opens Record with this period's session preselected)
- **link** Type the marks instead → Record a note (`/record`) (opens Record on its typing path, session preselected)
- **link** Open the activity → the activity's name (`/setup/activities/[code]`)
- **peek** each Sr. No. named under the last-time bar: opens ChildPeek for that child
- **fold** The steps, short (open by default)
- **fold** Lay out
- **fold** Watch for
- **link** rail: The activity → the activity's name (`/setup/activities/[code]`)
- **link** rail: each learning objective → the objective's title (`/setup/objectives/[code]`)
- **link** rail: Materials → Materials, this fortnight (`/timetable/materials`)
- **link** rail: Its place in the fortnight → Timetable (`/timetable`)
- **link** rail: The class → Class picture (`/children/[class]`)
- **button** peek: Close: closes ChildPeek; focus returns to the child that opened it
- **link** peek: Open the child → Where this child is (`/children/[class]/[roll]`) (the one way from a list to the child's own page)
- **child_name** the name in the peek (the child's name beside the Sr. No., read from pii by child_id)
Done when (on top of the ten generic checks):
- a period with no activity shows no capture controls and the words 'Nothing to record here'
- the last-time bar's segments sum to the number of children named in the last session's observations
- the steps fold is open on load and the others closed
- tapping a child opens ChildPeek with that child's recent history newest first (notes, observations, papers, state changes), each entry with who and when; Escape closes it and focus returns; its 'Open the child' link lands on the child page


#### Record a note `/record`
Who: educator · Phase: Core · Backend: CP-10 · Old page today: yes (/voice/record) · Slice: UI-3
Eyebrow: K2 Red · the session's name
Purpose: Say what happened and who, by Sr. number. The reader turns it into marks; you confirm them, one note at a time.
Blocks, in order:
- **CaptureBar**: Start recording (main) · Add a photo · Type the marks; while recording: Stop, Send; after: 'sent, the reader is listening'
- **KeyValue**: activity · class · time; audio and transcript kept 48 h on the private side, then deleted
Rail (Connected to): The period (when a session is chosen) · The activity · The class · Capture here: voice, photo
Main action: Start recording · Next step: Notes to confirm
Data: the session; pii.educator_note insert via the engine; config: note retention
Empty: none · Phone: this is the phone screen: one button, the activity already known
Folds in: /voice/record, /voice/form
Every control on the screen (9), and what the test does with each:
- **field** Which period (preselected when opened from a period, a class or a child; otherwise today's periods for the person's classes; required before Start recording or Type the marks)
- **button** Start recording: microphone permission asked; the button becomes Stop; a timer counts
- **button** Stop: recording ends; Send and Record again appear
- **button** Send: one pii.educator_note row with the session id, status received; the page says 'sent, the reader is listening' and links to Notes
- **upload** Add a photo: jpg/png/heic accepted; the photo attaches to the session, never to a child
- **button** Type the marks: creates the empty note for the chosen session and class in this step and opens it on the confirm screen
- **link** rail: The period → the session's name (`/period/[id]`) (drawn only when a session is chosen)
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
Rail (Connected to): The period · The activity · The class
Main action: Confirm this note · Next step: the next note waiting
Data: pii.educator_note + draft claims from the engine (pii.note_claim: flag, outcome, entry_mode, child_id, set when the note is read); activity_observation written at confirm, one row per child, confirmation_id
Empty: No note waiting: link to Record · Phone: the grid first, then her words; Confirm fixed at the bottom
Folds in: /voice/notes/[id]
Every control on the screen (12), and what the test does with each:
- **button** each claim line's × (remove): the claim is marked removed; its children's squares return to unmarked; recorded as her decision
- **cell** each square: opens the mark picker: above / below / not willing / absent / clear ("as expected" is the one switch for the rest: the engine records an individual child's mark in four lists); the square's corner mark changes; the claim it came from is marked changed
- **switch** the rest did as expected: every unmarked present child gets as-expected with entry mode group; off removes them
- **button** Confirm this note: one activity_observation per marked child with one confirmation_id; the note's status becomes confirmed; lands on the next waiting note or Notes
- **button** Correct this note: a confirmed note only: writes a superseding note row; the old row is never edited (absent on a waiting note)
- **link** rail: The period → the session's name (`/period/[id]`)
- **link** rail: The activity → the activity's name (`/setup/activities/[code]`)
- **link** rail: The class → Class picture (`/children/[class]`)
- **child_name** each square and each claim line (the name beside the Sr. No., so she can check the right child is marked)
- **peek** each child's name on a claim line: opens ChildPeek for that child
- **button** peek: Close: closes ChildPeek; focus returns to the child that opened it
- **link** peek: Open the child → Where this child is (`/children/[class]/[roll]`) (the one way from a list to the child's own page)
Done when (on top of the ten generic checks):
- Confirm writes one activity_observation per marked child, none for an unmarked child, all with one confirmation_id
- a changed or removed claim is kept as changed/removed in note_claim (reader accuracy)
- no control confirms more than one note
- a child's square is never red, whatever the mark
- a child's name on a claim line opens ChildPeek; a square still changes the mark and never opens the peek
- tapping a child opens ChildPeek with that child's recent history newest first (notes, observations, papers, state changes), each entry with who and when; Escape closes it and focus returns; its 'Open the child' link lands on the child page


### Timetable

#### Timetable `/timetable`
Who: both · Phase: Core · Backend: CP-22 · Old page today: part (/educator/week) · Slice: UI-6
Eyebrow: K2 Red
Purpose: The fortnight is the unit. Week A and week B, each period a block; a moved period is marked, a clash is red until the coordinator accepts it.
Blocks, in order:
- **FilterBar**: class (coordinator only) · Day / Week / Fortnight view · this / next fortnight
- **FortnightGrid**: from the timetable_rule rows in force + the dated session rows; subject colours; moved/clash outlines; a cell is the period's link
- **Cards**: Fortnight 9: state · Materials for this fortnight
Rail (Connected to): Fortnight 9 · Materials · Today's period · Rules (coordinator)
Main action: Open today · Next step: Fortnight
Data: timetable_rule rows (kind slot) valid today; session for the fortnight's days; period times; school_day kinds
Empty: No timetable live for this class: coordinator sees 'Make a draft' · Phone: Day view by default; week scrolls sideways in its box
Folds in: /educator (day), /educator/week
Every control on the screen (13), and what the test does with each:
- **filter** class (the coordinator always; an educator only when she holds more than one class)
- **tab** Day / Week / Fortnight (Day by default at 400 px)
- **link** Today → Timetable (`/timetable`) (opens today in the Day view)
- **link** each day head → Timetable (`/timetable`) (opens that day in the Day view; earlier and later days are reached the same way)
- **filter** this / next fortnight
- **cell** each grid cell → the session's name (`/period/[id]`)
- **fold** a moved cell's details (who, why, when) (opens on click, tap or Enter; never by hover alone)
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
- a period running now carries Do now, a recorded one Done, one over and not recorded Late, and no period still to come has a chip
- a holiday day is named in words under the grid


#### Fortnight 9 `/timetable/fortnight/[n]`
Who: both · Phase: Core · Backend: CP-6 · CP-22 · Old page today: no · Slice: UI-6
Eyebrow: 16-Nov to 27-Nov
Purpose: Its state, its plan lines, and what changed when the draft went live. Frozen once it starts; a move after that is a hand move, kept with who made it.
Blocks, in order:
- **Stepper**: drafted · approved · live · frozen
- **Cards**: State (chip + who/when) · Plan lines (plan_entry, each an activity link) · Hand moves (who, why, when)
- **DataTable**: coordinator: what changed at go-live, session by session
- **Form**: coordinator: Approve · Go live (main, one at a time)
Rail (Connected to): The grid · every activity in the plan · Materials · Draft (coordinator)
Main action: Approve / Go live (coordinator) · Open the grid (educator) · Next step: Timetable
Data: fortnight + fortnight.state (CP-6; each step's yes is an approval row); plan_entry; session diffs at go-live (CP-22); approval ledger
Empty: No plan lines yet: link to the planner upload · Phone: stepper wraps to two rows
Every control on the screen (9), and what the test does with each:
- **link** each plan line → the activity's name (`/setup/activities/[code]`)
- **link** each hand move → Moves by hand (`/timetable/moves`) [coordinator only; absent and refused for others]
- **button** Approve: approval row written; the stepper moves to approved; Go live appears; Approve disappears [coordinator only; absent and refused for others]
- **field** reason [coordinator only; absent and refused for others] (needed once the fortnight is frozen; the engine says so in words when it is missing)
- **button** Go live: every class's placed draft goes live and the sessions are updated in place; the what-changed table lists every session it moved or removed, and nothing else [coordinator only; absent and refused for others]
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
Who: coordinator · Phase: Core · Backend: CP-11 · Old page today: yes · Slice: UI-6
Eyebrow: Every grade
Purpose: Period times, blocked days, fixed slots and subject limits, kept as rows with who changed them.
Blocks, in order:
- **FilterBar**: grade · kind
- **DataTable**: rule · grade · value · changed by · when; each row its own Edit
- **Details**: history of edits (change_log)
Rail (Connected to): Draft from the rules · Timetable
Main action: Add a rule · Next step: Draft
Data: period, timetable_rule (kind block or limit), change_log for each edit
Empty: No rules yet: 'Add the period times first' · Phone: the table scrolls sideways in its own box
Every control on the screen (7), and what the test does with each:
- **filter** grade
- **filter** kind
- **button** Edit (a row): the row's value becomes a field; Save writes a change_log row with who and when; Cancel restores
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
Rail (Connected to): every activity in the plan · Fortnight 9 · Capture here: photo
Main action: Fill the quantities · Next step: Fortnight 9
Data: materials_list, materials_line, activity_material, material_item
Empty: No plan lines with materials · Phone: the table scrolls sideways in its own box
Every control on the screen (10), and what the test does with each:
- **filter** day / week / fortnight
- **field** quantity (each line): a number; saving writes materials_line_edit with who; the amber 'to confirm' chip clears
- **button** Remove (each line): the line is marked removed with who, never deleted
- **button** Add from the catalogue: a picker of material_item; never free text
- **link** each line's activity → the activity's name (`/setup/activities/[code]`)
- **tab** My class / School list [coordinator only; absent and refused for others] (the school-wide view of this screen; the address carries the tab)
- **filter** Notes to read (shows only the lines the system could not read)
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
- **KanbanBoard**: the notes as lanes by Table | Board toggle: To confirm (late ones first, red; a note still being read or left unconfirmed sits here too) · Confirmed; each card a note
- **DataTable**: when · activity · by voice/form · state chip · children named · its button (Confirm / Open / Correct)
- **ChildPeek**: the child chosen from the children-named column
Rail (Connected to): Record a note · Class picture · Today · Capture here: voice
Main action: Confirm the oldest · Next step: Class picture
Data: pii.educator_note joined to activity_observation counts; pii.educator_note.status (the words are a config list); pii.educator_note.route (by voice / form); pii.note_claim.child_id for the children named
Empty: No notes yet this fortnight: link to Record · Phone: the table scrolls sideways in its own box
Every control on the screen (19), and what the test does with each:
- **filter** class [coordinator only; absent and refused for others] (an educator with one class has no class filter)
- **filter** state
- **filter** week
- **peek** each child named in a note: opens ChildPeek for that child; a name is read from pii by child_id (pii.note_claim.child_id), the chip shows the Sr. No. and the name
- **button** × on a filter chip: removes that filter from the address
- **button** Clear: removes every filter
- **row** Confirm (a waiting note) → Confirm what the reader heard (`/notes/[id]`)
- **row** Open (a confirmed note) → Confirm what the reader heard (`/notes/[id]`) (the confirmed note on the confirm screen, where Correct this note lives)
- **link** page: Later → → Notes (`/notes`) (the next ten rows; the address carries the page)
- **link** rail: Record a note → Record a note (`/record`)
- **link** rail: Class picture → Class picture (`/children/[class]`)
- **link** rail: Today → Today (`/today/new`)
- **link** capture: Voice note → Record a note (`/record`)
- **tab** Board (the notes as lanes; the address carries the tab)
- **tab** Table (the notes as rows)
- **row** each card on the board → Confirm what the reader heard (`/notes/[id]`) (a waiting note's card confirms it; a confirmed note's card opens it)
- **button** peek: Close: closes ChildPeek; focus returns to the child that opened it
- **link** peek: Open the child → Where this child is (`/children/[class]/[roll]`) (the one way from a list to the child's own page)
- **child_name** the name in the peek (the child's name beside the Sr. No., read from pii by child_id)
Done when (on top of the ten generic checks):
- a correction writes a superseding row with a reason and never updates the old one
- the coordinator sees every class, an educator their own (access fixture)
- a note left unconfirmed past 48 hours carries the red 'late' chip and sorts first
- each board lane's card count equals the rows of the table in that state
- tapping a child opens ChildPeek with that child's recent history newest first (notes, observations, papers, state changes), each entry with who and when; Escape closes it and focus returns; its 'Open the child' link lands on the child page


#### Children `/children`
Who: both · Phase: Core · Backend: CP-13 · Old page today: part (/k2) · Slice: UI-3
Eyebrow: Your classes
Purpose: Your children in one table: how each is doing, last seen, notes waiting. Search, filter, open a child.
Blocks, in order:
- **FilterBar**: search by name or Sr. No. · class (coordinator) · needs attention · group by (none · class · how they are doing · needs attention)
- **DataTable**: Sr. No. · name (opens ChildPeek) · class (only when several) · how they are doing (stacked bar of secure / practising / not seen skills) · last seen · notes waiting · absences noted, last 7 school days; with a group heading and count when grouped
- **ChildPeek**: the child chosen in the table: recent history, newest first
Rail (Connected to): Assessments · Notes
Main action: Class picture grid · Next step: a child
Data: school_class, enrolment, pii.child, child_skill_state counts per child, pii.educator_note waiting per child (pii.note_claim.child_id), activity_observation with outcome 'absent' over session (absences noted, last 7 school days that had a confirmed lesson for the class); the peek: see ChildPeek
Empty: No class linked to you: 'The coordinator links you to the classes you teach'; no match: 'No child matches' with Clear · Phone: the table scrolls sideways in its own box
Every control on the screen (14), and what the test does with each:
- **filter** search by name or Sr. No.
- **filter** class [coordinator only; absent and refused for others] (an educator with one class has no class filter and no class column)
- **filter** needs attention (all / needs attention)
- **button** × on a filter chip: removes that filter from the address
- **button** Clear: removes every filter and the search
- **peek** each child: opens ChildPeek for that child (the Sr. No. and name are the button)
- **child_name** the name column and the peek's name (the name beside the Sr. No.)
- **link** Class picture grid → Class picture (`/children/[class]`) (the toggle between this table and the class picture grid; the picture's own toggle returns here)
- **link** rail: Assessments → Assessments (`/children/assessments`)
- **link** rail: Notes → Notes (`/notes`)
- **link** page: Later → → Children (`/children`) (the next ten rows; the address carries the page)
- **filter** group by (none / class (coordinator) / how they are doing / needs attention; the address carries it; a heading and a count per group)
- **button** peek: Close: closes ChildPeek; focus returns to the child that opened it
- **link** peek: Open the child → Where this child is (`/children/[class]/[roll]`) (the one way from a list to the child's own page)
Done when (on top of the ten generic checks):
- for a signed-in educator the table lists their own children; a coordinator sees every class, with a class filter
- the class column and the class filter appear only when the person has several classes
- the how-they-are-doing bar's segments are secure, practising and not seen, and sum to the child's skill count; never a red segment
- searching a Sr. No. or part of a name narrows the rows and writes itself into the address; a reload keeps it
- the absences-noted column shows the last 7 school days that had a confirmed lesson for the class: a noted absence is a grey 'absent' cell with its word, a day with no confirmed lesson is blank and never reads 'present'; the column head says 'absences noted'
- tapping a row opens ChildPeek for that child; the peek's 'Open the child' lands on the child; the toggle opens the class picture grid and the picture's toggle returns here
- grouping by class, by how they are doing or by needs attention puts a heading and a count over each group, the counts sum to the rows, and a child is in exactly one group; groups are computed, never stored
- tapping a child opens ChildPeek with that child's recent history newest first (notes, observations, papers, state changes), each entry with who and when; Escape closes it and focus returns; its 'Open the child' link lands on the child page


#### Class picture `/children/[class]`
Who: both · Phase: Core · Backend: CP-13 · CP-9 · Old page today: yes (/k2/[class]) · Slice: UI-3
Eyebrow: K2 Red · 24 children
Purpose: Each square a child by Sr. No., shown on one skill at a time. Tap a child. Change the skill from the rail.
Blocks, in order:
- **FilterBar**: skill (the skills anyone was seen on) · domain · group by (state on this skill · class)
- **ClassGrid**: state on the chosen skill; not seen = dashed; tap = open ChildPeek; with a group heading and count when grouped
- **StackBar**: the class on this skill with counts
- **Spark**: secure over six fortnights
- **Cards**: Clusters: children who share a place on this topic (for example secure here, ready for the next skill), each with its count and its children as chips that open ChildPeek
- **ChildPeek**: the child chosen in the grid
Rail (Connected to): Show: each skill seen · a child · Record a note · Assessments (grades 1–4: Class results folds here) · Capture here: voice, photo
Main action: a child · Next step: the skill
Data: child_skill_state (kind 'observed' for K2, 'written' for grades 1–4) for the class by skill; flow_run (the nightly graph run's row) finished_at for the date; evidence_event for clusters
Empty: No child seen yet: the grid of dashed squares with 'not seen yet, nothing more' · Phone: 3 columns of squares (a name and a state word do not fit a 44 px square; SPEC §2 rule 10)
Folds in: /growth (Class results), /growth/class/[section]
Every control on the screen (17), and what the test does with each:
- **filter** skill
- **filter** domain
- **peek** each square (and each child chip in a cluster): opens ChildPeek for that child
- **child_name** each square (the name beside the Sr. No.)
- **link** rail: Show: each skill seen → Class picture (`/children/[class]`) (same screen, the skill filter changes)
- **link** rail: a child → Where this child is (`/children/[class]/[roll]`)
- **link** rail: Record a note → Record a note (`/record`)
- **link** rail: Assessments → Assessments (`/children/assessments`)
- **link** capture: Voice note → Record a note (`/record`)
- **link** capture: Photo → Record a note (`/record`)
- **link** Show as a table → Children (`/children`) (the toggle between the class picture grid and the table of children)
- **filter** group by (state on this skill / class; a heading and a count per group)
- **button** peek: Close: closes ChildPeek; focus returns to the child that opened it
- **link** peek: Open the child → Where this child is (`/children/[class]/[roll]`) (the one way from a list to the child's own page)
- **tab** Picture (the class picture; the three views of a class are tabs of this screen (UI-3e, carrying /growth and /growth/class/[section]))
- **tab** By topic (topics as rows: who is secure, practising or needs help; a topic opens its skills, a skill its children)
- **tab** Matrix (each child against each topic; a topic opens its skills)
Done when (on top of the ten generic checks):
- each square shows the Sr. No. and the child's name read from pii by child_id, and no photo (DOM scan)
- the stack bar's counts equal the squares by state
- the squares are in Sr. No. order, 8 per row at 1440, 3 at 400
- an empty square's title reads 'not seen yet', never 'not secure'
- grouping by state puts a heading and a count over each group; the counts sum to the squares and equal the stack bar; a child is in exactly one group
- a cluster's count equals the chips in it; clusters are computed by code from child_skill_state and evidence_event, never by a model, and a child may be in several clusters
- tapping a child opens ChildPeek with that child's recent history newest first (notes, observations, papers, state changes), each entry with who and when; Escape closes it and focus returns; its 'Open the child' link lands on the child page


#### Where this child is `/children/[class]/[roll]`
Who: both · Phase: Core · Backend: CP-13 · CP-14 · Old page today: part (/k2/[class]/[roll], /growth/[id]) · Slice: UI-3
Eyebrow: K2 Red · Sr. No. 12 · the child's name
Purpose: Each skill this child was seen on, coloured by how secure it is and sized by how often. Every mark opens the note or paper behind it.
Blocks, in order:
- **ChildGraph**: the ChildGraph: the child at the centre, a ring per domain, a node per skill seen (state tint, state word, size by times seen); notes and papers both feed it
- **Trend**: level per sitting on the skill chosen
- **Timeline**: every observation and paper result, newest last; details: observed by (role), confirmed by, clocks, route, counts toward secure?
- **DataTable**: skill · state · named days · last seen · ready next (CP-14, confirmed links only)
Rail (Connected to): each skill · Back to the class · Add a note about this child · Reports (Next) · Capture here: voice, photo
Main action: Add a note · Next step: the class
Data: child_skill_state (kind observed for K2, written for grades 1–4, with named_days); activity_observation (+note words); evidence_event / item_result for papers; skill_link_confirmed (a view over activity_skill and approval)
Empty: Not seen yet on any skill: the graph is the child alone with 'not seen yet' · Phone: the graph is replaced by the list of skills (name, times seen, state chip), then the trend, then the timeline
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
- **link** rail: Add a note about this child → Record a note (`/record`)
- **link** rail: Reports → Reports (`/children/reports`)
- **link** capture: Voice note → Record a note (`/record`)
- **link** capture: Photo → Record a note (`/record`)
Done when (on top of the ten generic checks):
- a paper's result and a voice note appear on one timeline in date order
- a correction shows as a new entry that names the entry it replaces
- the header shows the child's name beside the Sr. No., read from pii by child_id; the address is by Sr. No. and carries no name; no photo (DOM scan)
- the graph's node count equals the skills the child was seen on, and each node's state equals the table's
- a table equivalent sits beside the graph: the DataTable lists the same skills with the same state words and times seen, the graph's SVG has role=img and an aria-label that names the counts by state, and axe reports no violation on it
- keyboard order: Tab reaches the graph's nodes one by one, in the order of the table's rows (domain, then skill), each with a visible focus ring and each opening that skill; no node is reachable by pointer only, and every node's link target is at least 44 × 44 px
- on a phone (400 px) the graph is not drawn: the list of skills shows each skill's name, times seen and its state chip (icon + word), each row a link of at least 44 px height, in the same order as the table


#### Assessments `/children/assessments`
Who: both · Phase: Core · Backend: none · Old page today: yes (/papers, /capture) · Slice: UI-4
Eyebrow: Grades 1 to 4 · your classes
Purpose: Each one goes through seven steps. Its row shows the step it waits at and the one thing to do next.
Blocks, in order:
- **AttentionStrip**: do now = answers for you to judge; this week = packs to approve, papers to sign off; done = results in
- **Cards**: Make an assessment (for a class · for each child · for one child · a ready-made worksheet) · Read an assessment (DropZone)
- **FilterBar**: class · topic · subject · kind · week · stage
- **DataTable**: assessment (built name) · class · papers back · waits for (chip) · next
- **KanbanBoard**: the assessments as lanes by Table | Board toggle, the seven steps grouped by who has the paper: To approve and print (Created, Approved) · With the children (Printed) · To read and check (Uploaded, Read, Checked) · Results in; each card an assessment, its next action beside it
Rail (Connected to): Answers to check · Pack to approve · A child with results in · The skills tested · Question bank · Capture here: photo
Main action: Check answers · Next step: an assessment
Data: existing queries-papers (assessmentList, paperList), STEP_WORDS, STATUS_WORDS
Empty: No assessments yet: Make one · Phone: the table scrolls sideways in its own box; the drop zone becomes 'take photos'
Folds in: /papers, /papers/make, /capture, /capture/[id]
Every control on the screen (29), and what the test does with each:
- **link** do now tile → Check the answers (`/children/assessments/[key]/[roll]`) (the first paper with answers to judge)
- **link** this week tile → {the built name} (`/children/assessments/[key]`) (the first pack to approve)
- **link** results in tile → {the built name} (`/children/assessments/[key]`)
- **button** Make: For a class → {the built name} (`/children/assessments/[key]`): creates the assessment at step Created, then opens it
- **button** Make: For each child → {the built name} (`/children/assessments/[key]`): creates the assessment at step Created, then opens it
- **button** Make: For one child → {the built name} (`/children/assessments/[key]`): creates the assessment at step Created, then opens it
- **button** Make: A ready-made worksheet → {the built name} (`/children/assessments/[key]`): creates the assessment at step Created, then opens it
- **upload** Read: choose scans or drop them: pdf/jpg/png/heic; the QR names the sheet; a paper appears at Uploaded; a file with no QR shows 'could not find the QR' and nothing is written
- **field** a Google Drive link (a non-Drive address shows a message)
- **button** Read it: the Drive file is fetched and read as above
- **filter** class · topic · subject · kind · week · stage (and, on Reading, Show: by day, by kind of question, by how sure)
- **row** each assessment row → {the built name} (`/children/assessments/[key]`)
- **link** each row's next action → {the built name} (`/children/assessments/[key]`) (lands on the step's action)
- **link** rail: Answers to check → Check the answers (`/children/assessments/[key]/[roll]`)
- **link** rail: Pack to approve → {the built name} (`/children/assessments/[key]`)
- **link** rail: A child with results in → Where this child is (`/children/[class]/[roll]`)
- **link** rail: The skills tested → the skill's name (`/setup/skills/[code]`)
- **link** rail: Question bank → Question bank (`/setup/question-bank`)
- **upload** capture: Photo: same as Read
- **tab** Board (the assessments as lanes; the address carries the tab)
- **tab** Table (the assessments as rows)
- **row** each card on the board → {the built name} (`/children/assessments/[key]`)
- **link** page: Later → → Assessments (`/children/assessments`) (the next ten assessments)
- **tab** By topic (every topic a row with its count, closed until opened; the address carries the topic)
- **tab** Reading (how the reader is doing, and the files read lately)
- **field** rename: name this assessment (one on each row; the built name shows until a name is chosen)
- **button** Save the name: the name is the educator's own and is kept as a row of the history log, the older names stay
- **link** each topic → Assessments (`/children/assessments`) (opens the topic's assessments beneath it)
- **button** Read again: the file is read again with the reader as it now is; the page says in words when the engine no longer keeps it
Done when (on top of the ten generic checks):
- the four old pages answer 308 to this one or to the Assessment node
- every row's name is built topic · skill · level · kind · class · day (regex)
- no approve-all control anywhere
- each tile's number equals the rows behind it
- each board lane's card count equals the table rows at the lane's steps


#### {the built name} `/children/assessments/[key]`
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
Empty: No copies yet · Phone: stepper wraps; the table scrolls sideways in its own box
Folds in: /papers/approve, /papers/card, /papers/review/[qr]
Every control on the screen (22), and what the test does with each:
- **link** Open the skill → the skill's name (`/setup/skills/[code]`)
- **field** Change the level (a row, before print): Easy / Medium / Hard / Advance; the row's reason updates; kept as an override with who
- **button** Approve the pack: approval row for this pack only; the stepper moves to Approved; Print appears; the rows' Change the level disappears
- **button** Print: the pack PDF opens in a new tab; the stepper moves to Printed
- **row** Check this paper → Check the answers (`/children/assessments/[key]/[roll]`)
- **button** Sign it off (a row): the paper's results are confirmed; its chip becomes results in
- **row** The child → Where this child is (`/children/[class]/[roll]`)
- **link** page: Later → → {the built name} (`/children/assessments/[key]`) (the next ten copies, grouped by state)
- **link** rail: a child's paper → Check the answers (`/children/assessments/[key]/[roll]`)
- **link** rail: the skills → the skill's name (`/setup/skills/[code]`)
- **link** rail: the class picture → Class picture (`/children/[class]`)
- **link** rail: all assessments → Assessments (`/children/assessments`)
- **button** rail: the printed pack → {the built name} (`/children/assessments/[key]`) (the PDF in a new tab)
- **upload** capture: Photo: a scan of this assessment's paper; the QR must belong to it, else a message
- **field** rename: name this assessment (the built name shows until a name is chosen)
- **button** Save the name: the name is the educator's own and is kept as a row of the history log, the older names stay
- **field** Why the level changes (a row, before print) (required; kept with the override and who made it)
- **button** Change this child (the level and the reason are kept as an override on this child's prescription; nothing else moves (proved in u76-assessment-controls: it needs a week the engine prescribed))
- **field** Day it was given (printed papers) (defaults to the day it was last said, else today; never later than today)
- **button** Given on: the day is kept by the engine as a row of its own, with who said it; the screen says it was given
- **button** Away: hold it for later (on a printed copy; the same button then reads Back: count as missing)
- **link** Edit this paper → Check the answers (`/children/assessments/[key]/[roll]`) (a home assessment's copy not yet printed: its questions, remove, add, approve)
Done when (on top of the ten generic checks):
- Approve acts on this pack only; no control acts on more than one pack or more than one row
- the stepper's amber step equals the status word in the list
- a replaced copy shows 'replaced by a newer one' and no action
- the papers bar's three counts sum to the number of copies


#### Check the answers `/children/assessments/[key]/[roll]`
Who: both · Phase: Core · Backend: none · Old page today: yes (/capture/check, /capture/[id]) · Slice: UI-4
Eyebrow: Grade 1 · Sr. No. 7 · Easy
Purpose: The page as photographed, and each answer as the engine read it. Say what the child wrote where it was unsure; the engine marks it.
Blocks, in order:
- **PageImage**: the scan, zoomable, the answer in focus outlined
- **DataTable**: question · read as · mark chip (right / wrong / blank / for you to judge) · the wrong-with-working reason
- **Form**: Say what the child wrote (main) · Sign this paper off (when nothing is left to judge)
Rail (Connected to): This child · The skill · The assessment · the next paper to check
Main action: Say what the child wrote · Next step: the next paper
Data: capture.pages, item_result with status and confidence, key, misconception tags
Empty: Nothing left to judge on this paper: Sign it off · Phone: image above, answers below
Folds in: /capture/check, /capture/[id]
Every control on the screen (20), and what the test does with each:
- **row** each answer row: the page scrolls to that answer and outlines it
- **field** what the child wrote (for the answer in focus; required when judging)
- **button** Say what the child wrote: a read_correction row; the engine marks it right / wrong / blank; the chip updates; the next judge answer comes into focus
- **button** Blank (the child wrote nothing): the answer is marked blank, never wrong
- **button** Sign this paper off: appears only when nothing is left to judge; confirms the results; lands on the assessment
- **link** rail: This child → Where this child is (`/children/[class]/[roll]`)
- **link** rail: The skill → the skill's name (`/setup/skills/[code]`)
- **link** rail: The assessment → {the built name} (`/children/assessments/[key]`)
- **link** rail: the next paper to check → Check the answers (`/children/assessments/[key]/[roll]`)
- **button** Approve this home assessment (a copy waiting for approval: approved in the educator's name, this one only)
- **button** Remove (a question) (asks once when the removal costs something (the approval, or the last question of a skill); the paper is made again with a new code)
- **filter** bank: topic · skill · level · kind · question (each choice narrows the next; the chosen question is seen before Add)
- **button** Change it for every child (under 'Is the right answer wrong?'; code refuses a key the sum contradicts and says why; otherwise every child's answer to the question is marked again)
- **button** Name the mistake (the likeliest, none of these, another) (for a wrong answer no named mistake explains; kept against the reading and reaches the evidence at sign-off)
- **button** This page is this child's / Not this child's (where the same photograph is on two copies; saving what the child wrote waits for this)
- **link** Next answer to judge (the next answer for a person, in the order they sit on the page)
- **link** Previous paper / Next paper (this child's) (the child's other papers, oldest first, each on its own paper screen)
- **link** a skill's answer chip (what this paper says by skill; each answer one tap away)
- **button** Right / Wrong / Blank (judge) (for the few answers code cannot mark; only a person can say which)
- **field** the right answer, for every child (inside the fold 'Is the right answer wrong?')
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
Empty: No report lines drafted yet · Phone: the table scrolls sideways in its own box
Every control on the screen (11), and what the test does with each:
- **filter** class · state
- **child_name** each report row (the child's name beside the Sr. No.; what a parent's copy shows is the school's decision with CP-19)
- **fold** each child's lines
- **field** a line's words: the educator edits her words; the system's state beside it is read-only
- **button** Approve (educator, a line): educator approval row; the line's chip moves to 'to approve (coordinator)'
- **button** Approve (coordinator, a line): coordinator approval row [coordinator only; absent and refused for others]
- **button** Send (a child): only with both approvals on every line and consent on file; otherwise absent and refused [coordinator only; absent and refused for others]
- **button** Preview the parent's copy: opens the parent's copy as a PDF in a new tab (a PDF in a new tab)
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
Rail (Connected to): each objective · each material · next taught (a period) · the fortnights it is in · Capture here: voice
Main action: Keep / Edit a drafted part (curriculum team) · Open the period (educator) · Next step: an objective
Data: activity (+steps, thinking, levels, materials), activity_objective, activity_material, change_log (origin: upload = school, proposal = drafted, person = person) and curriculum_proposal for the source of each part, change_log for each edit
Empty: a part with no text: shown empty and marked, never invented · Phone: levels as a 2×2
Folds in: /educator/activity/[code], /curriculum/fill/[code], /curriculum/fill/walk
Every control on the screen (13), and what the test does with each:
- **fold** Steps (open by default)
- **fold** How to think about it
- **fold** Materials
- **link** each objective → the objective's title (`/setup/objectives/[code]`)
- **link** each material → Materials, this fortnight (`/timetable/materials`)
- **button** Keep (a drafted part): the part's source becomes person (a change_log row with who); the 'drafted' badge goes [coordinator only; absent and refused for others]
- **button** Edit (a part): the part becomes a field; Save writes a change_log row; the source becomes person [coordinator only; absent and refused for others]
- **button** Send back (a drafted part): the part is emptied and marked; the proposal is rejected [coordinator only; absent and refused for others]
- **link** capture: Voice note → Record a note (`/record`)
- **link** rail: each objective → the objective's title (`/setup/objectives/[code]`)
- **link** rail: each material → Materials, this fortnight (`/timetable/materials`)
- **link** rail: next taught → the session's name (`/period/[id]`)
- **link** rail: the fortnights it is in → Fortnight 9 (`/timetable/fortnight/[n]`)
Done when (on top of the ten generic checks):
- a drafted part carries the 'drafted' badge until Keep, Edit or Send back; an educator sees the badge but not the three buttons
- every edit writes a change_log row with who


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
Empty: No skill linked yet: shown, no invention · Phone: the table scrolls sideways in its own box
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
- **Cards**: The class now (StackBar) · Secure, fortnight by fortnight (Spark) · Clusters: children who share a place on this skill, each with its count and its children as chips
- **ClassGrid**: the class on this skill; tap a child to open ChildPeek; groups by state or class, each with a count
- **Cards**: Comes after (confirmed links) · Ready next (confirmed links) · 'only links a person confirmed are read'
- **Details**: for grades 1–4: each level in a sentence, kinds of question, mistakes it watches for (today's skill-set page)
- **ChildPeek**: the child chosen in the grid
Rail (Connected to): the class picture on this skill · its objectives · after / next skills · Question bank for this skill
Main action: a child · Next step: the next skill
Data: child_skill_state (kind 'observed' / 'written') by skill; skill_link_confirmed (a view over activity_skill and approval); skill_level; misconception; flow_run result for the six-fortnight spark; evidence_event for clusters
Empty: nobody seen on it yet · Phone: grid of 3 columns of squares (SPEC §2 rule 10)
Folds in: /skill-sets/[code], /skill-sets/[code]/edit
Every control on the screen (17), and what the test does with each:
- **filter** class [coordinator only; absent and refused for others]
- **peek** each square (and each child chip in a cluster): opens ChildPeek for that child
- **child_name** each square (the name beside the Sr. No. (same ClassGrid as the class picture))
- **link** Comes after: each skill → the skill's name (`/setup/skills/[code]`)
- **link** Ready next: each skill → the skill's name (`/setup/skills/[code]`)
- **fold** Each level in a sentence
- **fold** Kinds of question
- **fold** Mistakes it watches for
- **button** Change a level's sentence: a field for the sentence and an optional reason; Save changes that level's words, takes that level out of approved and keeps who and why (the engine's level-words route) [coordinator only; absent and refused for others]
- **link** rail: the class picture on this skill → Class picture (`/children/[class]`)
- **link** rail: its objectives → the objective's title (`/setup/objectives/[code]`)
- **link** rail: after / next skills → the skill's name (`/setup/skills/[code]`)
- **link** rail: Question bank for this skill → Question bank (`/setup/question-bank`)
- **filter** group by (state on this skill / class (coordinator); a heading and a count per group)
- **button** peek: Close: closes ChildPeek; focus returns to the child that opened it
- **link** peek: Open the child → Where this child is (`/children/[class]/[roll]`) (the one way from a list to the child's own page)
- **fold** Earlier sentences (each level) (each earlier sentence with who and when, newest first; coordinator)
Done when (on top of the ten generic checks):
- a prerequisite or next skill is shown only when its link is confirmed (a proposed link in the fixture does not appear)
- the spark's last value equals the grid's secure count
- the grid's squares equal the class's enrolment in Sr. No. order
- grouping by state puts a heading and a count over each group and the counts sum to the squares
- a cluster's count equals the chips in it; clusters are computed by code, never by a model
- tapping a child opens ChildPeek with that child's recent history newest first (notes, observations, papers, state changes), each entry with who and when; Escape closes it and focus returns; its 'Open the child' link lands on the child page
- a coordinator changes a level's sentence and the change is logged with who and why, taking only that level out of approved; an educator is shown the sentences and no way to change them


#### the skill set's name `/setup/skill-sets/[code]`
Who: both · Phase: Core · Backend: none · Old page today: part (/skill-sets/[code]) · Slice: UI-3
Eyebrow: Skill set · Grades 1 to 4
Purpose: A skill set is what the school teaches and tests together, from one to four grades. It points at the skills the system reads a child on; it never scores a child itself.
Blocks, in order:
- **Cards**: each skill it covers: name, link
- **Details**: each level in a sentence
Rail (Connected to): each skill · Question bank for this skill set
Main action: a skill · Next step: the question bank
Data: skill (the skill set: code, name, registry_codes), skill_level, registry_skill
Empty: No registry skill linked yet: shown, no invention · Phone: cards stack in one column
Folds in: /skill-sets/[code]
Every control on the screen (4), and what the test does with each:
- **link** Open the skill (each card) → the skill's name (`/setup/skills/[code]`)
- **fold** Each level in a sentence
- **link** rail: each skill → the skill's name (`/setup/skills/[code]`)
- **link** rail: Question bank for this skill set → Question bank (`/setup/question-bank`)
Done when (on top of the ten generic checks):
- the screen is keyed by the skill set's code, not by a registry skill's code
- each registry skill the set points at is a card that opens the skill screen; a set with none says so and invents nothing
- the level sentences sit in a fold, closed on load


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
Data: activity, skill, skill_level, change_log and curriculum_proposal (the source of each part), curriculum_proposal
Empty: none · Phone: the table scrolls sideways in its own box
Folds in: /, /curriculum/browse, /curriculum/fill, /curriculum/offers, /asks
Every control on the screen (15), and what the test does with each:
- **filter** Grade
- **filter** Subject
- **filter** Topic
- **filter** Status
- **filter** search (matches names and codes, never children)
- **row** an activity row → the activity's name (`/setup/activities/[code]`)
- **row** a skill row → the skill's name (`/setup/skills/[code]`)
- **link** Check the drafted parts → the activity's name (`/setup/activities/[code]`) (the first activity with a drafted part)
- **button** Yes (an offer): the skill is linked to the activity; the offer closes [coordinator only; absent and refused for others]
- **button** No (an offer): the offer closes; nothing is linked [coordinator only; absent and refused for others]
- **link** page: Later → → Curriculum (`/setup/curriculum`)
- **link** offers page: Later → → Curriculum (`/setup/curriculum`) [coordinator only; absent and refused for others] (the offers table pages on its own, ten a page, and keeps the page of the list)
- **link** rail: Skills to approve → Skills to approve (`/setup/skills/approve`)
- **link** rail: Question bank → Question bank (`/setup/question-bank`)
- **link** rail: Drafts to check → the activity's name (`/setup/activities/[code]`)
Done when (on top of the ten generic checks):
- one list carries activities (K2) and skills (grades 1–4) under one filter row
- Curriculum shows no count of skills to approve; that number is the eyebrow of Skills to approve and appears nowhere else
- Yes / No act on one offer each; no control acts on all offers


#### Skills to approve `/setup/skills/approve`
Who: coordinator · Phase: Core · Backend: none · Old page today: yes · Slice: UI-11
Eyebrow: 109 waiting
Purpose: Read each skill's levels and approve them one at a time. What a wrong answer counts against is shown beside it.
Blocks, in order:
- **FilterBar**: grade · subject
- **DataTable**: skill · grade · levels · its own Approve
- **Details**: What a wrong answer counts against
Rail (Connected to): Curriculum
Main action: Read and approve the first · Next step: Curriculum
Data: skill.level_approved, skill_level, approval (kind calibration)
Empty: Nothing to approve · Phone: the table scrolls sideways in its own box
Folds in: /skill-sets/approve, /skill-sets/levels
Every control on the screen (12), and what the test does with each:
- **filter** Grade
- **filter** Subject
- **filter** Topic
- **filter** Taught (taught or not yet: a skill nobody teaches can be approved before its topic is switched on)
- **tab** Skills (the first list; the address carries the tab)
- **tab** Levels to review (the second list is the levels most children are secure at; the address carries the tab)
- **link** a skill's name → the skill's name (`/setup/skills/[code]`)
- **button** Approve (a row): level_approved set for that skill with who; the row leaves the list; the eyebrow's count drops by one [coordinator only; absent and refused for others]
- **fold** What a wrong answer counts against
- **button** Approve this table as written: the table of what a wrong answer counts against is approved as shown, once, with who; a changed table waits again [coordinator only; absent and refused for others]
- **link** page: Later → → Skills to approve (`/setup/skills/approve`)
- **link** rail: Curriculum → Curriculum (`/setup/curriculum`)
Done when (on top of the ten generic checks):
- approval is per row; no control approves more than one
- the eyebrow count equals the rows across all pages, and it is the only place the number is shown


#### Question bank `/setup/question-bank`
Who: both · Phase: Core · Backend: none · Old page today: yes (/library) · Slice: UI-11
Eyebrow: Grades 1 to 4
Purpose: What is in the bank for the skills taught in your classes, by level. Open a question to read it as it prints.
Blocks, in order:
- **Cards**: What the bank is · What is in the bank (ready / removed counts)
- **FilterBar**: grade · skill · difficulty · search
- **DataTable**: question · skill · level · kind · status
Rail (Connected to): a skill
Main action: Open a question · Next step: Curriculum
Data: item, item_stat (a view over item_result), curriculum_proposal with its decision as an approval row
Empty: No questions for this skill yet · Phone: the table scrolls sideways in its own box
Folds in: /library, /worksheets, /worksheets/taxonomy
Every control on the screen (11), and what the test does with each:
- **fold** What the bank is
- **filter** Grade
- **filter** Skill
- **filter** Difficulty
- **filter** Kind
- **filter** Status (Ready to print, or Removed: a removed question is kept with its reason and can be read here)
- **filter** search
- **row** each question row → {the question as it prints} (`/setup/question-bank/[key]`)
- **link** page: Later → → Question bank (`/setup/question-bank`)
- **fold** Statistics (counts and worksheets by taxonomy)
- **link** rail: a skill → the skill's name (`/setup/skills/[code]`)
Done when (on top of the ten generic checks):
- statistics and taxonomy sit behind the details link, not on the first view (rule 8)
- the table shows ten rows then pages


#### {the question as it prints} `/setup/question-bank/[key]`
Who: both · Phase: Core · Backend: none · Old page today: yes (/library/[key]) · Slice: UI-11
Eyebrow: Numeracy · Easy
Purpose: The question, its answer, the wrong answers it catches, and where it came from. Correct the wording or remove it.
Blocks, in order:
- **Cards**: As it prints · Answer · Wrong answers it catches
- **Details**: About it (source, versions)
- **Form**: Correct the wording · Remove (with reason)
Rail (Connected to): the skill · the bank
Main action: Correct the wording · Next step: the bank
Data: item, item.key (the current key), item.review (the reviewer model's latest verdict), change_log (key history)
Empty: none · Phone: stacked
Every control on the screen (10), and what the test does with each:
- **fold** About it
- **link** the corrected question → {the question as it prints} (`/setup/question-bank/[key]`) (on a removed question that has been corrected)
- **link** the original wording → {the question as it prints} (`/setup/question-bank/[key]`) (on a corrected question: the old wording, kept and readable)
- **link** rail: the skill → the skill's name (`/setup/skills/[code]`)
- **link** rail: the bank → Question bank (`/setup/question-bank`)
- **field** the wording [coordinator only; absent and refused for others] (required when correcting)
- **field** what was wrong [coordinator only; absent and refused for others] (required when correcting: the engine refuses a correction with no reason)
- **field** reason for removal [coordinator only; absent and refused for others] (required)
- **button** Correct the wording: a new item version; the old one stays, readable, and points to the new; the page shows the new wording [coordinator only; absent and refused for others]
- **button** Remove: the item is retired with the reason, never deleted; the chip reads 'removed' [coordinator only; absent and refused for others]
Done when (on top of the ten generic checks):
- a correction keeps the old key in change_log and the old version readable
- Remove retires, never deletes (row count unchanged)


#### Staff and classes `/setup/staff`
Who: coordinator · Phase: Core · Backend: CP-1 · CP-3 · Old page today: yes · Slice: UI-5
Eyebrow: This fortnight
Purpose: Who teaches which class, and whole counts the database can stand behind. No score, no ranking: the school decides what they mean.
Blocks, in order:
- **DataTable**: role · class · sessions done of planned · notes confirmed · notes late · lines accepted / changed / removed; each row opens the person's grants
- **Details**: a person's grants: role, class, subject, from, to; Add a grant
Rail (Connected to): Fortnight 9 · Timetable · Classes and children
Main action: Add a grant · Next step: Classes and children
Data: staff, staff_role_grant, role; session states; educator_note statuses; note_claim decisions
Empty: none · Phone: the table scrolls sideways in its own box
Every control on the screen (10), and what the test does with each:
- **row** each staff row: opens that person's grants fold
- **fold** a person's grants
- **button** Add a grant: opens a form: role, class, and a subject for a role held for a subject; Save the grant gives it from today, and the grant table's own words (a second class educator, a clash) show under the form
- **button** End a grant: valid_to is set to today on that grant; the row stays on the list, marked Ended, and nothing is deleted
- **link** rail: Fortnight 9 → Fortnight 9 (`/timetable/fortnight/[n]`)
- **link** rail: Timetable → Timetable (`/timetable`)
- **link** rail: Classes and children → Classes and children (`/setup/classes`)
- **filter** Role: narrows the rows to one role
- **filter** Find a person (search): narrows the rows to a name
- **button** Add a person: opens a form: name, school email and role; Add and send a link puts the person on the list with no password and emails them a link to set their own
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
- **Details**: change log (change_log, enrolment)
Rail (Connected to): Staff · Class picture · the fortnight
Main action: Move a child · Next step: Staff
Data: school_class, enrolment, change_log (a move is a closed enrolment, a new one and a change_log row), names read from pii by child_id at render, never stored in these tables
Empty: none · Phone: the table scrolls sideways in its own box
Folds in: /school
Every control on the screen (10), and what the test does with each:
- **row** each class row: opens that class's children table below
- **child_name** each child row (the name beside the Sr. No., so a person moving a child knows who it is)
- **button** Move (a child row): opens a picker of classes and a date; Save closes the enrolment, opens a new one and writes a change_log row; the child appears in the new class
- **fold** change log
- **link** a class's picture → Class picture (`/children/[class]`)
- **link** rail: Staff → Staff and classes (`/setup/staff`)
- **link** rail: Class picture → Class picture (`/children/[class]`)
- **link** rail: the fortnight → Fortnight 9 (`/timetable/fortnight/[n]`)
- **filter** Grade: narrows the classes to one grade
- **filter** Find a class (search): narrows the classes to a name
Done when (on top of the ten generic checks):
- a move closes the enrolment, opens a new one, writes a change_log row and deletes nothing
- each child row shows the name beside the Sr. No., read from pii by child_id; the address and the change log's stored text carry no name (DOM scan)
- the change log lists the move with who and when


#### How it works `/setup/how-it-works`
Who: both · Phase: Core · Backend: none · Old page today: yes (/workflows) · Slice: UI-12
Eyebrow: The engine
Purpose: The twelve steps agreed with the school: what each does, what it hands on, what it has made so far, and which work for one subject only.
Blocks, in order:
- **Tile**: how many steps work, are partly built, are not built, work for one subject only
- **Details**: each step's files and commands
Rail (Connected to): none
Main action: Setup · Next step: Setup
Data: workflows.json (the map the engine's code is held to), with each step's live number from the database
Empty: none · Phone: one column; the cards stack
Folds in: /workflows
Every control on the screen (4), and what the test does with each:
- **link** Setup → Setup (`/setup`)
- **link** each step it hands on to (jumps to that step on the same page)
- **link** each screen a step shows
- **fold** each step's files and commands
Done when (on top of the ten generic checks):
- every step of the map is drawn in its workflow, with what it is doing now and where it hands on
- a step's number is the database's own, read now; a step the map says is not built has no number
- the map fits a phone


#### Setup `/setup`
Who: both · Phase: Core · Backend: none · Old page today: part · Slice: UI-5
Eyebrow: Changed rarely
Purpose: The curriculum, the skills, the question bank, staff, classes and the school. Statistics and old scans sit behind details links.
Blocks, in order:
- **Cards**: Curriculum · Skills to approve (count) · Question bank · Staff · Classes and children · School (campus, academic year, fortnights)
Rail (Connected to): none
Main action: Curriculum · Next step: none
Data: counts
Empty: none · Phone: one column
Every control on the screen (6), and what the test does with each:
- **link** Curriculum → Curriculum (`/setup/curriculum`)
- **link** Skills to approve → Skills to approve (`/setup/skills/approve`) [coordinator only; absent and refused for others]
- **link** Question bank → Question bank (`/setup/question-bank`)
- **link** Staff → Staff and classes (`/setup/staff`) [coordinator only; absent and refused for others]
- **link** Classes and children → Classes and children (`/setup/classes`) [coordinator only; absent and refused for others]
- **link** details: the blocks gallery → The blocks (`/setup/blocks`) (/setup/blocks, staff only)
Done when (on top of the ten generic checks):
- every setup page is reachable in two clicks from the bar
- an educator sees only the cards their group may open


#### The blocks `/setup/blocks`
Who: coordinator · Phase: Core · Backend: none · Old page today: no · Slice: UI-2
Eyebrow: Setup · for the people who build the site
Purpose: Every part the site is built from, with sample data and its words. Open one to see how it behaves.
Blocks, in order:
- **Details**: one fold per block in screens.json `blocks`: the live component on sample data, its states, the words it uses
Rail (Connected to): none
Main action: Open the first block · Next step: Setup
Data: screens.json `blocks`; sample data lives in the page, never a database row
Empty: never empty: the list is the block list · Phone: one column
Folds in: 
Every control on the screen (1), and what the test does with each:
- **fold** each block's sample (closed by default; opening shows the component, never a screenshot)
Done when (on top of the ten generic checks):
- there is one fold per entry of `blocks`, and a block with no sample fails the test
- the page is absent for an educator and linked only from Setup's details link
- its first section is the legend: every state with its icon, word and colour, every action with its tile, every kind of thing with its tile, the subjects and the shapes, all read from STATES and tokens.json, nothing typed
- the legend shows the four logo files with where each is used and the rules (no recolour, dark ground uses the tile, clear space a quarter of the mark, no stretch, rotate or shadow)


### Outside the bar

#### Sign in `/login`
Who: both · Phase: Core · Backend: CP-2 · Old page today: yes · Slice: UI-12
Eyebrow: Staff only
Purpose: School email and password. Forgot it: a link by email, set by its owner.
Blocks, in order:
- **BrandMark**: the large lockup above the form; the dark-ground lockup in dark
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
- **tab** Sign in / Forgot your password? (the forgot form on the same page; sends one email; its link sets a new password once)
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
- **link** each job → Today (`/today/new`) (the jobs are generated from screens.json: each names its own screen, and the test follows every one)
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


## 7. Slices and their goal points

Each slice below is one scoped change in the Athena loop: pasted as a GitHub issue in the Scope form (`scopes.md` holds the
paste-ready text), locked by Nimish, proofs written first, built, verified, shipped. Every Done-when line is observable by a
test or a script named in it. The generic checks apply to every screen a slice builds, on top of the screen's own lines:

1. Renders at 1440: the eyebrow (14 px or larger), one h1 equal to the title, a purpose line of at most 140 characters, exactly one main action, the trail, and the rail where the screen lists one; a screen marked `frame: bare` (sign in) shows the bare frame, its h1 and its main action only. At 400 px every screen passes a smoke test (it renders, one h1, no console error, no sideways scroll of the page); screens marked `phone_gate` also pass checks 2, 5, 6 and 9 at 400.
2. Completeness: the set of interactive controls in the main column and the rail (a, button, [role=button], summary, input, select) equals this screen's element list for the signed-in role: nothing extra, nothing missing. A control that does nothing on click (no address change, no DOM change, no request) fails. The bar's own controls are not part of any screen's count; they are driven once per run against the `bar` list in screens.json.
3. Navigation: every link and row lands on its target screen (h1 check) and Back returns to this screen with the same address; a link whose target is its own screen (paging, a tab) changes the address and Back restores it; each earlier step of the trail returns to that screen; the four doors on the bar open their first screen from here. A control whose target screen's slice is not in `merged_slices` is not drawn (it is not a dead link), and its test is `test.fixme` until that slice merges.
4. Roles: a control marked for one group is absent from the page for the other (the UI lane's test). The refusal of the write behind it is tested once per write route, in the lane that owns it (the database rules CP-3 and CP-4, or the route's own group check), not once per screen.
5. Keyboard: Tab reaches every control in reading order; Enter or Space activates it; the focused control shows a visible ring (outline at least 2 px); Escape closes an open Sheet or Dialog. Nothing is shown by hover alone.
6. Touch: on a `phone_gate` screen at 400 px every control is at least 44 × 44 px with at least 8 px to its neighbour.
7. Words: every state shown is a word from the STATES rows beside its icon, never colour alone; a child's name appears only on screens whose element list marks a `child_name` element, read from pii by child_id, and on no other screen; every name the test finds on a page is in `tests/fake-names.ts`, the one list of names in the repository (the repository is public: a real name fails the run, and no fixture, test or baseline holds any other); no name is in any address; 'educator' never 'teacher'; no page loads a script or font from a host other than the site's own.
8. Accessibility: axe reports no serious or critical violation at either width in light; in dark it runs only on the journey steps and on the `blocks` screen.
9. Empty: with the fixture's empty class or empty filter, the screen shows exactly its stated empty text and its next-step link, and no table head over no rows, no zero columns, no dash columns.
10. Themes: a screenshot in light at 1440 is committed as the baseline; the `blocks` screen and the journey steps are also committed in dark. Text contrast is measured by the token-pair script (UI-14) and by axe, not by sampling every page.

The bar is on every signed-in screen and is driven once per run, not once per screen (its controls are outside each screen's count):

- **link** Today → Today (`/today/new`) (a coordinator lands on Today, the school; on a phone the four doors are a bottom tab bar, the same four links)
- **link** Timetable → Timetable (`/timetable`)
- **link** Children → Children (`/children`)
- **link** Setup → Setup (`/setup`) (shown to the coordinator group only)
- **field** Search (a typeahead of at most five suggestions (children within the person's classes, activities, skills, assessments); choosing one opens it; there is no results page; the typed term goes in a POST body only, never an address or a log line)
- **switch** Acting as (coordinator only: shows the site as an educator would see it; a view, never a permission)
- **link** ? → Start here (`/guide`) (opens the guide at this page's section)
- **button** Sign out: ends the session and lands on Sign in

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
| peek | a button on a child (a name, a square, a row or a chip) that opens ChildPeek in place for that child; the address carries the Sr. No. (never a name); Escape or Close closes it and focus returns to the button; the peek's own 'Open the child' link is the only route to the child page from a list |

| Slice | What | Screens | Waits for |
|---|---|---|---|
| UI-1 The test harness | Only what the Athena loop demands before any interface change can be marked built (`athena finish` is refused repo-wide without it): the axe dependency, the journey harness and one passing journey spec, and shadcn/ui initialised with the two primitives used first. No page changes in this slice. | none (infrastructure) | nothing |
| UI-14 Tokens, fonts and the existing parts on them | One source of colour, type, shape, elevation and motion for the whole site, in the look Nimish chose on 9 Nov 2026 (the rich draft, B). tokens.css is generated from tokens.json; every colour literal in the app is replaced by a token, including in the blocks that exist today (StatusChip, DataTable, FilterBar, EmptyState, Count) and in the shadcn files from UI-1; the fonts are self-hosted. No page changes shape in this slice. | none (infrastructure) | UI-1, and PR #528 (the logo pack) merged |
| UI-13 The frame and the inventory test | One navigation for the whole site: the top bar with the school's logo, its four doors, search, acting-as, help and sign out, the trail and the rail (AppFrame), replacing the four shells and the K2 side menu; every existing page reachable from the bar; docs/ux-rules.md brought in line; and the inventory test that reads screens.json and drives every screen like a person, proved here on a small inventory of pages that already exist. | none (infrastructure) | UI-14 |
| UI-2 The blocks | The school's new blocks of SPEC §5, built once, each with sample data on a staff-only gallery screen (`blocks`) and screenshots in both themes; every chart drawn to scale from its data. AppFrame is built in UI-13 and the existing blocks moved onto the tokens in UI-1. | The blocks | UI-13 |
| UI-3 Node pages: the K2 walk | Period, record, confirm, notes, children, class picture, child, activity, objective and skill as node pages on the blocks, each walking to its neighbours through the rail and back through the trail; the old routes redirect. | the session's name, Record a note, Confirm what the reader heard, Notes, Children, Class picture, Where this child is, the activity's name, the objective's title, the skill's name, the skill set's name | UI-2; the K2 switch (a config row) on for the pages behind it |
| UI-4 Node pages: assessments | Assessments, one assessment and one child's paper as node pages on the blocks; the seven old assessment pages and Class results fold in; the queries and the seven steps are unchanged. | Assessments, {the built name}, Check the answers | UI-2 |
| UI-5 The coordinator's views: staff, classes and setup | Staff and grants, classes and children and the Setup home; the small writes that exist today (a grant, a child move) through their own rows. Search is the bar's typeahead (UI-13); there is no results page. | Staff and classes, Classes and children, Setup | UI-2 for the views; CP-1 merged for moving a child |
| UI-6 Timetable, rules and the fortnight's actions | The timetable's day, week and fortnight views and the timetable rules, the fortnight node with Approve and Go live, the draft from the rules with its unmet rules, and moves by hand with clashes accepted by the coordinator only. Until this merges the bar's Timetable door opens the page that exists today. | Timetable, Timetable rules, Fortnight 9, Draft from the rules, Moves by hand | CP-6, CP-11, CP-12 and CP-22 merged |
| UI-7 Today, both kinds | The educator's Today (the day, the attention strip, notes to confirm, the class) and the coordinator's Today (what waits, last week's heat grid, next week), composed from the blocks over the queries that exist; What needs doing folds in and its count moves to Setup where it belongs. | Today, Today, the school | UI-3 and UI-5; UI-6 for the coordinator's clash and draft rows (rows for a backend not yet merged simply do not appear) |
| UI-8 Reports | Each child's report, line by line, in the educator's words: two approvals per line, consent on file, then sent. The parent's copy says educator, Easy / Medium / Hard / Advance, no rung and no code. | Reports | CP-19 merged (Next) |
| UI-9 Materials | The class's materials list for a fortnight, the school's list, the notes the system could not read, and the educator's approval of her own class's list. | Materials, this fortnight | CP-17 and CP-18 merged (Later) |
| UI-11 Setup content pages: curriculum, skills to approve, question bank, a question | The four existing Setup pages that carry content rather than people, rebuilt on the frame and the blocks: Curriculum (activities and skills under one filter row, with drafts and offers), Skills to approve, the Question bank and one question as it prints. Their queries and their one-row-at-a-time approvals are unchanged; the old routes fold in. | Curriculum, Skills to approve, Question bank, {the question as it prints} | UI-2 |
| UI-12 The screens outside the bar: sign in, help, report a problem | Sign in (with forgot and new password), the help pages and the feedback form, rebuilt on the tokens and the blocks; help is generated from screens.json so a new screen gets its section without a hand edit; the feedback form keeps names out of the public GitHub issue. | Sign in, Start here, Report a problem or suggest something, How it works | UI-13 (lands on Today once UI-7 is merged) |
| UI-10 The as-built milestone document | A script that generates docs/frontend/AS-BUILT.md from screens.json plus the last inventory-test run: the milestone document Nimish asked for, so he can see exactly what exists, what each screen's controls are, and what the checks reported. Every slice adds its id to `merged_slices` in screens.json when its proofs pass, so the document is always true. | none (infrastructure) | UI-13 (it can be built early and re-run after every slice) |
