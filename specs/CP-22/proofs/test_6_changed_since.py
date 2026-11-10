"""CP-22 item 6: putting a draft live over a fortnight whose timetable a person changed since it last went live is
refused, unless the person says to discard those changes; the go-live record then shows that changes were discarded,
with who and when."""

from conftest import generated, go_live, live_rows, moving, run_with, snapshot, swapped, world


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
    rows = live_rows(conn, w["class"])
    assert len(rows) == 2 and rows[-1]["run_id"] == second
    assert rows[-1]["discarded"] is False, "an unchanged fortnight was recorded as having changes discarded"


def test_a_hand_change_since_going_live_is_refused_unless_discarded_and_the_record_shows_who_and_when(
        conn, engine, monkeypatch):
    w, second = _live_twice(conn, engine, monkeypatch)
    changed = conn.execute(
        "update session set text = 'Changed by hand' where id = (select s.id from session s join school_day d"
        " on d.id = s.school_day_id join fortnight f on f.id = %s and d.on_date between f.starts_on and f.ends_on"
        " where s.school_class_id = %s and s.kind = 'subject' order by d.on_date, s.period_id limit 1) returning id",
        (w["fortnights"][2]["id"], w["class"])).fetchone()
    assert changed, "the live fortnight has no lesson of its own to change"
    was = snapshot(conn, w)

    code, out = go_live(engine, w, second)
    assert code != 0, f"a person's change was overwritten without being asked:\n{out}"
    assert "changed since it went live" in out.lower(), f"the refusal does not say why:\n{out}"
    assert snapshot(conn, w) == was, "something was written"

    code, out = go_live(engine, w, second, extra=("--discard-changes",))
    assert code == 0, out
    first, last = live_rows(conn, w["class"])
    assert last["run_id"] == second
    assert last["discarded"] is True, "the go-live record does not show that changes were discarded"
    assert last["who"] == w["coordinator"]["id"], "the discard does not record who"
    assert last["at"] is not None and last["at"] > first["at"], "the discard does not record when"
