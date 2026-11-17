"""CP-71, Done when 1 to 4, 9 and 10 (specs/CP-71/spec.md): the pattern the coordinators build, as the engine keeps it. Each test works in a
transaction that is rolled back, on the made-up 2033 school of tests/tt_pattern_world.py: no child, no real name, no old sheet."""

import datetime as dt
import os

import pytest

from engine.core import db
from engine.w2_print import tt_pattern, tt_pattern_copy
from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
FROM = tw.START + dt.timedelta(days=14)  # the Monday after the world's published fortnight
TODAY = tw.START - dt.timedelta(days=7)


@pytest.fixture
def world():
    with db.connect() as c:
        yield c, tw.school(c)
        c.rollback()


def go(c, w, klass, edits, on=FROM, **kw):
    return tt_pattern.change(c, pw.coordinator(w), str(klass), edits, on, today=TODAY, **kw)


def test_a_class_with_no_day_given_another_class_has_its_periods_and_fixed_rows_and_nothing_else(
    world,
):  # Done when 1
    c, w = world
    fresh = pw.empty_class(c, w)
    done = tt_pattern_copy.start_from(c, pw.coordinator(w), fresh, str(w["class"]), FROM, today=TODAY)
    got = tt_pattern.read(c, fresh, FROM)
    assert [(p["label"], p["starts_at"], p["fixed"]) for p in got["periods"]] == [
        (f"Test {n}", tw.TIMES[n], n == "circle") for n in ("circle", "p1", "p2", "p3")
    ]
    assert pw.cells(c, fresh, FROM) == sorted(
        ("Test circle", wk, wd, "fixed", None, "Circle") for wk in "AB" for wd in range(1, 6)
    )
    assert len(done["inverse"]) == 10 and done["pattern"]["cells"] == got["cells"]
    with pytest.raises(tt_pattern.Refused, match="already has"):  # a class that has a day is not started over
        tt_pattern_copy.start_from(c, pw.coordinator(w), fresh, str(w["class"]), FROM, today=TODAY)


def test_twelve_changes_are_written_all_or_none_and_the_inverse_puts_the_pattern_back(world):  # Done when 2
    c, w = world
    k = w["class"]
    before = pw.cells(c, k, FROM)
    twelve = [
        pw.edit(w, "p3", wk, wd, cell="subject", subject_code="english", text="English")
        for wk in "AB"
        for wd in range(1, 6)
    ]
    twelve += [pw.edit(w, "p1", wk, 1, cell="specialist", subject_code="music", text="Music") for wk in "AB"]
    bad = [
        *twelve[:11],
        pw.edit(w, "p1", "A", 9, cell="subject", subject_code="math", text="Maths"),
    ]  # no ninth weekday
    with pytest.raises(tt_pattern.Refused):
        go(c, w, k, bad)
    assert pw.cells(c, k, FROM) == before  # none of the eleven good ones stayed
    done = go(c, w, k, twelve)
    assert len(done["inverse"]) == 12 and pw.cells(c, k, FROM) != before
    assert ("Test p3", "B", 5, "subject", "english", "English") in pw.cells(c, k, FROM)
    go(c, w, k, done["inverse"])
    assert pw.cells(c, k, FROM) == before


def test_fill_a_period_every_day_and_copy_week_a_to_b_never_replace_a_fixed_cell(world):  # Done when 3
    c, w = world
    k = w["class"]
    go(
        c, w, k, [pw.edit(w, "p1", "B", 4, cell="fixed", text="Assembly")]
    )  # one fixed cell among the subjects
    filled = tt_pattern_copy.fill_period(
        c,
        pw.coordinator(w),
        str(k),
        str(w["period"]["p1"]),
        dict(cell="subject", subject_code="english", text="English"),
        FROM,
        today=TODAY,
    )
    got = pw.cells(c, k, FROM)
    assert ("Test p1", "A", 1, "subject", "english", "English") in got
    assert sum(1 for x in got if x[0] == "Test p1" and x[3] == "subject") == 9
    assert ("Test p1", "B", 4, "fixed", None, "Assembly") in got
    assert filled["skipped"] == [
        {"period_id": str(w["period"]["p1"]), "week": "B", "weekday": 4, "why": "fixed"}
    ]
    # circle is fixed on all ten days: filling it changes nothing
    again = tt_pattern_copy.fill_period(
        c,
        pw.coordinator(w),
        str(k),
        str(w["period"]["circle"]),
        dict(cell="subject", subject_code="math", text="Maths"),
        FROM,
        today=TODAY,
    )
    assert len(again["skipped"]) == 10 and pw.cells(c, k, FROM) == got
    go(
        c,
        w,
        k,
        [
            pw.edit(w, "p2", "A", 5, cell="subject", subject_code="hindi", text="Hindi"),
            pw.edit(w, "p2", "B", 5, cell="fixed", text="Reflection"),
            pw.edit(w, "p3", "A", 1, cell="subject", subject_code="math", text="Maths"),
        ],
    )
    tt_pattern_copy.copy_week(c, pw.coordinator(w), str(k), "A", "B", FROM, today=TODAY)
    after = pw.cells(c, k, FROM)
    by = {wk: {(x[0], x[2]): x[3:] for x in after if x[1] == wk} for wk in "AB"}
    fixed = {k for wk in "AB" for k, v in by[wk].items() if v[0] == "fixed"}
    assert {k: v for k, v in by["A"].items() if k not in fixed} == {
        k: v for k, v in by["B"].items() if k not in fixed
    }
    assert ("Test p2", "B", 5, "fixed", None, "Reflection") in after and (
        "Test p3",
        "B",
        1,
        "subject",
        "math",
        "Maths",
    ) in after
    assert ("Test p2", "B", 5, "subject", "hindi", "Hindi") not in after


