# UI-15: Web security: staff actions need the coordinator group, Next.js security upgrade

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/529
Scope locked by: Nimish (the label scope-locked on the GitHub issue, or the scope text quoted below)

Tier 3 (security). Waits for: nothing; goes right after UI-1, ahead of any screen slice. Lane: apps/web only.

## What

Two small fixes to the website that should not wait for the new screens. (1) The actions on the staff page act for any signed-in member of staff; each must check that the signed-in person is in the coordinator ("everything") group before it changes anything. (2) The website runs a version of Next.js that has published security advisories; upgrade it to the fixed version.

## Done when

1. Each action in `apps/web/app/(app)/staff/actions.ts` that changes data (add a person, set classes, set subjects) refuses a signed-in person who is not in the coordinator group: no row changes and no email is sent. Tested per action with the access fixture, as an educator and as a signed-out request.
2. A coordinator can still do all three, and the staff page behaves as before: the existing specs for it pass, with one change only: the signed-in person in `gate-password.spec.ts` (the "new member of staff ... first-time link" test) is made a real coordinator, since that test relied on the very gap this fixes.
3. The group check reuses the access groups the database already has (the same mapping the site uses elsewhere to decide who sees every class); no role name is written into the code.
4. The `next` version in `apps/web/package.json` and the lockfile is at least the version the npm advisory database names as fixed for GHSA-2464-fhr4-w9xw and GHSA-673q-mjm6-r5xr (expected 16.4.5; the builder confirms it against the advisory text and records the advisory text and the version chosen in `docs/notes/UI-15.md`). A test fails if the lockfile's `next` is lower than the version recorded there.
5. Upgrading changes no page: the full browser suite, `u51`, `screens.spec.ts`, the journey test and `bin/check` pass, and `ux.frozen` in workflows.json has not grown.

## Out of scope

Switching the site to the restricted database login (backend). Any other advisory or dependency. New screens, colours, fonts or layout.
