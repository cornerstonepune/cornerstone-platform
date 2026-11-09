# Cornerstone School OS: the design language

This is the one design file that builders follow, and the wireframes are made from what it describes. It repeats nothing
that already has a home: values live in `tokens.json`, rules in `SPEC.md` §2–§5, and screens in `screens.json`. Where this
file and those disagree, those win and this file is wrong. The look is "B rich" (`docs/decisions/2026-11-09-the-look-rich.md`).

Order of work (Nimish, 9 Nov 2026): the real elements are built in the app first: UI-14 the tokens, UI-13 the frame,
UI-2 the 26 blocks with their gallery page. Wireframes are then put together from those real components (§7), and a
wireframe Nimish approves becomes the page (§8).

## 1. Tokens: by name, never by value

Every colour, size, radius, shadow and motion is a token in `docs/frontend/tokens.json`. UI-14 copies that file to
`apps/web/design-system/tokens.json` and turns it into CSS custom properties, light and dark. Code names the token
(`var(--state-ok)`) and never types a hex, an `rgb()` or a pixel size the tokens already name.

| Family | Tokens | Meaning |
|---|---|---|
| Neutrals | `ground` `surface` `panel` `ink` `ink-muted` `line` `line-control` `link` `focus` `highlight` | the page, a sunken box, a card, text, hairlines, a control's edge, links (always underlined) |
| Main action | `action` `action-ink` | the one filled button on a page, the "now" outline, today's column |
| Brand | `brand-clay` (+ the materials) | the mark and the lit door's underline only; never a state, never on a child |
| Work states | `state-ok` `state-wait` `state-late` `state-quiet`, each with `-bg` | green, amber, red, grey; always with an icon and a word |
| Kinds | `kind-period` `-child` `-activity` `-objective` `-skill` `-assessment` `-note`, each with `-bg` | which kind of thing a tile, card header or rail link is |
| Subjects | `subject-numeracy` `-language` `-arts` (+ `-arts-ink`) `-fixed`, each with `-bg` | the top edge, icon and word of a period or cell |

The brand materials (olive, bamboo, monsoon, bark, sand, haldi, basalt) are the source of these hues. They appear on no
screen themselves.

**Type**, one token per style: `title-page` 32 serif (the one h1), `title-section` 24, `title-small` 20, `lead` 18 (the
purpose line), `body` 16, `label` 14, `eyebrow` 14 in capitals with 0.08em spacing, `caption` 12 (timestamps and sources
only, never a status or an action). Titles are Source Serif 4 and everything else is Source Sans 3, both self-hosted by
next/font; no page loads a font from another host. Every column of numbers uses tabular figures.

**Spacing**: `space-1` to `space-7` are 4 / 8 / 16 / 24 / 32 / 48 / 64 px. `tap` is 44 px, the least size of anything
tappable.

**Radii**: `radius-card` 14 px for cards, rows, cells, squares and the rail box; `radius-control` 10 px for buttons,
inputs, tabs and icon tiles; `radius-pill` for chips and the badge.

**Shadow**: `shadow-card` is the one elevation, and it replaces a card's border. It is never on a chip, text, a tinted
square or the logo.

**Motion**: `press` is the only motion. Anything pressable scales to 0.97 in 160 ms on `:active`; hover changes colour
only, and only on a fine pointer. Under reduced motion, press is removed.

## 2. The frame (AppFrame)

```
┌ bar ──────────────────────────────────────────────────────────────────────────┐
│ [logo] Today(7) Timetable Children Setup        [search]  Acting as  ?  Sign out │
├───────────────────────────────────────────────────────────────────────────────┤
│ Children › K2 Red                                       (trail: door › thing)   │
│ EYEBROW · FACTS                                         ┌ rail ─────────────┐  │
│ Title (h1)                                              │ CONNECTED TO       │  │
│ Purpose line, ≤140 characters                           │ [tile] link        │  │
│ blocks…                                                 │ CAPTURE HERE       │  │
│                                                         └────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
phone: mark alone and icon buttons; one column with the rail below; the four doors are a bottom tab bar
```

