# Fix main (14 Nov 2026): the failures of main's run on #761

Branch `claude/gallant-bardeen-yi3uby`. Main's CI (run 43559571454, on #761) was red: shard 2 and 4 failed, shard 3 hit
its 30-minute limit.

## Fixed
- u38:120, u87:97: Design PR 2 moved a board card's class from its title to its one line under it
  (`class · date · n of m papers back`); the tests now read the class there and check the title does not repeat it.
  The KanbanBoard line in `docs/frontend/screens.json` says the same (SPEC.md and scopes.md rebuilt from it by `build-spec.mjs`).
- u81:161 (flaky): `boundingBox()` does not wait and was null for a box not yet drawn; the test now waits for both first.

- **Shard 3's 30 minutes (u70-inventory `curriculum` at 1440).** Two causes:
  - The runner's fold driver called `evaluate()` on a `<summary>` that was not drawn; that waits for ever, so one missing fold
    cost the whole 5-minute test, four times (two roles, a retry each). It now waits 10 s and names the missing fold, as every
    other driver does (`tests/inventory/checks.ts`).
  - The fold was missing because the question states (`@asks-answered`, `@ask-with-link`) opened `/setup/curriculum`, and since
    Design PR 2 the questions are on the `?view=asks` tab (`tests/inventory-setup-content.ts`).
- **Curriculum's inventory** (`docs/frontend/screens.json`, wireframe `curriculum.html`): the page's new controls added at the end
  of its list (so no wireframe index moves): the Approval filter (CP-51), the panel's Approve (CP-51; declared, not pressed, as
  Save is: pressing it would make the fixture's machine parts the person's, which the Edit fold is checked on), and each question's
  "What was drafted, and why" fold (Design PR 2). "each topic" is checked on English, a subject both roles see (the educator sees
  no K2).
- **today-coordinator** at 1440: `@today-wait` opened "Answers to check", drawn only when another screen had left papers to check;
  on a database without them the panel never opened and its five controls were missing. It opens "Questions to answer" (the seeded
  questions); the panel's Later → is checked on "Topics to mark as taught" (`@today-taught`, the seeded topics, more than ten).

- u38:212: the same title assertion as u38:120 (the class is on the card's line).
- Curriculum's inventory, second pass: "each topic" is checked on `subject=English` (the address carries the subject's name,
  not its code); the drafted fold is "each question's …" (ten on a page; one element without "each" took one of them); each
  table's Later → is told apart by its address (`?page=2`, `?view=offers&opage=2`, `?view=asks&apage=2`), or the list's Later
  took the one a tab draws.
- Curriculum's tab Laters are pressed before Yes and No: those answer two offers, and twelve less two is one page, so the
  offers' Later was gone by its turn. The list's Later comes after the tabs' (no fixed address: it carries the filters), so each
  tab's Later is claimed by its own element first. The wireframe's indices follow the new order.
- Question bank's inventory: its Approval filter (CP-51), with the wireframe `bank.html`.

## Verified
- `bin/check`: 67 passed, 4 skipped. `node docs/frontend/wireframes/check.mjs` (and `--gaps`): all clear.
- Local, fresh database (`bin/testdb fresh` on an empty server): u38, u87, u81, u70-inventory-proof and the whole of
  u70-inventory: 84 passed, 2 failed (Curriculum, both fixed above, rerun on its own).

## Not checked locally
- The specs after u70 in shard 3, which never ran on CI: the full CI run decides.
