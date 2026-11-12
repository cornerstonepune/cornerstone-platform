# Cornerstone School OS: the design language

One file that a wireframer and a builder both follow. It restates nothing that has a home elsewhere: values live in
`tokens.json`, rules in `SPEC.md` §2–§5, screens in `screens.json`. Where this file and those disagree, those win and
this file is wrong, with one named exception: the spacing scale of §1, which revision 1 (issue 546) moved ahead of
`tokens.json` into `spacing.json` until the site adopts it. The look is "B rich" (`docs/decisions/2026-11-09-the-look-rich.md`).

## 1. Tokens: by name, never by value

Every colour, size, radius, shadow and motion is a token in `docs/frontend/tokens.json`. Code and wireframes name the
token (`var(--state-ok)`); nobody types a hex. `wireframes/kit.mjs` writes them as CSS custom properties into
`wireframes/kit.css`, light and dark; the site's build copies the same file to `apps/web/design-system/tokens.json`.

| Family | Tokens | Meaning |
|---|---|---|
| Neutrals | `ground` `surface` `panel` `ink` `ink-muted` `line` `line-control` `link` `focus` `highlight` | the page, a sunken box, a card, text, hairlines, a control's edge, links (always underlined) |
| Main action | `action` `action-ink` | the one filled button on a page; the "now" outline; today's column |
| Brand | `brand-clay` (+ materials) | the mark and the lit door's underline only; never a state, never on a child |
| Work states | `state-ok` `state-wait` `state-late` `state-quiet`, each with `-bg` | green, amber, red, grey; always with icon and word. The one state scale of a child's standing (page charter A3: secure green, practising amber, needs help red, not seen grey) and a rubric's levels 0–3 (grey, red, amber, green) use the same four (`apps/web/lib/state-scale.ts`) |
| Kinds | `kind-period` `-child` `-activity` `-objective` `-skill` `-assessment` `-note`, each with `-bg` | which kind of thing a tile, card header or rail link is |
| Subjects | `subject-numeracy` `-language` `-arts` (+ `-arts-ink`) `-fixed`, each with `-bg` | the top edge, icon and word of a period or cell |

**Type** (`--type-<name>`, used as `font: var(--type-body)`): `title-page` 32 serif (the one h1), `title-section` 24,
`title-small` 20, `lead` 18 (the purpose line), `body` 16, `label` 14, `eyebrow` 14 caps with `--type-eyebrow-ls`,
`caption` 12 (timestamps and sources only, never a status or action). Source Serif 4 for titles, Source Sans 3 for the
rest, loaded by next/font on the site; wireframes fall back to Georgia and the system sans (no font host, ever).
Tabular figures (`.num`) in every column of numbers.

