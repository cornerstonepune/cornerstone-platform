# CP-38: the check screen's page fingerprints are kept

## Verified
- `pytest tests/test_same_page.py tests/test_types.py tests/test_layout.py`: 20 passed (the 7 existing same-page tests unchanged, plus the new cache test).
- Not verified: that p6 now passes in CI (it measures about 2.8 s against 2.5 s on the frontend builder's report; the spec opens the screen once to warm it and measures the second open, which now hits the cache). `s4-validation-queue` "a right answer of a kind the reader is not yet trusted on waits, and settles in one ..." also failed on main run afd3d328; its cause is not looked at.

## Handoff
- Engine only, no database change; reaches live with the next engine deploy. The cache lives in the engine process (lost on restart); the first open of a scan still decodes.
