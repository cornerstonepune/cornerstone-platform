"""The clashes of a fortnight (CP-12, the view `timetable_clash` and `w2_print/tt_clash.py`): one per kind, worked out
from the timetable as it stands; an acceptance with its reason, who may give one, and what reopens it; the count the
approve command reads, and the command itself (`engine fortnight approve`, `engine timetable clashes`). Each test works
in a transaction that is rolled back, on a made-up 2033 class (tests/tt_hand_world.py)."""

import datetime as dt
import os

import psycopg
import pytest
from typer.testing import CliRunner

from engine.cli import app
from engine.core import db
from engine.w2_print import tt_clash, tt_move
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

MON, TUE = tw.START, tw.START + dt.timedelta(1)
B_MON = tw.START + dt.timedelta(7)
REASON = "Test reason: the school agreed"


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        yield c, w
        c.rollback()


def _clashes(c, w):
    return c.execute(
        "select * from timetable_clash where fortnight_id = %s order by kind, week_code nulls last",
        (w["fortnight"],),
    ).fetchall()


def _limit(c, w, subject, span, fewest=None, most=None):
    c.execute(
        "insert into timetable_limit (tenant_id, school_class_id, subject_code, span, fewest, most)"
        " values (%s, %s, %s, %s, %s, %s)",
        (w["tenant"], w["class"], subject, span, fewest, most),
    )


def _block(c, w, **where):
    cols = ", ".join(where)
    c.execute(
        f"insert into timetable_block (tenant_id, school_class_id, {cols}, reason)"  # noqa: S608
        f" values (%s, %s, {', '.join('%s' for _ in where)}, 'Test block')",
        (w["tenant"], w["class"], *where.values()),
    )


def _move(c, w, frm, fp, to, tp):
    tt_move.move(
        c, "K2", w["section"], "2033-34", frm, tw.ORD[fp], to, tw.ORD[tp], who=w["staff"]["coordinator"]["id"],
        reason=REASON,
    )  # fmt: skip


def test_a_fortnight_that_breaks_no_rule_has_no_clash(world):
    c, w = world
    _limit(c, w, "math", "week", fewest=4, most=5)
    _block(c, w, on_date=TUE, period_id=w["period"]["p3"])
    assert _clashes(c, w) == []


def test_each_kind_is_listed_from_the_frame_and_from_the_layer_with_the_lessons_involved(world):
    c, w = world
    _block(
        c, w, weekday=2, week_code="B"
    )  # every period of week B's Tuesday, which is the holiday: no lesson there
    _block(c, w, weekday=1, week_code="B", period_id=w["period"]["p1"])  # week B's Monday maths
    _limit(c, w, "math", "fortnight", most=8)  # nine maths lessons (the holiday takes one)
    _limit(c, w, "art", "fortnight", fewest=1)  # no art at all
    rows = _clashes(c, w)
    kinds = [(r["kind"], r["week_code"]) for r in rows]
    assert kinds == [("blocked", "B"), ("over_limit", None), ("under_limit", None)], kinds
    blocked, over, under = rows
    assert blocked["places"] == [
        {"class": str(w["class"]), "date": B_MON.isoformat(), "period": str(w["period"]["p1"])}
    ]
    assert len(over["places"]) == 9 and "most 8" in over["detail"]
    assert under["places"] == [] and "fewest 1" in under["detail"]
    assert all(not r["accepted"] and r["fortnight_number"] == w["number"] for r in rows)

    _move(c, w, B_MON, "p1", B_MON, "p3")  # the maths lesson leaves the blocked period: the layer is read now
    rows = _clashes(c, w)
    assert [r["kind"] for r in rows] == ["over_limit", "under_limit"]


def test_a_week_limit_counts_each_week_and_a_move_back_clears_it(world):
    c, w = world
    _limit(c, w, "math", "week", fewest=4, most=5)  # week B has four: the holiday takes one
    _move(c, w, B_MON, "p1", TUE, "p3")  # a week B lesson into week A
    assert [(r["kind"], r["week_code"]) for r in _clashes(c, w)] == [
        ("over_limit", "A"),
        ("under_limit", "B"),
    ]
    _move(c, w, TUE, "p3", B_MON, "p1")
    assert _clashes(c, w) == []