- **Bar**: the eight items of `screens.json` `bar`, in order:
  - the four doors with their icons, with the lit door underlined in `brand-clay`;
  - search;
  - acting-as (coordinator only);
  - help;
  - sign out.

  The BrandMark links to Today, and the one count badge on the site sits on the Today door.
- **Logo**: the official files in `docs/brand/cornerstone-logo/`, used as given.
  - `lockup-colour` on light, `lockup-for-dark-backgrounds` on dark.
  - On a phone, `mark` alone, or `mark-on-white-tile` on dark.
  - Never recoloured, stretched, shadowed or put inside a card.
  - Clear space on every side: a quarter of the mark's height.
- **Trail**: two fixed levels (the door, then the thing), plus the browser's Back.
- **Rail**: "Connected to" lists only the edges not already linked in the main column, each a KindTile plus words. Where
  a lesson or a child is in view, "Capture here" adds Voice note and Photo. Each sits in a `surface` box.
- **Phone**: the doors become a bottom tab bar (icon above word, the chosen icon in `brand-clay`). Prefer one markup that
  switches on width (a container or media query) over two components.

## 3. The state rule

A state is **an icon, a word and a colour, never one alone**. It comes from the `STATES` rows and `state_colour`.

| State | Colour | Words (examples) |
|---|---|---|
| late | red | do now, late, clash, for you to judge |
| wait | amber | to confirm, this week, moved, practising, wrong |
| ok | green | done, secure, right, results in |
| quiet | grey | to do, emerging, blank, absent |
| not seen | grey on the panel, dashed edge | not seen yet |

**Red is for work, never for a child.** A child who is below, not willing, not seen or at level 0 is grey or amber. If
two things on a screen are red, one of them is wrong.

A chip on a tinted cell sits on the panel colour with a 1 px ring in its state colour. The reason: the amber and Arts
tints sit close, and so do the red and Language tints.

Three signals, never two: right, wrong and blank stay distinct, and wrong-with-working is its own signal.

## 4. Kinds, subjects, icons

