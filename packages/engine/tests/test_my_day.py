"""CP-69: My day's engine read (engine/w2_print/my_day.py, POST /timetable/my-day): the lessons of a date that are a person's,
across her classes; a coordinator who holds none is given the school's. Uses the K2 day tests' world: one class, Fortnight 10."""

import os

import pytest

from tests.test_k2_day import call, conn, world  # noqa: F401 — the fixtures
from tests.test_notes_history_and_coordinator import _coordinator

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
DAY = "2026-11-23"


def _mine(w, **body):
    return call(w, "my-day", day=DAY, **body)


def _teaching(w):
    return [p for p in call(w, "day", day=DAY).json()["periods"] if p["kind"] not in ("fixed", "empty")]


def test_1_the_class_teacher_gets_the_lessons_of_the_class_in_period_order_each_with_its_session(world):
    got = _mine(world).json()
    assert got["scope"] == "mine" and got["kind"] == "teaching" and got["fortnight"]["number"] == 10
    assert [x["period_id"] for x in got["lessons"]] == [p["period_id"] for p in _teaching(world)]
    starts = [x["starts_at"] for x in got["lessons"]]
    assert starts == sorted(starts) and got["lessons"]
    assert all(
        x["session_id"] and x["class"]["id"] == world["k"]["class"] and x["subject"] for x in got["lessons"]
    )
    assert not any(x["subject"] is None for x in got["lessons"])


def test_2_no_break_and_no_empty_slot_is_a_lesson(world):
    assert {p["kind"] for p in call(world, "day", day=DAY).json()["periods"]} >= {"fixed"}
    assert len(_mine(world).json()["lessons"]) < len(call(world, "day", day=DAY).json()["periods"])


def _staff(world, role, subject=None, with_class=True):
    c, k = world["conn"], world["k"]
    campus = c.execute("select campus_id from school_class where id = %s", (k["class"],)).fetchone()[
        "campus_id"
    ]
    staff = c.execute(
        "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (k["tenant"], campus)
    ).fetchone()["id"]
    email = f"u.{str(staff)[:6]}@example.test"
    c.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder', %s)",
        (k["tenant"], staff, email),
    )
    c.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code, valid_from, granted_by)"
        " values (%s, %s, %s, %s, %s, '2026-01-01', 'test')",
        (k["tenant"], staff, role, k["class"] if with_class else None, subject),
    )
    return email


def test_3_a_subject_educator_gets_only_her_subjects_lessons(world):
    got = _mine(world, actor=_staff(world, "subject_educator", "NUM")).json()
    assert got["scope"] == "mine" and got["lessons"]
    assert {x["subject"] for x in got["lessons"]} == {"math"}
    assert [x["period_id"] for x in got["lessons"]] == [
        p["period_id"] for p in _teaching(world) if p["subject"] == "math"
    ]


def test_4_a_coordinator_holding_no_class_gets_the_schools_lessons(world):
    email = _coordinator(world["conn"], {"tenant": world["k"]["tenant"], "class": world["k"]["class"]})
    got = _mine(world, actor=email).json()
    assert got["scope"] == "school"
    assert [x["session_id"] for x in got["lessons"]] == [
        x["session_id"] for x in _mine(world).json()["lessons"]
    ]


def test_5_a_coordinator_on_a_day_no_class_has_lessons_gets_an_empty_school_day_not_a_refusal(world):
    email = _coordinator(world["conn"], {"tenant": world["k"]["tenant"], "class": world["k"]["class"]})
    got = call(world, "my-day", actor=email, day="2031-01-05").json()
    assert (got["scope"], got["lessons"], got["kind"]) == ("school", [], "none")


def test_6_someone_who_holds_no_class_and_reads_no_school_is_refused_in_words(world):
    r = _mine(world, actor=_staff(world, "educator", with_class=False))
    assert r.status_code == 403 and r.json()["detail"] == "No class is yours on this day."


def test_7_a_holiday_for_her_class_is_said_and_has_no_lessons(world):
    got = call(world, "my-day", day="2026-11-24").json()
    assert got["kind"] == "holiday" and got["lessons"] == [] and got["note"]


def test_8_the_answer_names_no_child(world):
    assert "child" not in _mine(world).text.lower()
