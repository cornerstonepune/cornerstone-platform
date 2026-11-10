"""A lesson moved by hand (CP-12, `w2_print/tt_move.py`): a move into an empty place, a swap, what is kept, every
refusal writing nothing, the freeze and an approved fortnight. The locked proofs of the scope (specs/CP-12/proofs) are
the long form. Each test works in a transaction that is rolled back, on a made-up 2033 class (tests/tt_hand_world.py)."""

import datetime as dt
import os
import uuid

import pytest

from engine.core import db, history
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import materials_list, tt_clash, tt_move, tt_need
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

MON, TUE, WED, THU = (
    tw.START,
    tw.START + dt.timedelta(1),
    tw.START + dt.timedelta(2),
    tw.START + dt.timedelta(3),
)
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
    own = [
        c.execute(f"select * from {t} where school_class_id = %s order by id", (w["class"],)).fetchall()  # noqa: S608
        for t in ("timetable_rule", "session")
    ]
    return [
        *own,
        tw.moves(c, w),
        c.execute("select * from materials_line_source order by line_id, session_id").fetchall(),
        c.execute("select * from materials_line order by id").fetchall(),
    ]


def _lessons(c, w):
    return c.execute(
        "select count(*) as n from session where school_class_id = %s", (w["class"],)
    ).fetchone()["n"]


def test_a_move_into_an_empty_place_moves_the_lesson_with_its_id_and_leaves_the_frame(world):
    c, w = world
    maths, before = tw.session_at(c, w, MON, "p1"), _lessons(c, w)
    done = _move(c, w, MON, "p1", TUE, "p3", reason=REASON)
    assert (done["moved"], done["swapped_with"]) == ("math", None)
    assert tw.cell(c, w, TUE, "p3")["subject"] == "math" and tw.cell(c, w, MON, "p1")["subject"] is None
    assert tw.session_at(c, w, TUE, "p3")["id"] == maths["id"] and tw.session_at(c, w, MON, "p1") is None
    frame = tt_need.load(c, "K2", w["section"], "2033-34", w["number"]).frame
    assert len(frame) == 40 and frame[("A", 1, str(w["period"]["p1"]))] == ("subject", "math"), (
        "the standing frame is untouched"
    )
    _move(c, w, TUE, "p3", THU, "p3", reason=REASON)
    assert _lessons(c, w) == before, "a move makes no lesson and loses none"


def test_a_fortnight_with_no_lessons_gets_them_from_its_frame_on_its_first_move(world):
    c, w = world
    c.execute("delete from session where school_class_id = %s", (w["class"],))
    _move(c, w, MON, "p1", TUE, "p3", reason=REASON)
    assert _lessons(c, w) == 9 * 3 + 2, (
        "every teaching day's fixed, subject and specialist lessons, made once"
    )
    assert tw.cell(c, w, TUE, "p3")["subject"] == "math" and tw.cell(c, w, WED, "p3")["kind"] == "specialist"
    _move(c, w, TUE, "p3", THU, "p3", reason=REASON)
    assert _lessons(c, w) == 9 * 3 + 2, "the second move did not make the fortnight's lessons again"


def test_two_lessons_swap_and_each_keeps_its_plan_line_and_id_and_the_move_is_kept(world):
    c, w = world
    maths, english = tw.session_at(c, w, MON, "p1"), tw.session_at(c, w, THU, "p2")
    done = _move(c, w, MON, "p1", THU, "p2", reason=REASON)
    assert done["swapped_with"] == "english"
    assert tw.session_at(c, w, THU, "p2")["id"] == maths["id"]
    assert tw.session_at(c, w, MON, "p1")["id"] == english["id"]
    assert (tw.cell(c, w, THU, "p2")["subject"], tw.cell(c, w, MON, "p1")["subject"]) == ("math", "english")
    (kept,) = tw.moves(c, w)
    assert (
        kept["before"]["on_date"],
        kept["after"]["on_date"],
        kept["after"]["subject_code"],
        kept["reason"],
    ) == (
        str(MON),
        str(THU),
        "math",
        REASON,
    )
    assert kept["staff_id"] == w["staff"]["coordinator"]["id"]
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
    kept = [r for r in history.of(c, "session", str(w["class"])) if (r["after"] or {}).get("frozen")]
    assert [(r["reason"], r["after"]["fortnight_id"]) for r in kept] == [(REASON, str(w["fortnight"]))]


def test_in_an_approved_fortnight_a_move_that_leaves_an_open_clash_is_refused_unless_the_setting_is_off(
    world,
):
    c, w = world
    tw.rule(c, w, rule="block", on_date=TUE, period="p3", reason="Test block")
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


