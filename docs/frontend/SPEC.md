# Cornerstone School OS: the frontend specification

Version 1, 9 Nov 2026. One file for the session that builds the site. It holds everything agreed in the four frontend-vision
passes with Nimish: the rules, the system, every screen as a wireframe with what it shows, what it calls and when it is done,
and the order to build in. `screens.json` beside it is the same inventory as data; `build-spec.mjs` regenerates the screen
catalogue below and the wireframes page from it. Change the JSON, run the script, never edit the catalogue by hand.

Companions: the design system "Cornerstone School OS" (tokens, brand book, icon map, first blocks):
https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514 · the clickable sketch:
https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74 · the wireframes of every screen:
https://claude.ai/code/artifact/c6bf8133-9aaa-4c8c-b951-b27afc114996 · the notes `docs/notes/frontend-*.md` · the decision `docs/decisions/2026-11-09-white-ground-for-the-site.md`.

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
9. No name and no photo of a child on any screen: Sr. No. only. Names stay in `pii`.
10. Desktop first at 1440 px; a phone must not break; only recording and confirming a note are designed for the phone.

## 3. The system

**Tokens** (`tokens.json` in the design system; `tokens.css` generated from it, nothing retyped): ground white `#ffffff`;
surface `#f7f7f5`; ink `#1c1b19`; ink-muted `#5e5a52`; line `#e4e3df`; line-control `#8a8984`; link clay-700 `#9c4626`;
brand clay `#b8562f` (the mark, the active group, the one main action; never on a child); olive `#4a5435` ok; bamboo
`#9a7a3a` wait; haldi `#e2a43f` an outline on a part that needs a person; monsoon `#3f4d55`; bark `#8a6a45`; sand
`#ede3d3`. States: ok / wait / late / quiet with `-bg` fills. Subjects from the materials: Numeracy monsoon, Language bark,
Arts haldi, fixed sand. Dark follows the system; every pair has a dark value in `tokens.json`. The contrast table in
`docs/design-tokens.md` was measured on paper-warm and must be re-run on white before step 1 ships.

**Type**: proposed Source Serif 4 for titles (32/24/20) and Source Sans 3 for everything else (18/16/14/12); weights
400/500/600; nothing under 14 px carries a status, label or action; tabular figures in columns. Nimish decides between
this, one serif for all (brand book) and Jost + Cormorant (D-073); one line in `tokens.json` changes it.

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
   `u51`) updated to the new frame. Needs Nimish's font decision first.
2. Blocks: the new blocks of section 5, each with its preview page and one screenshot per theme in the suite; the existing
   blocks moved onto the tokens.
3. Node pages, the K2 walk: period, record, confirm, notes, picture, child, activity, objective, skill.
4. Node pages, assessments: assessments, assessment, paper (the four old pages and `/growth` fold in; queries reused).
5. Node pages, the coordinator: fortnight, draft, moves, rules, staff, classes (as CP-6, CP-11, CP-12, CP-21 merge).
6. Today, both kinds, from the blocks over the queries that exist.
7. Reports (CP-19, Next); materials approval (CP-17/18, Later).

Steps 1 to 4 can start now (3 against the switched-on K2 pages); 5 waits for its backend scopes.

Tests that hold it: `packages/engine/tests/test_ux_rules.py` and `apps/web/tests/u51-ux-rules.spec.ts` (frame, table, chip,
filter row, 140 characters), `u53-the-menu.spec.ts` (four groups, tabs), one screenshot per block per theme, one journey
test per story (an educator's Tuesday; the coordinator's fortnight; what a parent receives) with `@axe-core/playwright` on
each, and the existing `screens.spec.ts` at laptop and phone. Every screen's `done_when` in section 6 is written as a proof
before its slice is built (the Athena loop). Server components by default; client code only for the class grid's tap, the
recorder and the details folds.

Folding: the catalogue marks which old pages fold into each new screen. A folded page keeps its address as a redirect for
one term, then goes. Nothing is deleted before its new screen's proofs pass.

## 5. The blocks

