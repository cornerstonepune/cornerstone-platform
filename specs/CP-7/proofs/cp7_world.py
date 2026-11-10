"""Shared fixtures for CP-7's database proofs (a class's fortnight timetable: draft, one approval per fortnight, roll forward).

Everything is made here inside one transaction that is rolled back: a fake school of its own (a new tenant, so every
per-school row the migration seeds for "every school, present and future" is exercised), academic year 2031-32, two K2
classes, three K2 periods, and teaching fortnights 9, 10, 11 and 12 (each at `planning`, CP-6's `fortnight.state`) with
their school days. The frame (`timetable_rule` rows) is seeded while every fortnight is at planning, then a test freezes
what it drafts. Since CP-27 the timetable of a date is its lessons (`session`): a draft gives a class's fortnight its
lessons from the frame, and the fortnight's standing is worked out from them (`timetable_standing`). The exception setting for 2031-32
lists Fortnight 10 (design, "Proofs").

Two people, by staff id only (no name is written; pii.staff holds "Fake Person" and an example.test address):
- `approver`: role `coordinator`, valid from current_date. CP-3 seeds coordinator into the group `everything`
  (CP-3's role-to-group mapping, since CP-27 the column `role.access_group`, group code `everything`,
  specs/CP-3/design.md "The groups are rows").
- `other`: role `class_teacher` of class A (CP-3's group `own_classes`): the class's own educator, not an approver.
Each acts as the website does: as `app_web`, with `set_config('app.staff_id', <sign-in list entry id>, true)`. The
sign-in entry (config `app.staff`) is given the same uuid as the person's `staff.id`, so the identity resolves to the
same person whether it is read through CP-3's sign-in resolution or as a staff id directly.

Names are the design's contract (specs/CP-7/design.md, "Data", "Rules", "Refusals"), as CP-27 moved them: the yes is a
row of the one `approval` list (kind `timetable`, its signature kept with it); who drafted is a `change_log` row.
"""

import datetime as dt
import uuid
from contextlib import contextmanager

import psycopg
import pytest
from psycopg.types.json import Jsonb

from engine.core import db
from engine.w2_print import fortnight_cycle as fc

WHO = f"staff:{uuid.uuid4()}"  # app.changed_by: a staff id, never a name (rule 6)
YEAR = "2031-32"
FN = {9: "2031-09-01", 10: "2031-09-15", 11: "2031-09-29", 12: "2031-10-13"}  # each a Monday
WEEKS, DAYS, ORDS = ("A", "B"), (1, 2, 3, 4, 5), (1, 2, 3)
LINES = len(WEEKS) * len(DAYS) * len(ORDS)  # 30 lines in a class's fortnight
NOT_APPROVER = "only the approving group approves a fortnight"


@pytest.fixture
def conn():
    with db.connect() as c:
        c.execute("select set_config('app.changed_by', %s, true)", (WHO,))
        c.execute("select set_config('app.change_reason', '', true)")
        yield c
        c.rollback()


def _val(conn, sql, params=()):
    return next(iter(db.one(conn, sql, params).values()))


def needs(conn) -> None:
    """CP-7 is built on CP-6, CP-4 and CP-3; until they are on main the proofs fail here, by design, saying which."""
    if not _val(conn, "select exists (select from information_schema.columns where table_schema = 'public'"
                      " and table_name = 'fortnight' and column_name = 'state')"):
        pytest.fail("needs CP-6: fortnight.state missing")
    if not _val(conn, "select exists (select from information_schema.columns where table_schema = 'public'"
                      " and table_name = 'access_table' and column_name = 'data_class')"):
        pytest.fail("needs CP-4: access_table.data_class missing")
    if not _val(conn, "select exists (select from information_schema.columns where table_schema = 'public'"
                      " and table_name = 'role' and column_name = 'access_group')"):
        pytest.fail("needs CP-3: role.access_group missing (the role-to-group mapping)")


