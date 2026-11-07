# ATH-25 trial: three builds of the Today screen (not for merge)

Route per build: `/trial/a`, `/trial/b`, `/trial/c` (apps/web/app/trial/). Same invented class, same fixed moment (Monday 9 November, 10:42), from `_data.ts`. No engine, database, login or real data; the real `/educator` page is untouched. The key from option number to build is in `KEY.json`.

## Counts (every build)
| Build | Impeccable 4.8.0 findings (live page, plus source file) | axe violations (wcag2a, 2aa, 21a, 21aa, 22aa; 390, 820, 1440) |
|---|---|---|
| a | 0 | 0 |
| b | 0 | 0 |
| c | 0 | 0 |

Reached after fixing what the first pass found in my own code: a stylesheet rule that overrode text colours, two clashing background classes, a thick coloured left edge, a cream page background, and a list holding a non-list child.

## Pinned skills (copies in `trial/skills-pinned/`; throwaway, never installed or wired into the harness)
| Skill | Repository | Commit | Licence |
|---|---|---|---|
| taste-skill (frontmatter name `design-taste-frontend`, v2.5.1) | https://github.com/Leonxlnx/taste-skill | f6b76575f949707b4e3c37cd86cb44b0b98643e8 | MIT (Leonxlnx, 2026) |
| UI UX Pro Max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | 0da327f37b436c173ce51177678b65ca92e6f3f7 | MIT (Next Level Builder, 2024) |

Repositories identified by web search and by the licence file in each clone. I did not verify the maintainers beyond that.

## What could not be done as asked
- **UI UX Pro Max**: its design-system generator is a Python script from the downloaded repository. The sandbox refused to run it (code from an external source), so I did not. I read its quick reference, skill text and data tables (colours, products, reasoning) and applied them by hand: calendar/scheduling style, flat, 150 ms feedback, tabular figures, one primary action, 44 px targets, status never by colour alone.
- **taste-skill** is written for company marketing sites (hero, photographs, sections, a browser gate). Only the parts that fit an app screen were applied: plain copy, a fact in the h1, one main action, equal edges, 44 px taps, a 2 px hover lift, no captions, no violet. Its gate and checker scripts were not run.
- **shadcn init (4.23.0)** rewrote `app/globals.css` and `app/layout.tsx` (it overrides the school's `--border` and `--radius`). Both reverted; its tokens are scoped to the trial in `app/trial/trial.css`. It also wired in an unrelated npm package named `cn`; replaced with `clsx` + `tailwind-merge` in `lib/utils.ts`. This is worth knowing if shadcn is adopted: its generated files need a review.
- Screenshots are `.png`, which `.gitignore` excludes; they were added by name with `-f` (fake data only).
- Dev indicator hidden in screenshots; the run needs `AUTH_DEV_BYPASS=1` with `next dev` (the existing dev switch, no code change). `trial/shoot.mjs` reproduces the screenshots and axe run.