**Spacing** (revision 1, Nimish, 9 Nov 2026, issue #546: "more spacing"): `--space-0`…`--space-7` = 4 / 6 / 12 / 20 / 32 / 48 / 64 / 96, from
`docs/frontend/spacing.json`; `--tap` 44 (least size of anything tappable). `space-0` is the hairline inside a chart or a
strip (the segments of a bar, the days of a week); `space-1` between an icon and its word; `space-2` between rows and
chips; `space-3` inside a card and the phone gutter; `space-4` between blocks, between groups of children and the main
column's padding; `space-5` above a section and between the main column and the rail; `space-6` under the title block;
`space-7` page bottom. **Every gap, padding and margin in the kit is one of these tokens (or 0 or auto): `check.mjs` fails
a typed length in `components.css`.** `tokens.json` still holds the old scale (4 / 8 / 16 / 24 / 32 / 48 / 64) on purpose:
`apps/web/design-system/tokens.json` must stay byte for byte equal to it (UI-14), and this revision changes no app code.
The builder who adopts revision 1 copies `spacing.json`'s values into `tokens.json` `spacing`, runs
`node apps/web/scripts/tokens.mjs`, deletes `spacing.json` and the `spacingTokens` lines of `kit.mjs` in the same commit.
**Radii** `--radius-card` 14 (cards, rows, cells, squares, the rail box), `--radius-control` 10 (buttons, inputs, tiles),
`--radius-pill` (chips, the badge). **Shadow** `--shadow-card`, the one elevation, replacing a card's border; never on a
chip, text, a tinted square or the logo. **Motion** `.press`: scale `--press-scale` in `--press-transition` on `:active`;
nothing else moves; removed under reduced motion.

## 2. The frame (AppFrame)

Since the page charter (`page-charter.md` A1–A2, approved 12 Nov 2026) the menu is a sidebar and the right side is a detail panel.

```
┌ bar ──────────────────────────────────────────────────────────────────────────┐
│ [logo]                                   [search]  person · Acting as  ?  Sign out │
├──────────────┬────────────────────────────────────────────────────────────────┤
│ [fold]       │ My day › Today, the school                 (trail: section › thing) │
│ MY DAY       │ EYEBROW · FACTS                        ┌ DetailPanel ─────────────┐ │
│  Today (7)   │ Title (h1)                             │ [tile] the thing     [×] │ │
│  Notes …     │ Purpose line, ≤140 characters          │ Move · Edit · full page  │ │
│ TIMETABLE    │ blocks… (a grid, a list, a board)      │ Activity|Children|…      │ │
│  Week …      │   choosing a thing opens it on the     │ (nothing chosen: 3–4     │ │
│ CHILDREN …   │   right: ?open=<kind>:<id>&tab=…       │  stat tiles, no links)   │ │
│ ASSESSMENTS …│                                        └──────────────────────────┘ │
│ SCHOOL …     │                                                                │
└──────────────┴────────────────────────────────────────────────────────────────┘
phone (≤700 px wide): Menu button, mark, search, person; the sidebar is a drawer (a modal); an open panel is a sheet over the page
```

- **Bar**: the BrandMark links to Today; search; the person and acting-as (coordinator); help; sign out. Its items, with the sidebar's
  lines and the Menu button, are `screens.json` `bar`, in that order.
- **Sidebar**: the sections of `apps/web/lib/menu.ts` (My day, Timetable, Children, Assessments, School for the coordinator), each a
  heading and its pages; the page you are on `aria-current="page"` with a `brand-clay` edge; the section of the walk lit. It folds to one
  icon per section (a cookie keeps the fold); on a phone it is a drawer. Only Today carries a count.
- **Trail**: the section, then the thing (two levels) plus the browser's Back.
- **DetailPanel** (right): what a page's thing is, in tabs; the same tabs for the same kind (a lesson: Activity · Children · Materials ·
  History). Escape or × closes it and focus returns to the thing. With nothing chosen: the page's stat tiles. A page not yet moved to the
  charter keeps its old **rail** (ChildPeek, "Connected to", Capture here) until its own screen's pull request.
- **Phone**: the switch is a container query on `.frame` in the kit, a 700 px media query on the site.

## 3. The state rule

A state is **an icon, a word and a colour, never one alone** (`.chip`, `.sq`, `.att`, `.step` with `data-state=`).

| `data-state` | Colour | Words (examples) |
|---|---|---|
| `late` | red | do now, late, clash, for you to judge |
| `wait` | amber | to confirm, this week, moved, practising, wrong |
| `ok` | green | done, secure, right, results in |
| `quiet` | grey | to do, emerging, blank, absent |
| `unseen` | grey on panel, dashed edge | not seen yet |

**Red is for work, never for a child.** A child below, not willing, not seen or at level 0 is grey or amber. If two
things on a screen are red, one is wrong. A chip on a tinted cell gets `.on-tint` (panel fill, 1 px ring), because the
amber and Arts tints, and the red and Language tints, sit close. **Settled (Nimish, 12 Nov 2026):** a rubric's levels are grey (0), amber (every level between) and green (the top), never red; red stays for work (a clash, an overdue check), never on a child.

## 4. Kinds, subjects, icons

