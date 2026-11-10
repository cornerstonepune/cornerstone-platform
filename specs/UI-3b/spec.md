UI-3b: Children, the class picture and where a child is

Part of #518 (UI-3, the K2 walk, split in three on 10 Nov 2026: UI-3a the notes loop, UI-3b children, UI-3c teaching pages). Closes #544.
Tier 2. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json (`children`, `picture`, `child`); wireframes: docs/frontend/wireframes/children.html, picture.html, child.html.

### In plain English

The Children door opens straight onto a table of the educator's own children (a coordinator sees every class): how each is doing, when last seen, and the absences noted over the last school days. A toggle shows the same children as a class picture, one skill at a time, with clusters of children who share a place. Tapping a child shows their recent history beside the page; opening them shows where they are on every skill.

### What

The three screens on the blocks of UI-2, in the frame of UI-13. The old K2 addresses (`/k2`, `/k2/[class]`, `/k2/[class]/[roll]`) answer 308 to the new ones. No table is added, no migration, no config row.

### Done when

Each line is proved by a test in `apps/web/tests/u72-children.spec.ts` (and the inventory run `SCREEN=children,picture,child`).

Children (`/children`)
1. An educator's table lists their own children; a coordinator sees every class, with a class filter.
2. The class column and the class filter appear only when the person has several classes.
3. The how-they-are-doing bar has secure, practising and not-seen segments that sum to the class's skill count; there is never a red segment.
4. Searching a Sr. No. or part of a name narrows the rows and writes itself into the address; a reload keeps it.
5. The absences-noted column heads "Absences noted"; a noted absence is a grey cell with its word, a day with no confirmed lesson is blank and never reads "present".
6. A child's name opens ChildPeek; its "Open the child" lands on the child page; the toggle opens the class picture and the picture's toggle returns.
7. Grouping by class, by how they are doing or by needs attention puts a heading and a count over each group; the counts sum to the rows and a child is in exactly one group.
8. ChildPeek shows the child's recent history newest first, each entry with who and when; Escape closes it and focus returns.

Class picture (`/children/[class]`)
9. Each square shows the Sr. No. and the child's name, no photo; squares are in Sr. No. order, 8 to a row at 1440 and 3 at 400.
10. The stack bar's counts equal the squares by state; an empty square's title reads "not seen yet", never "not secure".
11. Grouping by state puts a heading and a count over each group; the counts sum to the squares and equal the stack bar.
12. A cluster's count equals the chips in it; clusters are computed by code, never by a model, and a child may be in several.

Where this child is (`/children/[class]/[roll]`)
13. The header shows the name beside the Sr. No.; the address carries no name; no photo.
14. A paper's result and a voice note are on one timeline in date order; a correction is a new entry naming the one it replaces.
15. The graph's node count equals the skills the child was seen on and each node's state equals the table's; the graph's SVG is an image with a label naming the counts by state.
16. Tab reaches the graph's nodes in the table's order, each at least 44 x 44 px; at 400 the graph is not drawn and the list shows name, times seen and the state chip.

Access (all three): an educator never sees a class that is not theirs; the peek answers 404 for one.

### Out of scope

Anything in supabase/, packages/engine, config rows. A real attendance register (a school decision; the column says "absences noted", per #551). The Spark's fortnight history (the nightly run does not record class counts yet; the Spark shows its empty words). Activity, objective and skill screens (UI-3c). The notes loop (UI-3a).

Settled by the backend (#569, issue #565): notes waiting per child is the engine's `waiting_by_child` of `POST /voice/class-notes` (the person's own notes, a class they hold); "needs attention" reads the setting `children.attention_days`.
