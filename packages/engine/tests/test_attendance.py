"""CP-42 (`core/attendance.py`, routes `/attendance/*`): the report's rows become a child's days, matched by name inside
the engine, never kept; reads for a child and a class. Made-up names ('Zed Testchild'), a rolled-back transaction."""

import datetime as dt
import os
import uuid

import pytest

from engine.core import attendance as at
from engine.core import db
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

D1, D2, D3 = "28 Sept 2026", "29 Sept 2026", "30 Sept 2026"


def _row(name, day, **kw):
    return {"name": name, "date": day, "program": "K2", "total_hours": "4 hrs", "in": "09:05 AM", "out": "01:05 PM",
            "absent": "---", "leave": "---"} | kw  # fmt: skip


@pytest.fixture
def world():
    with db.connect() as c:
        k = a_k2_class(c)
        child = c.execute(
            "select e.child_id from enrolment e where e.class_id = %s and e.roll_no = '3'", (k["class"],)
        ).fetchone()["child_id"]
        name = f"Zed{uuid.uuid4().hex[:6]} Testchild"
        c.execute(
            "update pii.child set first_name = %s, last_name = 'Testchild' where child_id = %s",
            (name.split()[0], child),
        )
        yield c, k, child, name
        c.rollback()


def test_the_parsers_read_the_reports_words():
    assert at.parse_date("28 Sept 2026") == dt.date(2026, 9, 28) and at.parse_date("11 Jun 2026") == dt.date(
        2026, 6, 11
    )
    assert at.parse_date("31 Feb 2026") is None and at.parse_date("x") is None
    assert at.parse_time("09:35 AM") == dt.time(9, 35) and at.parse_time("01:38 PM") == dt.time(13, 38)
    assert at.parse_time("---") is None
    assert [at.parse_minutes(x) for x in ("2 hrs, 59 mins", "4 hrs", "0 mins", "", "---")] == [
        179,
        240,
        0,
        None,
        None,
    ]
    assert at.parse_minutes("", 0) == 0


def test_status_comes_from_the_row(world):
    c, k, child, name = world
    rows = [_row(name, D1), _row(name, D2, absent="01:22 PM", **{"in": "---", "total_hours": ""}),
            _row(name, D3, leave="08:27 AM", **{"in": "---"})]  # fmt: skip
    assert at.load(c, rows)["loaded"] == 3
    got = {
        r["on_date"].day: r["status"]
        for r in c.execute("select * from attendance where child_id = %s", (child,))
    }
    assert got == {28: "present", 29: "absent", 30: "leave"}


def test_loading_twice_leaves_the_same_rows_and_a_corrected_day_replaces_its_row(world):
    c, k, child, name = world
    at.load(c, [_row(name, D1)])
    at.load(c, [_row(name, D1)])
    assert (
        c.execute("select count(*) as n from attendance where child_id = %s", (child,)).fetchone()["n"] == 1
    )
    at.load(c, [_row(name, D1, absent="01:00 PM", **{"in": "---", "total_hours": ""})])
    assert (
        c.execute("select status from attendance where child_id = %s", (child,)).fetchone()["status"]
        == "absent"
    )


def test_a_name_that_matches_no_child_is_listed_by_row_and_program_and_nothing_with_a_name_is_kept(world):
    c, k, child, name = world
    out = at.load(c, [_row(name, D1), _row("Nobody Atall", D1, program="Daycare")])
    assert out["loaded"] == 1 and out["skipped"] == [
        {"row": 2, "program": "Daycare", "why": "no child of that name"}
    ]
    assert "Nobody" not in str(out) and name not in str(out)
    assert not c.execute("select 1 from attendance where program = 'Daycare'").fetchone()


def test_a_name_two_children_share_is_not_guessed(world):
    c, k, child, name = world
    other = c.execute("select child_id from pii.child where child_id <> %s limit 1", (child,)).fetchone()
    c.execute(
        "update pii.child set first_name = %s, last_name = 'Testchild' where child_id = %s",
        (name.split()[0], other["child_id"]),
    )
    assert at.load(c, [_row(name, D1)])["skipped"][0]["why"] == "two children of that name"


def test_a_childs_read_gives_present_percent_days_and_late_arrivals_by_the_programs_start(world):
    c, k, child, name = world
    c.execute(
        "update config set value = '{}'::jsonb where key = 'attendance.start_times'"
    )  # no time set (the seed sets K2's)
    at.load(
        c,
        [
            _row(name, D1, **{"in": "09:30 AM"}),
            _row(name, D2),
            _row(name, D3, absent="01:00 PM", **{"in": "---", "total_hours": ""}),
        ],
    )
    out = at.child(c, str(child), dt.date(2026, 9, 1), dt.date(2026, 9, 30))
    assert (out["days"], out["present"], out["absent"], out["leave"], out["present_pct"]) == (
        3,
        2,
        1,
        0,
        66.7,
    )
    assert out["months"][0]["bucket"] == "2026-09" and out["months"][0]["late"] is None, (
        "no start time set: no late count"
    )
    c.execute("update config set value = '{\"K2\": \"09:15\"}'::jsonb where key = 'attendance.start_times'")
    if not c.execute("select 1 from config where key = 'attendance.start_times'").fetchone():
        c.execute(
            "insert into config (tenant_id, key, value) select id, 'attendance.start_times', '{\"K2\": \"09:15\"}'::jsonb from tenant limit 1"
        )
    assert at.child(c, str(child), dt.date(2026, 9, 1), dt.date(2026, 9, 30))["months"][0]["late"] == 1


