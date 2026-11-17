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
