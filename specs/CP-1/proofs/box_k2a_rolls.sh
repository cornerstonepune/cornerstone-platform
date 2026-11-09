#!/usr/bin/env bash
# CP-1 item 4, on the box, read-only: the open enrolments of the 2026-27 K2-A class hold roll numbers exactly 1 to 22,
# no gap, no repeat. Prints counts only, never a name.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
url="${DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' "$root/.env" 2>/dev/null | tail -1)}"
[ -n "$url" ] || { echo "DATABASE_URL is not set (env or $root/.env)"; exit 1; }
slug="${TENANT_SLUG:-cornerstone-pune}"
out=$(PGOPTIONS='-c default_transaction_read_only=on' psql "$url" -At -F ' ' -v ON_ERROR_STOP=1 -v slug="$slug" <<'SQL'
with k as (
  select c.id from school_class c join academic_year y on y.id = c.academic_year_id
  join tenant t on t.id = c.tenant_id
  where t.slug = :'slug' and y.label = '2026-27' and c.grade_code = 'K2' and c.section = 'A'
), r as (
  select e.roll_no from enrolment e join k on k.id = e.class_id where e.to_date is null
)
select
  (select count(*) from k),
  (select count(*) from r),
  (select count(*) from r where roll_no !~ '^[0-9]+$'),
  (select count(distinct roll_no::int) from r where roll_no ~ '^[0-9]+$'),
  (select count(*) from generate_series(1, 22) n where n not in (select roll_no::int from r where roll_no ~ '^[0-9]+$'));
SQL
)
read -r classes open nonnum distinct gaps <<<"$out"
echo "K2-A 2026-27 classes=$classes open-enrolments=$open non-numeric=$nonnum distinct=$distinct missing-of-1..22=$gaps"
[ "$classes" -eq 1 ] && [ "$open" -eq 22 ] && [ "$nonnum" -eq 0 ] && [ "$distinct" -eq 22 ] && [ "$gaps" -eq 0 ]
