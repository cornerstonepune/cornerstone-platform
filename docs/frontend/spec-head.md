# Cornerstone School OS: the frontend specification

Version 1, 9 Nov 2026. One file for the session that builds the site. It holds everything agreed in the four frontend-vision
passes with Nimish: the rules, the system, every screen as a wireframe with what it shows, what it calls and when it is done,
and the order to build in. `screens.json` beside it is the same inventory as data; `build-spec.mjs` regenerates the screen
catalogue below and the wireframes page from it. Change the JSON, run the script, never edit the catalogue by hand.

Companions: the design system "Cornerstone School OS" (tokens, brand book, icon map, first blocks):
https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514 · the clickable sketch:
https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74 · the wireframes of every screen:
WIREFRAMES_URL · the notes `docs/notes/frontend-*.md` · the decision `docs/decisions/2026-11-09-white-ground-for-the-site.md`.

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

GENERIC_CHECKS

SLICES_TABLE

## 5. The blocks

BLOCKS_TABLE

## 6. Every screen

Each screen: its address, who sees it, its phase (Core / Next / Later) and the backend scopes it calls; the eyebrow, title
and purpose line as they appear; its blocks in order with what each shows and from where; the rail; the one main action and
the next step; the empty state; how it folds on a phone; which old pages fold into it; and what must be true before it is
done. Wireframes of all of them: WIREFRAMES_URL.

SCREENS
