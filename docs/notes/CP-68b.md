# CP-68b: one card, one spacing scale

Branch `cp-68b-cards`, issue #832 (section "68b"). Builds on main at 8d40771; merges after CP-68a.

## What changed
- **One box.** `Card` (`apps/web/components/cards.tsx`) is the only surface with an edge; its look is the `.card` rule at the top of
  `components/blocks.css`: 20 px padding (`compact` 12 by 20, `flush` none for a table or picture), a hairline, the card radius token,
  `tone="quiet"` (tinted ground, no border) and `tone="dashed"` (nothing here yet). A link, button or label card lifts 1 px under a fine
  pointer and is still under reduced motion. A block tints its card with `--card-bg`.
- **No box in a box.** A plain card inside a plain card is drawn as a ruled line of the outer one (one CSS rule), so Today's rows and
  filter bar no longer sit as frames inside a frame. The tinted header band glued to a card's top edge is gone.
- **The old `.panel` box is deleted** (rules and all 31 uses); `Panel`, `Tile`, `Notice` in `components/parts.tsx` are Cards.
- **One-off values removed**; spacing is `var(--space-N)` and `var(--tap)`, widths are Tailwind's named sizes.
- **Timetable cells** lost their coloured side stripe (impeccable's detector: side-tab); the subject tint and tag carry the colour.

## Counts (whole app, before → after)
| | before | after | what is left |
|---|---|---|---|
| hand-drawn boxes (scan) | 84 | 0 | 7 written exceptions: buttons, chips, empty state (68a), the token legend, the tab list |
| `[..px]`/`[..rem]` values | 152 in 47 files | 47 in 9 files | 18 in 68a's files (frame, chip), 1 in CP-67's, the rest screen-width breakpoints |
| lines with a one-off value outside owned files | 93 | 0 | |
| inline styles | 42 in 24 files | 32 in 21 files | all carry data (a bar's width, a place on a picture, a custom property) |
| raw px in a CSS padding, margin or gap | 44 | 7 | button, chip and legend rules (68a's), held by a ratchet |

## Held by
`packages/engine/tests/test_design_scale.py` (in `bin/check`): one box, no one-off value, no fixed inline style, CSS spacing ratchet, the
card rule itself. `apps/web/tests/u90-design-system.spec.ts` (core): every `[data-card]` keeps its padding, no card sits flush in a
card, cards never touch, a pressed card lifts and respects reduced motion.

## Found, not from this branch
On the local `bin/testdb fresh` copy, u90 fails on `/timetable` and `/children` (a 40 px gap: an empty action row in
`components/app-frame.tsx` takes a grid row) and on `/children`'s word budget (12 words). Both are in files CP-68a owns and the same on
main; told to the orchestrator.

## Done after CP-68a landed (da42cdd)
Main merged; `.card` is the one card (68a's `.b-card`/`.panel` card rules dropped, its tokens, `--shadow-lift` and `--motion-*` used);
subject stripes removed everywhere (68a's rule); hand-drawn buttons moved onto `.btn secondary` / `tertiary`; the CSS spacing ratchet is zero.
