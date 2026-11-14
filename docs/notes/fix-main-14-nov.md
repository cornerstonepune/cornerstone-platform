# Fix main (14 Nov 2026): the failures of main's run on #761

Branch `claude/gallant-bardeen-yi3uby`. Main's CI (run 43559571454, on #761) was red: shard 2 and 4 failed, shard 3 hit
its 30-minute limit.

## Fixed
- u38:120, u87:97: Design PR 2 moved a board card's class from its title to its one line under it
  (`class · date · n of m papers back`); the tests now read the class there and check the title does not repeat it.
  `docs/frontend/SPEC.md`'s KanbanBoard line says the same.
- u81:161 (flaky): `boundingBox()` does not wait and was null for a box not yet drawn; the test now waits for both first.

## Open (being reproduced locally)
- u70-inventory `curriculum` at 1440 (both roles): each attempt hits the 5-minute test limit; four attempts ate shard 3.
- u70-inventory `today-coordinator` at 1440 fails (34 s).
- The specs after u70 in shard 3 never ran on CI.
