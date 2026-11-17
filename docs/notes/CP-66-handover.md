# CP-66 handover — the top navigation bar (PR #825)

State on 17 Nov 2026, branch `cp-66-top-navigation-bar`.

- **main merged in** (#822, core tests per PR). The two conflicts were the retired inventory tests
  (`tests/inventory/checks.ts`, `u70-inventory.spec.ts`): main deleted them, the deletion stands.
- **`u105-top-nav.spec.ts` is in the core**: its four tests carry `{ tag: "@core" }`, as #822 tags its own. The browser
  core is 38 tags against a budget of 120.
- **The browser suite had never run on this branch** before this push; the first run is the PR's core check.
- Specs that clicked Help, Sign out or the account name open the person menu first, through `you()` in `tests/menu.ts`.
  No spec reads `[data-sidebar]`, the drawer or the fold any more.
- **'Assessments' was clipped at 400 px**: five equal 80 px columns left 76 px, and the label is 77 px in semibold
  (measured: Source Sans 3, 14 px; 75 px regular). Fixed at the cause: the phone tab bar is now a flex row where each
  tab is its label's width plus an equal share of what is left (the five labels total about 290 px, so they fit at 320 px
  too). The label keeps the school's word. u105 test 3 now visits `/children/assessments` and fails if any label is cut.
