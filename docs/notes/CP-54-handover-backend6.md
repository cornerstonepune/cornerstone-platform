# CP-54 handover: backend session 6 (17 Nov 2026, 15:10 UTC)

Read first: docs/notes/standing-orders.md, CLAUDE.md, CP-54-handover-backend5.md, this note, CP-54-sl-gap.md, CP-54-lo-v5-draft.md,
CP-54-coordinator-links.md. Orchestrator: session_01KEBF26AbSER2xbWPJjbrmX. Spend so far this session: Rs 0 (CP-54 total about Rs 3,660 of Rs 12,700).

## Done
- #858 merged as d858740: skill-link code rule (`skill_link_gap`, lists.json `max_gap_words` 2, `gap_ignore`, `gap_words_said`).
  Effect measured offline: none of the 32 gold picks can stay high; links are low with code's sentence. Orchestrator: leave as is.
- v5 wording drafted (CP-54-lo-v5-draft.md); `marked_good_gold.json` = 28 good-if-marked twins of planted P1/P2, NOT wired into evals.
  All 28 planted P1/P2 have no assumption written; 17 of 28 say medium or high. Waiting on Nimish's answer about P1/P2/P3.
- Free analyses, reported to the orchestrator: 1,037 in-scope statements with no linked objective (Cambridge 730, NCERT 118,
  NCF 189 competencies); with at least 2 shared words, same-grade 273, grade-agnostic 496 (127 at 3 words).

## Open, in order
1. After 'deploy engine' succeeds on d858740 (check the run; a scheduled check fires 15:20 UTC in session backend6): dispatch
   `skill_tune_sl` (about Rs 85), report flow_run cost and live counts. If clean >= 0.80 run `skill_held_sl` (<= Rs 100); only if it
   passes its bars switch skill-link on and run `skill_link_lo` (155 skills, about Rs 32, inside the Rs 1,500). If clean < 0.80: stop, report, no loop.
   Never dispatch while a deploy is pending. Merge rule: merge only when the orchestrator says so.
2. Build the statement matcher as its own PR (orchestrator approved, core CI only, no per-statement validator). Pattern: `w1_bank/lo_match.py`
   (shortlist in code, model picks, code refuses a pick not on the list, answers are proposals). Differences: the shortlist is GRADE-AGNOSTIC (Nimish, 17 Nov):
   same subject for Cambridge (ENG, NUM, SCI), NCERT/NCF by their `area` (eng/language -> ENG, math/mathematics -> NUM, evs/world-around-us -> SCI,
   others unrestricted), live objectives of any grade K2-G4, top 8 by shared content words; only statements with >= 2 shared words go to the model,
   the rest are code-marked 'no match'. The model picks up to 3 with a relation meets / partly_meets / extends; the grade is each objective's `band`
   (no new column). Rows go to `objective_statement` with source 'machine'. New prompt row `statement_match` (rule 2: a row, not a string) with an eval
   (rule 7) before it is active; map entries in workflows.json first (test_layout). No Cambridge/NCERT/NCF wording in git.
   SQL used for the shortlist numbers is in this session's report 5 (inverted word join: unnest statement words and objective titles, join on word).
3. Then run the 40-statement SAMPLE on the server (about Rs 14, ceiling Rs 25) and send the orchestrator a plain list in the message only (statement, objective(s),
   relation, grade). Do NOT run the full 1,037 until the orchestrator relays approval.
4. Release the learning-objective work only after Nimish answers P1/P2/P3 (wire `marked_good_gold.json` into `clean` in `engine/skills/evals.py`, bump SKILL.md to v5).
   No LO tune or held run before that.
5. Coordinators: two loose gold links (ADD.3D3D, MUL.TENS) are listed in CP-54-coordinator-links.md.

## Tools note
The Supabase tool is SELECT only (standing orders). It was renamed mcp__Supabase__execute_sql after a reconnect; project id ruznbyngtfjsaymuylhm. A heavy cross join
closed the connection once; use the inverted word join.
