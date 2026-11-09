VERDICT: PASS

# CP-23 verification (PR #512), head 7caf734 against origin/main fa39922

Independent athena-verifier, reading through git refs. It ran proof 8 itself; proofs 1–7 were judged from their code and RUN.json (8 of 8 at 07:14:53).

## Done-when
1–8: MET.
- spec.md matches issue #508's current body word for word, including both narrowing notes. The LOCK digest recomputed equals LOCK.
- 1: bin/check adds test_grades and test_school_words with no database. The proof plants a "K2" file and a "Borrow" screen and requires a failure naming both.
- 2: the migration-order check already existed on main in bin/check. It fails on a version less than or equal to main's newest and on a duplicate; the proof plants both.
- 3–5: `bin/check --db` builds the schema from all migrations on a scratch database, runs apply_conventions, and fails on an ownerless table. It diffs rules.json read-only and prints "run `engine live rules --write`". It runs test_grades and test_rules with no skips.
- 6: the stop gate runs --db when TEST_DATABASE_URL is set.
- 7: without --db no database is used, in under 60 s.
- 8: the learnings card says it.

## Other findings
- test_rules.py is not loosened: it adds 4 imports and one row insert, and its 5 assertions are unchanged.
- DATABASE_URL is never used by the --db path. It creates its own scratch database and drops only that one.
- `fresh` now calls apply_conventions once more. It is idempotent.

## Advisories (to be fixed in the final push)
1. The localhost guard was a glob that `?host=remote` could bypass. It is replaced with a whole-string allow-list.
2. The stop gate's error filter was case-sensitive and hid psql errors.

Not run by the verifier: athena done, bin/check, bin/check --db.

VERDICT: PASS
