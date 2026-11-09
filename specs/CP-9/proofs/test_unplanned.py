"""CP-9 item 3: "Unplanned" is computed from the sessions that happened and is not empty when sessions exist without a
plan line.

`public.unplanned_sessions(p_campus uuid, p_from date, p_to date) returns integer` (design decision 4): done sessions of
the campus's classes in the date range that are marked unplanned or carry no plan line count; a planned session with a
line, a session not done, another campus's session and a session outside the range do not; zero with none. The
coordinator's counts (`k2_reads._counts`) return it as an int, and the "null, and why" wording is gone from the code and
from the response model.
"""

import datetime as dt
import uuid
from zoneinfo import ZoneInfo

from conftest import ROOT, a_k2_class

ENGINE = ROOT / "packages" / "engine" / "engine"


def _campus(conn, t):
    return conn.execute("insert into campus (tenant_id, name) values (%s, %s) returning id",
                        (t, f"CP9 campus {uuid.uuid4().hex[:6]}")).fetchone()["id"]


class Timetable:
    """Periods, days, a fortnight and a plan line for writing sessions; placeholders only."""

    def __init__(self, conn, k):
        self.conn, self.k, self.days = conn, k, {}
        self.periods = [conn.execute(
            "insert into period (tenant_id, grade_code, ord, starts_at, label) values (%s, 'K2', %s, %s, %s)"
            " returning id", (k["tenant"], n, dt.time(5, n), f"CP9 period {n}")).fetchone()["id"] for n in range(1, 8)]
        fortnight = conn.execute(
            "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
            " values (%s, %s, 99, 'teaching', '2026-01-01', '2032-03-31') returning id",
            (k["tenant"], k["year"])).fetchone()["id"]
        self.line = conn.execute(
            "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source)"
            " values (%s, %s, %s, 'cp9', 1, 'Placeholder plan line', 'cp9 proof') returning id",
            (k["tenant"], k["class"], fortnight)).fetchone()["id"]

    def day(self, campus, on):
        if (campus, on) not in self.days:
            self.days[(campus, on)] = self.conn.execute(
                "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s, 'teaching')"
                " returning id", (self.k["tenant"], campus, on)).fetchone()["id"]
        return self.days[(campus, on)]

    def session(self, klass, campus, on, period, state, planned, line):
        self.conn.execute(
            "insert into session (tenant_id, school_class_id, school_day_id, period_id, state, planned, plan_entry_id)"
            " values (%s, %s, %s, %s, %s, %s, %s)",
            (self.k["tenant"], klass, self.day(campus, on), self.periods[period], state, planned,
             self.line if line else None))


def _unplanned(conn, campus, start, end):
    return conn.execute("select public.unplanned_sessions(%s, %s, %s) as n", (campus, start, end)).fetchone()["n"]


def test_3_unplanned_counts_done_sessions_without_a_plan_line_and_nothing_else(conn):
    t = conn.execute("select id from tenant limit 1").fetchone()["id"]
    here, there = _campus(conn, t), _campus(conn, t)
    k = a_k2_class(conn, campus=here)
    other = a_k2_class(conn, campus=there)
    tt = Timetable(conn, k)
    d1, d2, later = dt.date(2026, 6, 1), dt.date(2026, 6, 2), dt.date(2026, 6, 10)
    tt.session(k["class"], here, d1, 0, "done", False, False)      # unplanned, no line: counts
    tt.session(k["class"], here, d1, 1, "done", True, False)       # planned but no plan line: counts
    tt.session(k["class"], here, d1, 2, "done", False, True)       # marked unplanned, with a line: counts
    tt.session(k["class"], here, d1, 3, "done", True, True)        # planned with its line: no
    tt.session(k["class"], here, d1, 4, "not_done", False, False)  # did not happen: no
    tt.session(k["class"], here, d1, 5, "planned", False, False)   # not yet happened: no
    tt.session(k["class"], here, d2, 0, "moved", False, False)     # moved: no
    tt.session(k["class"], here, later, 0, "done", False, False)   # outside the range: no
    tt.session(other["class"], there, d1, 0, "done", False, False)  # another campus: no
    assert _unplanned(conn, here, d1, d2) == 3
    assert _unplanned(conn, here, later, later) == 1
    assert _unplanned(conn, here, dt.date(2026, 6, 3), dt.date(2026, 6, 9)) == 0, "zero when no session happened"
    assert _unplanned(conn, there, d1, d2) == 1
    assert _unplanned(conn, _campus(conn, t), d1, later) == 0, "zero for a campus with no sessions"


def test_3_the_coordinators_counts_carry_unplanned_as_a_number(conn):
    from engine.w3_read import k2_reads

    t = conn.execute("select id from tenant limit 1").fetchone()["id"]
    here = _campus(conn, t)
    k = a_k2_class(conn, campus=here)
    tt = Timetable(conn, k)
    cfg = k2_reads._cfg(conn)
    today = dt.datetime.now(ZoneInfo(cfg["zone"])).date()
    tt.session(k["class"], here, today, 0, "done", False, False)
    tt.session(k["class"], here, today, 1, "done", True, False)
    tt.session(k["class"], here, today, 2, "done", True, True)
    counts = k2_reads._counts(conn, cfg, str(here))
    assert type(counts["unplanned"]) is int and counts["unplanned"] == 2, counts
    assert "unplanned_why" not in counts, counts


def test_3_the_null_and_its_wording_are_gone_from_the_code_and_the_response_model():
    from engine.api.routes.k2 import Counts

    for f in (ENGINE / "w3_read" / "k2_reads.py", ENGINE / "api" / "routes" / "k2.py"):
        text = f.read_text()
        assert "unplanned_why" not in text and "UNPLANNED_WHY" not in text, f"{f.name} still says why it is null"
    assert "unplanned_why" not in Counts.model_fields
    assert Counts.model_fields["unplanned"].annotation is int, Counts.model_fields["unplanned"].annotation