| Block | What it is |
|---|---|
| AppFrame | top bar (four groups, search, acting-as), trail, main column, rail (Connected to; Capture here) |
| AttentionStrip | three tiles: do now (red) · this week (amber) · done (green); number, icon+word, one sentence; each a link |
| PeriodRow | time · subject edge+tag · name · state chip; the row is the link |
| StatusChip | icon + word + colour from the STATES rows; pill for work, square for a child's mark |
| DataTable | ≤10 rows then grouped/paged; needs-you first; numbers right, status centred; cards on a phone |
| FilterBar | dropdowns + compact search over any table of 6+ rows; filters in the address |
| ClassGrid | squares by Sr. No. on one skill; secure/practising/emerging/not seen; tap = act |
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
| PageImage | the child's page as photographed, QR corner, never a name |
| EmptyState | nothing to show, with the next step |
| Form | a short form of labelled fields; one main button |
| KeyValue | facts as label: value pairs, five lines at most |
| Cards | two to three bordered blocks side by side, each with a title, a few lines and one link |

## 6. Every screen

Each screen: its address, who sees it, its phase (Core / Next / Later) and the backend scopes it calls; the eyebrow, title
and purpose line as they appear; its blocks in order with what each shows and from where; the rail; the one main action and
the next step; the empty state; how it folds on a phone; which old pages fold into it; and what must be true before it is
done. Wireframes of all of them: https://claude.ai/code/artifact/c6bf8133-9aaa-4c8c-b951-b27afc114996.

### Today

#### Today `/today`
Who: educator · Phase: Core · Backend: CP-8 · CP-10 · Exists today: part
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
Done when:
- an educator sees only sessions of classes their grant names
- the count in the strip equals the rows behind it
- every period row opens its period


#### Today, the school `/today`
Who: coordinator · Phase: Core · Backend: CP-6 · CP-12 · CP-21 · CP-10 · Exists today: no
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
Done when:
- only the 'everything' group sees this version
- each row leads to the screen that does the work
- no ranking of people anywhere


#### the session's name `/period/[id]`
Who: educator · Phase: Core · Backend: CP-8 · Exists today: yes (/educator/period)
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
Done when:
- a period with no activity shows no capture
- the last-time bar sums to the children named last time
- the steps fold is open by default


#### Record a note `/period/[id]/record`
Who: educator · Phase: Core · Backend: CP-10 · Exists today: yes (/voice/record)
Eyebrow: K2 Red · the session's name
Purpose: Say what happened and who, by Sr. number. The reader turns it into marks; you confirm them, one note at a time.
Blocks, in order:
- **CaptureBar**: Start recording (main) · Add a photo · Type the marks; while recording: Stop, Send; after: 'sent, the reader is listening'
- **KeyValue**: activity · class · time; audio and transcript kept 48 h on the private side, then deleted
Rail (Connected to): The period · The activity · The class · Capture here: voice, photo
Main action: Start recording · Next step: Notes to confirm
Data: the session; pii.educator_note insert via the engine; config: note retention
Empty: none · Phone: this is the phone screen: one button, the activity already known
Done when:
- the note reaches the engine with the session id
- nothing is written until she confirms
- works at 400 px with no sideways scroll


#### Confirm what the reader heard `/notes/[id]`
Who: educator · Phase: Core · Backend: CP-9 · CP-10 · Exists today: yes (/voice/notes/[id])
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
Done when:
- a confirm writes one activity_observation per named child and nothing for a child not mentioned
- a changed claim is kept as changed (reader accuracy)
- no button confirms more than one note


### Timetable

#### Timetable `/timetable`
Who: both · Phase: Core · Backend: CP-21 · Exists today: part (/educator/week)
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
Done when:
- a hand move shows amber with who and why on hover/details
- an educator never sees an accept-clash button
- the grid matches the sessions table for the day shown