| Kind (`data-kind`) | Colour | Icon concept |
|---|---|---|
| `period` (and fortnight, timetable) | slate | `period` |
| `child` | teal | `child` (ChildPeek's top edge) |
| `activity` | indigo | `activity` |
| `objective` | violet | `objective` |
| `skill` | orchid | `skill` |
| `assessment` (and a child's paper) | sky | `assessment` |
| `note` (and materials) | stone | `note` |

Subjects (`data-subject`): `numeracy` blue (icon `numeracy`), `language` brown (`language`), `arts` gold (`arts`, its icon
and word in `subject-arts-ink`), `fixed` sand (settling, fruit, lunch, going home). A subject is always icon + word +
colour, like a state.

**Icons**: Lucide only, stroke 1.9, 16 / 20 / 24 px (`.ic.s`, `.ic`, `.ic.l`). A wireframe writes
`<i class="ic" data-icon="<concept>">`; the site writes `<Icon name="<concept>">` from `apps/web/lib/icons.tsx`. The
concept names are that file's `ICONS` keys plus `ADDED_ICONS` in `wireframes/kit.mjs` (period, assessment, photo,
setup, timetable, children, not-seen, numeracy, language, arts, materials, details, upload, help, sign-out, acting-as,
open, trail, moved, clash, board, table, group, cluster, history, close). A builder who first needs one of those moves it into `ICONS` and deletes it from
`ADDED_ICONS` in the same commit. No screen names a Lucide icon directly.

## 5. One main action, one purpose

Each page: one eyebrow (kind icon + two or three facts), one h1 equal to the screen's `title`, one purpose line of at most
140 characters, **exactly one main action** (`.btn-main`, filled with `action`; on a screen whose main action is a tap,
such as the class grid, there is no filled button), one next step. Nothing is ticked for an educator: no button over
every row; an approval is the row's own action.

## 6. Names

The repository is public. **No real child's or staff member's name is ever in git**: not in a wireframe, a fixture, a
test or a screenshot. Every name drawn comes from `wireframes/fake-names.json` (alliterative animals for children,
spice surnames for staff); `check.mjs` fails on any other. A child's name is shown only on screens whose `elements` list
a `child_name`, read from `pii.child` by `child_id` at render time; it never goes into a URL, a log or a state word.
UI-1 generates `apps/web/tests/fake-names.ts` from the same JSON, so the site has one list.

## 7. A page is full, and what moves is a board

Three rules from revision 1, for every screen drawn from now on:

1. **No empty-looking region.** At 1440 and at 400, a screen with a blank stretch (a narrow form beside nothing, a rail
   under its boxes, a short table) gets a **second block** that uses data the target tables really hold: a last-seen strip,
   counts by state, the recent notes, a week strip. Each datum carries its `data-source`; a figure no table can give is a
   gap, not an invention. A second block adds no control that is not on the screen's `elements`.
2. **Anything that moves through stages is also a board.** Offer it as a KanbanBoard next to its table, joined by the
   Table | Board toggle (`.seg`, two `role="tab"` links, the address carries the tab): the assessments (the seven steps
   grouped into four lanes by who has the paper), the educator's what-waits-on-me, the notes (to confirm, confirmed).
   Batch 3's reports, curriculum drafts and fortnight steps follow the same rule. A wireframe draws both views, each under
   a small heading, the chosen view first.
3. **Wherever children are listed they can be grouped.** By state on a skill, by skill and level, by class, with a count per
   group (§10). Groups are computed from rows that exist; nothing is stored. Saved educator groups are not drawn:
   they are a backend decision (`DATA-GAPS.md`).

## 8. How to make a wireframe

The order of work (Nimish, 9 Nov 2026): UI-14 builds the tokens, UI-13 the frame and UI-2 the 26 blocks in the app,
porting `blocks.html` and `components.css` into components. Until then, a wireframe is drawn in this kit, as below.
Afterwards, a wireframe is a page assembled from those real components, with fixture rows shaped exactly like the
target tables. It follows the same rules: the same `data-el`, `data-bar`, `data-source` and `data-gap` tags, the
same names, and the same two widths.

1. Read the screen's entry in `screens.json`: route, who, blocks, `elements`, rail, capture, main, empty, phone, data,
   `done_when`.
2. Copy `wireframes/picture.html` to `wireframes/<screen-id>.html`. Keep the two frames: `<section class="wf"
   data-viewport="1440">` and `data-viewport="400"`, with **the same markup in both** (the phone layout comes from
   kit.css).
3. Set the lit door, trail, eyebrow, h1 (= `title`), purpose. Draw as the role that sees most (a coordinator for `both`).
4. Build the main column and rail **only from blocks in `blocks.html`**: copy a block's markup, change the content. No
   new class, no `<style>`, no `<script>`; `style=""` may only set a `--custom-property` (a bar's length, a grid's
   columns, a board's lanes). A block that is missing is added to `components.css` and `blocks.html` first, in its own
   commit. Where a child is listed, the ChildPeek is drawn open at the top of the rail for one child on the page.
5. Mark every control: `data-el="<i>"`, `i` = its 0-based index in that screen's `elements`. A control repeated (each
   square, each skill link) carries the same index. A `child_name` element is text, not a control. Bar items carry
   `data-bar="<i>"` (index in `screens.json` `bar`); trail links carry `data-trail`. Nothing else may be clickable.
6. Bind every shown datum: `data-source="<table>.<column>"` (several separated by spaces; `pii.<table>.<column>` for
   pii), using **the target tables** in `specs/CP-27/target-tables.md` and the columns in `supabase/migrations`. A
   computed figure names what it counts (`enrolment.child_id` for "24 children").
7. Anything the target tables cannot give gets `data-gap="<what is missing>"`: kit.css draws it with a dashed amber
   outline and the words. Add a row to `wireframes/DATA-GAPS.md`.
8. Sample data from `fake-names.json`, the school's words (educator, exchange / regroup, Easy / Medium / Hard /
   Advance, secure / practising / emerging / not seen), and the empty state from `screens.json` `empty`.
