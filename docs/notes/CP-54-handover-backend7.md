# CP-54 handover: backend session 7 (17-18 Nov 2026)

Read first: docs/notes/standing-orders.md, CLAUDE.md, this note, CP-54-stmt-match.md. Orchestrator: session_01KEBF26AbSER2xbWPJjbrmX.
Nimish, 18 Nov: PAUSE all paid generation ("take a pause in terms of filling in all the things... get everything live that has been done so far;
once we start gathering feedback we will do that"). Nothing below has been run; each is a fixed run in `.github/curriculum/command.py`.

## Spend this session (flow_run)
skill_tune_sl Rs 90.66 | statement_match reference eval v1 Rs 22.23 | 40-sample v1 Rs 14.40. Total Rs 127.29. CP-54 about Rs 3,780 of Rs 12,700.

## Live and merged
#862 (the matcher: `stmt_match.py`, `cli_stmt_match.py`, prompt `statement_match` v1 INACTIVE, `stmt.*` settings, bars `eval.statement_match.*`).
Also merged, inactive prompt/config only, no spend: #871 (statement_match v1 in `llm.structured`, merge acf2839) and, with this note, #878 (v2 prompt, inactive; the fixed runs for the paused work).
No `objective_statement` row has been written by the matcher: every run so far was a dry run (`--gold`, `--sample`).

## The paused runs, exact order (dispatch ONE at a time, never during a pending deploy; Actions > "curriculum run" > the name)
Before any: #871 and #878 merged, `deploy engine` green on that commit, then `load_settings` (so the v2 row and `llm.structured` are live).
1. `stmt_match_gold_v2`: reference eval of v2, about Rs 22. A reference, never a gold (the 100 earlier links are machine-made and G3-only);
   expect it to miss the bars again; do not loosen a bar.
2. `stmt_match_sample_v2`: the same 40 statements as v1, about Rs 14, ceiling Rs 25. Build the plain list from flow_run (statement words via SELECT:
   never print Cambridge words in a log or in git), grouped A right / B plausible / C weak / refused / none, and compare with v1: A10 B8 C7 refused 1 none 14.
3. Pick the better version by weak matches and refusals (v2 if its C is smaller and A is not smaller).
4. Full pass, only after Nimish has judged the sample: `stmt_match_all_v1` or `stmt_match_all_v2` (776 askable of 1,037, about Rs 280).
   Built in: `--max-inr 400` (stops past Rs 400), `--max-refused 0.02` (stops after 25 asked if over 2% are refused; the run goes red). It writes
   `objective_statement` rows, source `machine`, `proposal_id` = the run id, never over a person's or the school's link; a statement already linked is not asked.
   Undo a whole run: `engine curriculum stmt-match --revert <run id>` (run id is on the last log line; no fixed workflow run exists for it, ask for one if needed).

## Facts a next session needs
- Reference eval v1: recall 0.351 (bar 0.80), agree 0.175 (0.60), refused 0.035 (ceiling 0.02). Cause of the refusals was a misspelled field: fixed by #871.
- 40-sample v1, by my reading: A 10, B 8, C 7, refused 1, none 14; about 35 of 45 picks were partly_meets. 2 of the 14 none (objects in patterns to 10; human
  organs) looked taught by the school but shared at most 1 word with any objective, so no model was asked: a possible shortlist gap (words only), not a model fault.
- The log of a run on the server is public: the command prints codes and counts only.
- Skill-link stays PARKED (Nimish). Proposed next step, not built, is in CP-54-stmt-match.md. Learning-objective fixes belong to another session (cp-54-lo-code-checks).
- LO v5 wiring waits on Nimish's answer about P1/P2/P3 (CP-54-handover-backend6.md).
