# UI-1 design: the test harness

Design of record: `docs/frontend/SPEC.md` v2.1 (frontend-vision 0f308dc), generated from `docs/frontend/screens.json`.
The design review (stage 5, two fresh reviewers: `specs/UI-1/design-review/zoom_out_report.md`) led the spec owner to split the first slice so that this one carries only the test harness. Stages 6 to 8 were not run: Nimish chose to build rather than keep reviewing (recorded departure).

## What this slice is
The three things `athena finish` demands before any interface change can be marked built: the accessibility checker, the journey helper with one passing journey, and shadcn/ui initialised with Button and Tabs. No page changes.

## Decisions (mechanical, with reason)
1. The one journey spec signs in and opens an existing page; it is a harness proof, not a user story. Reason: the scope says so.
2. shadcn is left as installed (stock look); UI-14 restyles it. Reason: the scope says so; colours are a later slice.
3. `bin/check`, `test_ux_rules.py`, `u51`, `screens.spec.ts` stay as they are; no rule is touched here. The old rules are replaced in UI-13 (Nimish, 9 Nov).
4. shadcn's init normally rewrites `globals.css`. Here it may add its variables and imports only; it must not add or change any rule that alters how an existing page looks (`screens.spec.ts` passing, done-when 4, is the guard). Reason: "no page changes in this slice"; the restyle is UI-14.
5. "shadcn@4.23.0" cannot be proved from what init leaves behind; the proof checks the two files and `components.json`, and the pinned version is recorded in the pull request. Reason: unprovable by file; accepted.