9. Run `node docs/frontend/wireframes/check.mjs <screen-id>.html` until it says PASS; open the file in a browser, both
   themes (`data-theme="dark"` on `<html>`). Nimish approves the picture; only then is it built.

## 9. How to turn an approved wireframe into a page

1. The route is the screen's `route`; a server component by default.
2. Each `data-block` region becomes the component of that name in `apps/web/components/`; port its markup and class
   names from `blocks.html` once, then reuse. kit.css's block rules become that component's styles, still naming
   only tokens.
3. Each `data-source` becomes a field of the page's one query; each `data-gap` is a backend question that must be
   closed (DATA-GAPS.md) before the slice starts, never a hard-coded value.
4. Each `data-el` becomes the control the inventory test (`tests/u70-inventory.spec.ts`) drives by that index; each
   `data-bar` is AppFrame's. Keep the same element types (a link stays an `<a>`, a filter a `<select>`).
5. The page passes the screen's `done_when`, the generic checks of SPEC §7, a screenshot per theme, and looks like the
   approved wireframe at 1440 and 400. A difference from the wireframe is a change to the wireframe first, approved
   again, never a quiet change in code.

## 10. Boards, groups, clusters, the child's peek (revision 1)

- **KanbanBoard** (`blocks.html`): one lane per stage, each lane headed by its state's icon, word and a count; each card is a
  link (kind tile, one line, one fact, a state chip). Lanes are `--lanes` columns that scroll sideways in their own box on a
  phone, as a table does. An empty lane says so in words. Cards are the same rows as the table beside it: a lane's count
  equals the table's rows in that state, and nothing is ticked for an educator.
- **Groups**: a `Group by` select (a `filter` element) and, under it, a heading with the state's icon, word and a count over
  each group, then the same squares, rows or chips. A child is in exactly one group; the counts sum to the rows.
- **Clusters** (the skill and class pictures): children who share a place on a topic (for example secure here and ready for
  the next skill), as a card with its count and the children as chips. **Code decides, not a model**: they are computed from
  `child_skill_state` and `evidence_event` (a backend gap row, `DATA-GAPS.md`), and a child may be in several.
- **ChildPeek**: tapping a child anywhere a child is listed (a row, a square, a chip, a name on a claim line) opens one
  child's recent history in a panel: state counts, then notes, observations, papers, state changes and corrections newest
  first, each with who and when, then **Open the child**, the only way from a list to the child's own page. The top of the
  rail on a wide screen, a sheet over the bottom on a phone; Escape closes it and focus returns. The address carries the
  Sr. No., never a name. On a confirm screen a square still changes the mark; the peek opens from the name.
- **Week strip** (`.days`): seven cells for the last seven school days that had a confirmed lesson; a noted absence is a grey
  `absent` cell with its word, a day with no lesson is blank, never "present". The school has no register: it reads
  "absences noted" (issue 551).

## 11. Files

| File | What it is |
|---|---|
| `spacing.json` | the revision 1 spacing scale (§1), until the site adopts it into `tokens.json` |
| `wireframes/kit.mjs` | writes `kit.css` from `tokens.json`, `spacing.json`, the icon map and `components.css` |
| `wireframes/components.css` | the blocks' rules, tokens only (the source; edit this, then run kit.mjs) |
| `wireframes/kit.css` | generated; the one stylesheet every wireframe links |
| `wireframes/schema.mjs` | replays `supabase/migrations` to know every table's columns today |
| `wireframes/blocks.html` | the 28 blocks, drawn once each, and the group, cluster and week-strip patterns |
| `wireframes/<screen-id>.html` | one wireframe per screen (the pilot: `picture.html`) |
| `wireframes/check.mjs` | holds every wireframe to the rules above (and the kit's gaps, paddings and margins to the spacing tokens); `--gaps` holds DATA-GAPS.md to screens.json |
| `wireframes/provisional.json` | columns the backend decided in issue 551 and has not built; a `data-source` may name one |
| `wireframes/fake-names.json` | the only names allowed |
| `wireframes/DATA-GAPS.md` | what the screens needed that the target tables did not have, how the backend decided each (0 new tables), and what is still open |
