#!/usr/bin/env bash
# CP-8 item 6: the existing website pages and the speed tests pass unchanged.
# "Unchanged" is proven here: against where this branch left main, no existing test file of the engine
# (packages/engine/tests) or of the website (apps/web/tests: the page journeys and the speed tests such as
# p6-check-is-quick.spec.ts) is deleted, renamed or has a line removed or rewritten, and the browser suite's
# config (apps/web/playwright.config.ts) is untouched. New lines and new files are allowed (the build adds
# packages/engine/tests/test_plan_link.py).
# "Pass" is ci.yml's own jobs, which every pull request must have green before it merges (the merge rule): the engine
# job runs `uv run pytest -q` in packages/engine (CLAUDE.md, Verify: `cd packages/engine && pytest -q`) and the browser
# job runs `npx playwright test` in apps/web (package.json `test:e2e`). They take far longer than the two minutes these
# proofs may use, so they are not run a second time here (as CP-2, CP-3 and CP-5 do).
# It guards CP-8's own change only, as CP-3's proof 7 and CP-5's tests_unchanged.sh do: every later scope's pull request
# is re-run through this proof and may rightly edit an existing test (CP-24 does). So it applies when the diff against
# the merge-base adds or changes CP-8's migration, or changes specs/CP-8 beyond VERIFY.md, RUN.json, status.json and this file;
# otherwise it says so in one line and passes. When it applies it behaves exactly as before.
#   bash specs/CP-8/proofs/tests_unchanged.sh              the check
#   bash specs/CP-8/proofs/tests_unchanged.sh --self-check  both cases, in a scratch repository
set -euo pipefail

MIGRATION=supabase/migrations/20270125140000_a_plan_line_knows_what_linked_it.sql

if [ "${1:-}" = "--self-check" ]; then
  me=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; cd "$tmp"; export CP8_REPO="$tmp"
  git init -q -b main . && git config user.email t@t && git config user.name t && git config commit.gpgsign false
  mkdir -p packages/engine/tests supabase/migrations specs/CP-8
  printf 'a\nb\n' > packages/engine/tests/test_x.py
  git add -A && git commit -q -m base
  git checkout -q -b other
  printf 'a\nB\n' > packages/engine/tests/test_x.py            # a rewritten test line, unrelated pull request
  git commit -q -am rewrite
  out=$(bash "$me") || { echo "FAIL: an unrelated pull request that rewrites a test must pass: $out"; exit 1; }
  case "$out" in *"does not apply"*) ;; *) echo "FAIL: expected the does-not-apply line, got: $out"; exit 1;; esac
  echo x > "$MIGRATION"; git add -A; git commit -q -m migration     # now it is CP-8's own change
  if out=$(bash "$me"); then echo "FAIL: CP-8's own change with a rewritten test line must fail: $out"; exit 1; fi
  case "$out" in *"existing tests changed since main"*) ;; *) echo "FAIL: wrong failure message: $out"; exit 1;; esac
  git checkout -q main && git checkout -q -b records && mkdir -p specs/CP-8 && echo '{}' > specs/CP-8/RUN.json
  printf 'a\nB\n' > packages/engine/tests/test_x.py            # records only plus a rewritten test: not CP-8's own change
  git add -A && git commit -q -m records
  bash "$me" >/dev/null || { echo "FAIL: a records-only change plus an unrelated test edit must pass"; exit 1; }
  git checkout -q main && git checkout -q -b own && mkdir -p supabase/migrations && echo x > "$MIGRATION"
  printf 'a\nb\nc\n' > packages/engine/tests/test_x.py          # added lines only
  git add -A && git commit -q -m additive
  bash "$me" >/dev/null || { echo "FAIL: CP-8's own change that only adds test lines must pass"; exit 1; }
  echo "self-check passed: applies and fails on a rewritten line; does not apply on an unrelated pull request"
  exit 0
fi

cd "${CP8_REPO:-$(dirname "$0")/../../..}"
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main) \
  || { echo "no main to compare with: this proof needs the repository's history"; exit 1; }
own=$(git diff --name-only "$base" | awk -v m="$MIGRATION" '$0 == m || ($0 ~ /^specs\/CP-8\// && $0 !~ /^specs\/CP-8\/(VERIFY\.md|RUN\.json|status\.json|proofs\/tests_unchanged\.sh)$/)')
if [ -z "$own" ]; then
  echo "this pull request is not CP-8's own change, so the unchanged-tests check does not apply"
  exit 0
fi
changed=$(git diff --numstat -M "$base" -- packages/engine/tests apps/web/tests | awk '$2 != "0" { print $3 " (" $2 " lines removed or rewritten)" }')
renamed=$(git diff --name-status -M --diff-filter=DR "$base" -- packages/engine/tests apps/web/tests apps/web/playwright.config.ts)
config=$(git diff --name-only "$base" -- apps/web/playwright.config.ts)
if [ -n "$changed$renamed$config" ]; then
  echo "existing tests changed since main:"; printf '%s\n' "$changed" "$renamed" "$config" | sed '/^$/d'; exit 1
fi
echo "no existing engine or website test (pages or speed) changed since main"
