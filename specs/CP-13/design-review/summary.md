# CP-13 design review: what each reviewer found and what was done

Reviewers (fresh, no history): zoom-out, codebase-details, implementation-readiness (three, kept light).

| Finding | Disposition |
|---|---|
| New `state_adults` table, trigger, fallback is more than item 3 needs; K2's number in two places (zoom-out) | Accepted: a `min_adults` column on `grade`; no table, trigger or fallback; `observed_rule.min_adults` dropped, one home. |
| D1 breaks more callers: `graph_state_of` signature, views, grants, four test files, docs (codebase) | Accepted: listed in D1; migration recreates the views and grants. |
| Wrong file for `engine graph` (codebase) | Fixed: `cli.py:113`, `assess/graph.py`. |
| Written graph never has an adult today (`seen_by` null), so item 2 cannot be proved there (codebase) | Accepted: D2 proves on the K2 observed path and on `graph_state_of`; edge case stated. |
| Extra proofs beyond Done-when (next_difficulty, padding, superseded) (zoom-out) | Accepted: dropped. |
| Item 3 had no "edit the row, see the result move" test (zoom-out) | Accepted: D6. |
| Proof-writer would have to invent names; no K2 recipe; no DDL for the list function (readiness) | Accepted: interfaces named in "What exists", D7 has the signature. |
| "Not applied" not provable as designed (readiness) | Accepted: stable, row-identical, CLI never rebuilds (D7). Kept as `check`, not `check_box`: it runs on the throwaway database; the human yes is not testable. |
| Reuse `_stale_graph` instead of a new function (zoom-out) | Contested: it returns rows, not counts by grade and transition; reason in D7. |
| Q1 fallback, Q2 normalisation (readiness) | Closed: column default removes Q1; `seen_by` is a staff id, no normalisation. |
| Items 1, 2, 5, 6 unverified as already met (all) | Kept as a stated hypothesis; the proof-writer reports which proofs fail on main. |
