"""CP-21 item 6: putting a draft live over a fortnight whose timetable a person changed since it last went live is
refused, unless the person says to discard those changes; the go-live record then shows that changes were discarded,
with who and when."""

from conftest import generated, go_live, moving, run_with, snapshot, swapped, world

LIVE = "select * from timetable_live where school_class_id = %s order by at"


def _live_twice(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    base = generated(conn, engine, w)
    first, second = run_with(conn, base, swapped(w)), run_with(conn, base, moving(w))
    code, out = go_live(engine, w, first)
    assert code == 0, out
    return w, second


def test_a_fortnight_nobody_changed_goes_live_again_without_a_discard(conn, engine, monkeypatch):
    w, second = _live_twice(conn, engine, monkeypatch)
    code, out = go_live(engine, w, second)
    assert code == 0, out
    rows = conn.execute(LIVE, (w["class"],)).fetchall()
    assert len(rows) == 2 and rows[-1]["run_id"] == second
    assert rows[-1]["discarded"] is False, "an unchanged fortnight was recorded as having changes discarded"


def test_a_hand_change_since_going_live_is_refused_unless_discarded_and_the_record_shows_who_and_when(
        conn, engine, monkeypatch):
    w, second = _live_twice(conn, engine, monkeypatch)
    changed = conn.execute(
        "update timetable_slot set text = 'Changed by hand' where id = (select id from timetable_slot"
        " where school_class_id = %s and fortnight_id = %s and kind = 'subject' order by valid_from, period_id"
        " limit 1) returning id", (w["class"], w["fortnights"][2]["id"])).fetchone()
    assert changed, "the live fortnight has no timetable row of its own to change"
    was = snapshot(conn, w)

    code, out = go_live(engine, w, second)
    assert code != 0, f"a person's change was overwritten without being asked:\n{out}"
    assert "changed since it went live" in out.lower(), f"the refusal does not say why:\n{out}"
    assert snapshot(conn, w) == was, "something was written"

    code, out = go_live(engine, w, second, extra=("--discard-changes",))
    assert code == 0, out
    first, last = conn.execute(LIVE, (w["class"],)).fetchall()
    assert last["run_id"] == second
    assert last["discarded"] is True, "the go-live record does not show that changes were discarded"
    assert last["who"] == w["coordinator"]["id"], "the discard does not record who"
    assert last["at"] is not None and last["at"] > first["at"], "the discard does not record when"
