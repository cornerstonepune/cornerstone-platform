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

## skill_goods, first run (17 Nov, serial build)
30 min, stopped at the ₹343 ceiling: kept 15 of 58, refused 20, 23 never started. 20 of 35 refused is systematic. `seed-goods` now stores each
refused case's last faults in `skill_goods_faults.<name>` and prints the fault rules by count, so the cause is fixed, not retried.

## The first scored run of the four skills (17 Nov, held half): the measures were wrong, not (only) the skills
gold/clean/catch/smoke: LO .60/.10/.94/0, capability-link .52/0/1.0/0, placement 1.0/0/1.0/0, skill-link .69/0/1.0/0. 4 min 35 s for all four; ~₹609.
- smoke 0 on every skill: no smoke case says `split: held`, so `--split held` ran none and the scorer returned 0.0. Smoke has no halves now.
- clean 0 on the three CHOOSE skills: the harness gave the validator a made-up "good answer" (reason "the coordinator's choice", confidence high, no
  assumption) and the validator, rightly, failed all 125. Clean now reads the skill's own pick where it agrees with the gold.
- learning-objective clean .10: the validator reads the standard's verb list as closed ("forms", "makes", "punctuates" refused); the code accepts any
  verb not ruled out (`_child_sentence`). A wording fix in SKILL.md (a new prompt version, with its eval), not made here.
- capability-link: all 60 gold and 40 planted-bad cases had `domain_default: ""`, which production never sends (`chain_choose.capability_jobs`
  fills it from `lo.capability_default` by the objective's subject_code). Filled the same way, by code, from each objective's live subject_code.
  The validator had failed every case on it ("domain_default is empty… yet confidence high").
- learning-objective v2: the verbs in the standard are examples; any verb a child does that can be seen or heard is fine (orchestrator, 17 Nov).
- Found, not fixed here (live data): many objectives' subject_code disagrees with their subject, e.g. 107 "Global perspectives" objectives coded ART.
