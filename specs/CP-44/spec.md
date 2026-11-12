# CP-44: main's lint is clean again

**What.** `npx eslint --max-warnings 0` fails on main (1242e39): `lib/menu.ts` `sectionsFor(_coordinator)` keeps a parameter nothing reads, since the sidebar is the same for every role. Remove the parameter and the caller's dead arguments.

**Done when.**
1. `npx eslint --max-warnings 0` in `apps/web` exits 0.
2. The sidebar is unchanged: every role still gets the same sections (the existing screen tests that open the menu still pass in CI).

**Out of scope.** The failing browser shard 3 (not yet diagnosed).
