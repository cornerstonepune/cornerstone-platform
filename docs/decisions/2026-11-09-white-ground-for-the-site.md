# The site's ground is white

Decided by Nimish, 9 Nov 2026, in the frontend-vision session: "Let's keep the background as close to white as possible so
that it looks spacious. Use modern design language, use icons strictly, and make navigation extremely simple and intuitive."

## Decision

The page ground of the educator's site is white (`#ffffff`), with a near-white surface for panels and rails. This supersedes,
for the page ground only:

- `design-system/PRINCIPLES.md` (Brand Book, Edition 02): "lime wash 70 %" (`#F3EEE4`) as the ground;
- D-073 (`docs/design-tokens.md`, `apps/web/design-system/tokens.css`): `paper-warm` as `--bg`.

Everything else in D-073 stands: the five chips (D-062), the spacing scale, the tap size, the type scale, the contrast rule
(R5) and dark mode following the system (R6). The accent stays rationed and is never on a child.

## What follows from it

1. R5's contrast table in `docs/design-tokens.md` was measured against paper-warm. It must be re-run against white before
   any screen is built on the new ground; a chip that passed on paper-warm may fail on white.
2. The font question in `docs/design-tokens.md` ("Decisions this needs", item 1: Source Serif 4 against Jost and Cormorant
   Garamond) is **not** decided here. The walkthrough sketch used Source Sans 3 and Source Serif 4 only because they were
   already on the site; that is not a choice.
3. The clickable sketch that showed the white ground: https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74
   (private). The first screen built on white is F1 (one menu), in `docs/notes/frontend-vision.md`.

## Rejected

- **Keep the lime wash or paper-warm.** It is the brand site's look and the brand book's rule, which is why it was there.
  Rejected because Nimish, looking at it in the two vision pages, found it closed in and asked for space. The brand site
  keeps its own ground; this decision is for the working site only.
- **A dark ground by default.** Not asked for; dark mode keeps following the system (R6).
