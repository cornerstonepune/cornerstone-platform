# Fix main, part 2 (14 Nov 2026): main's run on #766 (43572629380)

Branch `claude/gallant-bardeen-yi3uby` (restarted from main after #766 merged). Shard 3 no longer timed out; its specs after u70
ran for the first time, and engine shard 10 failed on #770.

## Fixed
- **Engine `test_bars`** (#770): `eval.lo_skill_match.*` and `eval.plan_line_kind.teaching` were bar rows no `engine eval`
  purpose scored. The two commands' gold runs are now functions (`cli_lo_match.gold_scores`, `cli_plan_author.gold_scores`)
  shared by `--gold` and `engine eval` (`checks/evals.py` `BY_VERSION`), held to the bars; two bar descriptions name their
  DECISIONS-LOG row. Test: `test_the_two_gold_runs_are_held_to_their_bars_through_engine_eval`.
- **u74-materials 6**: since batch 3 (never "not found" on a holiday) a class the person may not read showed the holiday words.
  A class the address names that neither the day nor the week read gives is not found again; the menu's door names no class.
- **u71-blocks 12**: the allowed files name the skill list at its new address (`setup/curriculum/skills/page.tsx`).
- **u74-timetable 69, u75-timetable-b 56 and 130**: the week view shows today's week; on 14 Nov (a Saturday) that was the
  fixture fortnight's second week, and the move, the Tuesday and the holiday are in the first. The tests name their week.

- **u71-blocks 2 (×4) and 9**: every block is 16 px narrower since Design PR 1's spacing (336 → 320, 976 → 936). This machine
  does not draw as CI does (same blocks, other pixel counts, 1 px heights apart), so the 125 committed screenshots are CI's own:
  the `*-actual.png` of main's run 43572629380 (artifact `browser-shard-3-screenshots`, 14105866780), each identical to its
  retry's. This branch changes no block.

- `tinted-chips-dark`, which CI first drew on this PR's run 43576329904 (artifact 14107686086, identical to its retry). That run's
  shard 3 had no other failure: 254 passed, the 21 specs main never reached among them.
