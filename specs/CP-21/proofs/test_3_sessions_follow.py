"""CP-21 item 3: each lesson already planned keeps its plan line and its materials lines when it moves, and the
materials' dates move with it; week A plan lines stay in week A; circle, lunch and specialist lessons stay where they
are; no materials line is lost. A lesson with materials left with no place, moved outside its list's dates, or whose
list was already sent, or a lesson already marked, stops the whole step with a list of those lessons, writing nothing."""

import datetime as dt

import pytest

from conftest import (START, day_view, entry, generated, go_live, materials, moving, run_with, sessions, snapshot,
                      teaching, week_of, world)

TUESDAY = START + dt.timedelta(1)


def _as_frame_but_one_maths_lesson_less(w):
    """Week A's Tuesday has English in both subject periods: week A has four maths lessons for five maths sessions."""
    out = []
    for d in teaching(w, 2):
        first = "english" if d == TUESDAY else "math"
        out += [entry(w, 2, d, "s1", first), entry(w, 2, d, "s2", "english")]
    return out


def test_planned_lessons_keep_their_plan_line_and_materials_and_the_dates_move_with_them(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    start = w["fortnights"][2]["start"]
    before = sessions(conn, w)
    subject = [s for s in before if s["subject_code"] in ("math", "english")]
    pinned = [s for s in before if s["subject_code"] not in ("math", "english")]  # circle and the visiting teacher
    assert pinned and subject
    linked = materials(conn, w, [s["id"] for s in subject if s["week_code"] == "A"])
    run = run_with(conn, generated(conn, engine, w), moving(w))

    code, out = go_live(engine, w, run)
    assert code == 0, out

    after = {s["id"]: s for s in sessions(conn, w)}
    view = {(d["day"], p["period_id"]): p for d in day_view(conn, w, teaching(w, 2)) for p in d["periods"]}
    for s in subject:
        now = after.get(s["id"])
        assert now is not None, f"a planned {s['subject_code']} lesson of {s['on_date']} was deleted"
        assert now["plan_entry_id"] == s["plan_entry_id"] and now["text"] == s["text"], "a plan line changed lesson"
        assert week_of(now["on_date"], start) == s["week_code"], f"a week {s['week_code']} plan line left its week"
        shown = view[(now["on_date"].isoformat(), now["period_id"])]
        assert shown["subject"] == s["subject_code"] and shown["line"] == s["text"], (
            f"{now['on_date']}: the day shows {shown['subject']} / {shown['line']} where the lesson is")
    assert any(after[s["id"]]["on_date"] != s["on_date"] for s in subject), "the draft moved no lesson to another day"
    for s in pinned:
        now = after[s["id"]]
        assert (now["on_date"], now["period_id"]) == (s["on_date"], s["period_id"]), "a circle or specialist lesson moved"

    rows = conn.execute(
        "select src.line_id, src.session_id, src.on_date, l.needed_on from materials_line_source src"
        " join materials_line l on l.id = src.line_id where src.line_id = any(%s)", (list(linked.values()),)).fetchall()
    assert {(r["session_id"], r["line_id"]) for r in rows} == set(linked.items()), "a materials line was lost"
    for r in rows:
        on = after[r["session_id"]]["on_date"]
        assert r["on_date"] == on and r["needed_on"] == on, f"materials for {on} still say {r['on_date']}"


def _maths_a(conn, w):
    return [s for s in sessions(conn, w) if s["subject_code"] == "math" and s["week_code"] == "A"]


def _no_place(conn, w):
    materials(conn, w, [s["id"] for s in _maths_a(conn, w)])
    return _as_frame_but_one_maths_lesson_less(w), [s["on_date"] for s in _maths_a(conn, w)]


def _outside_list(conn, w):
    for s in _maths_a(conn, w):  # each list covers only its lesson's own day
        materials(conn, w, [s["id"]], from_on=s["on_date"], to_on=s["on_date"], per="day")
    return moving(w), [s["on_date"] for s in _maths_a(conn, w)]


def _sent(conn, w):
    materials(conn, w, [s["id"] for s in _maths_a(conn, w)], state="sent")
    return moving(w), [s["on_date"] for s in _maths_a(conn, w)]


def _marked(conn, w):
    tuesday = next(s for s in _maths_a(conn, w) if s["on_date"] == TUESDAY)
    conn.execute("update session set state = 'done' where id = %s", (tuesday["id"],))
    return moving(w), [TUESDAY]


@pytest.mark.parametrize("case", [_no_place, _outside_list, _sent, _marked],
                         ids=["left-with-no-place", "outside-its-list", "list-sent", "already-marked"])
def test_the_whole_step_stops_with_the_lessons_listed_and_nothing_is_written(conn, engine, monkeypatch, case):
    w = world(conn, monkeypatch)
    base = generated(conn, engine, w)
    draft, named = case(conn, w)
    run = run_with(conn, base, draft)
    was = snapshot(conn, w)

    code, out = go_live(engine, w, run)

    assert code != 0, f"the step went live:\n{out}"
    assert any(d.isoformat() in out for d in named), f"no lesson of {[str(d) for d in named]} is listed:\n{out}"
    assert snapshot(conn, w) == was, "something was written"
