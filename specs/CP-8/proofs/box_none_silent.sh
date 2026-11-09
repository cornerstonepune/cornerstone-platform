#!/usr/bin/env bash
# CP-8 item 2, on the box, read-only: every K2 plan line, in every fortnight, is linked or on plan_unmatched; every line
# on plan_unmatched has one of the three reasons and shows its own fortnight (fortnight_number, week_code). Prints counts only (in total and per fortnight, design decision 10), never a name or text.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
url="${DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' "$root/.env" 2>/dev/null | tail -1)}"
[ -n "$url" ] || { echo "DATABASE_URL is not set (env or $root/.env)"; exit 1; }
slug="${TENANT_SLUG:-cornerstone-pune}"
q() { PGOPTIONS='-c default_transaction_read_only=on' psql "$url" -At -F ' ' -v ON_ERROR_STOP=1 -v slug="$slug"; }
K2="with k2 as (select pe.id, pe.activity_id, pe.fortnight_id, pe.week_code from plan_entry pe
  join school_class c on c.id = pe.school_class_id join tenant t on t.id = c.tenant_id
  where t.slug = :'slug' and c.grade_code = 'K2')"

echo "per fortnight (number week lines linked no_match several_matches ready_to_link unlisted):"
q <<SQL | sed 's/^/  FN/'
$K2
select f.number, coalesce(k2.week_code, '-'), count(*), count(k2.activity_id),
       count(*) filter (where u.reason = 'no_match'), count(*) filter (where u.reason = 'several_matches'),
       count(*) filter (where u.reason = 'ready_to_link'),
       count(*) filter (where k2.activity_id is null and u.plan_entry_id is null)
from k2 join fortnight f on f.id = k2.fortnight_id left join plan_unmatched u on u.plan_entry_id = k2.id
group by 1, 2 order by 1, 2;
SQL

read -r total unlinked unlisted noreason nofortnight < <(q <<SQL
$K2
select count(*), count(*) filter (where activity_id is null),
       count(*) filter (where activity_id is null and not exists (select 1 from plan_unmatched u where u.plan_entry_id = k2.id)),
       (select count(*) from plan_unmatched u join k2 on k2.id = u.plan_entry_id
         where u.reason is null or u.reason not in ('no_match', 'several_matches', 'ready_to_link')),
       (select count(*) from plan_unmatched u join k2 on k2.id = u.plan_entry_id join fortnight f on f.id = k2.fortnight_id
         where u.fortnight_number is distinct from f.number or u.week_code is distinct from k2.week_code)
from k2;
SQL
)
echo "$(date -u +%F): K2 lines=$total unlinked=$unlinked unlinked-and-unlisted=$unlisted listed-without-reason=$noreason listed-without-its-fortnight=$nofortnight"
[ "$total" -gt 0 ] && [ "$unlisted" -eq 0 ] && [ "$noreason" -eq 0 ] && [ "$nofortnight" -eq 0 ]
