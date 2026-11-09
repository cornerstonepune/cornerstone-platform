#!/usr/bin/env bash
# CP-8 item 1, on the box, read-only: overall AND in each fortnight, no K2 plan line that has a match is left unlinked
# (no `ready_to_link` line on plan_unmatched), and the share of K2 lines linked is printed per fortnight and overall.
# When docs/decisions/CP-8-link-target.md carries a line `Target: <n>%` (Nimish's), the share must reach it overall and
# in each fortnight. A fortnight of a K2 class's year with no K2 lines is named and skipped (design, "Measuring item 1").
# Denominator: every K2 plan_entry row. Prints counts only, never a name or a line's text.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
url="${DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' "$root/.env" 2>/dev/null | tail -1)}"
[ -n "$url" ] || { echo "DATABASE_URL is not set (env or $root/.env)"; exit 1; }
slug="${TENANT_SLUG:-cornerstone-pune}"
q() { PGOPTIONS='-c default_transaction_read_only=on' psql "$url" -At -F ' ' -v ON_ERROR_STOP=1 -v slug="$slug"; }
K2="with kc as (select c.id, c.academic_year_id from school_class c join tenant t on t.id = c.tenant_id
  where t.slug = :'slug' and c.grade_code = 'K2'),
k2 as (select pe.id, pe.activity_id, pe.fortnight_id from plan_entry pe join kc on kc.id = pe.school_class_id)"

record="$root/docs/decisions/CP-8-link-target.md"
target=""
[ -f "$record" ] && target=$(sed -n 's/^Target:[[:space:]]*\([0-9][0-9.]*\)[[:space:]]*%.*/\1/p' "$record" | head -1)
meets() { [ -z "$target" ] || awk -v l="$1" -v t="$2" -v g="$target" 'BEGIN { exit !(100 * l / t >= g + 0) }'; }

# per fortnight: number lines linked ready_to_link (weeks A and B together; the week split is printed by item 2's proof)
per=$(q <<SQL
$K2
select f.number, count(*), count(k2.activity_id), count(u.plan_entry_id) filter (where u.reason = 'ready_to_link')
from k2 join fortnight f on f.id = k2.fortnight_id left join plan_unmatched u on u.plan_entry_id = k2.id
group by f.number order by f.number;
SQL
)
empty=$(q <<SQL
$K2
select string_agg(distinct coalesce(f.number::text, f.kind), ' ') from fortnight f
where f.academic_year_id in (select academic_year_id from kc) and not exists (select 1 from k2 where k2.fortnight_id = f.id);
SQL
)

bad=0 total=0 linked=0 ready=0
echo "per fortnight:"
while read -r fn lines lk rd; do
  [ -n "$fn" ] || continue
  share=$(awk -v l="$lk" -v t="$lines" 'BEGIN { printf "%.1f", 100 * l / t }')
  ok=yes
  { [ "$rd" -eq 0 ] && meets "$lk" "$lines"; } || { ok=NO; bad=$((bad + 1)); }
  echo "  FN$fn lines=$lines linked=$lk share=${share}% ready_to_link=$rd meets=$ok"
  total=$((total + lines)); linked=$((linked + lk)); ready=$((ready + rd))
done <<<"$per"
echo "  skipped, no K2 lines: ${empty:-none}"

[ "$total" -gt 0 ] || { echo "no K2 plan lines at all"; exit 1; }
share=$(awk -v l="$linked" -v t="$total" 'BEGIN { printf "%.1f", 100 * l / t }')
echo "$(date -u +%F): K2 lines=$total linked=$linked share=${share}% ready_to_link=$ready fortnights-failing=$bad target=${target:-default (no ready_to_link line)}"
[ "$ready" -eq 0 ] && [ "$bad" -eq 0 ] && meets "$linked" "$total"
