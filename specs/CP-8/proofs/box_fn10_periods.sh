#!/usr/bin/env bash
# CP-8 item 3, on the box, read-only. A lesson period of FN10 (design decisions 8 and 10) is a K2 `session` that is
# planned, in a non-fixed `period`, on a `school_day` that is not a holiday, dated between the stored starts_on and ends_on
# of the class's year's `fortnight` row numbered 10. It passes when its plan line has an activity or is on plan_unmatched.
# A period with no plan line at all is neither, and is counted on its own: it must be 0. Prints counts only (per week
# A/B of the plan line, then in total), never a name or text.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
url="${DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' "$root/.env" 2>/dev/null | tail -1)}"
[ -n "$url" ] || { echo "DATABASE_URL is not set (env or $root/.env)"; exit 1; }
slug="${TENANT_SLUG:-cornerstone-pune}"
q() { PGOPTIONS='-c default_transaction_read_only=on' psql "$url" -At -F ' ' -v ON_ERROR_STOP=1 -v slug="$slug"; }
P="with p as (
  select s.id, pe.week_code, s.plan_entry_id is null as no_line, pe.activity_id is not null as opens,
         exists (select 1 from plan_unmatched u where u.plan_entry_id = s.plan_entry_id) as listed
  from session s
  join school_class c on c.id = s.school_class_id join tenant t on t.id = c.tenant_id
  join school_day d on d.id = s.school_day_id join period pd on pd.id = s.period_id
  join fortnight f on f.academic_year_id = c.academic_year_id and f.number = 10
  left join plan_entry pe on pe.id = s.plan_entry_id
  where t.slug = :'slug' and c.grade_code = 'K2' and s.planned and not pd.fixed and d.kind <> 'holiday'
    and d.on_date between f.starts_on and f.ends_on)"

echo "FN10 by week (week periods opens-activity on-unmatched-list no-plan-line neither):"
q <<SQL | sed 's/^/  /'
$P
select coalesce(week_code, '-'), count(*), count(*) filter (where opens), count(*) filter (where listed),
       count(*) filter (where no_line), count(*) filter (where not opens and not listed)
from p group by 1 order by 1;
SQL

read -r total opens listed noline neither < <(q <<SQL
$P
select count(*), count(*) filter (where opens), count(*) filter (where listed), count(*) filter (where no_line),
       count(*) filter (where not opens and not listed)
from p;
SQL
)
echo "$(date -u +%F): FN10 lesson periods=$total opens-activity=$opens on-unmatched-list=$listed no-plan-line=$noline neither=$neither"
[ "$total" -gt 0 ] && [ "$noline" -eq 0 ] && [ "$neither" -eq 0 ]
