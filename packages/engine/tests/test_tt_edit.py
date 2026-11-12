"""One lesson's topic and subject edited by hand (CP-35, `w2_print/tt_edit.py`): the edit and what it keeps, the freeze,
every refusal writing nothing, the subject check and the history row. Each test works in a transaction that is rolled
back, on the made-up 2033 class of tests/tt_hand_world.py (placeholder emails, no child, no real name)."""

import datetime as dt
import os

import pytest

from engine.core import db, history
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_edit
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

MON, THU = tw.START, tw.START + dt.timedelta(3)
REASON = "Test reason: the school agreed"


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        yield c, w
        c.rollback()


def _edit(c, w, at=(MON, "p1"), *, who=None, **change):
    s = tw.session_at(c, w, *at)
    return tt_edit.edit(c, str(s["id"]), who=who or w["staff"]["coordinator"]["id"], **change)


def _rows(c, w):
    return [
        c.execute(f"select * from {t} where school_class_id = %s order by id", (w["class"],)).fetchall()  # noqa: S608
        for t in ("session", "timetable_rule")
    ] + [c.execute("select * from change_log where tenant_id = %s order by id", (w["tenant"],)).fetchall()]


def test_a_planning_lessons_topic_changes_and_the_lesson_keeps_its_id_and_everything_else(world):
    c, w = world
    before = tw.session_at(c, w, MON, "p1")
    done = _edit(c, w, text="Counting to 20 with beads")
    after = tw.session_at(c, w, MON, "p1")
    assert (after["id"], after["plan_entry_id"], after["state"], after["kind"], after["subject_code"]) == (
        before["id"], before["plan_entry_id"], before["state"], before["kind"], before["subject_code"],
    )  # fmt: skip
    assert after["text"] == "Counting to 20 with beads" and done["text"] == after["text"]
    assert tw.cell(c, w, MON, "p1")["text"] == "Counting to 20 with beads", "the day view shows the new words"


def test_a_frozen_fortnight_needs_a_reason_and_keeps_it(world):
    c, w = world
    fc.move(c, w["fortnight"], "frozen", str(w["staff"]["coordinator"]["id"]))
    was = _rows(c, w)
    with pytest.raises(fc.CycleError, match="reason"):
        _edit(c, w, text="New words")
    assert _rows(c, w) == was
    _edit(c, w, text="New words", reason=REASON)
    assert tw.session_at(c, w, MON, "p1")["text"] == "New words"
    frozen = [
        r
        for r in history.of(c, "session", str(tw.session_at(c, w, MON, "p1")["id"]))
        if (r["after"] or {}).get("frozen")
    ]
    assert [r["reason"] for r in frozen] == [REASON]


@pytest.mark.parametrize(
    "case, why",
    [
        ("past", "past"),
        ("fixed", "fixed"),
        ("marked-done", "already marked"),
        ("nothing-given", "Give"),
        ("blank-text", "words"),
        ("no-change", "nothing"),
        ("no-such-lesson", "no lesson"),
    ],
)
def test_an_edit_that_may_not_happen_is_refused_with_why_and_writes_nothing(world, monkeypatch, case, why):
    c, w = world
    if case == "marked-done":
        c.execute("update session set state = 'done' where id = %s", (tw.session_at(c, w, MON, "p1")["id"],))
    if case == "past":
        monkeypatch.setattr(tt_edit.gate, "school_today", lambda conn: THU)
    was = _rows(c, w)
    with pytest.raises(tt_edit.Refused, match=why):
        if case == "fixed":
            _edit(c, w, at=(MON, "circle"), text="Changed")
        elif case == "nothing-given":
            _edit(c, w)
        elif case == "blank-text":
            _edit(c, w, text="   ")
        elif case == "no-change":
            _edit(c, w, text=tw.session_at(c, w, MON, "p1")["text"])
        elif case == "no-such-lesson":
            tt_edit.edit(
                c, "00000000-0000-0000-0000-000000000000", who=w["staff"]["coordinator"]["id"], text="x"
            )
        else:
            _edit(c, w, text="Changed")
    assert _rows(c, w) == was


def test_a_day_that_is_today_is_not_past(world, monkeypatch):
    c, w = world
    monkeypatch.setattr(tt_edit.gate, "school_today", lambda conn: MON)
    _edit(c, w, text="Today's lesson")
    assert tw.session_at(c, w, MON, "p1")["text"] == "Today's lesson"


def test_a_subject_change_takes_only_a_subject_the_class_is_taught(world):
    c, w = world
    was = _rows(c, w)
    with pytest.raises(tt_edit.Refused, match="not taught"):
        _edit(c, w, subject_code="zz-not-a-subject")
    assert _rows(c, w) == was
    _edit(c, w, subject_code="english")  # the class's frame has English
    assert tw.session_at(c, w, MON, "p1")["subject_code"] == "english"


def test_one_edit_writes_one_history_row_with_the_old_and_new_words_who_and_why(world):
    c, w = world
    s = tw.session_at(c, w, MON, "p1")
    _edit(c, w, text="Counting", subject_code="english", reason=REASON)
    (kept,) = [r for r in history.of(c, "session", str(s["id"])) if r["op"] == "edit"]
    assert kept["staff_id"] == w["staff"]["coordinator"]["id"] and kept["reason"] == REASON
    assert (kept["before"]["text"], kept["before"]["subject_code"]) == (s["text"], "math")
    assert (kept["after"]["text"], kept["after"]["subject_code"]) == ("Counting", "english")


def test_only_the_go_live_group_may_edit_a_lesson(world):
    c, w = world
    was = _rows(c, w)
    with pytest.raises(tt_edit.Refused, match="not in it"):
        _edit(c, w, who=w["staff"]["educator"]["id"], text="Changed")
    assert _rows(c, w) == was