def test_an_acceptance_is_kept_with_who_and_why_and_reopens_when_its_limit_changes(world):
    c, w = world
    _limit(c, w, "math", "fortnight", most=8)
    (clash,) = _clashes(c, w)
    coordinator, educator = w["staff"]["coordinator"]["id"], w["staff"]["educator"]["id"]
    for bad, who, reason in (
        ("reason", coordinator, "  "),
        ("group", educator, REASON),
        ("not a clash", coordinator, REASON),
    ):
        with pytest.raises(tt_clash.Refused, match=bad):
            key = "no-such-key" if bad == "not a clash" else clash["clash_key"]
            tt_clash.accept(c, key, who=who, reason=reason, today=MON)
    done = tt_clash.accept(c, clash["clash_key"], who=coordinator, reason=REASON, today=MON)
    assert done["kind"] == "over_limit" and done["fortnight"] == f"FN{w['number']}"
    (now,) = _clashes(c, w)
    assert now["accepted"] is True
    (row,) = c.execute(
        "select * from timetable_clash_accept where clash_key = %s", (clash["clash_key"],)
    ).fetchall()
    assert (row["who"], row["reason"], row["kind"]) == (coordinator, REASON, "over_limit")
    with pytest.raises(tt_clash.Refused, match="already"):
        tt_clash.accept(c, clash["clash_key"], who=coordinator, reason=REASON, today=MON)
    with pytest.raises(psycopg.Error), c.transaction():
        c.execute("delete from timetable_clash_accept where id = %s", (row["id"],))
    c.execute("update timetable_limit set most = 7 where school_class_id = %s", (w["class"],))
    (reopened,) = _clashes(c, w)
    assert reopened["accepted"] is False and reopened["clash_key"] != clash["clash_key"]
    assert tt_clash.open_by_kind(c, w["fortnight"]) == {"over_limit": 1}
    assert (
        tt_clash.words({"over_limit": 1, "blocked": 2})
        == "3 clashes nobody accepted (over_limit 1, blocked 2)"
    )


def test_the_approve_command_refuses_an_open_clash_and_the_list_names_no_one(world, monkeypatch):
    c, w = world
    _limit(c, w, "math", "fortnight", most=8)
    tw.set_state(c, w, "aligned")
    monkeypatch.setattr(db, "connect", lambda url=None: tw.shared(c))
    run = CliRunner()
    args = ["fortnight", "approve", "--year", "2033-34", "--fortnight", str(w["number"]), "--by"]
    out = run.invoke(app, [*args, w["staff"]["coordinator"]["email"]])
    assert out.exit_code == 1 and "clash" in out.output and "Nothing was written" in out.output, out.output
    assert (
        db.one(c, "select state from fortnight_cycle where fortnight_id = %s", (w["fortnight"],))["state"]
        == "aligned"
    )
    listed = run.invoke(app, ["timetable", "clashes", "--year", "2033-34", "--fortnight", str(w["number"])])
    assert listed.exit_code == 0 and f"FN{w['number']}" in listed.output and "over_limit" in listed.output
    assert "Test Person" not in listed.output and "@example.org" not in listed.output
    out = run.invoke(app, [*args, "nobody@example.org"])
    assert out.exit_code != 0 and "--by" in out.output


def _accept(c, w, clash):
    tt_clash.accept(c, clash["clash_key"], who=w["staff"]["coordinator"]["id"], reason=REASON, today=MON)


def test_an_accepted_limit_clash_reopens_when_a_lesson_in_it_moves_within_the_same_week(world):
    c, w = world
    _limit(c, w, "math", "fortnight", most=8)
    (clash,) = _clashes(c, w)
    _accept(c, w, clash)
    assert _clashes(c, w)[0]["accepted"] is True
    _move(c, w, MON, "p1", TUE, "p3")  # a maths lesson to another place of week A: the counts do not change
    (now,) = _clashes(c, w)
    assert now["accepted"] is False, "an acceptance carried over to a lesson that moved again"


def test_a_different_lesson_swapped_into_an_accepted_blocked_cell_reopens_it(world):
    c, w = world
    _block(c, w, on_date=TUE, period_id=w["period"]["p3"])
    _move(c, w, MON, "p1", TUE, "p3")  # maths into the blocked cell
    (clash,) = [r for r in _clashes(c, w) if r["kind"] == "blocked"]
    _accept(c, w, clash)
    _move(c, w, TUE, "p3", MON, "p2")  # English now sits in the blocked cell
    (now,) = [r for r in _clashes(c, w) if r["kind"] == "blocked"]
    assert now["accepted"] is False and now["clash_key"] != clash["clash_key"]


def test_the_same_lesson_leaving_and_coming_back_reopens_an_accepted_clash(world):
    c, w = world
    _block(c, w, on_date=TUE, period_id=w["period"]["p3"])
    _move(c, w, MON, "p1", TUE, "p3")
    (clash,) = [r for r in _clashes(c, w) if r["kind"] == "blocked"]
    _accept(c, w, clash)
    _move(c, w, TUE, "p3", MON, "p1")
    assert [r for r in _clashes(c, w) if r["kind"] == "blocked"] == []
    _move(c, w, MON, "p1", TUE, "p3")  # back where it was: the same clash, but a move came after the yes
    (again,) = [r for r in _clashes(c, w) if r["kind"] == "blocked"]
    assert again["clash_key"] == clash["clash_key"] and again["accepted"] is False
