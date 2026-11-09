"""CP-6 item 2, read for the fortnight: step dates are settings per school; a date on a holiday moves to the working day
before. Dates are counted from the fortnight's start (design: "Data" and "The engine module").

Settings: four `config` rows per school, `fortnight.freeze`, `fortnight.align`, `fortnight.approve`,
`fortnight.list_sent`, each `{"days_before_start": <int >= 0>}`. The roadmap's default numbers are NOT asserted (design,
decision 1: they are not in the repository); this proof checks the rows exist and are well-formed, and every date below
comes from a value the test itself sets.

`fortnight_cycle.step_date(conn, fortnight_id, step)` takes the step as the setting's suffix ('freeze', 'align',
'approve', 'list_sent'): `starts_on - days_before_start`, moved back while it is a Saturday, a Sunday or a holiday of the
school on any campus. It raises on a missing or malformed setting or an unknown step.

Calendar used (2031): 7 Jul and 21 Jul are Mondays; 23 Jul is a Wednesday.
"""

import datetime as dt
import json
import uuid

import pytest

from cp6_world import a_fortnight, conn, fc, school  # noqa: F401
from engine.core import db

STEPS = ("freeze", "align", "approve", "list_sent")


def setting(conn, school, step: str, value) -> None:
    conn.execute(
        "insert into config (tenant_id, key, value, description) values (%s, %s, %s::jsonb, 'CP-6 proof')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (school["t"], f"fortnight.{step}", json.dumps(value)),
    )


def holiday(conn, school, on: str, campus=None) -> None:
    conn.execute(
        "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s, 'holiday')"
        " on conflict (tenant_id, campus_id, on_date) do update set kind = 'holiday'",
        (school["t"], campus or school["campus"], on),
    )


def test_2_every_school_has_the_four_step_settings_well_formed(conn):
    """Item 2: the settings are rows per school, one per step, well-formed."""
    schools = [r["id"] for r in conn.execute("select id from tenant").fetchall()]
    assert schools, "no school in the test database"
    rows = conn.execute(
        "select tenant_id, key, value from config where key in"
        " ('fortnight.freeze', 'fortnight.align', 'fortnight.approve', 'fortnight.list_sent')"
    ).fetchall()
    have = {(r["tenant_id"], r["key"]): r["value"] for r in rows}
    for t in schools:
        for step in STEPS:
            v = have.get((t, f"fortnight.{step}"))
            assert v is not None, f"a school has no fortnight.{step} setting"
            assert isinstance(v, dict) and set(v) == {"days_before_start"}, f"fortnight.{step} is not well-formed"
            n = v["days_before_start"]
            assert isinstance(n, int) and not isinstance(n, bool) and n >= 0, f"fortnight.{step} days is {n!r}"


@pytest.mark.parametrize("step", STEPS)
def test_2_the_date_follows_the_schools_setting(conn, school, step):
    """Item 2: a changed setting changes the date."""
    f = a_fortnight(conn, school, "2031-07-07")
    setting(conn, school, step, {"days_before_start": 3})
    assert fc().step_date(conn, f["id"], step) == dt.date(2031, 7, 4)  # Friday
    setting(conn, school, step, {"days_before_start": 10})
    assert fc().step_date(conn, f["id"], step) == dt.date(2031, 6, 27)  # Friday a week earlier


def test_2_a_holiday_moves_to_the_working_day_before(conn, school):
    """Item 2: a date on a holiday moves to the working day before."""
    f = a_fortnight(conn, school, "2031-07-07")
    setting(conn, school, "freeze", {"days_before_start": 3})
    holiday(conn, school, "2031-07-04")
    assert fc().step_date(conn, f["id"], "freeze") == dt.date(2031, 7, 3)  # Thursday


def test_2_a_holiday_on_another_campus_of_the_school_counts(conn, school):
    """Item 2: a holiday of the school on any campus counts."""
    other = db.one(
        conn,
        "insert into campus (tenant_id, name) values (%s, %s) returning id",
        (school["t"], f"CP-6 proof campus {uuid.uuid4().hex[:6]}"),
    )["id"]
    f = a_fortnight(conn, school, "2031-07-07")
    setting(conn, school, "align", {"days_before_start": 3})
    holiday(conn, school, "2031-07-04", campus=other)
    assert fc().step_date(conn, f["id"], "align") == dt.date(2031, 7, 3)


def test_2_a_monday_holiday_moves_past_the_weekend_to_friday(conn, school):
    """Item 2: a Monday holiday moves back past the weekend."""
    f = a_fortnight(conn, school, "2031-07-23")  # a Wednesday
    setting(conn, school, "approve", {"days_before_start": 2})  # Monday 21 Jul
    holiday(conn, school, "2031-07-21")
    assert fc().step_date(conn, f["id"], "approve") == dt.date(2031, 7, 18)  # Friday


@pytest.mark.parametrize("days", [1, 2])  # Sunday, Saturday
def test_2_a_weekend_moves_back_to_friday(conn, school, days):
    """Item 2: a weekend is not a working day."""
    f = a_fortnight(conn, school, "2031-07-07")
    setting(conn, school, "list_sent", {"days_before_start": days})
    assert fc().step_date(conn, f["id"], "list_sent") == dt.date(2031, 7, 4)


@pytest.mark.parametrize(
    "bad", [{"days_before_start": "three"}, {"days_before_start": -1}, {"days_before_start": 2.5}, {}, 3]
)
def test_2_a_malformed_setting_raises(conn, school, bad):
    """Item 2: a malformed setting is an error, never a guessed date."""
    f = a_fortnight(conn, school, "2031-07-07")
    setting(conn, school, "freeze", bad)
    step_date = fc().step_date
    with pytest.raises(Exception):  # noqa: B017 - the design names no exception type for this
        step_date(conn, f["id"], "freeze")


def test_2_a_missing_setting_raises(conn, school):
    """Item 2: no setting is an error, never a guessed date."""
    f = a_fortnight(conn, school, "2031-07-07")
    conn.execute("delete from config where tenant_id = %s and key = 'fortnight.align'", (school["t"],))
    step_date = fc().step_date
    with pytest.raises(Exception):  # noqa: B017
        step_date(conn, f["id"], "align")


def test_2_an_unknown_step_raises(conn, school):
    """Item 2: only the four steps have dates."""
    f = a_fortnight(conn, school, "2031-07-07")
    step_date = fc().step_date
    with pytest.raises(Exception):  # noqa: B017
        step_date(conn, f["id"], "publish")