#### Fortnight 9 `/timetable/fortnight/[n]`
Who: both · Phase: Core · Backend: CP-6 · CP-21 · Exists today: no
Eyebrow: 17-Nov to 28-Nov
Purpose: Its state, its plan lines, and what changed when the draft went live. Frozen once it starts; a move after that is a hand move, kept with who made it.
Blocks, in order:
- **Stepper**: drafted · approved · live · frozen
- **Cards**: State (chip + who/when) · Plan lines (plan_entry, each an activity link) · Hand moves (who, why, when)
- **DataTable**: coordinator: what changed at go-live, session by session
- **Form**: coordinator: Approve · Go live (main, one at a time)
Rail (Connected to): The grid · every activity in the plan · Materials · Draft (coordinator)
Main action: Approve / Go live (coordinator) · Open the grid (educator) · Next step: Timetable
Data: fortnight + fortnight_cycle state (CP-6); plan_entry; session diffs at go-live (CP-21); approval ledger
Empty: No plan lines yet: link to the planner upload · Phone: stepper wraps to two rows
Done when:
- Approve and Go live visible only to the 'everything' group
- a frozen fortnight shows no edit button
- what changed lists every session updated in place


#### Draft from the rules `/timetable/draft`
Who: coordinator · Phase: Core · Backend: CP-11 · Exists today: no
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
Done when:
- the draft shown is the one the generator wrote
- every unmet rule names the rule row
- a draft never replaces a live fortnight by itself


#### Moves by hand `/timetable/moves`
Who: coordinator · Phase: Core · Backend: CP-12 · Exists today: no
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
Done when:
- a move changes only its own fortnight
- an educator cannot accept a clash
- every move is listed with who made it


#### Timetable rules `/timetable/rules`
Who: coordinator · Phase: Core · Backend: CP-11 · Exists today: yes
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
Done when:
- moves from Setup to Timetable in the menu
- every edit shows who and when


#### Materials, this fortnight `/timetable/materials`
Who: both · Phase: Later · Backend: CP-17 · CP-18 · Exists today: yes (/educator/materials)
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
Done when:
- a line with no quantity is amber 'to confirm'
- approval (CP-17) is the educator's own class only


### Children

#### Notes `/notes`
Who: both · Phase: Core · Backend: CP-9 · CP-10 · Exists today: no
Eyebrow: K2 Red · this fortnight
Purpose: Every note of your classes: waiting, confirmed, left unconfirmed. Open one to confirm it or to correct a confirmed one.
Blocks, in order:
- **FilterBar**: class · state · week
- **DataTable**: when · activity · by voice/form · state chip · children named · its button (Confirm / Open / Correct)
Rail (Connected to): Record a note · Class picture · Today · Capture here: voice
Main action: Confirm the oldest · Next step: Class picture
Data: pii.educator_note joined to activity_observation counts; note_status rows
Empty: No notes yet this fortnight: link to Record · Phone: cards
Done when:
- a correction opens the confirm screen in correction mode and writes a superseding row, never an edit
- the coordinator sees every class, an educator their own


#### Children `/children`
Who: both · Phase: Core · Backend: CP-13 · Exists today: part (/k2)
Eyebrow: Your classes
Purpose: Where each child stands, two ways in: the class picture from notes (nursery to K2) and the papers (grades 1 to 4). Both feed the same child.
Blocks, in order:
- **Cards**: Class picture: my class, count, from confirmed notes · Assessments: grades, live count, answers to check · Notes
- **DataTable**: coordinator: every class with children count, seen this fortnight, not seen
Rail (Connected to): Class picture · Assessments · Notes
Main action: Open the class · Next step: Class picture
Data: school_class, enrolment counts, child_observed_state coverage
Empty: No class linked to you: 'The coordinator links you to the classes you teach' · Phone: cards
Done when:
- one class opens at once for an educator; the coordinator picks


#### Class picture `/children/[class]`
Who: both · Phase: Core · Backend: CP-13 · CP-9 · Exists today: yes (/k2/[class])
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
Done when:
- an empty square is 'not seen', never 'not secure'
- no name or photo on a square
- the stack bar counts equal the grid


