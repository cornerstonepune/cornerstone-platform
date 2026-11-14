# Fix main (14 Nov 2026): what main still lacked after #768

Branch `claude/gallant-bardeen-yi3uby`. Main's CI (run 43559571454, on #761) was red: shards 2 and 4 failed, shard 3 hit its
30-minute limit. #768 (another session, merged 14 Nov 07:0x) fixed the same failures in parallel: the board tests read the class
on the card's line; the inventory follows Curriculum's tabs, #763's Approval filter and Approve, and Today's paged row. This branch
was merged with main taking #768's version of every file both touched. What remains here is what main still lacked.

## What this adds to main
- **The inventory no longer hangs on a missing fold** (`tests/inventory/checks.ts`). `evaluate()` on a `<summary>` that is not
  drawn waits for ever, so one missing fold cost a whole 5-minute test, four times (two roles, a retry each): that is what used up
  shard 3's 30 minutes. It now waits 10 s and names the missing fold, as every other driver does.
- **The elements a state needs choose their controls first** (same file). An element of another state matched loosely by its
  words could take a control of this one: "panel: Skills" took the "Activities and skills" tab, which was then reported missing,
  depending on what else the page drew (reproduced twice locally, gone with the change).
- **Today's `@today-wait` opens "Questions to answer"** (`tests/inventory-fixtures.ts`), a row the seeded questions always draw.
  "Answers to check" is drawn only if another screen left papers to check first, so the panel's controls were missing or not by
  the order the specs ran in. (#768 moved Later → to `@today-taught`, as this branch had.)
- **Curriculum's "Lessons to confirm" tab is always drawn for the check** (#768 listed it; it is drawn only while a lesson of
  the screens' grade waits, so it passed or not by what other specs had left). The Curriculum screen now has `rest` fixtures
  `curriculum-rest` / `curriculum-gone` (`tests/inventory-fixtures.ts`): one lesson of the fixture class with no activity and no
  planner line, on a day no other spec uses, removed after the screen's run.
- **u38:212** still read the class from the card title (#768 fixed u38:120 only).
- **u81:161 (flaky):** `boundingBox()` does not wait and was null for a box not yet drawn; the test waits for both first.
- **The Question bank's inventory has its Approval filter** (CP-51), with the wireframe `bank.html`: the page draws it and the
  inventory reported it as an extra control.

## Verified
- `bin/check`: 67 passed, 4 skipped. `node docs/frontend/wireframes/check.mjs` (and `--gaps`): all clear.
- Before the merge, on a fresh database: u38, u87, u81, u70-inventory-proof and the whole of u70-inventory, then Curriculum alone
  with the checks.ts change: 25 passed. After the merge: see the PR.

## Not checked locally
- The specs after u70 in shard 3, which never ran on CI: the full CI run decides.
