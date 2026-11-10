# fix-u71-growth-speed

## Verified
- u71's `/growth?class=U71-BIG` over 1000 ms on main since 359baf0 is not UI-2's weight. On a clean copy both builds take
  160-200 ms a page. After all of browser shard 3, main's copy holds 28 classes and a page takes 0.9-1.5 s; 2d39ff9's holds 33
  classes and is as slow or slower (1.28-1.46 s). It passed there only because 30 or more classes switches u71 to its
  relative budget. Spec order and shard split decide which budget applies; the shard split moved when UI-2 added specs.
  Probe runs: the throwaway branch `probe-u71-timing`, workflow runs 42820778884, 42824293563, 42829184644.
- Cause: the menu's count (`tasksFor`, run by the layout on every page) called `topics(scope)`, which asks
  `skill_taught_in` (not inlinable: it pins its search path), `grade_ord` and an `exists` once per topic per class per skill,
  to learn which topics some class has not been taught. The cost grows with classes x skills.
- Fix: `untaughtTopics` (lib/queries-people.ts) reads the same answer as one join: a class's word on a skill is this year's
  `school_class.taught`, else `skill.taught`, else not taught. `topics` itself is unchanged (the Papers page still uses it).
- Not measured here: no database in the session. The equivalence is argued from `skill_taught_in`'s body
  (20270125250000_cp27_people_and_classes.sql); the browser specs on What needs doing (u62, u64, u65) and u71 are the proof.

## Handoff
- `generate` in lib/queries-todo.ts still calls `taught_in` per topic per class; if pages are still slow on a loaded copy,
  that is the next statement to read as a join.
