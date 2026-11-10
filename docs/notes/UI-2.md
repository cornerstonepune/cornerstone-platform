# UI-2: the blocks

Branch `ui-2-blocks` (from `ui-14-tokens-fonts`), issue #517. Scope: `specs/UI-2/spec.md`. Tests: `apps/web/tests/u71-blocks.spec.ts`
(+ `u71-chip-contract.ts`, the type-level half of Done when 3), baselines in `u71-blocks.spec.ts-snapshots/`.

## State (9 Nov 2026)

Every block of `screens.json` `blocks` except AppFrame, BrandMark (and the bar search) is a file `components/<kebab>.tsx`
with `data-block`; the gallery is `/setup/blocks`, linked from Setup's details view (`/?details=1`), coordinator only.
UI-13 (AppFrame, BrandMark) is merged in: the gallery's two samples are the real components. AppFrame's root and
BrandMark's `<picture>` carry `data-block`, so tests 1 and 11 hold. The AppFrame sample is the real frame inside a box with
`contain: layout`, so its phone tab bar stays in the sample. The gallery page is a `Screen` (the old `PageShell` went with UI-13).

## Mechanical choices

| Choice | Reason |
|---|---|
| Block styles are one file, `components/blocks.css`, imported in `globals.css`, every class prefixed `b-`, in `@layer components`. | The kit's names (`.chip`, `.btn`, `.card`) collide with the older pages' classes. Same structure, no collision; no CSS import inside a component, so the charts still render in plain Node (`tests/render-blocks.mjs`). |
| Icons are `<Icon name>` (lucide through `lib/icons.tsx`), not the kit's mask CSS. Added concepts moved into `ICONS`: period, assessment, photo, not-seen, numeracy, language, arts, details, upload, moved, clash. `ACTIONS` lists the actions the legend draws. | Done when 7; DESIGN.md §4. |
| Every `STATES` row names its icon (`StateRow`); new rows: secure, practising, emerging, notSeenYet (`look: "unseen"`), moved, clash, notDone, holiday, overdue. `data-tone` stays ok/wait/act/quiet (older tests); the new `data-state` is ok/wait/late/quiet/unseen. | Done when 3; the blocks' words come from STATES. |
| `StatusChip` keeps its Tailwind look (tint + 1 px ring, UI-14 choice 8); `onTint` swaps the fill to the panel colour. | Done when 9, no change to the older pages. |
| Phone layout uses `@media (max-width: 700px)`, not the kit's container query on `.frame`. | A real phone is the viewport; UI-13's frame can switch to a container query when it owns the width. |
| `ClassGrid` is a client component taking cells (`attrs` for data-*), a link per cell or `onTap`. `voice/board.tsx` keeps its problems list and activity picker and draws its children with ClassGrid; its own `Cell` is gone. | Done when 4; the voice tests pass unchanged. |
| Chart geometry follows the kit's numbers: Spark x 10–290, y 54 (least) to 18 (greatest); Trend x 40–580 by date, y = 100 − 30 × level; LevelBars width = share of children counted; StackBar flex = count. | "Drawn to scale from its data". |
| The gallery reads the block list from `docs/frontend/screens.json` (`lib/blocks.ts`) and the legend from `STATES`, `ACTIONS` and `design-system/tokens.json`. Folds are native `<details>`, opened by `?open=<Name>` (a sample's own links and the filter keep their fold open). | Done when 11 and 13. |
| `mayUse(me, "blocks")` is coordinator-only; for an educator the page answers with Next's not-found page (the page streams, so the status is 200). | Done when 12. |
| The inventory's BrandMark rule (`tests/inventory/brand.ts`) counts the page's own logo only (`img:not([data-sample] *)`); the gallery shows a second one as a sample. | One logo per page is still checked; the sample is not the page's. |
| KanbanBoard and ChildPeek (kit revision 1, #553; the kit grew from 26 to 28 blocks) were added to UI-2 on the orchestrator's decision, drawn as `docs/frontend/wireframes/blocks.html` and `components.css` do: `components/kanban-board.tsx` (with the Table \| Board `ViewToggle`, links so the address carries the tab) and `components/child-peek.tsx` (with `NameChip`; Escape or Close closes it and focus returns to the opener). | Tests 1 and 11 read the block list from `screens.json`. |
| The 114 screenshot baselines (`tests/u71-blocks.spec.ts-snapshots/`, 28 blocks × light/dark × 1440/400, and the tinted-chip pair) are committed, taken from the pictures CI drew (the artifact `browser-shard-3-screenshots`, which CI now keeps when a comparison fails), not from a sandbox: text renders differently between machines. `.gitignore` has an exception for `tests/*-snapshots/*.png`. | `*.png` was ignored, so CI had no baseline and tests 2 and 9 could only write them and fail. |
| The three growth rows (`secure`, `practising`, `emerging`) take their words from their own key, their icons are `tree`, `leaf`, `sprout`, and the samples take the names from `SECURE`/`PRACTISING`/`EMERGING` in `status-chip.tsx`. | `test_no_file_names_a_state_or_a_subject` (from main) forbids a quoted state code in the website's code; the words are the engine's `child_state` rows. |
| `STATUS_ICONS` is back in `status-chip.tsx` as each tone's default icon, and a `STATES` row takes it unless it has a drawing of its own; every row still names an icon (`StateRow`). | `test_ux_rules.py` reads `STATUS_ICONS`; the map also ends 45 copies of the same four icon names. |
| Sample names are the fake-names list (alliterative animals, spice surnames). | The repository is public. |

## Lessons

- A closed `<details>`' nested summaries still count as visible to Playwright; the controls test asks `closest("details:not([open])")`.
- A global `.b-cgraph svg` rule reached the icons in the table beside it: scope chart rules to the chart's own svg (`>`).