#### Where this child is `/children/[class]/[roll]`
Who: both · Phase: Core · Backend: CP-13 · CP-14 · Exists today: part (/k2/[class]/[roll], /growth/[id])
Eyebrow: K2 Red · Sr. No. 12
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
Done when:
- a paper's result and a voice note sit on one timeline
- a correction shows as a new entry naming the one it replaces
- never a name on the page; Sr. No. only


#### Assessments `/children/assessments`
Who: both · Phase: Core · Backend: none · Exists today: yes (/papers, /capture)
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
Done when:
- the four old pages fold into this one and the Assessment node
- names are built topic · skill · level · kind · class · day
- no approve-all anywhere


#### the built name `/children/assessments/[key]`
Who: both · Phase: Core · Backend: none · Exists today: part (/papers/approve, /papers/card)
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
Done when:
- approving is per pack here and per child row, never all packs
- the stepper's amber step equals the status word in the list
- a replaced copy is shown as replaced


#### Check the answers `/children/assessments/[key]/[roll]`
Who: both · Phase: Core · Backend: none · Exists today: yes (/capture/check, /capture/[id])
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
Done when:
- three signals kept apart in the chips and the counts
- a person's answer writes a correction row, never overwrites the read
- sign-off is one paper, never a batch


#### Reports `/children/reports`
Who: both · Phase: Next · Backend: CP-19 · Exists today: part (/growth/reports)
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
Done when:
- nothing is sent without both approvals and consent
- a parent's copy says 'educator', Easy/Medium/Hard/Advance, no rung or code


### Setup

#### the activity's name `/setup/activities/[code]`
Who: both · Phase: Core · Backend: CP-8 · CP-15 · Exists today: yes (/educator/activity/[code], /curriculum/fill/[code])
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
Done when:
- a drafted part is marked drafted until a person keeps, edits or sends it back
- a photo attaches to the activity, never to a child


#### the objective's title `/setup/objectives/[code]`
Who: both · Phase: Core · Backend: none · Exists today: no
Eyebrow: Learning objective · K2 · Numeracy
Purpose: An objective names the skills it builds. The system reads a child's state on those skills; it never scores the objective itself.
Blocks, in order:
- **Cards**: each skill: name, prerequisite confirmed?, link
- **DataTable**: activities that build toward it
Rail (Connected to): each skill · each activity
Main action: a skill · Next step: an activity
Data: learning_objective, learning_objective_skill, activity_objective
Empty: No skill linked yet: shown, no invention · Phone: cards
Done when:
- no score or percentage is ever shown on an objective


#### the skill's name `/setup/skills/[code]`
Who: both · Phase: Core · Backend: CP-13 · CP-14 · Exists today: part (/skill-sets/[code])
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
Folds in: /skill-sets/[code]
Done when:
- a prerequisite is shown only if confirmed
- the spark's last value equals the grid's secure count


#### Curriculum `/setup/curriculum`
Who: both · Phase: Core · Backend: CP-15 · Exists today: yes (/, /curriculum/browse, /curriculum/fill)
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
Done when:
- one list carries activities (K2) and skills (grades 1–4) with one filter row
- the 109 'skills to approve' count leaves Today and lives here


#### Skills to approve `/setup/skills/approve`
Who: coordinator · Phase: Core · Backend: none · Exists today: yes
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
Done when:
- approval is per row, never all


#### Question bank `/setup/question-bank`
Who: both · Phase: Core · Backend: none · Exists today: yes (/library)
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
Done when:
- statistics sit behind a details link (rule 8)


#### the question as it prints `/setup/question-bank/[key]`
Who: both · Phase: Core · Backend: none · Exists today: yes (/library/[key])
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
Done when:
- a correction keeps the old key (item_key_change)


#### Staff and classes `/setup/staff`
Who: coordinator · Phase: Core · Backend: CP-1 · CP-3 · Exists today: yes
Eyebrow: This fortnight
Purpose: Who teaches which class, and three numbers the database can stand behind per class. No ranking: the school decides what they mean.
Blocks, in order:
- **DataTable**: role · class · sessions done of planned · notes late · reader accuracy; each row opens the person's grants
- **Details**: a person's grants: role, class, subject, from, to; Add a grant
Rail (Connected to): Fortnight 9 · Timetable · Classes and children
Main action: Add a grant · Next step: Classes and children
Data: staff, staff_role_grant, role; session states; educator_note statuses; note_claim decisions
Empty: none · Phone: cards
Done when:
- no score, rank or order by performance
- a grant edit is a new row with valid_from/valid_to, never a delete


