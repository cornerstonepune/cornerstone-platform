"""CP-12 item 1: a lesson can be moved to another day or period of the same fortnight, or swapped with another lesson.
Each move is kept with who, when, from, to and the reason given; the history cannot be changed or deleted."""

import datetime as dt

from conftest import REASON, START, refused, shown, world

MON, TUE, THU = START, START + dt.timedelta(1), START + dt.timedelta(3)


def test_a_lesson_moves_to_an_empty_place_and_two_lessons_swap(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    assert shown(conn, w, TUE, "extra")["subject"] is None  # the fourth period is empty on Tuesdays

    code, out = engine("timetable", "move", "--grade", "K2", "--section", w["section"], "--year", "2030-31",
                       "--from", MON.isoformat(), "--from-period", 2, "--to", TUE.isoformat(), "--to-period", 4,
                       "--by", w["coordinator"]["email"], "--reason", REASON)
    assert code == 0, out
    assert shown(conn, w, TUE, "extra")["subject"] == "math", "the maths lesson is not in its new place"
    assert shown(conn, w, MON, "s1")["subject"] is None, "the maths lesson is still in its old place"

    code, out = engine("timetable", "move", "--grade", "K2", "--section", w["section"], "--year", "2030-31",
                       "--from", TUE.isoformat(), "--from-period", 2, "--to", THU.isoformat(), "--to-period", 3,
                       "--by", w["coordinator"]["email"], "--reason", REASON)
    assert code == 0, out
    assert shown(conn, w, TUE, "s1")["subject"] == "english", "the swap did not bring English to Tuesday"
    assert shown(conn, w, THU, "s2")["subject"] == "math", "the swap did not take maths to Thursday"


def test_each_move_is_kept_with_who_when_from_to_and_why_and_cannot_be_changed(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    code, out = engine("timetable", "move", "--grade", "K2", "--section", w["section"], "--year", "2030-31",
                       "--from", MON.isoformat(), "--from-period", 2, "--to", THU.isoformat(), "--to-period", 3,
                       "--by", w["coordinator"]["email"], "--reason", REASON)
    assert code == 0, out
    rows = conn.execute("select * from timetable_move where school_class_id = %s", (w["class"],)).fetchall()
    assert len(rows) == 1, f"{len(rows)} history rows for one move"
    r = rows[0]
    assert r["who"] == w["coordinator"]["id"] and r["at"] is not None
    assert (r["from_date"], str(r["from_period"])) == (MON, w["period"]["s1"])
    assert (r["to_date"], str(r["to_period"])) == (THU, w["period"]["s2"])
    assert r["reason"] == REASON and r["fortnight_id"] == w["fortnights"][2]["id"]
    assert "Proof Person" not in str(r), "a name is stored in the history"

    refused(conn, "update timetable_move set reason = 'changed' where id = %s", (r["id"],))
    refused(conn, "delete from timetable_move where id = %s", (r["id"],))
    assert conn.execute("select * from timetable_move where id = %s", (r["id"],)).fetchone() == r


def test_someone_not_on_the_staff_list_cannot_move(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    code, out = engine("timetable", "move", "--grade", "K2", "--section", w["section"], "--year", "2030-31",
                       "--from", MON.isoformat(), "--from-period", 2, "--to", THU.isoformat(), "--to-period", 3,
                       "--by", "nobody-on-the-list@example.org", "--reason", REASON)
    assert code != 0, f"a move by nobody on the staff list went through:\n{out}"
    assert shown(conn, w, MON, "s1")["subject"] == "math"
