# The site's type and its subject colours

Decided by Nimish, 9 Nov 2026, in the frontend-vision session: "I'm okay with the fonts that you're proposing and also the
colors."

## Decision

1. **Type.** Source Serif 4 for titles (a page's h1 at 32 px, a section title at 24, a small heading at 20; weight 600) and
   Source Sans 3 for everything else (lead 18, body 16, label 14, eyebrow and caption 12; weights 400/500/600). Both are on
   Google Fonts and already loaded by the site. Nothing under 14 px carries a status, a label or an action. Tabular figures
   wherever digits line up.
2. **Subject colours** come from the brand's material library, never a chart palette: Numeracy = monsoon, Language = bark,
   Arts and music = haldi (darkened for text), the fixed parts of the day = sand. A subject colour is a hue on a left edge, a
   tag or a timetable cell; it is never a judgement about a child.

The values are in `docs/frontend/tokens.json` (`type.families`, `subject-*`), mirrored in the design system
https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514.

## Superseded

- `design-system/PRINCIPLES.md`: "Source Serif 4 for everything" (Nimish, 21 Sep 2026). Titles keep the serif; the
  interface moves to the sans because tables of numbers and 14 px labels read better in it.
- D-073 (`docs/design-tokens.md`, R4): Jost for the interface, Cormorant Garamond for headings, Young Serif for the
  wordmark, Eczar for Devanagari. Not adopted for the site. Devanagari text, when it appears, needs its own face: not
  decided here; Eczar stays the candidate.

## Rejected

- One serif for everything: dense tables and small labels in a serif were the complaint behind the 21 Sep change in the
  first place, moved one step further.
- Jost + Cormorant: a thin display face at 24 px on white reads faint; two more font downloads for no gain a person would see.
- Blue / purple / green subject colours (used in the first sketch): outside the brand; the materials give enough hues that
  differ in lightness as well as hue.
