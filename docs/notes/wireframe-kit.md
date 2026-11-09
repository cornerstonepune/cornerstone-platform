# wireframe-kit

## Verified

- `node docs/frontend/wireframes/check.mjs` → `blocks.html: 26/26 blocks drawn once`; `PASS picture.html: 1440: 10/10
  elements, 8/8 bar, 48 controls; 400: 10/10 elements, 8/8 bar, 48 controls; 172 data-sources, 2 gaps`; `all clear`.
- `node docs/frontend/wireframes/check.mjs --gaps` → `25 gaps on 16 screens`; `all clear` (every gap has a row in DATA-GAPS.md).
- The checker fails on purpose when a control is removed, a hex is typed, a column is wrong, a removed table is named or a
  real-looking name is drawn (tried by hand on a copy of picture.html: 12 problems reported, exit 1).
- `schema.mjs` replays the migrations to 170 tables, the count CP-27 cites for today.

## Handoff

- Live: nothing; docs and tools only (no app, migration or engine change).
- Next: one wireframe per screen in screens.json, each through check.mjs and Nimish's approval (DESIGN.md §7).
- For the backend: DATA-GAPS.md (25 rows + 2 from the pilot).
- Decided: the class grid is 8 / 3 columns. `screens.json` picture (done_when, phone) and skill (phone) are fixed, and
  SPEC.md and scopes.md are regenerated with build-spec.mjs.
- The kit stays, as the reference UI-2 ports into components (the orchestrator, 9 Nov). The cut commit was reverted.
- Regenerating icons needs lucide-react at the site's version: `LUCIDE_DIR=<unpacked lucide-react@1.59.0>`.
