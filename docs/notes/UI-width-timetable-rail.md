# UI: full width, the Timetable door in the rail (follow-up to #688, #694, #695)

Nimish, 12 Nov 2026 (1920 px): the frame left ~180 px empty on each side, the Timetable's Live and Planning were plain text, the door's pages were behind a grey 12 px fold, Fortnight listed nine activities in its rail, and a green success-looking box said lessons "could not be read".

Done: no 1560 cap (bar, main, footer on the 24 px token gutters; only the purpose line keeps 62 ch); Live and Planning are tables (fortnight name a link, whole row opens its grid, Move lessons the row action); `components/timetable-rail.tsx` puts the door's other pages in the rail of every Timetable-door page, the fold is a bordered button and is put away only where a rail holds those pages (`globals.css`); Fortnight's rail is the few places it connects to and its plan lines are a table grouped by week; the engine's refusal is `components/grid-refused.tsx`, neutral, with the reason and the way on (no new engine call, no SQL); Children's rail gains Connected to and an honest empty Latest notes; the attention strip fills its row.

Tests: `u81-full-width` (new); `u79`, `u80`, `u53` follow the new markup at equal strength (fold read at 900 px).

Still not as the wireframe draws it: Fortnight's rail has no "Activities in the plan" box (asked for fewer links); Setup › What needs doing has no wireframe and no rail; the Timetable grid is not shown to a coordinator who holds no class until the school's head allows it in the engine (not changed here); u71-blocks baselines were not redrawn (the shared blocks draw the same at their sizes; CI will say if not); `u1-today` fails the same way on main (data count), not touched.
