#!/usr/bin/env bash
# CP-2 item 4: on the real shared connection (Supabase's transaction pooler), each request sees only its own identity:
# A, B, nobody x200 in alternation on one shared connection; A and B at the same time; after a failed query; after a
# query that timed out. The test itself is apps/web/scripts/check-pooler.ts (the existing real-pooler harness),
# extended by CP-2. Read-only: set_config(..., true), current_staff() and pg_backend_pid(); no table is touched.
# Needs CHECK_POOLER_URL (the pooler's address): it fails, never skips, without it.
set -euo pipefail
cd "${ATHENA_ROOT:?}"
f=apps/web/scripts/check-pooler.ts
[ -n "${CHECK_POOLER_URL:-}" ] || { echo "CHECK_POOLER_URL is not set: the alternation proof needs the real pooler's address"; exit 1; }
grep -q 'CHECK_POOLER_URL' "$f" || { echo "$f does not read CHECK_POOLER_URL yet"; exit 1; }
grep -q 'current_staff()' "$f" || { echo "$f does not check current_staff() yet: the identity alternation is not written"; exit 1; }
grep -q 'pg_backend_pid' "$f" || { echo "$f does not record pg_backend_pid(): nothing shows A and B shared one connection"; exit 1; }
cd apps/web
timeout 600 node scripts/check-pooler.ts
