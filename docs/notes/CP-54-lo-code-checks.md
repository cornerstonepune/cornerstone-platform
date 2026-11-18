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
- Tests: `tests/test_lo_source.py` (8). Not in core.txt (the list is at its ceiling).

## Why the first brief's point 1 was changed (ADR 0102)
Code cannot decide repeats by word overlap: 1 of 10 planted repeats shares a unit with what it repeats, 5 of 10 use a
different verb, overlap 0.17 to 0.60; at 0.8 code refuses "writes the number 1" against "writes the number 2". The
shortlist holds the repeated objective for all 10, so the validator is shown it and judges.

## Rulings (orchestrator, 17 Nov, three messages) and what was done
- A. Purpose-only flag: ruled yes, but NOT built as a code rule, because the data refuses it: the `lo.triage` pattern
  calls only 5 of the 12 P1 source lines a purpose ("Makes children alert" reads as a topic, "Reinforces concepts /" as
  a list) and calls 9 reviewed gold lines a purpose, 8 of them medium or high ("Understanding quarter turn"). So P1 stays
  the validator's, which is shown the source and the confidence; standard 3 now says it firmly. Reported.
- B. Catch = the validator on what code cannot see. The 12 code-made cases moved to `code_cases.json` (a test proves
  code refuses each). The catch set is now 44: P1 12, P2 16, P4 10, other 6; 22 tune, 22 held. Bar 0.75 unchanged.
  Blind v4 caught 5 of those 22 tune cases; v5 shows `nearest` and words standards 1 and 3 firmly. No forecast is honest.
- C. The 3 non-':' P3 cases stay unsplit, in `code_cases.json`, in neither score: a question for Nimish (PR body).
- D. Shortlist approved. Code's own refusal is identical wording only (0.8 refuses "writes the number 1" against
  "writes the number 2").
- E. Real run = K2's 404 only. NOT BUILT; the next session's work:
  1. `engine/w1_bank/lo_write.py` (add to workflows.json first): jobs from live K2 rows whose title does not begin
     "The child" and are not retired; inputs as `seed_rows.rewrite_faults` builds them (grade, subject, unit as topic,
     text, rewrite true, siblings of the unit); `lo_source.part_inputs` per row; run a grade's jobs in order with
     `machines.write(..., seen=lambda r: lo_source.shown(inputs, r["text"], lists, own, pool))`, adding each written
     objective to `pool`; a job refused twice as "a repeat of <code>" ends as that, no row.
  2. A `chain-link` kind (or `engine curriculum lo-write`) with `--estimate` (code-computed: calls by purpose times
     the prompt's measured tokens, as `cli_chain._cost` does) and `--apply`; a `curriculum-run` entry. Apply nothing
     and dispatch nothing without the orchestrator's word.
  3. Forecast the extra tokens `nearest` adds, by code, before any paid run.

## Then, in order
Merge on the orchestrator's word; after a green deploy `skill_tune_lo`
(bars unchanged: gold 0.70, clean 0.80, catch 0.75, smoke 0.80); held only if all pass; stop and report on a failure.
Known debt, not this branch's: `rules_skills._same` drops non-Latin letters, so the sibling check cannot tell two Hindi
vowel marks apart.
