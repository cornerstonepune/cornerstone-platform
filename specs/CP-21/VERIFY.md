# CP-21 verification (independent verifier, five rounds)

Spec: specs/CP-21/spec.md, locked. Proofs: 4 of 4 pass (`athena done CP-21`: ALL DONE 1/1).

- Done when 1: MET. `timeout-minutes: 30` on the browser shards and `--max-failures=10` on the shard's Playwright command, in CI only.
- Done when 2: MET. The `browser` and `engine` roll-ups print "cancelled" for a cancelled run and "failed" for a broken one; both still exit non-zero, and a cancelled shard does not turn the run green.
- Done when 3: MET. `.claude/athena/preflight.sh` runs the guard tests and the listed browser specs, exits non-zero when either fails, and is written for a Mac's bash 3.2.
- Done when 4: MET. It prints each page's seconds and fails a page over 3 seconds.

Findings fixed across rounds 1 to 4: the Mac argument handling, a local-database check before any role change, the plan reason passed to the roll-ups as a variable, then a strict one-shape allow-list for the database address matched whole (a line break could no longer pass).

Limits: the cancelled, failed and early-stop behaviours are shown by local runs of the real workflow lines and Playwright config, not by real GitHub runs; the Mac run was not tried; PG* environment variables are not checked by the preflight (documented in its header).

VERDICT: PASS
