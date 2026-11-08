"""CP-21 item 6: putting a draft live over a fortnight whose timetable a person changed since it last went live is
refused, unless the person says to discard those changes; the discard is recorded with who."""

from conftest import generated, go_live, moving, run_with, snapshot, swapped, world


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


def test_a_hand_change_since_going_live_is_refused_unless_discarded_and_the_discard_keeps_who(
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
    assert snapshot(conn, w) == was, "something was written"

    code, out = go_live(engine, w, second, extra=("--discard-changes",))
    assert code == 0, out
    last = conn.execute("select * from timetable_live where school_class_id = %s order by at desc limit 1",
                        (w["class"],)).fetchone()
    assert last["run_id"] == second and last["who"] == w["coordinator"]["id"]
    assert last["discarded_changes"] and last["discarded_changes"] >= 1, "the discard is not recorded"
