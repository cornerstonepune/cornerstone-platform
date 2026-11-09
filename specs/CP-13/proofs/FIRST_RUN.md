# CP-13 proofs: first run against main (2026-11-08, commit 0818ee3)

Run: `python3 .claude/athena/bin/athena done CP-13` (throwaway Postgres 16 built from all 130 migrations; about 67 s).

| Item | Check | First result | Why |
|---|---|---|---|
| 1 | a mistake absent from recent answers stops repeating | PASS (regression lock) | `graph_level_window` already reads only the last `state.window_answers` answers; the proof isolates the window (later answers wrong with no code, so no right answer clears it) and has a still-repeating control |
| 2 | two notes by the same adult count as one | PASS (regression lock) | `count(distinct seen_by)` on the written graph and the `who` array on the K2 observed path; controls with a second adult give 2 |
| 3 | minimum adults is a grade row, 2 default, 1 for K2 | FAIL (expected) | `grade.min_adults` does not exist; `observed_rule.min_adults` and `state.min_adults` (seed and function source) still exist. The static no-literal test passes already |
| 4 | the list of states that would change, counts only, nothing applied | FAIL (expected) | `public.graph_state_changes` does not exist; `engine graph --changes` exits 2 ("No such option") |
| 5 | blank, wrong, wrong-with-working stay distinct | PASS (regression lock) | `confirm_results` / `answer_evidence` store three distinct `(correct, codes)` shapes; blank is not counted in `n_events` |
| 6 | rebuilt from confirmed only, same twice | PASS (regression lock) | `graph_answer` reads `confirmed_by is not null`; unconfirmed rows that would make the child `patterned_error` change nothing |
