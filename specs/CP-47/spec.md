# CP-47: the browser job prints the database's slow statements on every run

**What.** Today the browser job prints Postgres's log of statements over a second only when the job fails (`if: failure()`), so a passing run and a failing run cannot be compared: the paper-screen speed test (p6) took 0.4 s on some runs and 3.5 s on others on identical code, and only the slow, failing runs said what the database did. Print it every run.

**Done when.**
1. The step "the database's slow statements" in the browser job runs `if: always()`.
2. On this PR's full run, a passing browser shard prints that step's output ("no statement took over a second" or the statements).

**Out of scope.** A budget or any check; the cause of p6's spread.
