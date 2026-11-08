#!/usr/bin/env bash
# CP-8 item 1, on the box, read-only: no K2 plan line that has a match is left unlinked (no `ready_to_link` line on
# plan_unmatched), and the share of K2 lines linked is printed, in total and per fortnight (design decision 10). When
# docs/decisions/CP-8-link-target.md carries a line `Target: <n>%` (Nimish's), the share must reach it.
# Denominator: every K2 plan_entry row (design, "Measuring item 1"). Prints counts only, never a name or a line's text.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
url="${DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' "$root/.env" 2>/dev/null | tail -1)}"
[ -n "$url" ] || { echo "DATABASE_URL is not set (env or $root/.env)"; exit 1; }
slug="${TENANT_SLUG:-cornerstone-pune}"
q() { PGOPTIONS='-c default_transaction_read_only=on' psql "$url" -At -F ' ' -v ON_ERROR_STOP=1 -v slug="$slug"; }
K2="with k2 as (select pe.id, pe.activity_id, pe.fortnight_id, pe.week_code from plan_entry pe
  join school_class c on c.id = pe.school_class_id join tenant t on t.id = c.tenant_id
  where t.slug = :'slug' and c.grade_code = 'K2')"

echo "per fortnight (number week lines linked ready_to_link):"
q <<SQL | sed 's/^/  FN/'
$K2
select f.number, coalesce(k2.week_code, '-'), count(*), count(k2.activity_id),
       count(*) filter (where u.reason = 'ready_to_link')
from k2 join fortnight f on f.id = k2.fortnight_id left join plan_unmatched u on u.plan_entry_id = k2.id
group by 1, 2 order by 1, 2;
SQL

read -r total linked ready < <(q <<SQL
$K2
select count(*), count(activity_id),
       (select count(*) from plan_unmatched u join k2 on k2.id = u.plan_entry_id where u.reason = 'ready_to_link')
from k2;
SQL
)
share=$(awk -v l="$linked" -v t="$total" 'BEGIN { printf "%.1f", (t > 0 ? 100 * l / t : 0) }')
record="$root/docs/decisions/CP-8-link-target.md"
target=""
[ -f "$record" ] && target=$(sed -n 's/^Target:[[:space:]]*\([0-9][0-9.]*\)[[:space:]]*%.*/\1/p' "$record" | head -1)
echo "$(date -u +%F): K2 lines=$total linked=$linked share=${share}% ready_to_link=$ready target=${target:-default (no ready_to_link line)}"
[ "$total" -gt 0 ] && [ "$ready" -eq 0 ] || exit 1
[ -z "$target" ] || awk -v s="$share" -v g="$target" 'BEGIN { exit !(s + 0 >= g + 0) }'
