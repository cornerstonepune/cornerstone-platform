# UI-14: Tokens, fonts and the existing parts on them

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/526
Scope locked by: Nimish (the label scope-locked on the GitHub issue, or the scope text quoted below)

Tier 2. Waits for: UI-1, and PR #528 (the logo pack) merged. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

Nothing new to do yet except the look. Every colour in the site now comes from one list, and the two chosen typefaces load from the site itself. After this a change of colour is one edit in one place. What Nimish sees: the same pages in the new white and type.

## What

One source of colour, type, shape, elevation and motion for the whole site, in the look Nimish chose on 9 Nov 2026 (the rich draft, B). tokens.css is generated from tokens.json; every colour literal in the app is replaced by a token, including in the blocks that exist today (StatusChip, DataTable, FilterBar, EmptyState, Count) and in the shadcn files from UI-1; the fonts are self-hosted. No page changes shape in this slice.

## Done when

1. `apps/web/design-system/tokens.json` is byte-identical to `docs/frontend/tokens.json`, and `apps/web/design-system/tokens.css` is produced from it by `apps/web/scripts/tokens.mjs`; a test regenerates and diffs, so the two cannot drift.
2. No hex colour literal remains in `apps/web/app`, `apps/web/components` or `apps/web/lib` outside `tokens.css` (a grep test; the count today is the baseline and must be 0 at the end of this slice). Each literal becomes the nearest token with no change of layout, and `screens.spec.ts` is re-baselined once, in this slice.
3. Every pair named in tokens.json's usage notes measures at least 4.5:1 (text) or 3:1 (borders, icons, outlines) in both themes by the WCAG formula, including link on ground, the main-action text on the basalt button, the amber outline on ground and each state text on its fill; and the four colours that sit near each other (the Language edge, the Arts edge, the wait amber and the late red) are at least 20 apart pairwise (CIE76 ΔE in light). The script lives in the suite and its table is committed as `docs/design-tokens-contrast.md`. A pair that fails is fixed in tokens.json, not exempted.
4. `tokens.css` carries every token of tokens.json: the colours in both themes (including the seven kind colours and their tints and the subject colours), radius-card 14 px, radius-control 10 px, radius-pill, shadow-card in both themes and the press motion; a test reads tokens.json and finds each name as a CSS custom property.
5. Press is the only motion: every button, link-row, tile and square scales to 0.97 on :active in 160 ms with the token's curve; hover changes colour only and only under `(hover: hover) and (pointer: fine)`; under `prefers-reduced-motion` nothing moves (a test reads the computed styles in both media settings).
6. The four official logo files are copied byte for byte from `docs/brand/cornerstone-logo/SVG-vector/` (PR #528) into `apps/web/public/brand/` by the tokens script, never edited; `app/icon.svg` (the browser tab) is `mark-on-white-tile`; the app icon is made at build time from `mark-on-white-tile` (PNG files are ignored by git), for example with `app/apple-icon.tsx`, verified against the installed Next.js version; a test compares the hashes.
7. Each shadcn file under `components/ui/` references `var(--` and no hex, and the stock look is gone (screenshot baseline).
8. next/font loads Source Serif 4 and Source Sans 3 from the build: no page makes a request to a font host or any host other than the site's own (a test records the requests of one page); the computed font-family first names across every page are within {Source Serif 4, Source Sans 3}.
9. `bin/check`, `test_ux_rules.py`, `u51` and `screens.spec.ts` pass; `ux.frozen` in workflows.json has not grown.

## Out of scope

The frame, the menu and the inventory test (UI-13); new blocks (UI-2); new screens, changed queries.
