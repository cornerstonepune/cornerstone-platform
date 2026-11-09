# M1-12r: the bars Nimish accepted, v3 on, and the run scoped to the 281

## Verified
- Held-out run 31 (read free by `map_replay_held_out`): 245 of 427 activities reached (the stage cap ended it; in code order; 182 never read):
  skill_all_right 0.80 (132 of 165 passes; 95% interval 0.732 to 0.854), skill_found 0.784, auto_passed 0.673.
- Nimish, 8 Nov: "80% bar is alright ... educators will change it if required"; quality over usage. Bars now: skill_all_right 0.80 (was 0.90),
  skill_found 0.75 (was 0.85), auto_passed 0.60 (unchanged). Lowered AFTER the result, by him; recorded in DECISIONS-LOG 2026-11-08 and in the rows' descriptions.
- `curriculum_map_propose` v3 `active`; validator v2 stays off (`map.use_checker` 0: on the dev run it added no signal).
- 871 versus 281: `propose` called the proposer for every activity with any gap (no skill, no objective or no level words: every K2 activity, 871 on
  live). `--kind skill` calls it only for activities with no skill link, records only skills and their offers, and `--estimate --kind skill` prints the
  count and the proposer price. `map_propose` and the `forecast` run both use it.
- Tests: `tests/test_map_kind.py`, run-command tests.

## Handoff
- After merge: `load_settings`, then `forecast` (free: the exact count and price), then `map_propose`. Links the run makes: `machine` + proposal id, revertible, shown check-me.
