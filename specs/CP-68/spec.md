# CP-68: design language v2

Issue #832. Approved by Nimish in chat on 17 Nov 2026 ("it does not make me want to come onto the platform": elevate the whole look by changing the core elements once, not page by page).

## What
The site's look changes in one place: the tokens (`docs/frontend/tokens.json`, `apps/web/app/globals.css`) and the shared components. No page's content changes.

- **Top bar:** solid terracotta (the school's clay), white text, the page you are on as a soft lighter pill, a quiet count badge. On a phone the bottom tab bar is white with the active tab in terracotta.
- **Colour:** white page, ink text, one accent (terracotta). One fixed colour per subject, held as tokens and the school's own config row, used as dots, chips and lesson blocks. Every pair meets WCAG AA; the contrast document is regenerated.
- **Buttons:** primary is filled terracotta, one per view; secondary is a quiet outline; tertiary is text. No black slab button anywhere.
- **Card:** one look: 16 to 20 px inner padding, 12 px radius, hairline border, a subtle lift under the pointer; no box flush inside a box; cards never touch.
- **Type:** still three sizes and two weights, with more contrast: larger, tighter titles and a calm body. Counts in tabular figures.
- **Count chips and a small progress bar** for "n to do" numbers.
- **Motion tokens:** 150 to 200 ms ease-out for hover, expand/collapse and a panel opening; `prefers-reduced-motion` respected.
- **Empty state:** one line plus the one useful action.

## Done when
1. At 1440 px the top bar's background is the terracotta token, its text is white, and the active page is a lighter pill; at 400 px the bottom tab bar is white with the active tab in terracotta.
2. The page is white, and no button or link drawn as a button has a black (ink) fill on Today, Timetable, Children, Assessments, Curriculum and Staff; the main action is filled terracotta.
3. `node apps/web/scripts/contrast.mjs --check` passes: every pair in the contrast document meets WCAG AA, including white on the bar, the pill, the badge and each subject colour on its fill.
4. Each subject look has its own colour token, and which subject wears which is the school's config row, not a constant in code.
5. A card has a 12 px radius and 16 to 20 px inner padding; cards never touch and keep a scale gap (u90).
6. Text uses exactly three sizes and two weights (u90), and the title size is larger than before.
7. The count chip and progress bar components exist, draw whole numbers in tabular figures, and the bar says its value to a screen reader.
8. Hover, expand/collapse and panel transitions read their duration and easing from the motion tokens, and are removed or reduced under `prefers-reduced-motion`.
9. The empty state shows one line and at most one action.
10. The static scan (`packages/engine/tests/test_design_scale.py`) fails on a new raw colour, radius, shadow, transition time or inline colour outside the tokens; today's offenders are counted and frozen, and the list only shrinks.
11. u90 holds the new language and stays in the core.

## Out of scope
- Any change to page content, copy or behaviour.
- `setup/curriculum` page files (CP-67, PR #829, is building the Curriculum tree).
- Rebuilding the old pages that still use one-off classes beyond what is mechanical; they are counted and listed in the pull request.
- New fonts, dark theme work, new tables.
