# The Fortnight page is the grid (PR 2 after #709)

Nimish, 12 Nov 2026: "We don't need two different pages. This is where the freezing happens, where the movement happens, where rules are seen if they conflict when the movement is being shown."

`/timetable/fortnight/<n>` is now the lesson-block grid of the whole fortnight (week A and B), with:
- the state steps, coordinator only (Freeze, Align, Approve; Go live once approved) through the existing engine calls; the engine's refusal comes back in its own words;
- Move on the grid: the coordinator's click on a block chooses it, the second click on a block or a free slot chooses where it goes, then a reason and `POST /timetable/move`; Undo is a new row; the move form and the choice live in the address (`from`, `to`);
- clashes drawn on their blocks (red, a Clash chip, the rule's own words from `timetable_clash`) and listed under the grid as "Rules in conflict", each with its Accept and reason; no rule is in the page;
- every block links to its activity page when its lesson has one (`/setup/activities/<code>`); a lesson with none is a plain block, nothing invented. The page counts them: "129 lessons · 0 with an activity to open".
`/timetable/moves` is gone; the rail and the draft page point at the fortnight page; `screens.json`, `built.json`, `help.json` and `wireframes/moves.html` no longer name it. The plan-lines table, the state and hand-move cards and the board of fortnights are gone.

Also: the round Move button is gone (the click chooses); fixed periods draw as the thin time bands whether or not a session row was loaded for them (the engine gives such a period as `empty`); blocks carry Moved and Clash chips; the Timetable's filter row is one line at 1440.

What this PR does not do, and why:
- **The clash is drawn the moment the move is made, not the moment it is chosen.** The engine has no "what if" for a move (`POST /timetable/move` writes, then the clash read shows it); a preview needs an engine dry-run. Undo is one click.
- Drag is not built; choose-then-choose is.
- The Edit action on a block (CP-35, `POST /timetable/lesson/edit`) is left for a third PR.
- Which lessons have an activity is the plan's data (6 of 129 on live), not this page's.
- `docs/frontend/screens.json`'s `fortnight` entry still describes the old page (State, Plan lines, Hand moves); the spec text was not rewritten.
- There is no button for the last step (List sent).

Remaining differences from the Timetable wireframe, in `docs/screens/ui-fortnight-grid/` (wireframe left, built right): break bands carry the fixed period's own label ("Break"), not "Settling in"; the Fortnight page shows ten day columns, so its blocks are narrower than the wireframe's week; the cards and the by-subject table of the Timetable page are not on the Fortnight page; at 400 px the grid scrolls sideways in its own box and the "Timetable pages" fold shows in the trail.
