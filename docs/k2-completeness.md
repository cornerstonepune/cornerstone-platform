# K2 completeness: the gap, the goalposts and the loop that closes them

Written 2026-11-12 from live numbers (read-only). This is the one list of what is missing for K2 and the proof that it is no longer missing. It is the goalpost for CP-48 (issue #736). Numbers are today's; the targets are "n of n". The school's own material grounds every maker (the Activity list, the planner, `cornerstone-brain` curriculum notes); Cambridge is not used for K2 (Nimish, 12 Nov).

## 1. The gap today and the goalpost

| # | Link | Today | Goalpost | Measured by |
|---|---|---|---|---|
| 1 | K2 teaching lesson → activity | 0 of 538 | 538 of 538 (FN10–FN17, kind not fixed) | chain check |
| 2 | activity → learning objective | 530 of 871 | 871 of 871 | chain check |
| 3 | activity → skill | 590 of 871 | 871 of 871 | chain check |
| 4 | activity → rubric levels L0–L3 all filled | 870 of 871 | 871 of 871 | chain check |
| 5 | activity → steps | 803 of 871 | 871 of 871 | chain check |
| 6 | activity → materials as a list (not free text) | 0 of 871 | 871 of 871 (or "none needed", said in words) | chain check |
| 7 | plan line → activity | 40 of 375 | every line linked, or said to match none | chain check |
| 8 | learning objective → skill | not counted yet | every objective an activity uses has a skill | chain check |
| 9 | rubric mark → evidence → child's graph | 0 observations | ≥ 1 end to end on live, then counted | chain check |
| 10 | attendance → child (K2) | 17 of 22 children | 22 of 22, the rest listed by roll | chain check |
| 11 | activity carries practical tags (group size, space, prep, duration) | none | 871 of 871 | chain check |

Teacher-flow items (frontend, not in the chain check): the lesson page's per-child form and voice-note button, the timetable grid with choose-an-activity and click-through, the time-by-subject page, the machine symbol and origin filter (CP-48 Done-when 10).

Blocked by CI, not by work: main is red on the paper-screen speed test, so nothing deploys (CP-43's attendance matching is merged and waiting).

## 2. How "done" is decided

`engine chain-check --grade K2 --fortnights 10-17` (CP-48 Done-when 8) prints each row of the table in words and exits non-zero while any structural link (rows 1–8, 11) is short of its goalpost. Rows 9 and 10 are reported on every run and become pass/fail the day real data exists (live has 0 observations today).

## 3. The loop that closes the gap

`engine fill k2` is one command, run by hand or on a schedule (n8n only starts it). It is not the retired goal runner: it measures, makes, checks and stores, then measures again.

1. Run the chain check. Take the shortest link.
2. Code lists the unfilled items for that link and, for each, the candidates (same grade and subject).
3. **Maker** (a prompt row per purpose) answers in a fixed shape from the candidates, the school's own words and the brain's curriculum notes, or says "none". Its model is a row.
4. **Code gate**: the answer's ids exist, grade and subject agree, shape complete, materials on the school's list, no name anywhere. A failure is refused and reported, never stored.
5. **Checker** (a different model, its own prompt row) sees the inputs and the answer, not the maker's reasoning, and says pass or fail with a reason.
6. Pass: stored, origin `drafted`, with the checker's verdict. Fail: the maker retries with the reason, up to the retry limit. Still failing: not stored; listed as unresolved with its reason.
7. After each batch the circuit breaker is read; then step 1 again. The loop ends when the chain check passes or only the unresolved list is left.

## 4. Quality parameters (rows in `config`; the values here are proposals for Nimish to confirm)

| Parameter | Proposed | Why |
|---|---|---|
| `fill.retries` | 3 | one more try with the checker's reason, then stop |
| `fill.batch_size` | 25 items | small enough to stop early |
| `fill.max_checker_fail_rate` | 0.20 per batch | above it the loop halts and reports; the prompt is wrong, not the items |
| `fill.max_unresolved_rate` | 0.10 per batch | same |
| `eval.<purpose>` bar | ≥ 0.90 agreement with the exact matches (60 lessons name an activity today) | a prompt is not active before its score is in DECISIONS-LOG.md (rule 7) |
| `fill.sample_rate` | 0.10 per fortnight, read by an educator | a measurement, not a queue |
| `fill.min_sample_accept` | 0.95 | below it the loop halts and the prompt gets a new version |
| budget | the existing LLM budget (`adapters/llm_budget`) | a run ends cleanly when it is spent |

The 0.90, 0.20, 0.10, 0.95 are not derived from data yet: the pilot (a fortnight × one subject, about 20 items) is what sets them honestly.

## 4a. Evidence safety (not negotiable)

A lesson's activity of origin `drafted` is never taken as what was taught: rubric evidence defaults to a lesson's activity only when its origin is `school` or `person`; for `drafted` the teacher confirms the activity first. A new learning objective is made only together with its skill links.

## 5. Order of work

1. Pilot, then set the parameters above from its numbers.
2. Migration: `origin` on `learning_objective`, `activity_objective` and `session`; `tags` on `activity`; the chain check; the fill loop.
3. Full K2 run; chain check pasted in the PR; a Grade 1 dry run (CP-48 Done-when 9).
4. Frontend items as the origin and tag columns land.
