#!/usr/bin/env bash
# CP-5 item 5, first half: the engine's tests and the website's tests are unchanged on this branch. Against where it
# left main, no existing test file under packages/engine/tests or apps/web/tests is deleted and no line in one is
# removed or rewritten; new lines and new files are allowed (the search-path guard extends test_db_privileges.py).
#
# It guards CP-5's own change only. GitHub re-runs every finished scope's proofs on any pull request that touches
# migrations or specs, and a later scope may rightly edit an existing test. So the check applies when the diff against
# the merge-base adds or changes CP-5's migration, or changes specs/CP-5 beyond its VERIFY.md and RUN.json records;
# otherwise it says so in one line and exits 0. When it applies it behaves exactly as before.
#   bash specs/CP-5/proofs/tests_unchanged.sh              the check
#   bash specs/CP-5/proofs/tests_unchanged.sh --self-check  both cases, in a scratch repository
set -euo pipefail

MIGRATION=supabase/migrations/20270110090000_pin_function_search_paths.sql

if [ "${1:-}" = "--self-check" ]; then
  me=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; cd "$tmp"
  git init -q -b main . && git config user.email t@t && git config user.name t
  mkdir -p packages/engine/tests supabase/migrations
  printf 'a\nb\n' > packages/engine/tests/test_x.py
  git add -A && git commit -q -m base
  git checkout -q -b other
  printf 'a\nB\n' > packages/engine/tests/test_x.py            # a rewritten test line, unrelated pull request
  git commit -q -am rewrite
  out=$(bash "$me") || { echo "FAIL: an unrelated pull request that rewrites a test must pass: $out"; exit 1; }
  case "$out" in *"does not apply"*) ;; *) echo "FAIL: expected the does-not-apply line, got: $out"; exit 1;; esac
  echo x > "$MIGRATION"; git add -A; git commit -q -m migration     # now it is CP-5's own change
  if out=$(bash "$me"); then echo "FAIL: CP-5's own change with a rewritten test line must fail: $out"; exit 1; fi
  case "$out" in *"existing tests changed since main"*) ;; *) echo "FAIL: wrong failure message: $out"; exit 1;; esac
  git checkout -q main && git checkout -q -b own && mkdir -p supabase/migrations && echo x > "$MIGRATION"
  printf 'a\nb\nc\n' > packages/engine/tests/test_x.py          # added lines only
  git add -A && git commit -q -m additive
  bash "$me" >/dev/null || { echo "FAIL: CP-5's own change that only adds test lines must pass"; exit 1; }
  echo "self-check passed: applies and fails on a rewritten line; does not apply on an unrelated pull request"
  exit 0
fi

base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
# CP-5's own change: its migration, or its scope files other than the VERIFY/RUN records.
own=$(git diff --name-only "$base" | awk -v m="$MIGRATION" '$0 == m || ($0 ~ /^specs\/CP-5\// && $0 !~ /^specs\/CP-5\/(VERIFY\.md|RUN\.json)$/)')
if [ -z "$own" ]; then
  echo "this pull request is not CP-5's own change, so the unchanged-tests check does not apply"
  exit 0
fi
changed=$(git diff --numstat "$base" -- packages/engine/tests apps/web/tests | awk '$2 != "0" { print $3 " (" $2 " lines removed or rewritten)" }')
if [ -n "$changed" ]; then
  echo "existing tests changed since main:"; echo "$changed"; exit 1
fi
echo "no existing engine or web test changed since main"
