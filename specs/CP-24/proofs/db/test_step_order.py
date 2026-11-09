"""CP-24 item 4: `fortnight_cycle.step_date` refuses the school's step settings unless their order is
freeze > align > approve > list_sent in `days_before_start`, raising `fortnight_cycle.CycleError` (Audit F9).

Settings are the `config` rows `fortnight.<step>` = {"days_before_start": n}, set here inside a transaction rolled back.
The fortnight is made here, in 2031 (21 Jul 2031 is a Monday).
"""

import json
import uuid

import pytest

from engine.core import db
from engine.w2_print import fortnight_cycle

STEPS = ("freeze", "align", "approve", "list_sent")
GOOD = (10, 7, 5, 3)
BAD = {
    "align_before_freeze": (7, 10, 5, 3),
    "approve_same_day_as_align": (10, 5, 5, 3),
    "list_sent_before_approve": (10, 7, 3, 5),
    "reversed": (3, 5, 7, 10),
}


@pytest.fixture
def fortnight(conn, tenant):
    year = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2031-32', '2031-06-01',"
        " '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (tenant,),
    )["id"]
    return db.one(
        conn,
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s, %s, %s, 'teaching', '2031-07-21', '2031-08-03') returning id",
        (tenant, year, 100000 + uuid.uuid4().int % 800000),
    )["id"]


def _set(conn, tenant, days) -> None:
    for step, n in zip(STEPS, days, strict=True):
        conn.execute(
            "insert into config (tenant_id, key, value, description) values (%s, %s, %s::jsonb, 'CP-24 proof')"
            " on conflict (tenant_id, key) do update set value = excluded.value",
            (tenant, f"fortnight.{step}", json.dumps({"days_before_start": n})),
        )


def test_4_settings_in_order_give_a_date_for_every_step(conn, tenant, fortnight):
    _set(conn, tenant, GOOD)
    dates = [fortnight_cycle.step_date(conn, fortnight, step) for step in STEPS]
    assert dates == sorted(dates), dates


@pytest.mark.parametrize("days", BAD.values(), ids=BAD.keys())
def test_4_settings_out_of_order_are_refused(conn, tenant, fortnight, days):
    _set(conn, tenant, days)
    for step in STEPS:
        with pytest.raises(fortnight_cycle.CycleError):
            fortnight_cycle.step_date(conn, fortnight, step)
