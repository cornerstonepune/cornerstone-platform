VERDICT: PASS

# CP-0 amendment: independent verification (branch cp-0-plan-ids, commit 03f1979, on main 397dd21)

Independent athena-verifier, read through git refs. It ran proofs 2 to 4 against the branch's own files and recomputed the LOCK digest.

## Done-when
- 1 (id_prefix CP; next-id prints CP-1): MET. config.json unchanged; the orchestrator's checks.sh run shows check 1 PASS.
- 2 (plan lists exactly CP-1..CP-19 and CP-22, each with an issue titled by its ID): MET. Proof prints "plan = CP-1..CP-19 and CP-22, each with an issue". Live GitHub agrees: #496 is "CP-22: A draft goes live" and #493 is "CP-21: a broken build is found in minutes...".
- 3 (no status words in the table): MET.
- 4 (HANDOFF points to the plan as what remains, under 50 lines): MET (44 lines).
- 5 (fast checks pass): MET on the orchestrator's 5/5 checks.sh run.

## Scope
9 files, limited to the renumbering:
- the plan (CP-21 to CP-22 swaps, plus a history note on row 72);
- HANDOFF;
- notes/CP-11.md;
- the CP-0 spec, proof, check label, issue-title snapshot, LOCK and status.json.
No other scope rows, dependencies or tiers changed. The remaining CP-21 mentions are history notes, or say that PR #495 still holds the scope as specs/CP-21, to be renamed at build.

## Lock
The digest over spec.md, checks.sh and proofs/plan.py, recomputed, equals LOCK (1ea27e75...c4).

## Snapshot
36 entries, each holding only number and title. No personal data.

Risks: none. No secrets, client data, database, auth or permission changes.

VERDICT: PASS