def test_a_change_dated_from_a_fortnight_leaves_the_earlier_fortnights_lessons_and_pattern_as_they_were(
    world,
):  # Done when 4
    c, w = world
    k = w["class"]
    lessons, then = pw.lessons_signature(c, k), pw.cells(c, k, tw.START)
    assert lessons  # the world's fortnight is published
    go(c, w, k, [pw.edit(w, "p1", "A", 1, cell="subject", subject_code="hindi", text="Hindi")], FROM)
    assert pw.lessons_signature(c, k) == lessons and pw.cells(c, k, tw.START) == then
    assert ("Test p1", "A", 1, "subject", "hindi", "Hindi") in pw.cells(c, k, FROM)
    tw.set_state(c, w, "frozen")  # a change that would reach a frozen fortnight asks why
    with pytest.raises(tt_pattern.Refused, match="reason"):
        go(c, w, k, [pw.edit(w, "p1", "A", 2, cell="subject", subject_code="hindi", text="Hindi")], tw.START)
    go(
        c,
        w,
        k,
        [pw.edit(w, "p1", "A", 2, cell="subject", subject_code="hindi", text="Hindi")],
        tw.START,
        reason="Hindi moved",
    )
    assert pw.lessons_signature(c, k) == lessons  # a pattern change writes rules, never lessons


def test_a_person_outside_the_coordinators_group_may_read_the_pattern_and_is_refused_every_write(
    world,
):  # Done when 9
    c, w = world
    k, teacher = str(w["class"]), w["staff"]["educator"]["id"]
    assert tt_pattern.read(c, k, FROM)["class"]["id"] == k  # reading is open to staff
    edit = pw.edit(w, "p1", "A", 1, cell="subject", subject_code="hindi", text="Hindi")
    with pytest.raises(tt_pattern.Refused) as no:
        tt_pattern.change(c, teacher, k, [edit], FROM, today=TODAY)
    assert no.value.status == 403
    for call in (
        lambda: tt_pattern_copy.copy_week(c, teacher, k, "A", "B", FROM, today=TODAY),
        lambda: tt_pattern_copy.fill_period(
            c,
            teacher,
            k,
            edit["period_id"],
            dict(cell="subject", subject_code="math", text="M"),
            FROM,
            today=TODAY,
        ),
        lambda: tt_pattern_copy.start_from(c, teacher, pw.empty_class(c, w), k, FROM, today=TODAY),
    ):
        with pytest.raises(tt_pattern.Refused) as no:
            call()
        assert no.value.status == 403
    assert ("Test p1", "A", 1, "subject", "hindi", "Hindi") not in pw.cells(c, k, FROM)


def test_a_day_shape_with_a_last_day_is_not_offered_after_it(world):  # Done when 10
    c, w = world
    k = w["class"]
    last = FROM - dt.timedelta(days=1)
    c.execute("update period set valid_to = %s where id = %s", (last, w["period"]["p3"]))
    assert "Test p3" in [p["label"] for p in tt_pattern.read(c, k, last)["periods"]]
    assert "Test p3" not in [p["label"] for p in tt_pattern.read(c, k, FROM)["periods"]]
    with pytest.raises(tt_pattern.Refused, match="not one of"):
        go(c, w, k, [pw.edit(w, "p3", "A", 1, cell="subject", subject_code="math", text="Maths")], FROM)
