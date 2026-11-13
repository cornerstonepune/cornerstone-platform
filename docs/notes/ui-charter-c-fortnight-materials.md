# ui-charter-c-fortnight-materials — the page charter's Part C: Fortnight and Materials

Spec: `docs/frontend/page-charter.md` Part C, rows "Fortnight (plan, freeze, move)" and "Materials".

## Verified

- Fortnight (`/timetable/fortnight/[n]`): no rail. The right side is the fortnight's own DetailPanel (`fortnight-panel.tsx`, inline,
  never closed): at its top the Stepper of the fortnight's states in the engine's words, the coordinator's next step (Freeze / Align /
  Approve) and Go live; then tabs Conflicts (accept with a reason) · Moves (the move being made, Cancel, Undo, the hand moves) · Draft
  (coordinator: Make a draft, each class's last draft, this class's unmet rules, a link to the draft grid) · Rules (what the draft reads,
  the Timetable rules link). The address carries `tab=`; every form comes back to its own tab. Held by `apps/web/tests/u98-fortnight-panel.spec.ts`.
- Materials (`/timetable/materials`): a Workspace. The lines grouped by day on the left; a line opens on the right (`?open=line:<id>`,
  `line-panel.tsx`): How many (quantity with Save, kept where, source, day; Remove) · Activity. With nothing chosen: lines · to confirm ·
  days. Add from the catalogue under the list; the school list stays a tab; Notes to read a filter whose panel links the review page.
  `/educator/materials` now redirects here (its controls moved), and the menu's Materials opens here. Held by
  `apps/web/tests/u99-materials-workspace.spec.ts`.
- Moved proofs: u74-timetable, u79, u80 (rail links → panel tabs), u74-materials and m1-09-materials (table rows → the list and the
  line's panel), u13-route-walk (the old address is a redirect).
- `screens.json` (fortnight, materials) and both wireframes redrawn together; `check.mjs` and `--gaps` clear; tokens and SPEC rebuilt.

## Handoff

- Live: nothing until merged.
- The Draft tab's Make a draft is proved by its form (action, fortnight, back); no local test runs the generator itself.
