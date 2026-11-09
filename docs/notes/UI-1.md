# UI-1: the test harness: notes

## Proof amendment (Nimish, UNLOCK UI-1, 9 Nov 2026)
`specs/UI-1/proofs/watch.cjs` read `TEST_WORKER_INDEX` once at load. Playwright 1.63 sets it in the worker only after `--require` modules load, so the watcher recorded nothing and proofs 1 and 2 failed wherever a browser run was possible. The check now reads it on every module load. Only that file changed; spec.md, checks.sh and the other proofs are byte-identical to the lock.

Known gap: the amended proof still depends on Playwright setting `TEST_WORKER_INDEX` before the spec requires `@axe-core/playwright` and `@playwright/test`. A Playwright change to that order would make proofs 1 and 2 fail loudly, not pass silently.
Locked with `--regression` because the proofs all pass on the built branch.

## Left for later
- axe finds real violations on /today (colour contrast, nested interactive controls); `step()` records them and fails only with `strict=true`. Fixing them is UI-14 and later slices.
- The journey does not fail on today's violations by design; slices that touch a page pass `strict`.
