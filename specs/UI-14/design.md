# UI-14 design: the mechanical decisions

The design itself is `docs/frontend/SPEC.md` §3 and `docs/frontend/tokens.json` (PR #507, reviewed there). This file records
only the builder's mechanical choices, each with its reason. Nimish decided the look; none of these changes what a user sees
beyond "the same pages in the new white and type".

| # | Choice | Reason |
|---|---|---|
| 1 | `scripts/tokens.mjs` copies `docs/frontend/tokens.json` byte for byte to `design-system/tokens.json`, writes `tokens.css`, copies the four logo SVGs to `public/brand/` and `mark-on-white-tile` to `app/icon.svg`. `--check` writes nothing and exits 1 naming each stale file. | One script owns every generated file, so one test (regenerate and diff) guards them all. |
| 2 | tokens.css: light values on `:root`, dark under `@media (prefers-color-scheme: dark)` on `:root:not([data-scheme="light"])`. The root layout keeps `data-scheme="light"`, so the site stays light in this slice; tests take the dark values by removing the attribute and emulating the dark scheme. | Decided by the orchestrator (9 Nov 2026): turning dark on site-wide would show dark on every old page before UI-13/UI-2 restyle them, a user-visible change nobody asked for in UI-14. |
| 3 | Names: a colour is `--<name>`; type style `s` is `--font-s`, `--text-s`, `--lh-s`, `--weight-s` (`--tracking-s`); families `--font-sans`, `--font-serif`; spacing, radius and shadow by their names; a motion token's declarations become `--press-transform` and `--press-transition`. | Every tokens.json name appears as a custom property; the existing `--text-label`, `--lh-body`, `--space-*`, `--tap` keep their names, so the educator screens' size tokens did not move. |
| 4 | tokens.css is imported once, in `app/globals.css`, in the `tokens` layer, for every page. The two other imports (the educator shell, the timetable rules page) are removed. | "One source … for the whole site." |
| 5 | "Nearest token" means nearest by role, not by colour value. | By value, the lime ground maps to `subject-fixed-bg` and the cream look stays, contradicting "the same pages in the new white". |
| 6 | The old material names the screens' Tailwind classes use (539 classes in 93 files: `text-basalt/55`, `bg-chalk`…) are re-pointed in one place, `globals.css`: basalt → ink, lime → ground, chalk → panel, terracotta → state-late, neem → state-ok, bamboo → state-wait, mud → kind-note, monsoon → state-quiet; the `--ink-NN` washes become `color-mix` of `--ink`. | No layout change, no 93-file churn; every one of those colours now comes from tokens.json. Terracotta is used today for alerts, wrong answers and "red" standing, so its role is the late red; links get `--link` from the base `a` rule. Each screen moves to the tokens' own names when UI-13 and UI-2 rebuild it. |
| 7 | The educator screens' old semantic names are renamed to tokens.json names (`--text` → `--ink`, `--bg` → `--ground`, old `--surface` (white card) → `--panel`, `--sunken` → `--surface`, `--border` → `--line`, `--border-control` → `--line-control`, chip and state names → `--state-ok/wait/late/quiet(-bg)`, selection (`chip-donow`) → `--action`/`--action-ink`, `--radius-m` → `--radius-control`, `--radius-l` → `--radius-card`, `--text-h3` → `--text-title-small`). The K2 "do now" chip is the late red (tokens.json: state-late "do now"). | Those screens were already token-only; their names now match the one list. |
| 8 | The five named blocks (StatusChip, DataTable, FilterBar, EmptyState; Count has no colour) use `var(--state-…)`, `var(--ink…)`, `var(--line-control)`, `var(--panel)`, `var(--surface)` directly. A state chip is text in its state colour on its fill with a 1 px ring in its state colour. | Scope names them; SPEC's StatusChip ring. |
| 9 | The engine's "no picture" placeholder is a standalone SVG image, which cannot read CSS: it reads its four colours from `design-system/tokens.json` (light). | Zero hex in code without a second list of colours. |
| 10 | The hex grep covers code and style files; the byte-copied logo SVGs (`app/icon.svg`, `public/brand/`) are governed by line 6, which forbids editing them. | Lines 2 and 6 otherwise contradict. Told the orchestrator before locking. |
| 11 | Press: one rule in `globals.css` (base layer) on `button, a, summary, [role=button], [role=tab], [data-press]`: transition `var(--press-transition)`, `:active` transform `var(--press-transform)`; both removed under `prefers-reduced-motion: reduce`. `[data-press]` is the hook for tiles and squares (UI-2). The two pulse animations and the chevron's rotate transition are removed. | "Press is the only motion." An inline text link cannot transform (CSS), which is right: a link-row is a block. |
| 12 | Hover: Tailwind's `hover:` variant is redefined (`@custom-variant hover`) to `@media (hover: hover) and (pointer: fine)`; every hand-written `:hover` in globals.css sits inside the same query and changes colour only. | Line 5. |
| 13 | Fonts: `next/font/google` `Source_Serif_4` (400, 600) and `Source_Sans_3` (400, 500, 600), latin, swap, applied on `<html>`; body is `--font-sans`, h1–h3 `--font-serif`. next/font downloads them at build and serves them from `/_next/static/media`. | tokens.json `type.fonts`; "from the build, never from a font host". |
| 14 | App icon: `app/apple-icon.tsx` renders `public/brand/Cornerstone-logo-mark-on-white-tile.svg` with `ImageResponse` (180 px PNG, made at build, statically optimised per the installed Next 16.3.5 docs `app-icons.md`); PNGs are already git-ignored. | Line 6. |
| 15 | Contrast: `scripts/contrast.mjs` measures the pairs the usage notes name (both themes, WCAG 2; 4.5:1 text, 3:1 edges and icons) and ΔE76 ≥ 20 for language/arts/wait/late in light; writes `docs/design-tokens-contrast.md`; `--check` fails if the table is stale or a pair is short. | Line 3. The Arts top edge on its own fill measures 2.998:1; the usage note names it only "3:1 on white", so it is not in the table; reported to the orchestrator as a finding for the spec owner. |
| 16 | The shadow tokens' rgba values and `color-mix` washes are not hex and stay; the only shadow is `--shadow-card`. | One elevation. |

## The full map, old name → token (choices 6 and 7)

Old Tailwind materials (`globals.css`, `:root`): `--lime` → `--ground` · `--basalt` → `--ink` · `--chalk` → `--panel` ·
`--terracotta` → `--state-late` · `--neem` → `--state-ok` · `--bamboo` → `--state-wait` · `--mud` → `--kind-note` ·
`--monsoon` → `--state-quiet` · `--ink-NN` → `color-mix(in srgb, var(--ink) NN%, transparent)` · base `a` → `--link`.
Hand-written classes in `globals.css`: `.btn` → `--action`/`--action-ink`; `.chip.on` → `--action`/`--action-ink`;
`.pill-neem/-bamboo/-terracotta/-monsoon` → `--state-ok/-wait/-late/-quiet` with their `-bg`; focus outline → `--focus`;
a table row's hover → `--highlight`.

Old D-073 names (educator, K2, curriculum, timetable, page-part): `--text` → `--ink` · `--text-muted` → `--ink-muted` ·
`--bg` → `--ground` · `--surface` → `--panel` · `--sunken` → `--surface` · `--border` → `--line` ·
`--border-control` → `--line-control` · `--chip-donow-fg/bg/bd` → `--action-ink`/`--action`/`--action` (a selected tab,
the Now line), except the K2 "do now" chip → `--state-late(-bg)` · `--chip-confirm-*` and `--state-soon-*` → `--state-wait(-bg)` ·
`--chip-soon-*` and `--state-coming-*` → `--state-quiet(-bg)` · `--chip-done-*` and `--state-done-*` → `--state-ok(-bg)` ·
`--chip-late-*` and `--state-late-fg` → `--state-late(-bg)` · `--needs-you-fg/bg/bd` → `--ink`/`--panel`/`--state-wait` ·
`--words-school-*` and `--origin-school-*` → `--kind-note(-bg)` · `--origin-drafted-*` → `--state-wait(-bg)` ·
`--origin-edited-*` → `--state-quiet(-bg)` · `--brand-basalt` → `--action` · `--brand-paper` → `--panel` ·
`--brand-line` → `--line` · `--brand-stone` → `--ink-muted` · `--brand-bamboo` → `--kind-note` ·
`--brand-bamboo-deep` → `--state-wait` · `--radius-m` → `--radius-control` · `--radius-l` → `--radius-card` ·
`--text-h1/h2/h3`, `--lh-h1/h2/h3` → `--text-/--lh-title-page/-section/-small` · `--font-display`, `--font-heading` → `--font-serif` ·
`--font-body` → (tokens' own `--font-body`, the sans).

Other literals: `bg-white` → `bg-chalk` (panel); `shadow-sm/md` → `shadow-[var(--shadow-card)]`; the active door's underline
→ `--brand-clay`; the dark bar's `text-bamboo` labels → `text-chalk/75`; skill map's white ink on a state fill → `--panel`.

## Three readings of the scope no proof can observe (agreed with the orchestrator, 9 Nov 2026: "lock as is")

1. Line 2, "`screens.spec.ts` is re-baselined once": it has no committed baselines (it saves screenshots to the test output
   and never compares them), so there is nothing to re-baseline. Covered by `screens.spec.ts` passing (line 9) and the
   before/after screenshots on the pull request.
2. Line 2, "the nearest token with no change of layout": covered by the committed map above and `screens.spec.ts` passing.
3. Line 7, "the stock look is gone": every shadcn theme variable points at a tokens.json name, and a Button/Tabs screenshot
   baseline is tracked and changed in this slice. `git add -f` only for files under a `*-snapshots/` folder that show the
   primitives, never anything with a child's name or page data.
