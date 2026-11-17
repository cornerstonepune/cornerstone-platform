"""CP-71, the rules panel's door (design E1 to E3; spec Done when 6 and 9 at `/timetable/rules/*`): a limit for a day, a week or a fortnight
as a Must or a Try to, a day's limit about every subject, a count for a subject not yet placed, an educator's days away, and who may write.
The made-up 2033 school (a K2 class, a coordinator, a class educator); rolled back. No child, no real name."""

import datetime as dt
import os

import pytest

from engine.core import db
from engine.w2_print import tt_check_load, tt_pattern
from tests import tt_check_world as cw
from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
FROM = tw.START + dt.timedelta(days=14)
TODAY = tw.START - dt.timedelta(days=7)


@pytest.fixture
def door(monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import deps
    from engine.api.app import app

    with db.connect() as c:
        w = tw.school(c)
        monkeypatch.setenv("ENGINE_KEY", "k")
        app.dependency_overrides[deps.get_conn] = lambda: (yield c)
        try:
            with TestClient(app, headers={"X-Engine-Key": "k"}) as client:

                def ask(what, who="coordinator", **body):
                    actor = w["staff"][who]["email"] if who in w["staff"] else who
                    return client.post(
                        f"/timetable/rules/{what}", json={"actor": actor, "class_id": str(w["class"]), **body}
                    )

                yield ask, c, w
        finally:
            app.dependency_overrides.clear()
            c.rollback()


def limit_of(read: dict, subject: str, span: str) -> dict:
    return next(x for x in read["limits"] if x["subject_code"] == subject and x["span"] == span)


def problems(c, w):
    return tt_check_load.check(c, [str(w["class"])], FROM)


def twice_on_monday(c, w, subject="math", text="Maths"):
    edit = {
        "period_id": str(w["period"]["p2"]),
        "week": "A",
        "weekday": 1,
        "cell": "subject",
        "subject_code": subject,
        "text": text,
    }
    tt_pattern.change(c, pw.coordinator(w), str(w["class"]), [edit], FROM, today=TODAY)


def test_a_days_limit_is_a_try_to_unless_said_and_one_toggle_makes_it_a_must_that_blocks(door):
    ask, c, w = door
    twice_on_monday(c, w)
    r = ask("change", rule="limit", action="set", subject_code="math", span="day", most=1)
    assert r.status_code == 200, r.text
    assert limit_of(r.json(), "math", "day") | {"id": ""} == {
        "id": "", "subject_code": "math", "span": "day", "fewest": None, "most": 1, "level": "try"
    }  # fmt: skip
    got = problems(c, w)
    assert got["counts"] == {"must": 0, "try": 1} and got["blocking"] == []
    r = ask("change", rule="limit", action="set", subject_code="math", span="day", most=1, level="must")
    assert limit_of(r.json(), "math", "day")["level"] == "must" and len(r.json()["limits"]) == 1
    got = problems(c, w)
    assert got["counts"] == {"must": 1, "try": 0} and len(got["blocking"]) == 1


def test_a_days_limit_about_every_subject_finds_each_subject_that_is_over(door):
    ask, c, w = door
    twice_on_monday(c, w)
    any_subject = ask("read").json()["any_subject"]
    assert (
        ask("change", rule="limit", action="set", subject_code=any_subject, span="day", most=1).status_code
        == 200
    )
    day = [p for p in problems(c, w)["problems"] if p["kind"] == "most_in_day"]
    assert len(day) == 1 and "Maths" in day[0]["sentence"] and "Monday" in day[0]["sentence"]
    # every subject at once is a day's rule only: a week's count names its subject
    assert (
        ask("change", rule="limit", action="set", subject_code=any_subject, span="week", most=5).status_code
        == 422
    )


def test_a_weeks_count_is_a_must_and_may_be_said_before_the_subject_is_placed(door):
    ask, c, w = door
    unplaced = next(
        h["code"] for h in ask("read").json()["heads"] if h["code"] not in {s["code"] for s in ask("read").json()["subjects"]}
    )  # fmt: skip
    r = ask("change", rule="limit", action="set", subject_code=unplaced, span="week", fewest=2, most=4)
    assert r.status_code == 200, r.text
    assert limit_of(r.json(), unplaced, "week")["level"] == "must"
    assert (
        ask(
            "change", rule="limit", action="set", subject_code="no_such_subject", span="week", most=4
        ).status_code
        == 422
    )
    assert (
        ask("change", rule="limit", action="set", subject_code="math", span="day", fewest=1).status_code
        == 422
    )
    gone = ask("change", rule="limit", action="remove", id=limit_of(r.json(), unplaced, "week")["id"])
    assert gone.status_code == 200 and gone.json()["limits"] == []


def test_an_educator_of_the_class_is_marked_away_on_a_weekday_and_her_lessons_that_day_are_must_problems(
    door,
):
    ask, c, w = door
    hindi = cw.educator(c, w, [(w["class"], "HIN")])
    who = ask("read").json()["teaches"]
    assert who[0]["class_educator"] and who[0]["staff_id"] == str(w["staff"]["educator"]["id"])
    assert [e["staff_id"] for e in who[1:]] == [hindi] and "Hindi" in {s["label"] for s in who[1]["subjects"]}
    teacher = who[0]["staff_id"]
    assert (
        ask("change", rule="away", action="set", staff_id=teacher, weekday=1).status_code == 422
    )  # no reason
    r = ask(
        "change",
        rule="away",
        action="set",
        staff_id=teacher,
        weekday=1,
        week_code="A",
        reason="Not in school",
    )
    assert r.status_code == 200, r.text
    (row,) = r.json()["away"]
    assert (row["staff_id"], row["weekday"], row["week"], row["period_id"]) == (teacher, 1, "A", None)
    kept = db.one(
        c, "select school_class_id, staff_id::text as s from timetable_rule where id::text = %s", (row["id"],)
    )
    assert kept == {"school_class_id": None, "s": teacher}  # a row about the person, never about a class
    found = [p for p in problems(c, w)["problems"] if p["kind"] == "away"]
    assert found and all(
        p["level"] == "must" and "Monday" in p["sentence"] and "week A" in p["sentence"] for p in found
    )
    again = ask(
        "change",
        rule="away",
        action="set",
        staff_id=teacher,
        weekday=1,
        week_code="A",
        reason="Not in school",
    )
    assert again.status_code == 409
    stranger = cw.educator(c, w, [])  # on the staff list, teaches nothing here
    assert (
        ask("change", rule="away", action="set", staff_id=stranger, weekday=2, reason="x").status_code == 422
    )
    assert ask("change", rule="away", action="remove", id=row["id"]).json()["away"] == []
    assert [p for p in problems(c, w)["problems"] if p["kind"] == "away"] == []


def test_only_the_coordinators_write_a_limit_or_an_absence_and_everyone_on_the_staff_list_reads(
    door,
):  # Done when 9
    ask, c, w = door
    teacher = str(w["staff"]["educator"]["id"])
    for body in (
        {"rule": "limit", "action": "set", "subject_code": "math", "span": "day", "most": 2},
        {"rule": "away", "action": "set", "staff_id": teacher, "weekday": 3, "reason": "Not in school"},
    ):
        assert ask("change", who="educator", **body).status_code == 403, body
        assert ask("change", who="nobody@example.test", **body).status_code == 403, body
    read = ask("read", who="educator")
    assert read.status_code == 200 and read.json()["limits"] == [] and read.json()["away"] == []
    assert ask("read", who="nobody@example.test").status_code == 403
