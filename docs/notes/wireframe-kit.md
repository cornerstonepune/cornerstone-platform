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
- Open: `picture.done_when` (10 / 8 columns) disagrees with SPEC §2 rule 10 and §5 (8 / 3) and `picture.phone` (6); the
  pilot draws 8 / 3. Needs a decision before UI-3's test is written.
- Regenerating icons needs lucide-react at the site's version: `LUCIDE_DIR=<unpacked lucide-react@1.59.0>`.
