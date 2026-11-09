# UI-1: The test harness

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/516
Scope locked by: Nimish (the label scope-locked on the GitHub issue; text regenerated from spec v2.1, frontend-vision 0f308dc, 9 Nov 2026)

Tier 2. Waits for: nothing. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: (see docs/notes/frontend-landscape.md).

## In plain English
Nothing changes on screen. This adds the testing tools every later slice needs, so that finished backend work can be marked built and every later screen is checked in a real browser, including for accessibility. It should merge within hours.

## What
Only what the Athena loop demands before any interface change can be marked built (`athena finish` is refused repo-wide without it): the axe dependency, the journey harness and one passing journey spec, and shadcn/ui initialised with the two primitives used first. No page changes in this slice.

## Done when
1. `@axe-core/playwright` is a dependency of `apps/web`, and the journey spec runs axe on every step it visits.
2. `apps/web/e2e/athena-journey.ts` exists and one journey spec imports it, signs in, opens an existing page and passes, so `athena ui-ready` passes for the slice.
3. shadcn/ui is initialised (`npx shadcn@4.23.0 init`; `components/ui/` does not exist today) with Button and Tabs only; every other primitive is added by the first slice that uses it, and none is added unused. The stock look is left as installed; UI-14 restyles it.
4. `bin/check`, `test_ux_rules.py`, `u51` and `screens.spec.ts` pass; `ux.frozen` in workflows.json has not grown.

## Out of scope
Any change to a page, a colour or a font (UI-14); the frame and the inventory test (UI-13); new screens, blocks or queries.
