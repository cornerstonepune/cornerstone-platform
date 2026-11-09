# The frontend landscape: how the whole site gets built from one system

9 Nov 2026, for Nimish. Fourth pass of the frontend vision; it replaces "build screen by screen" with "build the system,
then assemble". Companion to `frontend-vision.md` (menu, slices), `frontend-mindmap.md` (other systems, demo stories) and
`frontend-walkthrough.md` (the clickable sketch and the data graph). The design system itself, with the tokens, the icon
map and the first blocks, is the Artifact "Cornerstone School OS":
https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514 (private to Nimish).

## What we are building

One site, one navigation, every screen a node in a graph a person can walk. The grades 1 to 4 assessment loop is not
kept as it is: it is rebuilt on the same parts (its queries and its seven steps stay; its pages are re-assembled).
Nimish, 9 Nov: "We will completely change even this assessment. It's still cluttered, and it's still not fine-tuned."

## How we build it: four layers, in order

| Layer | What | Comes from | Held by |
|---|---|---|---|
| 0 Tokens | colour (white ground, brand materials, four work states, four subject hues), type, space, shape, in `tokens.json`; `tokens.css` generated from it | the design system artifact | nothing retypes a value; the contrast table re-run on white |
| 1 Primitives | Button, Badge, Table, Tabs, Collapsible, Dialog, Sheet, Select, Tooltip, Progress, Command | shadcn/ui, `npx shadcn@4.23.0 init`, into `components/ui/` (the athena standard) | adopted, not written |
| 2 Blocks | AppFrame (top bar + trail + rail), StatusChip, AttentionStrip, DataTable, FilterBar, ClassGrid, PeriodRow, Stepper, Details, Timeline, ChildGraph, the small charts, CaptureBar, EmptyState, Count | the ones that exist move onto the tokens; the new ones come from the sketch | one preview per block in both themes; one screenshot each in the suite; words from rows |
| 3 Node pages | one page shape per kind of thing: Period, Activity, Objective, Skill, Class, Child, Assessment, Paper, Fortnight, Staff; then Today (educator, coordinator) composed over existing queries | a node contract: eyebrow (kind icon, facts), title, purpose, blocks, rail of edges | the UX-rule test, the menu test, a journey test per story, axe on each |

A new kind of thing is a new query and a new rail list, not a new layout. That is what makes the site cheap to extend.

## Build order (each one a scoped change; replaces F1 to F11 of `frontend-vision.md`)

1. **Tokens and frame.** `tokens.css` from the system; AppFrame replaces `PageShell`, `TopBar` and the K2 side menu; the
   four groups; every existing page reachable from the bar. Tier 2. Needs Nimish: the two fonts.
2. **Blocks.** The new blocks, each with its preview and screenshot; the existing ones moved onto the tokens. Tier 2.
3. **Node pages, the K2 walk:** Period, Activity, Objective, Skill, Class picture, Child. Calls CP-8, CP-9, CP-10, CP-13.
4. **Node pages, assessments:** Assessment (the stepper, the papers bar, each copy's row), Paper (the page, each answer
   right / wrong / blank / for you to judge). Today's four assessment pages fold into these two plus Today's rows.
5. **Node pages, the coordinator:** Fortnight (approve, go live, what changed), Staff (sessions done, notes late, reader
   accuracy; no ranking). Calls CP-6, CP-7, CP-11, CP-12, CP-21 as they merge.
6. **Today**, both kinds, last, from the blocks and the queries that already exist.
7. **Reports and the parent's page** when CP-19 is built (Next).

Steps 1 and 2 can start now; 3 can start now against the switched-on K2 pages; 5 waits for its backend scopes.

## Why this is the efficient way, for a 100-child school

- The site today has 62 pages and two navigations because each goal added a page. Blocks plus node pages mean about
  ten page shapes and one frame carry everything; the count of pages stops mattering.
- Every rule that matters is already a test (`test_ux_rules.py`, `u51`, `u53`): a page must stand on the frame and the
  table, a status must have its icon, no table without its filter row. The system gives those tests one more target: a
  block's screenshot in both themes.
- Server components by default; a block is a function of rows. The only client code is the class grid's tap, the
  recorder and the details folds.
- Words stay rows (`STATES`, `state_colour`, `voice-words.ts`); a change of wording is a row, not a release.

## Decisions for Nimish

1. **Fonts.** Proposed: Source Serif 4 for titles, Source Sans 3 for everything else. Alternatives on record: one serif
   for all (brand book, 21 Sep) or Jost + Cormorant Garamond (D-073). One line in `tokens.json` changes it.
2. **Subject colours from the brand's materials** (Numeracy monsoon, Language bark, Arts haldi, fixed sand) rather than a
   chart palette. Mechanical; recorded here unless he objects.
3. **The assessment loop is rebuilt, not kept.** Said by Nimish on 9 Nov; recorded so no slice "preserves" the old pages.

## What was checked and what was not

Checked: the brand book, D-073's tokens and contrast notes, the icon map agreed with the designer, the 62 pages and their
titles, the real site built here from the repository (26 screenshots). Not checked: the contrast of the new pairs on
white (to be measured before step 1 ships), Lucide names not yet in `lib/icons.tsx` (verify against the installed
version), and any screen with real children, which needs the live database.
