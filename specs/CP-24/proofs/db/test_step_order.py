"""CP-24 item 4: `engine live watch` (`watch.problems`) reports a problem when the school's step settings are not in the
order freeze > align > approve > list_sent (days before the fortnight starts, largest first); `step_date` keeps working
with whatever values are set (Audit F9).

Settings are the `config` rows `fortnight.<step>` = {"days_before_start": n}, set here inside a transaction rolled back.
The fortnight is made here, in 2031: 21 Jul 2031 is a Monday, so 3, 5, 7 and 10 days before it are all weekdays.
"""

import datetime as dt
import json
import uuid

import pytest

from engine.checks import watch
from engine.core import db
from engine.w2_print import fortnight_cycle

PLENTY = 50 * 10**9  # bytes free: no disk line
START = dt.date(2031, 7, 21)
STEPS = ("freeze", "align", "approve", "list_sent")
GOOD = {"tight": (19, 16, 13, 10), "spread": (20, 12, 5, 1)}
BAD = {
    "align_before_freeze": (7, 10, 5, 3),
    "approve_same_day_as_align": (10, 5, 5, 3),
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
        " values (%s, %s, %s, 'teaching', %s, '2031-08-03') returning id",
        (tenant, year, 100000 + uuid.uuid4().int % 800000, START),
    )["id"]


def _put(conn, tenant, step, value) -> None:
    conn.execute(
        "insert into config (tenant_id, key, value, description) values (%s, %s, %s::jsonb, 'CP-24 proof')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (tenant, f"fortnight.{step}", json.dumps(value)),
    )


def _set(conn, tenant, days) -> None:
    for step, n in zip(STEPS, days, strict=True):
        _put(conn, tenant, step, {"days_before_start": n})


def _lines(conn, word: str) -> list[str]:
    return [ln for ln in watch.problems(conn, PLENTY) if word in ln]


@pytest.mark.parametrize("days", GOOD.values(), ids=GOOD.keys())
def test_4_settings_in_order_are_no_problem(conn, tenant, days):
    _set(conn, tenant, days)
    assert _lines(conn, "fortnight step") == []


@pytest.mark.parametrize("days", BAD.values(), ids=BAD.keys())
def test_4_settings_out_of_order_are_a_problem(conn, tenant, days):
    _set(conn, tenant, days)
    assert _lines(conn, "fortnight steps"), f"the watch says nothing of step settings {days}"


@pytest.mark.parametrize("days", BAD.values(), ids=BAD.keys())
def test_4_step_date_still_answers_out_of_order(conn, tenant, fortnight, days):
    _set(conn, tenant, days)
    held = conn.execute(
        "select count(*) as n from school_day where tenant_id = %s and kind = 'holiday' and on_date between %s and %s",
        (tenant, START - dt.timedelta(days=10), START),
    ).fetchone()["n"]
    if held:
        pytest.fail("the test database holds a holiday in July 2031 someone committed; rebuild it (bin/testdb fresh)")
    for step, n in zip(STEPS, days, strict=True):
        assert fortnight_cycle.step_date(conn, fortnight, step) == START - dt.timedelta(days=n), step


@pytest.mark.parametrize("case", ["malformed", "missing"])
def test_4_a_bad_or_missing_setting_is_a_problem(conn, tenant, case):
    _set(conn, tenant, GOOD["tight"])
    if case == "malformed":
        _put(conn, tenant, "align", {"days_before_start": "ten"})
    else:
        conn.execute("delete from config where tenant_id = %s and key = 'fortnight.approve'", (tenant,))
    assert _lines(conn, "fortnight step settings"), f"the watch says nothing of a {case} step setting"
