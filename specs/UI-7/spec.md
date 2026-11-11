# UI-7: Today (educator and coordinator)

Issue #595. Playbook #591. Screens: `today-educator`, `today-coordinator` (docs/frontend/screens.json).

## What
The first screen each person sees, on the shared blocks, beside the old "What needs doing" page (it holds controls no Today element lists, so it stays live until UI-7b swaps the address). One address, two versions chosen by what the person's group reaches. Doors to screens that are not built are not drawn.

## Done when
1. Both screens pass the ten generic checks and every element whose target is built behaves as its kind says (`SCREEN=today-educator,today-coordinator`).
2. The one count (the bar's Today badge) and the 308 of the old page: moved to UI-7b (they change the old page's tests).
3. The skills-to-approve count appears on neither Today.
4. The educator version goes to the own-classes group, the school version to the everything group; no code names a role.
5. An educator sees only sessions of classes their grant names.
6. Each tile's number equals the count of rows it opens.
7. The lit row is the session whose period holds the current time; before 08:30 none is lit.
8. Each board lane's card count equals the tile of the same name; an empty lane says so in words.
9. ChildPeek from "Your class": waits on UI-3b and UI-3c (pending, with reason).
10. School: only the 'everything' group sees it; no ranking of people; rows for work whose backend is not built do not appear.

## Out of scope
The swap of /today, the 308, the badge, `UI-7` in `merged_slices`, the old controls and their specs (UI-7b). Reports. Materials approval. supabase/ and the engine.
