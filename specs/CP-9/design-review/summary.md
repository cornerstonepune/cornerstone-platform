# CP-9 design review (light: 4 reviewers)
Reviewers: zoom-out, design, implementation-readiness, codebase-details. Findings taken into design.md (marked R):
- Reuse the existing `POST /graph/rebuild` and `engine graph`; per-night Idempotency-Key; flow named f4.
- `nightly` moved out of pure `assess/` into `w3_read/nightly.py`; one transaction, advisory lock, failure row.
- Digests use a start-time watermark and a state digest; ledger kept (needed for read-only LIVE item 6).
- `hand_check` kept but append-only, written by an engine command that stores the system state at the time.
- "Real notes" counted from data with a config date; item 7 named a manual gate that cannot pass before people act.
- Unplanned: precedence fixed, security invoker, API model and test_k2_reads named.
- Item 5 scope limited to written answers; observed scale out of scope.
Not taken: dropping `hand_check` for a CSV (a mutable file proves nothing); dropping state columns from the ledger.
