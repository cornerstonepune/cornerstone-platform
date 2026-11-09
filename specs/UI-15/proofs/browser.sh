#!/usr/bin/env bash
# Runs a Playwright command from apps/web on a local test database: TEST_DATABASE_URL (CI's proofs job), or, without it,
# a fresh copy of the template database UI15_TEMPLATE (default ui15_tmpl, built by `bin/testdb fresh`) on the local
# Postgres, dropped afterwards. Usage: browser.sh <playwright test args...>
set -uo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
web="$root/apps/web"
export NODE_OPTIONS=   # the sandbox's --use-openssl-ca breaks Next's build workers
export NODE_PATH="$web/node_modules"   # so specs/UI-15/proofs/*.ts find @playwright/test and postgres
made=""
if [ -z "${TEST_DATABASE_URL:-}" ]; then
  server="${UI15_PG:-postgresql://postgres:postgres@127.0.0.1:5432}"
  made="ui15_run_$$"
  psql "$server/postgres" -qAtc "create database $made template ${UI15_TEMPLATE:-ui15_tmpl}" || exit 1
  export TEST_DATABASE_URL="$server/$made"
fi
cd "$web" && npx playwright test "$@"
rc=$?
[ -z "$made" ] || psql "${UI15_PG:-postgresql://postgres:postgres@127.0.0.1:5432}/postgres" -qAtc "drop database if exists $made with (force)"
exit $rc