def _line(c, w, sessions, *, state="draft", from_on=MON, to_on=tw.START + dt.timedelta(13), lst=None):
    """One materials list for the class with one line fed by the given sessions."""
    lst = (
        lst
        or db.one(
            c,
            "insert into materials_list (tenant_id, school_class_id, period, from_on, to_on, state)"
            " values (%s, %s, 'fortnight', %s, %s, %s) returning id",
            (w["tenant"], w["class"], from_on, to_on, state),
        )["id"]
    )
    code = f"MAT-{uuid.uuid4().hex[:6]}"
    c.execute(
        "insert into material_item (tenant_id, code, name) values (%s, %s, %s)",
        (w["tenant"], code, f"Test material {code}"),
    )
    line = db.one(
        c,
        "insert into materials_line (tenant_id, list_id, material_code, unit, quantity, needed_on, source)"
        " values (%s, %s, %s, 'piece', 1, %s, 'educator') returning id",
        (w["tenant"], lst, code, MON),
    )["id"]
    for sid in sessions:
        c.execute(materials_list.ADD_SOURCE, (line, sid, "ACT-TEST", MON, 1))
    return line


def _list_of(c, line):
    return db.one(c, "select list_id from materials_line where id = %s", (line,))["list_id"]


def test_a_lessons_materials_follow_it_but_a_line_shared_with_another_lesson_keeps_its_date(world):
    c, w = world
    maths, english = tw.session_at(c, w, MON, "p1"), tw.session_at(c, w, THU, "p2")
    alone = _line(c, w, [maths["id"]])
    shared = _line(c, w, [maths["id"], english["id"]], lst=_list_of(c, alone))
    _move(c, w, MON, "p1", THU, "p2", reason=REASON)
    dates = {
        (r["line_id"], r["session_id"]): r["on_date"]
        for r in c.execute("select * from materials_line_source").fetchall()
    }
    assert dates[(alone, maths["id"])] == THU and dates[(shared, maths["id"])] == THU
    assert dates[(shared, english["id"])] == MON
    needed = {
        r["id"]: r["needed_on"] for r in c.execute("select id, needed_on from materials_line").fetchall()
    }
    assert needed[alone] == THU, "a line only this lesson feeds follows it"
    assert needed[shared] == MON, "a line shared with another lesson keeps its date"


def test_a_lesson_keeps_its_creation_time_on_a_swap(world):
    c, w = world
    maths, english = tw.session_at(c, w, MON, "p1"), tw.session_at(c, w, THU, "p2")
    _move(c, w, MON, "p1", THU, "p2", reason=REASON)
    got = {r["id"]: r["created_at"] for r in c.execute("select id, created_at from session").fetchall()}
    assert (got[maths["id"]], got[english["id"]]) == (maths["created_at"], english["created_at"])


@pytest.mark.parametrize(
    ("case", "why"), [("sent", "already sent"), ("outside", "outside its materials list")]
)
def test_a_lesson_whose_materials_list_is_sent_or_does_not_cover_the_new_date_is_not_moved(world, case, why):
    c, w = world
    maths = tw.session_at(c, w, MON, "p1")
    if case == "sent":
        _line(c, w, [maths["id"]], state="sent")
    else:
        _line(c, w, [maths["id"]], to_on=TUE)  # the list ends before Thursday
    was = _snapshot(c, w)
    with pytest.raises(tt_move.Refused, match=why):
        _move(c, w, MON, "p1", THU, "p2", reason=REASON)
    assert _snapshot(c, w) == was


def test_in_an_approved_fortnight_swapping_two_lessons_of_an_accepted_limit_clash_is_refused(world):
    c, w = world
    tw.rule(c, w, rule="limit", subject_code="math", span="fortnight", most=8)
    (clash,) = c.execute(
        "select clash_key from timetable_clash where fortnight_id = %s", (w["fortnight"],)
    ).fetchall()
    tt_clash.accept(c, clash["clash_key"], who=w["staff"]["coordinator"]["id"], reason=REASON, today=MON)
    tw.set_state(c, w, "approved")
    was = _snapshot(c, w)
    with pytest.raises(tt_move.Refused, match="clash"):
        _move(c, w, MON, "p1", TUE, "p1", reason=REASON)  # two maths lessons: counts and cells do not change
    assert _snapshot(c, w) == was
    assert c.execute(
        "select accepted from timetable_clash where fortnight_id = %s", (w["fortnight"],)
    ).fetchone()["accepted"]
