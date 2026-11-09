# What this repo has taught us


- 2026-11-08 [CP-21] A script that guards what it may touch needs an allow-list of one exact shape, matched whole: three deny-lists in a row each missed a way round (`?host=`, a path trick, a line break). Test the guard with crafted inputs, and match with bash `[[ =~ ]]`, not `grep`, which reads line by line. (evidence: five verifier rounds on specs/CP-21)
- 2026-11-09 [guard-checks] `bin/check` runs the no-database guards (grade codes in Python, school words); the database ones skip there and only fail in CI, a 15–20 minute round. Before pushing a migration: regenerate `rules.json` (`engine live rules --write` on a database built from migrations), name every new table in `workflows.json`, and run `athena done CP-1`. (evidence: test_rules, test_data_register and CP-1 proof 6 all skip with no DATABASE_URL)
