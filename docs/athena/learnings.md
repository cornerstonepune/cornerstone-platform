# What this repo has taught us


- 2026-11-08 [CP-21] A script that guards what it may touch needs an allow-list of one exact shape, matched whole: three deny-lists in a row each missed a way round (`?host=`, a path trick, a line break). Test the guard with crafted inputs, and match with bash `[[ =~ ]]`, not `grep`, which reads line by line. (evidence: five verifier rounds on specs/CP-21)