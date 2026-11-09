"""CP-9 item 7, LIVE (box only, read-only): 20 real notes confirmed by the K2 educator, and the coordinator's hand
calculation for 5 children matches the system exactly. A manual acceptance gate (design decision 5).

- Real notes: distinct `confirmation_id` of `activity_observation` with `route` in ('form', 'voice'), stored on or after
  the config row `cp9.real_notes_from` (absent: fail, saying so), in a class whose grade is a K2 grade (config `k2.reads`
  grades), confirmed by a member of staff holding a recording role (config `voice.roles_that_record`) on that class.
- Hand calculation: `hand_check` rows (written by `engine graph --hand-check`): at least 5 distinct children, and every
  row matches (`matches` true and `expected_state` = `system_state`).
Prints counts only: never a name, a child id or a state of a named child.
"""

import os
import sys

import psycopg

GATE = ("This check cannot pass before the K2 educator confirms 20 real notes on the typed form and the coordinator's "
        "hand calculations for 5 children are entered (engine graph --hand-check). It is a manual gate: no build "
        "closes it.")


def main() -> int:
    print(GATE)
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        since = conn.execute("select (value #>> '{}') from config where key = 'cp9.real_notes_from' limit 1").fetchone()
        if not since or not since[0]:
            print("config cp9.real_notes_from is not set: real notes cannot be told from test ones")
            return 1
        notes = conn.execute(
            "select count(distinct o.confirmation_id) from activity_observation o"
            " join school_class c on c.id = o.class_id"
            " where o.route in ('form', 'voice') and o.stored_at >= %s::date"
            " and c.grade_code in (select jsonb_array_elements_text(value -> 'grades') from config"
            "                      where key = 'k2.reads')"
            " and exists (select 1 from staff_role_grant g where g.staff_id = o.confirmed_by"
            "             and g.school_class_id = o.class_id and g.role_code in"
            "             (select jsonb_array_elements_text(value) from config where key = 'voice.roles_that_record'))",
            (since[0],)).fetchone()[0]
        if conn.execute("select to_regclass('public.hand_check') is null").fetchone()[0]:
            print(f"{notes} real notes confirmed since {since[0]} (20 needed); hand_check is not on the live database")
            return 1
        rows, children, wrong = conn.execute(
            "select count(*), count(distinct child_id),"
            " count(*) filter (where not matches or expected_state is distinct from system_state) from hand_check"
        ).fetchone()
    print(f"{notes} real notes confirmed since {since[0]} (20 needed); hand calculations: {rows} rows for "
          f"{children} children (5 needed), {wrong} not matching the system")
    return 0 if notes >= 20 and children >= 5 and rows and not wrong else 1


if __name__ == "__main__":
    sys.exit(main())
