# CP-68: design language v2

Issue #832. Approved by Nimish in chat on 17 Nov 2026 ("it does not make me want to come onto the platform": elevate the whole look by changing the core elements once, not page by page).

## What
The site's look changes in one place: the tokens (`docs/frontend/tokens.json`, `apps/web/app/globals.css`) and the shared components. No page's content changes.

- **Top bar:** the brand's dark (the warm basalt of the old menu; first drawn terracotta, changed on Nimish's instruction of 17 Nov: "let's keep a good dark colour"), white text, the page you are on as a terracotta pill, a quiet count badge. On a phone the bottom tab bar is white with the active tab in terracotta.
- **Colour:** white page, ink text, one accent (terracotta). The seven kind colours stay (teal child, indigo activity, violet objective, orchid skill, sky paper, slate period, stone note; Nimish: "bring the kind colours back, it still looks flat"), at least 20 apart from every subject and state colour. One fixed colour per subject, held as tokens and the school's own config row, used as dots, chips and lesson blocks. Every pair meets WCAG AA; the contrast document is regenerated.
- **Buttons:** primary is filled terracotta, one per view; secondary is a quiet outline; tertiary is text. No black slab button anywhere.
- **Card:** one look: 16 to 20 px inner padding, 12 px radius, hairline border, a subtle lift under the pointer; no box flush inside a box; cards never touch.
- **Type:** still three sizes and two weights, with more contrast: larger, tighter titles and a calm body. Counts in tabular figures.
- **Count chips and a small progress bar** for "n to do" numbers.
- **Motion tokens:** 150 to 200 ms ease-out for hover, expand/collapse and a panel opening; `prefers-reduced-motion` respected.
- **Empty state:** one line plus the one useful action.

## Done when
1. At 1440 px the top bar's background is the brand's dark token (the old menu's basalt, not black), its text is white, and the active page is a terracotta pill; at 400 px the bottom tab bar is white with the active tab in terracotta.
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

---

# 68b: one card, one spacing scale

**What.** Every box on the site becomes one `Card` component (`apps/web/components/cards.tsx`), whose look is one CSS rule (`.card` in `apps/web/components/blocks.css`). Hand-drawn boxes and one-off sizes are removed. No page's content or behaviour changes.

## Done when
1. `Card` is the only box: the card corner and the card shadow appear in CSS only in the `.card` rule (and the written exceptions: buttons, chips, the empty state, the token legend), and no class string in a page or component asks for its own rounded, bordered box (`test_one_box_the_card`).
2. The `.card` rule's padding is the 20 px step, a compact row's is 12 px by 20 px, its edge is a hairline and its corner is the card radius token (`test_the_card_rule_is_the_scale`).
3. No class string holds a one-off `[..px]` or `[..rem]` value; screen-width breakpoints are the only exception (`test_no_arbitrary_spacing_or_size_in_a_class`).
4. No inline style only repeats fixed values; a style that carries data (a bar's width, a place on a picture) stays (`test_no_inline_style_a_class_can_say`).
5. Raw px in a CSS padding, margin or gap is zero outside `docs/frontend/one-offs.json`'s frozen files and only shrinks (`test_css_spacing_is_the_scale_and_only_shrinks`).
6. In the browser, on Today, Timetable, Children, Assessments, Curriculum and Staff at 1440 and 400 px: every card keeps at least 12 px of inner padding unless it is a table or picture card, no card sits within 4 px of the edge of a card around it, and cards never touch (u90, in the core).
7. A card that is a link or a button lifts under a fine pointer, reading its time and curve from the motion tokens, and does not move under `prefers-reduced-motion` (u90).
8. A hand-drawn button in a component is the shared `.btn` style (`secondary` or `tertiary`).

## Out of scope
Tokens, the bar and the menu, the button, chip and empty-state components (68a). `setup/curriculum` (CP-67). Any change to copy, data or behaviour.
