"""CP-71, Done when 8 (specs/CP-71/spec.md) and the two doors that go with it: publish writes the lessons of a fortnight from the pattern, and
`build/home` says what the Build page's home needs. Also the stale-version refusal (two coordinators on one class). Each test works in a
transaction that is rolled back, on the made-up 2033 school: a Grade 2 class with two periods, the fortnight of 4 July with a holiday on
Tuesday 12 July, no child, no real name."""

import datetime as dt
import os

import pytest

from engine.core import db
from engine.w2_print import tt_build_home, tt_check_load, tt_pattern, tt_pattern_copy, tt_publish
from tests import tt_check_world as cw
from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
START = tw.START
TODAY = START - dt.timedelta(days=7)


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        w["g2"] = cw.g2(c, w)
        k, p = w["g2"]["class"], w["g2"]["period"]
        paint = [
            {"period_id": p["early"], "week": "A", "weekday": 1, "cell": "subject", "subject_code": "NUM"},  # Monday 4 July
            {"period_id": p["early"], "week": "B", "weekday": 2, "cell": "subject", "subject_code": "NUM"},  # Tuesday 12 July: the holiday
            *({"period_id": p["late"], "week": wk, "weekday": 3, "cell": "subject", "subject_code": "ENG"} for wk in "AB"),  # both Wednesdays
        ]  # fmt: skip
        tt_pattern.change(c, pw.coordinator(w), str(k), paint, START, today=TODAY)
        yield c, w
        c.rollback()


def lessons(c, k):
    return sorted(
        (r["on_date"], r["label"], r["subject_code"], r["kind"])
        for r in c.execute(
            "select d.on_date, p.label, s.subject_code, s.kind from session s join school_day d on d.id = s.school_day_id"
            " join period p on p.id = s.period_id where s.school_class_id = %s",
            (k,),
        ).fetchall()
    )


def publish(c, w, **kw):
    return tt_publish.publish(c, pw.coordinator(w), w["g2"]["class"], w["number"], today=TODAY, **kw)


def test_publish_writes_one_lesson_per_cell_per_school_day_and_none_on_a_holiday(world):  # Done when 8
    c, w = world
    k = w["g2"]["class"]
    done = publish(c, w)
    d = dt.date
    assert lessons(c, k) == [  # worked out by hand from the four cells painted above
        (d(2033, 7, 4), "G2 early", "NUM", "subject"),
        (d(2033, 7, 6), "G2 late", "ENG", "subject"),
        (d(2033, 7, 13), "G2 late", "ENG", "subject"),
    ]
    assert done["written"] == 3 and done["holidays"] == [d(2033, 7, 12).isoformat()]


def test_a_dry_publish_writes_nothing_and_a_published_fortnight_is_not_published_twice(world):
    c, w = world
    k = w["g2"]["class"]
    assert publish(c, w, dry=True)["written"] == 3 and lessons(c, k) == []
    publish(c, w)
    with pytest.raises(tt_pattern.Refused, match="already has"):
        publish(c, w)
    assert len(lessons(c, k)) == 3


def test_a_must_problem_refuses_publish_with_its_sentence_until_it_is_allowed_and_a_try_to_never_does(
    world,
):  # Done when 8
    c, w = world
    k = str(w["g2"]["class"])
    cw.limit(c, w, k, "NUM", "day", 0, weight=3)  # Maths twice a day at most: broken, but only a Try to
    publish(c, w, dry=True)
    cw.limit(c, w, k, "NUM", "fortnight", 1)  # Maths at most once in the fortnight: two are painted
    with pytest.raises(tt_pattern.Refused) as no:
        publish(c, w)
    assert no.value.status == 409 and "Maths" in str(no.value) and "the most is 1" in str(no.value)
    assert lessons(c, k) == []
    first = tt_check_load.check(c, [k], START)["problems"]
    key = next(p["allow_key"] for p in first if p["level"] == "must")
    tt_check_load.allow(c, pw.coordinator(w), [k], key, "the school keeps both", START, today=TODAY)
    assert publish(c, w)["written"] == 3


def test_only_the_coordinators_publish(world):  # Done when 9 for the new write door
    c, w = world
    with pytest.raises(tt_pattern.Refused) as no:
        tt_publish.publish(c, w["staff"]["educator"]["id"], w["g2"]["class"], w["number"], today=TODAY)
    assert no.value.status == 403


def test_a_second_coordinator_working_from_an_old_page_is_refused_and_nothing_is_merged(world):
    c, w = world
    k = str(w["g2"]["class"])
    mine = tt_pattern.read(c, k, START)["version"]
    one = [
        {
            "period_id": w["g2"]["period"]["late"],
            "week": "A",
            "weekday": 4,
            "cell": "subject",
            "subject_code": "HIN",
        }
    ]
    tt_pattern.change(c, pw.coordinator(w), k, one, START, today=TODAY, version=mine)
    other = [{**one[0], "weekday": 5}]
    with pytest.raises(tt_pattern.Refused) as no:  # the same old version, a second person
        tt_pattern.change(c, pw.coordinator(w), k, other, START, today=TODAY, version=mine)
    assert no.value.status == 409 and "changed since" in str(no.value)
    assert not [x for x in pw.cells(c, k, START) if x[2] == 5 and x[4] == "HIN"]
    fresh = tt_pattern.read(c, k, START)["version"]
    assert fresh != mine
    tt_pattern_copy.copy_week(
        c, pw.coordinator(w), k, "A", "B", START, today=TODAY, version=fresh
    )  # a current one goes through
    with pytest.raises(
        tt_pattern.Refused
    ):  # and the copy changed the pattern, so the version it came with is stale now
        tt_pattern_copy.copy_week(c, pw.coordinator(w), k, "A", "B", START, today=TODAY, version=fresh)


def test_the_build_home_says_for_each_class_what_is_placed_what_is_open_and_when_it_cannot_publish(world):
    c, w = world
    bare = pw.empty_class(c, w, "G3")
    home = tt_build_home.home(c, START)
    by = {x["class_id"]: x for x in home["classes"]}
    g2 = by[str(w["g2"]["class"])]
    assert (g2["has_day"], g2["placed"], g2["total"], g2["state"]) == (True, 4, 20, "waiting")
    assert g2["next_fortnight"]["number"] == w["number"] and g2["problems"] == {"must": 0, "try": 0}
    assert by[bare]["has_day"] is False and by[bare]["state"] == "todo"
    assert home["can_publish"] is True
    cw.limit(c, w, str(w["g2"]["class"]), "NUM", "fortnight", 1)
    home = tt_build_home.home(c, START)
    assert home["can_publish"] is False and "Maths" in home["blocked_by"]
    assert {x["class_id"]: x for x in home["classes"]}[str(w["g2"]["class"])]["state"] == "fix"
