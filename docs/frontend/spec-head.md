# Cornerstone School OS: the frontend specification

Version 2, 9 Nov 2026 (v1 plus the fresh-reviewer design review). One file for the session that builds the site. It holds
everything agreed in the frontend-vision passes with Nimish: the rules, the system, every screen as a wireframe with what it
shows, what it calls and when it is done, and the order to build in. `screens.json` beside it is the same inventory as data;
`build-spec.mjs` regenerates the screen catalogue below and the wireframes page from it. Change the JSON, run the script,
never edit the catalogue by hand.

Companions: the design system "Cornerstone School OS" (tokens, brand book, icon map, first blocks):
https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514 · the clickable sketch:
https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74 · the wireframes of every screen:
WIREFRAMES_URL · the notes `docs/notes/frontend-*.md` · the decision `docs/decisions/2026-11-09-white-ground-for-the-site.md`.
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

**Space and shape**: 4 / 8 / 16 / 24 / 32 / 48 / 64 px; 44 px tap. Three shapes, each with a meaning: a card (14 px corners:
cards, period rows, timetable cells, a child's square, the rail box), a control (10 px: buttons, inputs, tabs, icon tiles),
a pill (a state chip, the count badge, a name chip). One elevation, `shadow-card`, a faint ring and a soft shadow under a
card, a period row and the chosen tab; it replaces the card's border. No other shadow, no gradient; hairlines separate rows
inside a card, a surface box groups the rail.

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

BLOCKS_TABLE

## 6. Every screen

Each screen: its address, who sees it, its phase (Core / Next / Later) and the backend scopes it calls; the eyebrow, title
and purpose line as they appear; its blocks in order with what each shows and from where; the rail; the one main action and
the next step; the empty state; how it folds on a phone; which old pages fold into it; and what must be true before it is
done. Wireframes of all of them: WIREFRAMES_URL.

SCREENS

## 7. Slices and their goal points

Each slice below is one scoped change in the Athena loop: pasted as a GitHub issue in the Scope form (`scopes.md` holds the
paste-ready text), locked by Nimish, proofs written first, built, verified, shipped. Every Done-when line is observable by a
test or a script named in it. The generic checks apply to every screen a slice builds, on top of the screen's own lines:

GENERIC_CHECKS

SLICES_TABLE
