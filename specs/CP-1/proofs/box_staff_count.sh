#!/usr/bin/env bash
# CP-1 item 1, on the box, read-only: active staff in the people record = entries on the sign-in list (config app.staff),
# and no active staff row lacks an open role grant. Prints counts only, never a name.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
url="${DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' "$root/.env" 2>/dev/null | tail -1)}"
[ -n "$url" ] || { echo "DATABASE_URL is not set (env or $root/.env)"; exit 1; }
slug="${TENANT_SLUG:-cornerstone-pune}"
out=$(PGOPTIONS='-c default_transaction_read_only=on' psql "$url" -At -F ' ' -v ON_ERROR_STOP=1 -v slug="$slug" <<'SQL'
with t as (select id from tenant where slug = :'slug')
select
  (select count(*) from staff s, t where s.tenant_id = t.id and s.active),
  (select coalesce(jsonb_array_length(c.value), 0) from config c, t where c.tenant_id = t.id and c.key = 'app.staff'),
  (select count(*) from staff s, t where s.tenant_id = t.id and s.active and not exists (
     select 1 from staff_role_grant g where g.staff_id = s.id and g.valid_from <= current_date
       and (g.valid_to is null or g.valid_to >= current_date)));
SQL
)
read -r staff signin nogrant <<<"$out"
echo "$(date -u +%F): staff=$staff sign-in-list=${signin:-none} staff-without-open-grant=$nogrant"
[ -n "$signin" ] && [ "$signin" -gt 0 ] && [ "$staff" -eq "$signin" ] && [ "$nogrant" -eq 0 ]
