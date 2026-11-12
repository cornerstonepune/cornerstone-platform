# CP-46: undo CP-45's Postgres pin: it was not the cause

**What.** CP-45 pinned CI's Postgres to 17.11 because the paper-screen speed test (p6, budget 2500 ms) was fast with 17.11 and slow with 17.12 in five runs, and one pinned experiment run (dispatch, 19:20) measured 386 ms. After the pin merged, main's run on 1eb03b9 (20:03) installed 17.11, confirmed in its log, and p6 took 3500 ms and 3551 ms. So the version is not the cause. Remove the pin so `bin/ci-postgres` says only what is true.

**Done when.**
1. `bin/ci-postgres` is as it was before CP-45 (installs `postgresql-17` unpinned); `git diff` against the commit before CP-45's shows nothing for that file.
2. The record says what was found and what is still unknown (docs/notes/cp-46-undo-pg-pin.md).

**Out of scope.** Finding the real cause of p6's 10x spread; the budget (never loosened).
