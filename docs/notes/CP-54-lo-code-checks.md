# CP-54 lo-code-checks: branch note and handover (17 Nov 2026)

Branch `cp-54-lo-code-checks`, parent issue #775, orchestrator session_01KEBF26AbSER2xbWPJjbrmX. Spend by this session: Rs 0.
Read first: docs/notes/standing-orders.md, CLAUDE.md, docs/adr/0102, this note.

## What is true (checked on live `flow_run` and the seed)
- Tune run 17 Nov 12:34 UTC (validator v4): P1 0/6, P2 3/8, P3 1/8, P4 1/5 caught. Write Rs 39.6, validate Rs 182.0.
- Of the 9 tune cases that are neither P1-P4, the validator caught 6. It passed LO-G2-0492-CODE-3 (a list, which code
  already refuses), LO-K2-0613-1-other and LO-G2-0766-other. All 12 `CODE-*` cases are refused by today's code rules.
- Live: G1-G4 objectives all begin "The child" (1,667). K2 has 404 that do not (241 with a verb, 151 purpose, 9 topic,
  3 list). None of the 404 is a ':' list. The engine has no learning-objective write pass (chain-link runs capability,
  skill_lo and topic only).
- All 60 gold answers are syllabus-only rewrites with no assumption; 56 say medium or high.

## Built on this branch
- `engine/skills/lo_source.py`: `parts` / `part_inputs` (a list-type line is one job a part), `nearest` / `shown` (the
  same grade's closest objectives, rare shared words counting more), `seed_pool` (the eval's stand-in for live rows).
- `machines.write(..., seen=)`: what the checks are shown may depend on the reply. `rules_skills`: code refuses the same
  wording again, naming the code. `evals`: `_shown` on gold, clean and catch; `marked_good_gold.json` joins clean.
- Seed: SKILL.md v5 (standards 2, 3, 6), contract (`part`, `other_parts`, `nearest`), lists.json (`part_*`,
  `nearest_size`, `plain_words`, `nearest_from_seed`), 16 P3 cases moved to `code_cases.json`.
- Tests: `tests/test_lo_source.py` (7). Not in core.txt (the list is at its ceiling).

## Why the first brief's point 1 was changed (ADR 0102)
Code cannot decide repeats by word overlap: 1 of 10 planted repeats shares a unit with what it repeats, 5 of 10 use a
different verb, overlap 0.17 to 0.60; at 0.8 code refuses "writes the number 1" against "writes the number 2". The
shortlist holds the repeated objective for all 10, so the validator is shown it and judges.

## Open, waiting on the orchestrator (reports 1 and 1b)
A. Unflagged assumptions: "every syllabus-only rewrite must be low + assumption" refuses the school's gold; proposed
   instead: code demands the flag only when the source line triages as `purpose` (config `lo.triage`). NOT BUILT.
   Then the P1 planted cases move to `code_cases.json`; P2 stays the validator's.
B. Catch counts a planted case caught when code refuses it or the validator fails it. NOT BUILT (evals.evaluate).
C. Three P3 cases are not ':' lists (`NOT_A_LIST` in the test): leave unsplit, or split "verb and verb".
D. The shortlist design above (built; one word from the orchestrator removes it).
E. The real run: which rows (K2's 404, or all), and a job builder + `chain-link` kind + `curriculum-run` entry for it.
   NOT BUILT. It must run a unit's jobs in order so each written objective joins the pool of the next.

## Then, in order
DECISIONS-LOG row once A-D are settled; merge on the orchestrator's word; after a green deploy `skill_tune_lo`
(bars unchanged: gold 0.70, clean 0.80, catch 0.75, smoke 0.80); held only if all pass; stop and report on a failure.
Known debt, not this branch's: `rules_skills._same` drops non-Latin letters, so the sibling check cannot tell two Hindi
vowel marks apart.
