# CP-54: the statement matcher (backend 7, 17 Nov 2026)

An outside statement is held against the school's live objectives of ANY grade (Nimish, 17 Nov). Code shortlists the top 8 of the
statement's subject by shared words (settings `stmt.*`); fewer than 2 shared words is "no match", written by code, no model call;
otherwise the model (prompt row `statement_match`, v1, inactive) names up to 3 with meets / partly_meets / extends. The grade of a
match is the objective's band. Matches are `objective_statement` rows, source `machine`, `proposal_id` = the run id (one run is
undone with `engine curriculum stmt-match --revert RUN`). A link a person or the school made is never overwritten.

Eval (rule 7): no statement has a school or person link, so there is no gold. `engine eval statement_match --version 1` scores
agreement with the earlier machine links as a REFERENCE (bars `eval.statement_match.agree` 0.60, `.shortlist_recall` 0.80,
`.refused_at_most` 0.02, set 17 Nov before any run; orchestrator agreed). Nimish judging the 40-statement sample is the real gate.

The server log of a run is public: the command prints codes and counts only, never a statement's words or a reason. Replies stay
in `flow_run.result`; read them with a SELECT.

Not done: the full pass over the 1,037 in-scope statements (waits for Nimish's judgement of the sample); `stmt_match` is not in the
run list on purpose.

## Skill-link: parked by Nimish (17 Nov); the next step when it is picked up
Tune 44114399216: gold 0.842, clean 0.312 (bar 0.80), catch 1.0; Rs 90.66. 30 of 35 validate calls failed; of the clean pairs, most
fail because the validator reads #858's code-written assumption (a list of leftover words) as "not a statement of what differs";
the rest are loose registry links (ADD.3D3D, MUL.TENS) and reasons that quote words the skill does not have.
Proposed fix, NOT built: (a) code writes the assumption as a sentence from the gap it already computes ("the skill does not name X,
Y; the objective asks for them"), and the validator is not asked to grade text code wrote; (b) a code check refuses a reason that
quotes words found in neither the objective nor the chosen skill, before any validator call. Eval: one skill_tune_sl (about Rs 90)
after merge and deploy. Lesson: never ask a model to grade what code wrote or what it was not shown.
