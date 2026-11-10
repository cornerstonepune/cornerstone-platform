# Wireframe revision 1 (issue #546) and the backend's data-gap decisions (issue #551)

Branch `cp-27-wireframe-revision-1`. Docs only: no app code, no schema.

## Verified

- `node docs/frontend/wireframes/check.mjs`: all 11 wireframes PASS, 28 blocks drawn once, all clear.
- `node docs/frontend/wireframes/check.mjs --gaps`: all clear (3 derived names left, each decided in #551).
- Spacing: `components.css` uses `--space-*` only; `check.mjs` fails a typed gap, padding or margin (proved by injecting `gap: 17px`).
- Not run: the app, `bin/specs`, a dark-theme pass on every page (checked on Today only).

## Decisions taken

- Spacing scale (4/6/12/20/32/48/64/96) lives in `docs/frontend/spacing.json`, not `tokens.json`: UI-14 holds `apps/web/design-system/tokens.json` byte for byte equal to `tokens.json`, and this change touches no app code. **Follow-up for the builder:** copy the values into `tokens.json`, run `node apps/web/scripts/tokens.mjs`, delete `spacing.json`.
- The issue says ten wireframes; eleven exist (the pilot `picture` included), all redrawn.
- ChildPeek lists newest first (the child page's Timeline keeps newest last).
- A tap on a child in a list opens the peek; "Open the child" inside it is the one route to the child page. On `confirm` a square still changes the mark.
- #551's column names are provisional (`provisional.json`); `check.mjs` prints a note for them.

## Handoff

- Open question for Nimish (#551): is "absences noted" enough, or does the school want a real daily register?
- Saved educator groups, the cluster computation and the ChildPeek merge query are backend gaps (`DATA-GAPS.md`).
- Batch 3 draws `assessments` with its board (lanes already in `screens.json`), and applies the peek, groups and fuller-page rules to the screens that list children.
- The "how they are doing" grouping rule on `children` (secure at least practising among skills seen) was the drawing agent's choice: confirm it.