class World:
    def __init__(self, conn):
        needs(conn)
        self.c = conn
        tag = uuid.uuid4().hex[:8]
        self.t = _val(conn, "insert into tenant (slug, name) values (%s, %s) returning id",
                      (f"cp7-proof-{tag}", f"CP-7 proof school {tag}"))
        campus = _val(conn, "select id from campus where tenant_id = %s order by created_at limit 1", (self.t,))
        self.year = _val(conn, "insert into academic_year (tenant_id, label, starts_on, ends_on)"
                               " values (%s, %s, '2031-06-01', '2032-03-31') returning id", (self.t, YEAR))
        cls = ("insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
               " values (%s, %s, %s, 'K2', %s) returning id")
        self.a = _val(conn, cls, (self.t, campus, self.year, "P7A"))
        self.b = _val(conn, cls, (self.t, campus, self.year, "P7B"))
        self.period = {
            o: _val(conn, "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label)"
                          " values (%s, 'K2', %s, %s, %s, %s) returning id",
                    (self.t, 90 + o, dt.time(5, 10 * o), dt.time(5, 10 * o + 9), f"CP-7 proof period {o}"))
            for o in ORDS
        }
        self.fn, self.start = {}, {}
        for n, start in FN.items():
            s = dt.date.fromisoformat(start)
            self.fn[n] = _val(conn, "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on,"
                                    " ends_on) values (%s, %s, %s, 'teaching', %s, %s) returning id",
                              (self.t, self.year, n, s, s + dt.timedelta(days=13)))
            self.start[n] = s
            conn.execute("insert into school_day (tenant_id, campus_id, on_date, kind) select %s, %s, d, 'teaching'"
                         " from generate_series(%s::date, %s::date, '1 day') d where extract(isodow from d) <= 5"
                         " on conflict (tenant_id, campus_id, on_date) do nothing",
                         (self.t, campus, s, s + dt.timedelta(days=13)))

        self.staff, entries = {}, []
        for who, role, klass in (("approver", "coordinator", None), ("other", "class_teacher", self.a)):
            sid = _val(conn, "insert into staff (tenant_id, campus_id, active) values (%s, %s, true) returning id",
                       (self.t, campus))
            email = f"{who}.{tag}@example.test"
            conn.execute("insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Fake Person', %s)",
                         (self.t, sid, email))
            conn.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from,"
                         " granted_by) values (%s, %s, %s, %s, current_date, 'cp7 proof')", (self.t, sid, role, klass))
            self.staff[who] = str(sid)
            entries.append({"id": str(sid), "email": email, "name": "Fake Person", "role": "educator"})
        conn.execute("insert into config (tenant_id, key, value) values (%s, 'app.staff', %s)"
                     " on conflict (tenant_id, key) do update set value = excluded.value", (self.t, Jsonb(entries)))
        # The fixture's exception: 2031-32 lists Fortnight 10 (kept beside the default 2026-27 entry).
        conn.execute("update config set value = value || %s where tenant_id = %s and key = 'fortnight.no_roll_forward'",
                     (Jsonb({YEAR: [10]}), self.t))

    # ---- the frame ----

    @staticmethod
    def text(week, day, o):
        return f"Fake lesson {week}{day}.{o}"

    def timetable(self, klass):
        """Every period of every weekday of weeks A and B, open-ended from the start of the year."""
        for w in WEEKS:
            for d in DAYS:
                for o in ORDS:
                    self.c.execute(
                        "insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday,"
                        " cell, text, valid_from) values (%s, %s, 'frame', %s, %s, %s, 'subject', %s, '2031-06-01')",
                        (self.t, klass, self.period[o], w, d, self.text(w, d, o)))

    def change(self, klass, week, day, o, from_date, text=None):
        """From `from_date` on, the frame's cell says `text`; None removes the period. A draft made after it follows."""
        key = (klass, self.period[o], week, day)
        same_day = self.c.execute(
            "select id from timetable_rule where kind = 'frame' and school_class_id = %s and period_id = %s"
            " and week_code = %s and weekday = %s and valid_from = %s", (*key, from_date)).fetchone()
        if same_day:
            assert text is not None, "a proof never removes a period on the day it began"
            self.c.execute("update timetable_rule set text = %s where id = %s", (text, same_day["id"]))
            return
        self.c.execute(
            "update timetable_rule set valid_to = %s::date - 1 where kind = 'frame' and school_class_id = %s"
            " and period_id = %s and week_code = %s and weekday = %s and valid_from < %s"
            " and (valid_to is null or valid_to >= %s)", (from_date, *key, from_date, from_date))
        if text is not None:
            self.c.execute(
                "insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell,"
                " text, valid_from) values (%s, %s, 'frame', %s, %s, %s, 'subject', %s, %s)", (self.t, *key, text, from_date))

    def relesson(self, klass, n, week, day, o, text):
        """A drafted lesson's words changed (by hand, allowed with a reason under CP-6's freeze)."""
        self.c.execute("update session set text = %s where id = %s", (text, self.line((klass, n), week, day, o)["id"]))

    # ---- CP-6's cycle ----

    def move(self, n, state):
        with self.c.transaction():  # a savepoint: a refused move leaves the test's transaction usable
            self.c.execute("update fortnight set state = %s where id = %s", (state, self.fn[n]))

    def freeze(self, *ns):
        for n in ns:
            self.move(n, "frozen")

    # ---- drafting and the yes, called as their callers call them ----

    def draft(self, klass, n):
        """`engine timetable draft` drafts as app_engine, naming who drafts. The class's fortnight: (class, number)."""
        with acting(self.c, "app_engine"):
            fc.draft(self.c, klass, self.fn[n], WHO)
        return (klass, n)

    def approve(self, plan, who="approver"):
        """The website calls this as app_web, with the signed-in person's app.staff_id."""
        klass, n = plan
        with acting(self.c, "app_web", self.staff.get(who, who)):
            self.c.execute("select public.fortnight_approve(%s, %s)", (klass, self.fn[n]))

    def settle(self, klass, n):
        """Draft, and approve when it waits: the class's fortnight is settled."""
        plan = self.draft(klass, n)
        if self.plan(plan)["state"] == "draft":
            self.approve(plan)
        assert self.plan(plan)["state"] in ("approved", "rolled_forward")
        return plan

    # ---- reading what was written (as the owner) ----

    def plan(self, plan):
        """Where the class's fortnight stands, its signature and baseline, who approved it and when, and who drafted it
        and when (the history's row of its lessons being made)."""
        klass, n = plan
        row = db.one(self.c, "select * from public.timetable_standing(%s, %s)", (klass, self.fn[n]))
        drafted = self.c.execute(
            "select origin, at from change_log where table_name = 'session' and row_id = %s and op = 'insert'",
            (f"{klass} {self.fn[n]}",)).fetchone()
        return {**row, "drafted_by": drafted and drafted["origin"], "drafted_at": drafted and drafted["at"]}

    def lines(self, plan):
        klass, n = plan
        return self.c.execute(
            "select s.id, s.period_id, s.text, d.on_date, extract(isodow from d.on_date)::int as weekday,"
            " case when d.on_date - f.starts_on < 7 then 'A' else 'B' end as week_code"
            " from session s join school_day d on d.id = s.school_day_id join fortnight f on f.id = %s"
            " and d.on_date between f.starts_on and f.ends_on where s.school_class_id = %s"
            " order by week_code, weekday, s.period_id", (self.fn[n], klass)).fetchall()

    def line(self, plan, week, day, o):
        return next(r for r in self.lines(plan)
                    if (r["week_code"], r["weekday"], r["period_id"]) == (week, day, self.period[o]))

    def approvals(self):
        """Rows of the one approval list in this school."""
        return _val(self.c, "select count(*) from approval where tenant_id = %s", (self.t,))

    def yeses(self, plan):
        klass, n = plan
        return self.c.execute("select * from approval where kind = 'timetable' and target = %s order by seq",
                              (f"{klass} {self.fn[n]}",)).fetchall()

    def counts(self):
        return db.one(self.c, "select (select count(*) from session where tenant_id = %(t)s) as lessons,"
                              " (select count(*) from change_log where tenant_id = %(t)s) as history,"
                              " (select count(*) from approval where tenant_id = %(t)s) as approvals", {"t": self.t})

    def setting(self, key):
        return _val(self.c, "select value from config where tenant_id = %s and key = %s", (self.t, key))