#### Classes and children `/setup/classes`
Who: coordinator · Phase: Core · Backend: CP-1 · Exists today: part (/school)
Eyebrow: The school
Purpose: Each class, its grade, its children by Sr. No., and who teaches it. Move a child to another class; every change is kept with who made it.
Blocks, in order:
- **DataTable**: class · grade · children · educators; open a class
- **DataTable**: a class: Sr. No. · since · moved from; Move (its own action)
- **Details**: change log (child_move, enrolment)
Rail (Connected to): Staff · Class picture · the fortnight
Main action: Move a child · Next step: Staff
Data: school_class, enrolment, child_move, pii stays on the private side (names never on this page)
Empty: none · Phone: cards
Folds in: /school
Done when:
- a move writes child_move and a new enrolment, nothing is deleted
- no child's name on the page; Sr. No. only


#### Setup `/setup`
Who: both · Phase: Core · Backend: none · Exists today: part
Eyebrow: Changed rarely
Purpose: The curriculum, the skills, the question bank, staff, classes and the school. Statistics and old scans sit behind details links.
Blocks, in order:
- **Cards**: Curriculum · Skills to approve (count) · Question bank · Staff · Classes and children · School (campus, academic year, fortnights)
Rail (Connected to): each card
Main action: Curriculum · Next step: none
Data: counts
Empty: none · Phone: one column
Done when:
- every setup page is reachable in two clicks


### Outside the bar

#### '12' or 'counting' `/search?q=`
Who: both · Phase: Core · Backend: none · Exists today: part (top bar search)
Eyebrow: Search
Purpose: A child by Sr. No. in your classes, an activity, a skill, an assessment by its built name.
Blocks, in order:
- **DataTable**: kind icon · what · where · open
Rail (Connected to): none
Main action: the first result · Next step: none
Data: enrolment roll_no in scope; activity, skill names; assessment names
Empty: Nothing found: suggest the Sr. No. form · Phone: full screen
Done when:
- never searches names; Sr. No. and things only


#### Sign in `/login`
Who: both · Phase: Core · Backend: CP-2 · Exists today: yes
Eyebrow: Staff only
Purpose: School email and password. Forgot it: a link by email, set by its owner.
Blocks, in order:
- **Form**: school email · password · Sign in (main) · Forgot your password?
Rail (Connected to): none
Main action: Sign in · Next step: Today
Data: auth; sign_in_failure; password_link
Empty: none · Phone: centred form
Folds in: /login/forgot, /login/new-password, /account/password
Done when:
- lands on Today for the person's group
- no development bypass in production


#### Start here `/guide`
Who: both · Phase: Core · Backend: none · Exists today: yes
Eyebrow: Start here
Purpose: What each page is for, the usual jobs, and what each button does; the school's steps in four stages. Reached from the ? on every page.
Blocks, in order:
- **Cards**: I want to… (jobs → pages)
- **Details**: one per page: what it is for, what you see where, what each button does
Rail (Connected to): none
Main action: the page you came from · Next step: none
Data: static, generated from the menu and page purposes
Empty: none · Phone: stacked
Folds in: /guide/[slug], /guide/workflows, /workflows
Done when:
- every page's ? opens its own section


#### Report a problem or suggest something `/feedback`
Who: both · Phase: Core · Backend: none · Exists today: yes
Eyebrow: To the team
Purpose: Tell us what is broken, what you would like, or ask a question. It reaches the team, who decide what is built.
Blocks, in order:
- **Form**: what · where (the page you were on, prefilled) · Send
Rail (Connected to): none · Capture here: photo
Main action: Send · Next step: back to the page
Data: staff_note → GitHub issue
Empty: none · Phone: full form
Done when:
- a screenshot never contains a child's name (none on screens)

