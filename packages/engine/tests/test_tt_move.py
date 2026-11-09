"""A lesson moved by hand (CP-12, `w2_print/tt_move.py`): a move into an empty place, a swap, what is kept, every
refusal writing nothing, the freeze and an approved fortnight. The locked proofs of the scope (specs/CP-12/proofs) are
the long form. Each test works in a transaction that is rolled back, on a made-up 2033 class (tests/tt_hand_world.py)."""

import datetime as dt
import os

import pytest

from engine.core import db
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import tt_move
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

MON, TUE, THU = tw.START, tw.START + dt.timedelta(1), tw.START + dt.timedelta(3)
REASON = "Test reason: the school agreed"


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        yield c, w
        c.rollback()


def _move(c, w, frm, fp, to, tp, *, reason=None, who=None):
    return tt_move.move(
        c, "K2", w["section"], "2033-34", frm, tw.ORD[fp], to, tw.ORD[tp],
        who=who or w["staff"]["coordinator"]["id"], reason=reason,
    )  # fmt: skip


def _snapshot(c, w):
    return [
        c.execute(f"select * from {t} where school_class_id = %s order by id", (w["class"],)).fetchall()  # noqa: S608
        for t in ("timetable_slot", "session", "timetable_move")
    ]


def test_a_move_into_an_empty_place_lays_the_fortnight_down_once_and_moves_the_lesson_with_its_id(world):
    c, w = world
    maths = tw.session_at(c, w, MON, "p1")
    done = _move(c, w, MON, "p1", TUE, "p3", reason=REASON)
    assert (done["moved"], done["swapped_with"]) == ("math", None)
    layer = c.execute(
        "select count(*) as n from timetable_slot where school_class_id = %s and fortnight_id = %s",
        (w["class"], w["fortnight"]),
    ).fetchone()["n"]
    assert layer == 9 * 4, "one dated row per teaching day and period (the holiday has none)"
    assert tw.cell(c, w, TUE, "p3")["subject"] == "math" and tw.cell(c, w, MON, "p1")["subject"] is None
    assert tw.session_at(c, w, TUE, "p3")["id"] == maths["id"] and tw.session_at(c, w, MON, "p1") is None
    assert (
        c.execute(
            "select count(*) as n from timetable_slot where school_class_id = %s and valid_to is null",
            (w["class"],),
        ).fetchone()["n"]
        == 40
    ), "the standing frame is untouched"
    _move(c, w, TUE, "p3", THU, "p3", reason=REASON)
    assert (
        layer
        == c.execute(
            "select count(*) as n from timetable_slot where school_class_id = %s and fortnight_id = %s",
            (w["class"], w["fortnight"]),
        ).fetchone()["n"]
    ), "the second move did not lay the fortnight down again"


def test_two_lessons_swap_and_each_keeps_its_plan_line_and_id_and_the_move_is_kept(world):
    c, w = world
    maths, english = tw.session_at(c, w, MON, "p1"), tw.session_at(c, w, THU, "p2")
    done = _move(c, w, MON, "p1", THU, "p2", reason=REASON)
    assert done["swapped_with"] == "english"
    assert tw.session_at(c, w, THU, "p2")["id"] == maths["id"]
    assert tw.session_at(c, w, MON, "p1")["id"] == english["id"]
    assert (tw.cell(c, w, THU, "p2")["subject"], tw.cell(c, w, MON, "p1")["subject"]) == ("math", "english")
    (kept,) = c.execute("select * from timetable_move where school_class_id = %s", (w["class"],)).fetchall()
    assert (kept["from_date"], kept["to_date"], kept["moved_subject"], kept["reason"]) == (
        MON,
        THU,
        "math",
        REASON,
    )
    assert kept["who"] == w["staff"]["coordinator"]["id"] and kept["fortnight_id"] == w["fortnight"]
    assert "Test Person" not in str(kept)


@pytest.mark.parametrize(
    ("case", "why"),
    [
        ("fixed", "fixed"),
        ("holiday", "holiday"),
        ("other-fortnight", "another fortnight"),
        ("same-place", "same place"),
        ("marked-done", "marked done"),
        ("no-period", "no one period"),
    ],
)
def test_a_move_that_may_not_happen_is_refused_with_why_and_writes_nothing(world, case, why):
    c, w = world
    if case == "marked-done":
        c.execute("update session set state = 'done' where id = %s", (tw.session_at(c, w, MON, "p1")["id"],))
    was = _snapshot(c, w)
    args = {
        "fixed": (MON, "p1", THU, "circle"),
        "holiday": (MON, "p1", tw.HOLIDAY, "p2"),
        "other-fortnight": (MON, "p1", tw.START + dt.timedelta(14), "p2"),
        "same-place": (MON, "p1", MON, "p1"),
        "marked-done": (MON, "p1", THU, "p2"),
        "no-period": (MON, "p1", THU, "p2"),
    }[case]
    with pytest.raises(tt_move.Refused, match=why):
        if case == "no-period":
            tt_move.move(
                c, "K2", w["section"], "2033-34", MON, 92, THU, 7, who=w["staff"]["coordinator"]["id"]
            )
        else:
            _move(c, w, *args, reason=REASON)
    assert _snapshot(c, w) == was


def test_a_day_already_past_is_refused(world, monkeypatch):
    c, w = world
    monkeypatch.setattr(tt_move.gate, "school_today", lambda conn: TUE)
    with pytest.raises(tt_move.Refused, match="past"):
        _move(c, w, MON, "p1", THU, "p2", reason=REASON)
    _move(c, w, TUE, "p1", THU, "p2", reason=REASON)  # today itself is not past


def test_a_frozen_fortnight_needs_a_reason_and_keeps_it(world):
    c, w = world
    fc.move(c, w["fortnight"], "frozen", str(w["staff"]["coordinator"]["id"]))
    with pytest.raises(fc.CycleError, match="reason"):
        _move(c, w, MON, "p1", THU, "p2")
    _move(c, w, MON, "p1", THU, "p2", reason=REASON)
    kept = c.execute(
        "select reason from fortnight_edit where fortnight_id = %s and kind = 'frozen_change'",
        (w["fortnight"],),
    ).fetchall()
    assert [r["reason"] for r in kept] == [REASON]


def test_in_an_approved_fortnight_a_move_that_leaves_an_open_clash_is_refused_unless_the_setting_is_off(
    world,
):
    c, w = world
    c.execute(
        "insert into timetable_block (tenant_id, school_class_id, on_date, period_id, reason)"
        " values (%s, %s, %s, %s, 'Test block')",
        (w["tenant"], w["class"], TUE, w["period"]["p3"]),
    )
    tw.set_state(c, w, "approved")
    with pytest.raises(tt_move.Refused, match="clash"):
        _move(c, w, MON, "p1", TUE, "p3", reason=REASON)
    assert tw.cell(c, w, TUE, "p3")["subject"] is None, "something was written"
    c.execute(
        "insert into config (tenant_id, key, value, description) values (%s, 'timetable.open_clash_blocks_approval',"
        " 'false', 't') on conflict (tenant_id, key) do update set value = 'false'",
        (w["tenant"],),
    )
    _move(c, w, MON, "p1", TUE, "p3", reason=REASON)
    assert tw.cell(c, w, TUE, "p3")["subject"] == "math"
