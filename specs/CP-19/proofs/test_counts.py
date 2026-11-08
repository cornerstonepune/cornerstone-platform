"""CP-19 items 5 and 6: `coordinator_counts(fortnight)`, called as the website calls it (app_web, `app.staff_id` set).

5  per class, each measure (notes confirmed, notes late, children without notes, class days without notes, unplanned
   sessions, lines draft, lines waiting for the second approval, lines approved, reports sent) equals a hand-written
   count(*) on the database for the same fortnight (hand_counts.py);
6  per educator only notes confirmed and notes late, whole numbers, no score, rate, rank or ordering; the coordinator
   sees every educator's, an educator only their own.

Needs CP-9 (`unplanned_sessions()`, the unplanned count the function reuses): fails until CP-9 has merged.
The fortnight is the current one (thirteen days ago to today), so "today" means the same to every definition. Notes are
placed on past days by writing their clock columns with the database's triggers paused for that insert only
(session_replication_role, superuser, this transaction): fake rows, rolled back.
"""

import datetime as dt
import re
import uuid

import pytest

from conftest import (COUNTS, DECIDE, MARK_SENT, act, child, consent, decide, evidence, ins, klass, line, mark_sent,
                      need, note, person, school)
from hand_counts import MEASURES, by_class, by_educator, function_by_class

PER_EDUCATOR = {"notes_confirmed", "notes_late"}
NOT_A_COUNT = re.compile(r"score|rate|rank|percent|pct|ratio|avg|average|order|position", re.I)


def _at(day: dt.date, hour=4, minute=30) -> dt.datetime:
    return dt.datetime(day.year, day.month, day.day, hour, minute, tzinfo=dt.UTC)  # 10:00 in Pune


@pytest.fixture
def world(conn):
    c = conn
    need(c, "report_line", DECIDE, MARK_SENT, COUNTS)
    assert c.execute("select to_regprocedure('public.unplanned_sessions(uuid,date,date)') is not null").fetchone()[0], \
        "unplanned_sessions() does not exist: CP-9 has not merged yet"
    s = school(c)
    t = s["tenant"]
    today = c.execute("select (now() at time zone %s)::date", (s["zone"],)).fetchone()[0]
    start = today - dt.timedelta(days=13)
    f = ins(c, "fortnight", tenant_id=t, academic_year_id=s["year"], number=1, kind="teaching", starts_on=start,
            ends_on=today)
    x, y = klass(c, s), klass(c, s)
    kx = [child(c, s, x) for _ in range(3)]
    ky = [child(c, s, y) for _ in range(2)]
    a, b = person(c, s, "class_teacher", x), person(c, s, "class_teacher", y)
    coord = person(c, s, "coordinator")
    activity = ins(c, "activity", tenant_id=t, code=f"ACT-{uuid.uuid4().hex[:5]}", name="Proof activity", band="K2",
                   strand="Proof")
    code = c.execute("select code from activity where id = %s", (activity,)).fetchone()[0]
    day = {n: today - dt.timedelta(days=n) for n in range(0, 21)}

    c.execute("set local session_replication_role = replica")  # place clock columns in the past (fake rows only)
    obs = {}

    def observe(tag, kids, cls, by, seen, stored, supersedes=None):
        conf = uuid.uuid4()
        for k in kids:
            obs[(tag, k)] = ins(
                c, "activity_observation", tenant_id=t, confirmation_id=conf, activity_code=code, child_id=k,
                class_id=cls, outcome="as_expected", entry_mode="individual", route="form", expected_level=2,
                observed_at=_at(day[seen]), stored_at=_at(day[stored], 5), observed_by=by, confirmed_by=by,
                supersedes=supersedes, reason="proof correction" if supersedes else None)

    observe("o1", [kx[0]], x, a, 10, 10)
    observe("o2", kx[:2], x, a, 9, 8)            # late
    observe("o3", [kx[1]], x, a, 5, 5)
    observe("o7", [kx[1]], x, a, 5, 4, supersedes=obs[("o3", kx[1])])  # a correction: not a new note
    observe("o4", [ky[0]], y, b, 12, 11)         # late
    observe("o5", [ky[1]], y, b, 20, 20)         # before the fortnight
    observe("o6", [ky[0]], y, a, 3, 2)           # late; recorded in class y by x's educator
    for cls, by, days in ((x, a, (10, 9, 5)), (y, b, (12, 3))):
        for n in days:
            ins(c, "pii.educator_note", tenant_id=t, staff_id=by, class_id=cls, audio_key=f"proof/{uuid.uuid4()}",
                received_at=_at(day[n]), status="received")
    c.execute("set local session_replication_role = origin")

    weekdays = [day[n] for n in range(13, -1, -1) if day[n].isoweekday() < 6]
    school_day = {d: ins(c, "school_day", tenant_id=t, campus_id=s["campus"], on_date=d, kind="teaching")
                  for d in weekdays}
    p1 = ins(c, "period", tenant_id=t, grade_code="K2", ord=1, starts_at="09:00", label="P1")
    p2 = ins(c, "period", tenant_id=t, grade_code="K2", ord=2, starts_at="10:00", label="P2")
    sx, sy = school_day[weekdays[-3]], school_day[weekdays[-5]]
    for cls, d, per, state, planned in ((x, sx, p1, "done", False), (x, sx, p2, "done", True),
                                        (y, sy, p1, "done", False), (y, sy, p2, "planned", True)):
        ins(c, "session", tenant_id=t, school_class_id=cls, school_day_id=d, period_id=per, state=state,
            planned=planned)

    seen = _at(day[7])
    n1, n2, n3 = note(c, s, kx[0], start, today), note(c, s, kx[1], start, today), note(c, s, ky[0], start, today)

    def ln(kid, n):
        return line(c, s, kid, n, [evidence(c, s, kid, seen)])

    ln(kx[0], n1)                                   # draft
    l2 = ln(kx[0], n1)
    decide(c, l2, a)                                # waiting for the second approval
    l3 = ln(kx[0], n1)
    decide(c, l3, a)
    decide(c, l3, coord)                            # approved
    ln(kx[1], n2)                                   # draft
    for _ in range(2):
        l5 = ln(ky[0], n3)
        decide(c, l5, b)
        decide(c, l5, coord)
    consent(c, s, ky[0])
    mark_sent(c, n3, coord)                         # one report sent
    return {"f": f, "x": x, "y": y, "a": a, "b": b, "coord": coord}


