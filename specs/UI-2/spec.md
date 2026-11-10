UI-2: The blocks

Tier 2. Waits for: UI-13. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

### In plain English

A gallery page for the people who build the site, showing every part (the chips, the class grid, the charts, the folds) with sample data. Nothing a teacher uses yet; it is what the next slices are assembled from.

### What

The school's new blocks of SPEC §5, built once, each with sample data on a staff-only gallery screen (`blocks`) and screenshots in both themes; every chart drawn to scale from its data. AppFrame is built in UI-13 and the existing blocks moved onto the tokens in UI-1.

### Done when

1. For every block in screens.json `blocks` except AppFrame (UI-13), a file `components/<kebab-name>.tsx` exists and its root element carries `data-block="<Name>"` (the inventory test checks the list against the folder).
2. `/setup/blocks` (staff only, behind Setup's details link) renders every block with sample data; the inventory test on the `blocks` screen drives each block's behaviours from `element_kinds` (fold opens and closes; filter writes the address; grid cell acts; stepper states; chip icon+word) and screenshots each in light and dark at 1440 and 400 against committed baselines.
3. StatusChip draws every state in STATES with icon and word; a state without an icon does not compile (the existing test kept).
4. ClassGrid replaces `voice/board.tsx` and the voice form's tests pass unchanged.
5. Each chart block (StackBar, LevelBars, Spark, Trend, HeatGrid) is fed known data by a test and every text label in its SVG is a value or a date from that data; colours come from tokens only; a chart with no data renders its empty words, never an empty axis.
6. Details is a native `<details>`; a main action inside a closed Details fails the inventory test.
7. No file outside `lib/icons.tsx` imports from `lucide-react` (grep test).
8. KindTile exists and draws each of the seven kinds with its icon from lib/icons.tsx and its colour from the tokens; every rail link, card header and timeline entry in the gallery starts with one (DOM test).
9. A state chip placed on a tinted cell or square sits on the panel colour with a 1 px ring in its state colour (the gallery shows a Moved chip on an Arts cell and a To confirm chip on a Language cell; a screenshot baseline holds it), because those fills are within 5 of each other (CIE76) and the chip would otherwise vanish.
10. Every one of the 1 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
11. The blocks: there is one fold per entry of `blocks`, and a block with no sample fails the test
12. The blocks: the page is absent for an educator and linked only from Setup's details link
13. The blocks: its first section is the legend: every state with its icon, word and colour, every action with its tile, every kind of thing with its tile, the subjects and the shapes, all read from STATES and tokens.json, nothing typed
14. The blocks: the legend shows the four logo files with where each is used and the rules (no recolour, dark ground uses the tile, clear space a quarter of the mark, no stretch, rotate or shadow)

### Out of scope

Pages and their data.
