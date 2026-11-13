# CP-48: fill K2 (part 1: skills, objectives, objective → skill, applied without a queue)

Spec #736 (approved 13 Nov). Nimish, 13 Nov: fill the whole K2 now, $50 limit, no queue; machine links marked and revertible.

## Verified (live, read-only, 13 Nov ~04:40 UTC)
K2: 871 activities; 281 no skill, 341 no objective, 68 no steps; 746 objectives, 0 linked to a skill; 375 planner lines,
40 linked; 538 teaching lessons, 27 with an activity (168 have no planner line). Forecast run 43367110478: 281 skill
proposals ≈ $3.28; 68 page drafts ≈ $1.21; $24.51 of the $40 campaign spent.

## What this branch adds
- `engine curriculum propose --kind objective | lo_skill` (each run stopped only by its own kind's history).
- `engine curriculum apply --fill`: also a link waiting for a person, as the machine's, never a "none".
- A new objective must be a sentence (≥ 4 words): "x" was accepted before and would have been written.
- Curriculum-run choices `map_propose_objectives`, `map_lo_skills`, `map_apply`.

## Handoff
Order on live after merge + deploy: map_apply → map_lo_skills → map_apply → map_propose_objectives → map_apply →
map_lo_skills → map_apply. Next: planner line → activity (part 2).