| Kind | Colour | Icon concept |
|---|---|---|
| period (and fortnight, timetable) | slate | `period` |
| child | teal | `child` |
| activity | indigo | `activity` |
| objective | violet | `objective` |
| skill | orchid | `skill` |
| assessment (and a child's paper) | sky | `assessment` |
| note (and materials) | stone | `note` |

**Subjects**: Numeracy is blue (icon `numeracy`), Language is brown (`language`), Arts is gold (`arts`, with its icon and
word in `subject-arts-ink`), and the fixed parts of the day are sand (settling, fruit, lunch, going home). A subject is
always icon, word and colour, like a state.

**Icons**: Lucide only, stroke 1.9, at 16 / 20 / 24 px, always through `<Icon name="…">` from `apps/web/lib/icons.tsx`;
no screen imports a Lucide icon by its own name. The file does not yet name these concepts: `period`, `assessment`,
`photo`, `setup`, `timetable`, `children`, `not-seen`, `numeracy`, `language`, `arts`, `materials`, `details`, `upload`,
`help`, `sign-out`, `acting-as`, `open`, `trail`, `moved`, `clash`. The slice that first needs one adds it to `ICONS`.
The proposed icons for them (Lucide names) are calendar-clock, clipboard-check, camera, settings, calendar-range,
users-round, circle-dashed, hash, messages-square, palette, package, eye, upload, circle-help, log-out, user-cog,
chevron-down, chevron-right, move-right and triangle-alert. They are proposals, not decided.

## 5. One main action, one purpose

Every page has:

- one eyebrow: the kind's icon plus two or three facts;
- one h1, equal to the screen's `title`;
- one purpose line of at most 140 characters;
- **exactly one main action**: a filled `action` button. Where the main action is a tap, as on the class grid, there is
  no filled button;
- one next step.

Nothing is ticked for an educator: there is no button over every row, and an approval is the row's own action. The
school's words apply everywhere: educator, exchange or regroup, Easy / Medium / Hard / Advance, and secure / practising /
emerging / not seen.

## 6. Names

The repository is public. **No real child's or staff member's name is ever in git**, whether in a wireframe, a fixture,
a test, a gallery or a screenshot. Every name drawn comes from `docs/frontend/wireframes/fake-names.json`: alliterative
animals for children, spice surnames for staff. UI-1 generates `apps/web/tests/fake-names.ts` from that file, so there is
one list, and the inventory test fails on any rendered name that is not in it.

On the live site, a child's name shows only on screens whose `elements` list a `child_name`. It is read from `pii.child`
by `child_id` at render time, and it never goes into a URL, a log or a state word.

## 7. How a wireframe is made

A wireframe is a real page of the app, assembled from the real blocks, with fake data. It is not a drawing.

1. **Where it lives**: under the app's own routes, at the screen's `route` in `screens.json`, behind the wireframe
   switch the frame slice provides. Its data comes from a fixture module (`apps/web/wireframes/<screen-id>.ts`) instead
   of the database. The page component is the one the real route will use.
2. **What it is built from**: AppFrame and the blocks from the UI-2 gallery only. A block that is missing is built in the
   gallery first, with its screenshot in both themes, and never drawn ad hoc on one page.
3. **The data**: a fixture is rows shaped exactly like the target tables in `specs/CP-27/target-tables.md`, with the
   column names as they appear in `supabase/migrations`.
   - Names come from `fake-names.json`.
   - Words are the school's own, taken from the vocabulary rows (`child_state.words`, the status words).
   - Every number shown is computed from those rows by the same code the page will use, never typed in.
   - The empty state shows the screen's `empty` text from `screens.json`.
4. **Every control is tagged** `data-el="<i>"`, where `i` is its 0-based index in that screen's `elements`.
   - A repeated control (each square, each skill link) carries the same index.
   - A `child_name` element is text, not a control.
   - Bar items are AppFrame's (`data-bar="<i>"`, the index in `screens.json` `bar`).
   - Nothing else on the page is clickable.
5. **Every shown datum is tagged** `data-source="<table>.<column>"`, naming the target table and the column it comes from.
   - Several sources are separated by spaces, and a pii column is written `pii.<table>.<column>`.
   - A count names what it counts (`enrolment.child_id` for "24 children").
6. **What the tables cannot give** is tagged `data-gap="<what is missing>"`, drawn with a dashed amber outline and the
   words, and added to `docs/frontend/wireframes/DATA-GAPS.md`. A gap is never filled with a hard-coded value.
7. **Before Nimish sees it**, the page passes three checks:
   - the inventory test for that screen: every element is present and no control is extra;
   - a check that each `data-source` names a target table and an existing column;
   - a scan that finds no colour typed outside the tokens and no name outside `fake-names.json`.

   It is shown to Nimish at 1440 and at 400, in light and in dark.

## 8. How an approved wireframe becomes the page

1. The page component does not change. The route swaps the fixture module for the page's one query, which returns the
   same row shapes. That is the reason fixtures follow the target tables exactly.
2. Each `data-source` is a field that query must return. Each `data-gap` is a backend question that must be closed in
   `DATA-GAPS.md` before the slice starts.
3. The `data-el` tags are what `tests/u70-inventory.spec.ts` drives. Element types stay as they were: a link stays an
   `<a>`, a filter stays a `<select>`.
4. Before the slice merges, the page passes:
   - its screen's `done_when`;
   - the generic checks of SPEC §7;
   - one screenshot per theme;
   - a visual match with the approved wireframe at 1440 and 400.

   A difference from the wireframe changes the wireframe first and is approved again; it is never a quiet change in
   code.

## 9. Files

| File | What it is |
|---|---|
| `docs/frontend/tokens.json` | every value; the source for UI-14 |
| `docs/frontend/SPEC.md`, `screens.json` | the rules, the blocks' contracts, every screen and its elements |
| `docs/frontend/DESIGN.md` | this file |
| `docs/frontend/wireframes/fake-names.json` | the only names allowed in git |
| `docs/frontend/wireframes/DATA-GAPS.md` | what the screens need that the target tables do not have; for the backend |
