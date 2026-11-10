"""A made-up class for the timetable-by-hand tests (CP-12): one class in a made-up 2033-34 year, four periods (the
first fixed), a two-week frame (maths, English, music on Wednesday), one teaching fortnight at planning with its school
days and planned lessons, a coordinator and a class teacher with placeholder emails. Everything is written on the
test's own connection and rolled back by the test. No child, no real name."""

import datetime as dt
import uuid
from contextlib import contextmanager

from psycopg.pq import TransactionStatus

from engine.core import db

START = dt.date(2033, 7, 4)  # a Monday
HOLIDAY = START + dt.timedelta(days=8)  # week B's Tuesday
ORD = {"circle": 91, "p1": 92, "p2": 93, "p3": 94}
TIMES = {"circle": "04:10", "p1": "04:40", "p2": "05:10", "p3": "05:40"}


def week_of(d: dt.date) -> str:
    return "A" if (d - START).days < 7 else "B"


def dates() -> list[dt.date]:
    return [START + dt.timedelta(n) for n in range(14) if (START + dt.timedelta(n)).isoweekday() <= 5]


def cells(wd: int) -> dict[str, tuple[str, str | None, str]]:
    return {
        "circle": ("fixed", None, "Circle"),
        "p1": ("subject", "math", "Maths"),
        "p2": ("subject", "english", "English"),
        "p3": ("specialist", "music", "Visiting music") if wd == 3 else ("empty", None, ""),
    }


def school(c: db.Conn) -> dict:
    t = db.one(c, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    campus = db.one(c, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))["id"]
    year = db.one(
        c,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2033-34', '2033-06-01',"
        " '2034-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,),
    )["id"]
    section = f"H{uuid.uuid4().hex[:5]}"
    klass = db.one(
        c,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id",
        (t, campus, year, section),
    )["id"]
    period = {
        name: db.one(
            c,
            "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (%s, 'K2', %s,"
            " %s, %s::time + interval '25 minutes', %s, %s) on conflict (tenant_id, grade_code, starts_at) do update"
            " set ord = excluded.ord, fixed = excluded.fixed, label = excluded.label returning id",
            (t, ORD[name], at, at, f"Test {name}", name == "circle"),
        )["id"]
        for name, at in TIMES.items()
    }
    for wk in "AB":
        for wd in range(1, 6):
            for p, (kind, subj, text) in cells(wd).items():
                c.execute(
                    "insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell,"
                    " subject_code, text, valid_from) values (%s, %s, 'frame', %s, %s, %s, %s, %s, %s, '2033-06-01')",
                    (t, klass, period[p], wk, wd, kind, subj, text),
                )
    fortnight = db.one(
        c,
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s, %s, %s, 'teaching', %s, %s) returning id",
        (t, year, 100000 + uuid.uuid4().int % 800000, START, START + dt.timedelta(days=13)),
    )["id"]
    for d in dates():
        day = db.one(
            c,
            "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s, %s)"
            " on conflict (tenant_id, campus_id, on_date) do update set kind = excluded.kind returning id",
            (t, campus, d, "holiday" if d == HOLIDAY else "teaching"),
        )["id"]
        if d == HOLIDAY:
            continue
        for p, (kind, subj, text) in cells(d.isoweekday()).items():
            if kind != "empty":
                c.execute(
                    "insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind,"
                    " text) values (%s, %s, %s, %s, %s, %s, %s)",
                    (t, klass, day, period[p], subj, kind, text),
                )
    staff = {}
    for who, role, on_class in (("coordinator", "coordinator", None), ("educator", "class_teacher", klass)):
        sid = db.one(c, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus))[
            "id"
        ]
        email = f"{who}-{uuid.uuid4().hex[:8]}@example.org"
        c.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Test Person', %s)",
            (t, sid, email),
        )
        c.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)"
            " values (%s, %s, %s, %s, '2026-01-01', 'test')",
            (t, sid, role, on_class),
        )
        staff[who] = {"id": sid, "email": email}
    return {
        "tenant": t, "campus": campus, "year": year, "class": klass, "section": section, "period": period,
        "fortnight": fortnight, "staff": staff, "number": db.one(c, "select number from fortnight where id = %s", (fortnight,))["number"],
    }  # fmt: skip


def rule(c: db.Conn, w: dict, **change) -> None:
    """A block or a limit for the class, set as the rules page sets one (`tt_rules.change`), by the coordinator."""
    from engine.w2_print import tt_rules

    if "period" in change:
        change["period_id"] = str(w["period"][change.pop("period")])
    tt_rules.change(
        c, w["staff"]["coordinator"]["id"], str(w["class"]), tt_rules.Change(action="set", **change), START
    )


def moves(c: db.Conn, w: dict) -> list[dict]:
    """The lessons moved by hand in the world's fortnight, as the one history log keeps them, oldest first."""
    from engine.core import history

    return [r for r in history.of(c, "session", f"{w['class']} {w['fortnight']}") if r["op"] == "move"]


def session_at(c: db.Conn, w: dict, d: dt.date, p: str):
    return c.execute(
        "select s.* from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and d.on_date = %s and s.period_id = %s",
        (w["class"], d, w["period"][p]),
    ).fetchone()


def cell(c: db.Conn, w: dict, d: dt.date, p: str):
    """What the educator's day shows at one place: the lesson there, or an empty period."""
    from engine.w2_print import k2_day

    klass = {"id": str(w["class"]), "academic_year_id": w["year"], "campus_id": w["campus"], "grade": "K2"}
    day = k2_day.days(c, klass, [d])[0]
    return next(x for x in day["periods"] if x["period_id"] == str(w["period"][p]))


def set_state(c: db.Conn, w: dict, state: str) -> None:
    """Put the fortnight's cycle at `state` for a test, past CP-7's gate (a test sets the scene; the product never
    does this: `fortnight_cycle.move` is the one way)."""
    c.execute("set local session_replication_role = replica")
    c.execute("update fortnight set state = %s where id = %s", (state, w["fortnight"]))
    c.execute("set local session_replication_role = origin")


@contextmanager
def shared(c: db.Conn):
    """`db.connect` for a command run in a test: the test's own connection, where commit releases a savepoint and
    rollback undoes the command's work only, so the test still rolls everything back."""

    class Shared:
        def __getattr__(self, name):
            return getattr(c, name)

        def commit(self):
            c.execute("release savepoint tt_cli")
            c.execute("savepoint tt_cli")

        def rollback(self):
            c.execute("rollback to savepoint tt_cli")

    c.execute("savepoint tt_cli")
    try:
        yield Shared()
    except BaseException:
        c.execute("rollback to savepoint tt_cli")
        raise
    if c.info.transaction_status == TransactionStatus.INERROR:
        c.execute("rollback to savepoint tt_cli")
