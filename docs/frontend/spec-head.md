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
   screen, notes, reports, Classes, search results, a skill's grid), and on no other screen. Names are read from the `pii`
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
    own box and is not redrawn as cards. A phone class grid has six columns of 44 px squares.

## 3. The system

**Tokens** (`tokens.json`; `tokens.css` generated from it, nothing retyped): ground white `#ffffff`; surface `#f7f7f5`; ink
`#1c1b19`; ink-muted `#5e5a52`; line `#e4e3df`; line-control `#8a8984`; brand clay `#b8562f` (the mark, the active group's
underline, the trail's accent; never on a child, never a state); basalt `#26241f` (the one main action: a filled button with
white text); monsoon `#3f4d55` (links, always underlined, and Numeracy); olive `#4a5435` ok; bamboo `#9a7a3a` wait; bark
`#8a6a45`; haldi `#e2a43f` (the source of the Arts hue only: about 2.2:1 on white, so never a border or text; a part that
needs a person is outlined in the wait amber); sand `#ede3d3`. States: ok / wait / late / quiet with `-bg` fills. Subjects
from the materials: Numeracy monsoon, Language bark, Arts haldi (darkened for text), fixed sand. Three hues are therefore
never confused: links are blue-grey and underlined; work states are red, amber, green and grey with their words; the main
action is the one dark button. Dark follows the system; every pair has a dark value in `tokens.json`. The contrast table in
`docs/design-tokens.md` was measured on paper-warm; UI-1 re-measures every pair on white and commits the new table.

**Type** (decided by Nimish, 9 Nov 2026: `docs/decisions/2026-11-09-site-type-and-subject-colours.md`): Source Serif 4 for
titles (32/24/20) and Source Sans 3 for everything else (18/16/14/12); weights 400/500/600; nothing under 14 px carries a
status, label or action (so the eyebrow, which carries facts, is 14 px; 12 px is for a timestamp or a source only); tabular
figures in columns. Both fonts are loaded by next/font from the build, never from a font host. One thing is open, for
Nimish: Source Sans 3 has no Devanagari and nothing in Devanagari is rendered today; if the school wants it, a fallback font
is added. The fonts and every colour are in `docs/frontend/tokens.json`, which the build copies to
`apps/web/design-system/tokens.json`.

**Space and shape**: 4 / 8 / 16 / 24 / 32 / 48 / 64 px; 44 px tap; square corners everywhere except the pill of a work-state
chip and a count badge; no shadows, no gradients; hairlines separate, a one-step surface groups.

**Icons**: Lucide only, stroke 1.9, 16 / 20 / 24 px, one icon per concept in `lib/icons.tsx`; the map is in the design
system's README. A screen never imports an icon by its Lucide name.

**Layers**: 0 tokens → 1 primitives from shadcn/ui (`npx shadcn@4.23.0 init` into `components/ui/`, adding a primitive only
when the first slice that uses it needs it: Button and Tabs first; DataTable, StatusChip, FilterBar and the native
`<details>` stay the school's own, so Table, Badge, Select and Collapsible are not installed) → 2 the school's blocks
(section 5) → 3 node pages (one page shape per kind of thing) → Today composed last.

**Blocks** (`components/`): the list and one-line contract of each is in section 5. The blocks that exist today (`StatusChip`,
`DataTable`, `FilterBar`, `EmptyState`, `Count`) move onto the tokens in UI-1; `PageShell`, `TopBar` and the K2 side menu
become AppFrame in UI-13; `voice/board` becomes ClassGrid and `voice/record` CaptureBar when their screens are built; the
new blocks are built once with a preview and a screenshot in both themes (UI-2).

**Node contract**: a node page = AppFrame + eyebrow (the kind's icon and two or three facts) + title + purpose + its blocks +
its rail of edges (Connected to) + Capture here where a lesson or a child is in view. The rail lists only edges that are not
already links in the main column, and is defined once per kind of node (a hub such as Children or Setup has none). The trail
is two fixed levels, the door and then the thing, plus the browser's Back; the door lit on the bar is the door the walk
started from (an Activity opened from Today lights Today). A new kind of thing is a new query and a new rail list, not a new
layout. A control whose target screen is not yet built is not drawn (`merged_slices`); a screen that needs no rail, or the
bare frame of Sign in, says so in `screens.json`.

## 4. How to build it: order, tests, done

The order is the slice table in section 7, the only list of what is built when and what each waits for: tokens (UI-1), the
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
