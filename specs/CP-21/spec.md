### What
Make platform's checks fail fast and say what really happened, and let a builder find browser-test failures before pushing.
1. The browser job gets a time limit, and a shard stops early after repeated failures (Playwright `maxFailures` in CI).
2. When a run is cancelled, the `browser` and `engine` roll-up jobs say "cancelled", not "failed".
3. `.claude/athena/preflight.sh` and its list of browser specs: runs the guard tests and the browser specs a change can touch, locally, as the restricted login, on a database with many rows, and prints timings per page.
4. A page slower than its limit fails the preflight. You choose the limit; my unverified suggestion is 3 seconds.

### Done when
1. `.github/workflows/ci.yml` gives the browser shards a `timeout-minutes` and sets Playwright to stop a shard after a set number of failures in CI. Shown by the workflow file and by one run that stops early on a deliberately failing spec.
2. A cancelled shard makes the `browser` and `engine` roll-up report "cancelled" in its printed line, and a failed shard still reports "failed". Shown by one cancelled run and one failed run.
3. `.claude/athena/preflight.sh` exists, runs in a cloud session and on the Mac, and exits non-zero when a guard test or a listed browser spec fails. Shown by one passing run and one failing run, with their output.
4. The preflight prints the seconds each page took and fails when a page is over the limit. Shown by one run that passes and one with a limit set below a real page.

### Out of scope
- Moving the full browser suite out of CI; CI stays the final check.
- The athena-build "ready" block, the no-stacking rule and the draft status: those are the harness scope (ATH-30).
- Fixing tests that are already failing.
