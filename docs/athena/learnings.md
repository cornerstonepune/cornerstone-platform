# What this repo has taught us


- 2026-11-08 [CP-21] A script that guards what it may touch needs an allow-list of one exact shape, matched whole: three deny-lists in a row each missed a way round (`?host=`, a path trick, a line break). Test the guard with crafted inputs, and match with bash `[[ =~ ]]`, not `grep`, which reads line by line. (evidence: five verifier rounds on specs/CP-21)
- 2026-11-09 [CP-23] Number a new migration just after origin/main's newest (for example one hour later), never from a hand-picked or clock date that sorts before it: main's are dated 2027, so `date -u` sorts first and `supabase db push` refuses it. Before pushing a migration, run `bin/check --db` with TEST_DATABASE_URL set to a local Postgres: it builds every migration with the seed and fails on a table with no owner, a stale `rules.json`, or the grade and rule tests. (evidence: CP-6, CP-8, CP-11 each lost a CI round on 9 Nov)
