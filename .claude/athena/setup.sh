#!/usr/bin/env bash
# Installs what this repo needs before its fast checks and acceptance proofs can run (used by CI).
# Athena writes this once and never overwrites it: edit it for this repo.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v uv >/dev/null || python3 -m pip install --quiet uv
(cd packages/engine && uv sync --extra dev)

# CP-20: in GitHub's job only, a throwaway Postgres built from this repo's migrations (bin/ci-postgres, bin/testdb fresh),
# so locked proofs that need a database can run. TEST_DATABASE_URL only: DATABASE_URL stays unset, the live database is unreachable.
if [ "${GITHUB_ACTIONS:-}" = true ]; then
  URL="${CP20_TEST_DB_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
  case "$URL" in
    *@127.0.0.1:*|*@localhost:*) ;;
    *) echo "setup.sh: the test database must be on this runner (127.0.0.1 or localhost), not at: @${URL#*@}" >&2; exit 1 ;;
  esac
  bin/ci-postgres
  # CP-11: the timetable program, so the timetable proofs can run (the engine image installs the same package)
  sudo apt-get update -qq && sudo apt-get install -y --no-install-recommends fet && fet-cl --version >"$RUNNER_TEMP/fet-version" && head -1 "$RUNNER_TEMP/fet-version"
  export PATH="/usr/lib/postgresql/17/bin:$PATH"
  # rc is written even when set -e would end the subshell early, so the wait below cannot hang
  ( rc=0; bin/testdb fresh "$URL" >"$RUNNER_TEMP/testdb.log" 2>&1 || rc=$?; echo "$rc" >"$RUNNER_TEMP/testdb.rc" ) &
  bg=$!
  (cd apps/web && npm ci)
  wait "$bg" || true
  cat "$RUNNER_TEMP/testdb.log"
  rc=$(cat "$RUNNER_TEMP/testdb.rc")
  [ "$rc" = 0 ] || exit "$rc"
  echo "TEST_DATABASE_URL=$URL" >> "$GITHUB_ENV"
else
  (cd apps/web && npm ci)
fi
