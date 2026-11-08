"""CP-18 item 8, LIVE (box only, read-only counts per fortnight; no row, name, number or address is printed):
- at least one real send (a class list or the combined list, status opened) with a recipient (`to_staff`);
- at least one reminder delivered (`reminder_delivery.status = 'delivered'`);
- no due reminder left with no record at all: a pending reminder of an unsent list, due before the school's today and
  on or after the first delivery row ever written (so lists from before CP-18 are not counted), with no
  `reminder_delivery` row of any status.
A list or combined list is counted under the fortnight its first day falls in (design, "Risks not verified")."""

import os
import sys

import psycopg

PER_FORTNIGHT = """
with today as (
  select (now() at time zone coalesce((select value #>> '{}' from config where key = 'school.time_zone' limit 1),
                                      'Asia/Kolkata'))::date as d
), began as (select min(at)::date as d from reminder_delivery),
f as (select id, number, starts_on, ends_on from fortnight where kind <> 'vacation')
select f.starts_on, f.number,
  (select count(*) from materials_send s join materials_list l on l.id = s.list_id
    where s.status = 'opened' and s.to_staff is not null and l.from_on between f.starts_on and f.ends_on)
  + (select count(*) from materials_consolidated_send s join materials_consolidated m on m.id = s.consolidated_id
    where s.status = 'opened' and s.to_staff is not null and m.from_on between f.starts_on and f.ends_on) as sends,
  (select count(*) from reminder_delivery d join reminder r on r.id = d.reminder_id
    join materials_list l on l.id = r.list_id
    where d.status = 'delivered' and l.from_on between f.starts_on and f.ends_on) as delivered,
  (select count(*) from reminder_delivery d join reminder r on r.id = d.reminder_id
    join materials_list l on l.id = r.list_id
    where d.status = 'failed' and l.from_on between f.starts_on and f.ends_on) as failed,
  (select count(*) from reminder r join materials_list l on l.id = r.list_id, today, began
    where r.state = 'pending' and l.state = 'draft' and r.due_on < today.d and r.due_on >= began.d
      and l.from_on between f.starts_on and f.ends_on
      and not exists (select 1 from reminder_delivery d where d.reminder_id = r.id)) as unrecorded
from f order by f.starts_on
"""


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as c:
        if c.execute("select to_regclass('public.reminder_delivery') is null").fetchone()[0]:
            print("reminder_delivery is not on the live database")
            return 1
        rows = c.execute(PER_FORTNIGHT).fetchall()
    sends = delivered = unrecorded = 0
    for starts, number, s, dl, failed, un in rows:
        if s or dl or failed or un:
            print(f"fortnight {number or '-'} from {starts}: sends with a recipient {s}, reminders delivered {dl},"
                  f" failed {failed}, due with no record {un}")
        sends, delivered, unrecorded = sends + s, delivered + dl, unrecorded + un
    print(f"total: sends with a recipient {sends}, reminders delivered {delivered}, due with no record {unrecorded}")
    return 0 if sends >= 1 and delivered >= 1 and unrecorded == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