def counts(c, w, staff):
    return act(c, "app_web", staff, "select school_class_id, staff_id, measure, n from public.coordinator_counts(%s)",
               (w["f"],))


def test_5_each_class_measure_equals_a_direct_count(conn, world):
    w = world
    got = function_by_class(counts(conn, w, w["coord"]))
    want = by_class(conn, w["f"], [w["x"], w["y"]])
    assert {k[0] for k in got} >= {w["x"], w["y"]}, "coordinator_counts gives no rows for the fortnight's classes"
    assert all(sum(n for (_, m), n in want.items() if m == measure) > 0 for measure in MEASURES), \
        f"the fake fortnight should give every measure a non-zero count: {want}"
    wrong = {f"{'x' if cls == w['x'] else 'y'}.{m}": (got.get((cls, m), 0), n)
             for (cls, m), n in want.items() if got.get((cls, m), 0) != n}
    assert not wrong, f"coordinator_counts disagrees with a direct count (function, direct): {wrong}"


def test_6_columns_hold_counts_only(conn, world):
    need(conn, COUNTS)
    cur = conn.execute("select * from public.coordinator_counts(%s) limit 0", (world["f"],))
    names = [d.name for d in cur.description]
    assert names == ["school_class_id", "staff_id", "measure", "n"], names
    assert cur.description[3].type_code in (20, 21, 23), "n is not a whole number"
    assert not [n for n in names if NOT_A_COUNT.search(n)], names
    src = conn.execute("select lower(prosrc) from pg_proc where oid = to_regprocedure(%s)", (COUNTS,)).fetchone()[0]
    for banned in ("rank(", "row_number(", "ntile(", "percent", "order by"):
        assert banned not in src, f"coordinator_counts ranks or orders: '{banned}'"


def _educators(rows):
    out = {}
    for _, staff, measure, n in rows:
        if staff is not None:
            assert measure in PER_EDUCATOR, f"a per-educator figure that is not a count of notes: {measure}"
            assert isinstance(n, int) and n >= 0
            out[(staff, measure)] = out.get((staff, measure), 0) + n
    return out


def test_6_the_coordinator_sees_every_educators_notes(conn, world):
    w = world
    rows = counts(conn, w, w["coord"])
    assert not [r[2] for r in rows if NOT_A_COUNT.search(r[2])], "a measure is a score, rate or rank"
    got = _educators(rows)
    want = by_educator(conn, w["f"], [w["a"], w["b"]])
    assert want[(w["a"], "notes_confirmed")] > 0 and want[(w["b"], "notes_late")] > 0
    assert {k: got.get(k, 0) for k in want} == want


@pytest.mark.parametrize("who", ["a", "b"])
def test_6_an_educator_sees_only_their_own(conn, world, who):
    w = world
    me = w[who]
    got = _educators(counts(conn, w, me))
    assert {k[0] for k in got} == {me}, "an educator sees another educator's figures, or none of their own"
    want = by_educator(conn, w["f"], [me])
    assert {k: got.get(k, 0) for k in want} == want