def test_a_class_read_counts_the_children_enrolled_by_week_or_month(world):
    c, k, child, name = world
    at.load(c, [_row(name, D1), _row(name, D2, absent="01:00 PM", **{"in": "---", "total_hours": ""})])
    wk = at.klass(c, k["class"], dt.date(2026, 9, 1), dt.date(2026, 9, 30), "week")["buckets"]
    assert wk == [
        {"bucket": "2026-09-28", "days": 2, "present": 1, "absent": 1, "leave": 0, "present_pct": 50.0}
    ]
    assert (
        at.klass(c, k["class"], dt.date(2026, 9, 1), dt.date(2026, 9, 30), "month")["buckets"][0]["bucket"]
        == "2026-09"
    )


def test_the_routes_load_for_a_coordinator_only_and_read_for_the_class_staff(world, monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import deps
    from engine.api.app import app

    c, k, child, name = world
    monkeypatch.setenv("ENGINE_KEY", "test-engine-key")
    h = {"X-Engine-Key": "test-engine-key"}
    span = {"start": "2026-09-01", "end": "2026-09-30"}
    app.dependency_overrides[deps.get_conn] = lambda: c
    try:
        with TestClient(app) as client:
            rows = [_row(name, D1)]
            assert (
                client.post(
                    "/attendance/load", json={"actor": k["email"], "rows": rows}, headers=h
                ).status_code
                == 403
            )
            assert (
                client.post(
                    "/attendance/load", json={"actor": "nobody@example.org", "rows": rows}, headers=h
                ).status_code
                == 403
            )
            assert client.post("/attendance/load", json={"rows": rows}).status_code == 401
            at.load(c, rows)
            one = client.post(
                "/attendance/child",
                json={"actor": k["email"], "class_id": str(k["class"]), "roll_no": "3"} | span,
                headers=h,
            )
            assert one.status_code == 200 and one.json()["present"] == 1 and name not in one.text
            assert (
                client.post(
                    "/attendance/child",
                    json={"actor": k["email"], "class_id": str(k["class"]), "roll_no": "99"} | span,
                    headers=h,
                ).status_code
                == 404
            )
            wk = client.post(
                "/attendance/class", json={"actor": k["email"], "class_id": str(k["class"])} | span, headers=h
            )
            assert wk.status_code == 200 and wk.json()["buckets"][0]["present"] == 1
            late = {
                "actor": k["email"],
                "class_id": str(k["class"]),
                "start": "2026-09-30",
                "end": "2026-09-01",
            }
            assert client.post("/attendance/class", json=late, headers=h).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_a_child_kept_by_first_name_is_matched_by_first_name_in_the_programs_grade_and_only_when_it_is_one(
    world,
):
    c, k, child, name = world
    first = name.split()[0]
    c.execute("update pii.child set last_name = '' where child_id = %s", (child,))
    grade = c.execute(
        "select k.grade_code from enrolment e join school_class k on k.id = e.class_id where e.child_id = %s and e.to_date is null",
        (child,),
    ).fetchone()["grade_code"]
    c.execute(
        "insert into config (tenant_id, key, value) select id, 'attendance.program_grades', jsonb_build_object('Prog', %s::text)"
        " from tenant where slug = %s on conflict (tenant_id, key) do update set value = excluded.value",
        (grade, db.tenant_slug()),
    )
    row = _row(f"{first} Surnameadded", D1, program="Prog")
    out = at.load(c, [row, _row(f"{first} Surnameadded", D2, program="Elsewhere")])
    assert out["loaded"] == 1 and out["by_first_name_in_grade"] == 1
    assert out["skipped"] == [{"row": 2, "program": "Elsewhere", "why": "no child of that name"}], (
        "another program: no guess"
    )
    other = c.execute(
        "select e.child_id from enrolment e join school_class k on k.id = e.class_id where k.grade_code = %s and e.to_date is null"
        " and e.child_id <> %s limit 1",
        (grade, child),
    ).fetchone()
    if other:
        c.execute(
            "update pii.child set first_name = %s, last_name = '' where child_id = %s",
            (first, other["child_id"]),
        )
        assert at.load(c, [row])["skipped"][0]["why"] == "two children of that name", (
            "two in the grade: never picked"
        )
