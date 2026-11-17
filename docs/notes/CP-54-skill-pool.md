# CP-54: the skills' model calls go out together (17 Nov 2026)

Runs were ~12 minutes a skill because each call waited for the one before. `engine/skills/pool.py` runs one function over a list on a bounded
thread pool (setting `skill.workers`, 10) and returns results in the input's order. Used by `skill eval` (all four measures' calls at once),
`skill seed-goods` and `curriculum chain-link` (every job at once).

- Spend stop stays exact: `spend.capped` reserves each call's worst-case price under a lock before it is made (flow_run's total + calls in flight
  + this one <= ceiling); a stop begins no call after it; calls already in flight finish and are on record.
- Rate limits: the Anthropic SDK retries 429/5xx with backoff; raised from 3 to 6 retries for the burst. Lower `skill.workers` if 429s show.
- Not done, on purpose: several items in one call. That changes each skill's prompt contract, so it needs a new prompt version and its own
  eval (rule 7); it is a decision for after the first scored runs.
- A deploy kills a run in flight: seed-goods now saves its kept answers once, when the run ends (a run is minutes, and deploys wait for runs).
- Tests: `tests/test_skills_pool.py` (order, overlap bound, stop, failure kept as the item's own, the ceiling with ten calls in flight).
  `test_chain_choose.py` answers each job from its own replies: calls of different jobs no longer have an order.
