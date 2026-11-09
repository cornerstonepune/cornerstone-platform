# Shared by the CP-23 proofs. Sourced from a proof script run at the repository root.
# Every plant is an UNTRACKED file in the working tree (never committed) and every changed file is restored, by the
# EXIT trap, even when the proof fails. Untracked is what bin/check sees as "on the branch, not on origin/main": its
# migration guard lists supabase/migrations from the working tree and compares with `git ls-tree origin/main`.
set -u
ROOT=$(pwd)
MIG=supabase/migrations
WORK=$(mktemp -d)
PLANTED=()
PG_DATA=""
PG_AS=()

cleanup() {
  local f
  for f in "${PLANTED[@]}"; do rm -rf "$ROOT/$f"; done
  if [ -f "$WORK/rules.json.bak" ]; then
    cmp -s "$WORK/rules.json.bak" "$ROOT/packages/engine/engine/checks/rules.json" ||
      cp "$WORK/rules.json.bak" "$ROOT/packages/engine/engine/checks/rules.json"
  fi
  if [ -n "$PG_DATA" ]; then "${PG_AS[@]}" "$PG_BIN/pg_ctl" -D "$PG_DATA" -m immediate stop >/dev/null 2>&1; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# plant <path relative to the repo> <content>: an untracked file, removed on exit. Refuses to overwrite anything.
plant() {
  local dir
  if [ -e "$ROOT/$1" ]; then echo "proof error: $1 already exists" >&2; exit 99; fi
  dir=$(dirname "$1")
  # record the topmost directory this plant creates, so cleanup removes it too
  local top="$dir"
  while [ ! -d "$ROOT/$(dirname "$top")" ]; do top=$(dirname "$top"); done
  [ -d "$ROOT/$top" ] || PLANTED+=("$top")
  mkdir -p "$ROOT/$dir"
  PLANTED+=("$1")
  printf '%s\n' "$2" >"$ROOT/$1"
}

# the newest migration version anywhere (working tree or origin/main)
newest_version() {
  { ls "$ROOT/$MIG"; git -C "$ROOT" ls-tree --name-only origin/main "$MIG/" 2>/dev/null | sed 's#.*/##'; } |
    grep -E '^[0-9]{14}_.*\.sql$' | cut -c1-14 | sort | tail -1
}

# a version that sorts just after every migration (one hour after the newest)
next_version() { echo $(($(newest_version) + 10000)); }

# start_pg: a throwaway Postgres in $WORK on a free port, with one empty database; sets PG_URL and PG_LOG.
start_pg() {
  PG_BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
  [ -x "$PG_BIN/initdb" ] || { echo "proof error: no Postgres binaries under /usr/lib/postgresql" >&2; exit 99; }
  PG_DATA="$WORK/pg/data"
  mkdir -p "$WORK/pg"
  if [ "$(id -u)" = 0 ]; then
    chown -R postgres "$WORK" && chmod 755 "$WORK"
    PG_AS=(runuser -u postgres --)
  else
    PG_AS=(env)
  fi
  local port
  port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
  PG_LOG="$WORK/pg/log"
  "${PG_AS[@]}" "$PG_BIN/initdb" -D "$PG_DATA" -A trust -U postgres -E UTF8 --no-locale >/dev/null ||
    { echo "proof error: initdb failed" >&2; exit 99; }
  "${PG_AS[@]}" "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -w \
    -o "-p $port -k $WORK/pg -c listen_addresses=127.0.0.1 -c log_connections=on" start >/dev/null ||
    { echo "proof error: Postgres did not start" >&2; exit 99; }
  PG_HOST=127.0.0.1
  PG_PORT=$port
  psql "postgresql://postgres@127.0.0.1:$port/postgres" -qc "create database cp23_empty" ||
    { echo "proof error: createdb failed" >&2; exit 99; }
  PG_URL="postgresql://postgres@127.0.0.1:$port/cp23_empty"
}

# connections the throwaway server received since start
pg_connections() { grep -c "connection received" "$PG_LOG" || true; }
