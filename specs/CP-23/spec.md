# CP-23: bin/check catches the guards that fail CI

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/508
Scope locked by: Nimish (the label scope-locked on the GitHub issue, or the scope text quoted below)

## What
bin/check catches, before a push, the structural guard failures that today only show up in CI after a 15–20 minute run: a grade code in Python, a stale rules.json, a table with no owner, and a mis-numbered migration. Source: the independent backend audit of 9 Nov 2026 (findings F2, F3). Three PRs (CP-6, CP-8, CP-11) each lost a full CI round to these on 9 Nov.

## Done when
1. With DATABASE_URL and TEST_DATABASE_URL empty, bin/check fails when a .py file outside assess/ contains a grade code such as "K2", and when a screen says "borrow". It passes on main.
2. bin/check fails when a migration added on the branch (not on origin/main) has a version less than or equal to origin/main's newest, or when two migrations share a version. It passes on main.
3. With TEST_DATABASE_URL set to a local database, `bin/check --db` builds the schema from all migrations (the existing bin/testdb path, no bank load) and fails if a table has no owner (apply_conventions raises).
4. In the same setup, `bin/check --db` regenerates rules.json and fails when the committed file differs, printing "run `engine live rules --write`".
5. In the same setup, `bin/check --db` runs test_grades.py and test_rules.py with no skips.
6. `bin/check --claude` (the stop gate) runs the --db checks automatically when TEST_DATABASE_URL is set, so builders don't have to remember them.
7. bin/check without --db still uses no database and finishes in under 60 s.
8. docs/athena/learnings.md has a card saying a new migration is numbered just after origin/main's newest (for example one hour later), never from a hand-picked or clock date that sorts before it, and is checked with `bin/check --db` before pushing.

## Out of scope
- CI workflow changes; making CI itself faster; loading the bank in --db; changing any existing guard test's logic; tiers.json.

Tier 2 (bin/ is the default tier).

Line 8 corrected on 9 Nov, with Nimish's "yes", before the proofs were written. The earlier wording (clock-dated names) contradicted line 2, because main's migrations are dated in 2027. See the comment below.

Out of scope narrowed on 9 Nov (Nimish: UNLOCK CP-23 and "go"): --db loads the seed (`engine load`) but not the bank, because 5 grade and rules tests need seed rows and the stop gate would otherwise block every session with a test database.