@pytest.fixture
def world(conn):
    return World(conn)


@contextmanager
def acting(conn, role=None, staff_id=None):
    """Run as `role` with the website's identity set; undone afterwards (a savepoint undoes it on an error)."""
    with conn.transaction():
        if role:
            conn.execute(f"set local role {role}")
        conn.execute("select set_config('app.staff_id', %s, true)", (staff_id or "",))
        yield
        conn.execute("reset role")
        conn.execute("select set_config('app.staff_id', '', true)")


def refused(fn, *args, stem=None, code=None, **kw) -> psycopg.Error:
    """`fn(*args)` must raise a database error; its message holds `stem` and its errcode is `code`, when given."""
    with pytest.raises(psycopg.Error) as e:
        fn(*args, **kw)
    if stem:
        assert stem in str(e.value), f"refused, but not with {stem!r}: {e.value}"
    if code:
        assert e.value.sqlstate == code, f"refused with errcode {e.value.sqlstate}, not {code}: {e.value}"
    return e.value


def sql_as(conn, role, staff_id, sql, params=()):
    """One statement as `role` with an identity: a direct write the way an app login would try it."""
    with acting(conn, role, staff_id):
        conn.execute(sql, params)


def real_date(start: dt.date, week: str, day: int) -> dt.date:
    monday = start - dt.timedelta(days=start.weekday())
    return monday + dt.timedelta(days=day - 1 + (7 if week == "B" else 0))
