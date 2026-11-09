"""CP-12 item 4: each fortnight's clashes are listed with their kind, fortnight number, week and the lessons involved,
for each kind: a lesson on a blocked day or period, a subject above its most or below its fewest in a week or the
fortnight. Moving a lesson back removes its clash from the list. One test per kind."""

import datetime as dt

from conftest import REASON, START, clashes, move, world

MON, TUE = START, START + dt.timedelta(1)
B_MON, B_TUE = START + dt.timedelta(7), START + dt.timedelta(8)


def _of(rows, kind):
    return [r for r in rows if r["kind"] == kind]


def _mentions(r, d: dt.date, period_id: str) -> bool:
    """The clash's places name this lesson: its date and its period (by id)."""
    text = str(r["places"])
    return d.isoformat() in text and period_id in text


def _block(conn, w, *, on_date=None, weekday=None, week=None, period=None):
    conn.execute("insert into timetable_block (tenant_id, school_class_id, on_date, weekday, week_code, period_id,"
                 " reason) values (%s, %s, %s, %s, %s, %s, 'Proof block')",
                 (w["tenant"], w["class"], on_date, weekday, week, w["period"][period] if period else None))


def _limit(conn, w, subject, span, fewest=None, most=None):
    conn.execute("insert into timetable_limit (tenant_id, school_class_id, subject_code, span, fewest, most)"
                 " values (%s, %s, %s, %s, %s, %s)", (w["tenant"], w["class"], subject, span, fewest, most))


def test_a_plain_fortnight_has_no_clash(conn, monkeypatch):
    w = world(conn, monkeypatch)
    _limit(conn, w, "math", "week", fewest=5, most=5)
    _block(conn, w, on_date=TUE, period="extra")
    assert clashes(conn, w) == [], "a fortnight that breaks no rule lists a clash"


def test_a_lesson_on_a_blocked_period_is_listed_and_moving_it_back_removes_it(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _block(conn, w, on_date=TUE, period="extra")
    code, out = move(engine, w, MON, "s1", TUE, "extra", reason=REASON)
    assert code == 0, out
    rows = _of(clashes(conn, w), "blocked")
    assert len(rows) == 1, f"one lesson on a blocked period, {len(rows)} blocked clashes listed"
    r = rows[0]
    assert r["fortnight_number"] == 2 and r["week_code"] == "A"
    assert _mentions(r, TUE, w["period"]["extra"]), f"the lesson involved is not named: {r['places']}"

    code, out = move(engine, w, TUE, "extra", MON, "s1", reason=REASON)
    assert code == 0, out
    assert _of(clashes(conn, w), "blocked") == [], "the clash is still listed after the lesson moved back"


def test_lessons_on_a_blocked_day_are_listed(conn, monkeypatch):
    w = world(conn, monkeypatch)
    _block(conn, w, weekday=2, week="B")  # every period of week B's Tuesday
    rows = _of(clashes(conn, w), "blocked")
    assert rows, "no clash listed for lessons on a blocked day"
    assert all(r["fortnight_number"] == 2 and r["week_code"] == "B" for r in rows)
    assert any(_mentions(r, B_TUE, w["period"]["s1"]) for r in rows), "the maths lesson on the blocked day is not named"
    assert not any(TUE.isoformat() in str(r["places"]) for r in rows), "week A's Tuesday is listed for a week B block"


def test_a_subject_above_its_most_and_below_its_fewest_in_a_week_and_moving_back(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _limit(conn, w, "math", "week", fewest=5, most=5)
    code, out = move(engine, w, B_MON, "s1", TUE, "extra", reason=REASON)  # a week B maths lesson into week A
    assert code == 0, out
    rows = clashes(conn, w)
    over, under = _of(rows, "over_limit"), _of(rows, "under_limit")
    assert [r["week_code"] for r in over] == ["A"], f"week A has six maths lessons: {over}"
    assert [r["week_code"] for r in under] == ["B"], f"week B has four maths lessons: {under}"
    assert all(r["fortnight_number"] == 2 for r in over + under)
    assert _mentions(over[0], TUE, w["period"]["extra"]), f"the moved lesson is not named: {over[0]['places']}"

    code, out = move(engine, w, TUE, "extra", B_MON, "s1", reason=REASON)
    assert code == 0, out
    assert clashes(conn, w) == [], "the limit clashes are still listed after the lesson moved back"


def test_a_subject_above_its_most_in_the_fortnight(conn, monkeypatch):
    w = world(conn, monkeypatch)
    _limit(conn, w, "math", "fortnight", most=9)
    rows = _of(clashes(conn, w), "over_limit")
    assert len(rows) == 1 and rows[0]["fortnight_number"] == 2 and rows[0]["week_code"] is None, rows
    assert _mentions(rows[0], MON, w["period"]["s1"]), f"the maths lessons are not named: {rows[0]['places']}"


def test_a_subject_below_its_fewest_in_the_fortnight_even_with_no_lessons_at_all(conn, monkeypatch):
    w = world(conn, monkeypatch)
    _limit(conn, w, "english", "fortnight", fewest=11)
    _limit(conn, w, "art", "fortnight", fewest=1)
    rows = _of(clashes(conn, w), "under_limit")
    assert len(rows) == 2, f"two subjects below their fewest, {len(rows)} listed"
    assert all(r["fortnight_number"] == 2 and r["week_code"] is None for r in rows)
    with_lessons = [r for r in rows if r["places"]]
    assert len(with_lessons) == 1, "art has no lessons, English has ten: exactly one clash names lessons"
    assert _mentions(with_lessons[0], MON, w["period"]["s2"]), "the English lessons are not named"


def test_the_clash_list_command_groups_by_fortnight_and_names_no_one(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _limit(conn, w, "math", "fortnight", most=9)
    code, out = engine("timetable", "clashes", "--year", "2030-31", "--fortnight", 2)
    assert code == 0, out
    assert "FN2" in out and "over_limit" in out, f"the clash is not listed under FN2:\n{out}"
    assert "Proof Person" not in out and "@example.org" not in out, "a name or an email is printed"
