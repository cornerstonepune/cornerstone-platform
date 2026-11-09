PASS: all six Done-when lines are met; item 4 is met as tooling (the list on a copy of live data is a separate approval by Nimish).

# CP-13 verification (independent athena-verifier, second pass, 2026-11-08)

First pass said FAIL for three things, all since fixed: `checks/rules.json` regenerated from a migrations-only database; a school's tuned `state.min_adults` now moves to its grades before the row is deleted; item 4 judged as tooling only per the scope. Migration also made safe to run twice.

1. Repeating mistake clears: MET (proof 1; rule unchanged from main, locked by the proof).
2. Same adult counts once: MET (proof 2).
3. Minimum adults is a row per grade, 2 default, 1 for K2: MET (proof 3).
4. Every changing state is listed, Nimish says yes first: MET as tooling (proof 4: `graph_state_changes`, `engine graph --changes`, counts only, read-only, never rebuilds). The list from a copy of live data is NOT produced; `docs/notes/CP-13.md` says so.
5. Three signals distinct: MET (proof 5).
6. Confirmed evidence only, same twice: MET (proof 6).

VERDICT: PASS

Unasked work: none of substance. Departures: `workflows.json` not changed (its check accepts sub-commands, not flags); older docs naming `state.min_adults` left as history.
Risks: tier 3 destructive migration (drops `observed_rule.min_adults`, deletes the threshold row, values copied first); a non-whole tuned value would round.
Checks run: athena done CP-13 6/6; test_rules, test_graph_rule, test_calibration, test_k2_picture, test_layout, test_types (55 passed). Not run by the verifier: full engine suite, Playwright (no screen changed).
