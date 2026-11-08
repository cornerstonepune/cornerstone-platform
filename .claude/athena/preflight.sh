#!/usr/bin/env bash
# Find a broken build in minutes, before a push and before a pull request is marked ready (CP-21): the guard tests,
# then the browser specs in preflight-specs.txt on a database with the real number of rows, as the restricted logins the
# live site uses. Prints the seconds each page took and fails when a page is over the limit (3 seconds).
# Runs on a Mac (bash 3.2, BSD tools) and in a cloud session. Needs: `uv sync --extra dev` in packages/engine, `npm ci` in apps/web,
# and TEST_DATABASE_URL naming an empty or already built Postgres (built here with bin/testdb fresh, about 5 minutes the
# first time, then reused). Settings, all optional:
#   PREFLIGHT_GUARD_CMD           the guard tests; default bin/check
#   PREFLIGHT_SPECS               the list of specs; default .claude/athena/preflight-specs.txt
#   PREFLIGHT_PLAYWRIGHT_CMD      the browser run instead (no database, no server); each listed spec is added as an argument
#   PREFLIGHT_PAGE_LIMIT_SECONDS  the page limit; default 3
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
limit=${PREFLIGHT_PAGE_LIMIT_SECONDS:-3}
list=${PREFLIGHT_SPECS:-$root/.claude/athena/preflight-specs.txt}

echo "preflight 1/2: guard tests"
cd "$root"
if ! ${PREFLIGHT_GUARD_CMD:-$root/bin/check}; then
  echo "preflight FAILED: a guard test failed; the browser specs were not run" >&2
  exit 1
fi

set --
while IFS= read -r line; do
  case "$line" in ''|'#'*) ;; *) set -- "$@" "$line" ;; esac
done < "$list"
[ "$#" -gt 0 ] || { echo "preflight FAILED: $list lists no browser spec" >&2; exit 1; }

PREFLIGHT_TIMINGS=$(mktemp "${TMPDIR:-/tmp}/preflight.XXXXXX")
export PREFLIGHT_TIMINGS
trap 'rm -f "$PREFLIGHT_TIMINGS"' EXIT

echo "preflight 2/2: browser specs ($*)"
cd "$root/apps/web"
browser=0
if [ -n "${PREFLIGHT_PLAYWRIGHT_CMD:-}" ]; then
  $PREFLIGHT_PLAYWRIGHT_CMD "$@" || browser=$?
else
  : "${TEST_DATABASE_URL:?set TEST_DATABASE_URL to a Postgres to test on (it is built here when empty), e.g. postgresql://postgres@127.0.0.1:5432/postgres}"
  if [ -z "$(psql "$TEST_DATABASE_URL" -tAc "select to_regclass('public.skill')")" ]; then
    echo "building the test database (about 5 minutes; kept for the next run)"
    "$root/bin/testdb" fresh "$TEST_DATABASE_URL"
  fi
  # The website and the engine reach the database as their own roles, as live does (as ci.yml does)
  psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "alter role app_web password 'ci-web'" -c "alter role app_engine password 'ci-engine'"
  export TEST_WEB_DATABASE_URL=$(echo "$TEST_DATABASE_URL" | sed -E 's#://[^@/]*@#://app_web:ci-web@#')
  export TEST_ENGINE_DATABASE_URL=$(echo "$TEST_DATABASE_URL" | sed -E 's#://[^@/]*@#://app_engine:ci-engine@#')
  # Stops after 3 failures: a broken build says so in minutes, not after the whole suite
  npx playwright test "$@" --max-failures=3 --reporter=list,./tests/preflight-reporter.ts || browser=$?
fi

echo "page seconds (limit ${limit}s):"
if [ ! -s "$PREFLIGHT_TIMINGS" ]; then
  echo "preflight FAILED: the browser run recorded no page timings" >&2
  exit 1
fi
over=0
while IFS="$(printf '\t')" read -r page secs; do
  if awk -v s="$secs" -v l="$limit" 'BEGIN { exit !(s + 0 > l + 0) }'; then
    echo "  $page  ${secs}s  OVER THE LIMIT"
    over=1
  else
    echo "  $page  ${secs}s"
  fi
done < "$PREFLIGHT_TIMINGS"

[ "$browser" -eq 0 ] || { echo "preflight FAILED: a browser spec failed" >&2; exit 1; }
[ "$over" -eq 0 ] || { echo "preflight FAILED: a page took more than ${limit}s" >&2; exit 1; }
echo "preflight passed"
