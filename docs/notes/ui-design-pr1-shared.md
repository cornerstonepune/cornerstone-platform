# UI design PR 1 — the shared pieces (13 Nov 2026)

Nimish, 13 Nov 2026, on five live screenshots: grids misaligned, filters crowded, boxes touching lines, the right panel useless on
most pages, the left menu bleak, text too small, the site opening on an old skill list. This PR fixes the pieces every page is built
from; the five pages themselves (Timetable, Assessments, Question bank, a question, Curriculum) are PR 2.

## What changed

- **Spacing:** revision 1 (approved 9 Nov, issue #546) was in the wireframes only; the site now reads it from `tokens.json`
  (4 / 6 / 12 / 20 / 32 / 48 / 64 / 96). `spacing.json` is gone.
- **Colour:** the page is a warm off-white (`ground` #faf8f4), cards stay white; a new `menu` token is the sidebar's sand ground.
- **Menu:** each section's icon in a tile of its colour (clay, numeracy blue, child teal, objective violet, olive); the current page
  filled with its section's tint (the 3 px clay side stripe is gone: impeccable bans side stripes); section names in sans.
- **Right panel:** only when something is open. With nothing chosen, Screen draws the page's numbers as a band under the title and its
  other facts at the foot; the "Choose X to see it here" hints are gone. Charter A2 and DESIGN.md say so.
- **Numbers:** every StatTile is one compact pill (number in its state's colour, words beside it), never the big-number card.
- **Filters:** one white bar; each filter a rounded chip with its label inside, at most 15 rem wide; search at the end; on a phone the
  bar scrolls sideways instead of stacking.
- **Text:** every 11–15 px size in the app moved to the token scale (caption 12, label 14, body 16); the global h1–h3 rule moved into
  the base layer so a heading's own utility wins.
- **Home:** `/` redirects to `/today`. The old skill list moved to `/setup/curriculum/skills` (Curriculum links to it); its tests follow
  it. It merges into Curriculum's redesign in PR 2.

## Checks

`bin/check` green; `tsc` and `eslint` clean; screenshots at 1440 and 390 of Today, Timetable, Fortnight, Assessments, Question bank,
Curriculum, Notes and Staff reviewed before the push.
