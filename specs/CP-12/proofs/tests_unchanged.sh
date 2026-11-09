#!/usr/bin/env bash
# CP-12 item 8, last part: the existing website pages and engine tests pass unchanged. Against where this branch left
# main, no existing test file under packages/engine/tests or apps/web/tests is deleted and no line in one is removed or
# rewritten; new lines and new files are allowed. (That they pass is CI's engine and web jobs; this proves "unchanged".)
#
# CP-21's pattern (from CP-5): it guards CP-12's own change only, since a later scope may rightly edit an existing test
# and GitHub re-runs every finished scope's proofs. It applies when the diff against the merge-base adds or changes
# CP-12's migration (*_a_lesson_moved_by_hand_is_kept.sql) or changes specs/CP-12 beyond its VERIFY.md and RUN.json
# records; otherwise it says so in one line and exits 0.
#   bash specs/CP-12/proofs/tests_unchanged.sh              the check
#   bash specs/CP-12/proofs/tests_unchanged.sh --self-check  both cases, in a scratch repository
set -euo pipefail

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
  echo x > supabase/migrations/20990101000000_a_lesson_moved_by_hand_is_kept.sql; git add -A; git commit -q -m migration
  if out=$(bash "$me"); then echo "FAIL: CP-12's own change with a rewritten test line must fail: $out"; exit 1; fi
  case "$out" in *"existing tests changed since main"*) ;; *) echo "FAIL: wrong failure message: $out"; exit 1;; esac
  git checkout -q main && git checkout -q -b own && mkdir -p supabase/migrations
  echo x > supabase/migrations/20990101000000_a_lesson_moved_by_hand_is_kept.sql
  printf 'a\nb\nc\n' > packages/engine/tests/test_x.py          # added lines only
  git add -A && git commit -q -m additive
  bash "$me" >/dev/null || { echo "FAIL: CP-12's own change that only adds test lines must pass"; exit 1; }
  echo "self-check passed: applies and fails on a rewritten line; does not apply on an unrelated pull request"
  exit 0
fi

base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
own=$(git diff --name-only "$base" | awk '$0 ~ /^supabase\/migrations\/[0-9]+_a_lesson_moved_by_hand_is_kept\.sql$/ || ($0 ~ /^specs\/CP-12\// && $0 !~ /^specs\/CP-12\/(VERIFY\.md|RUN\.json)$/)')
if [ -z "$own" ]; then
  echo "this pull request is not CP-12's own change, so the unchanged-tests check does not apply"
  exit 0
fi
changed=$(git diff --numstat "$base" -- packages/engine/tests apps/web/tests | awk '$2 != "0" { print $3 " (" $2 " lines removed or rewritten)" }')
if [ -n "$changed" ]; then
  echo "existing tests changed since main:"; echo "$changed"; exit 1
fi
echo "no existing engine or web test changed since main"
