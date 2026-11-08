"""Shared fixtures for CP-7's database proofs (a class's fortnight timetable: draft, approve what changed, roll forward).

Everything is made here inside one transaction that is rolled back: a fake school of its own (a new tenant, so every
per-school row the migration seeds for "every school, present and future" is exercised), academic year 2031-32, two K2
classes, three K2 periods, and teaching fortnights 9, 10, 11 and 12 with their CP-6 `fortnight_cycle` rows. Slots are
seeded while every fortnight is `planning`, then a test freezes what it drafts. The exception setting for 2031-32
lists Fortnight 10 (design, "Proofs").

Two people, by staff id only (no name is written; pii.staff holds "Fake Person" and an example.test address):
- `approver`: role `coordinator`, valid from current_date. CP-3 seeds coordinator into the group `everything`
  (assumed CP-3 name: `access_role_group(tenant_id, role_code, group_code)`, group code `everything`,
  specs/CP-3/design.md "The groups are rows").
- `other`: role `class_teacher` of class A (CP-3's group `own_classes`): the class's own educator, not an approver.
Each acts as the website does: as `app_web`, with `set_config('app.staff_id', <sign-in list entry id>, true)`. The
sign-in entry (config `app.staff`) is given the same uuid as the person's `staff.id`, so the identity resolves to the
same person whether it is read through CP-3's sign-in resolution or as a staff id directly.

Names are the design's contract (specs/CP-7/design.md, "Data", "The rules", "Refusals").
"""

import datetime as dt
import uuid
from contextlib import contextmanager

import psycopg
import pytest
from psycopg.types.json import Jsonb

from engine.core import db

WHO = f"staff:{uuid.uuid4()}"  # app.changed_by: a staff id, never a name (rule 6)
YEAR = "2031-32"
FN = {9: "2031-09-01", 10: "2031-09-15", 11: "2031-09-29", 12: "2031-10-13"}  # each a Monday
WEEKS, DAYS, ORDS = ("A", "B"), (1, 2, 3, 4, 5), (1, 2, 3)
LINES = len(WEEKS) * len(DAYS) * len(ORDS)  # 30 lines in a class's fortnight
NOT_APPROVER = "only the approving group decides a fortnight's line"


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
    if _val(conn, "select to_regclass('public.fortnight_cycle') is null"):
        pytest.fail("needs CP-6: fortnight_cycle missing")
    if not _val(conn, "select exists (select from information_schema.columns where table_schema = 'public'"
                      " and table_name = 'access_table' and column_name = 'data_class')"):
        pytest.fail("needs CP-4: access_table.data_class missing")
    if _val(conn, "select to_regclass('public.access_role_group') is null"):
        pytest.fail("needs CP-3: access_role_group missing (the role-to-group rows)")


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
            conn.execute("insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')"
                         " on conflict (fortnight_id) do nothing", (self.t, self.fn[n]))

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
                        "insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind,"
                        " text, valid_from) values (%s, %s, %s, %s, %s, 'subject', %s, '2031-06-01')",
                        (self.t, klass, self.period[o], w, d, self.text(w, d, o)))

    def change(self, klass, week, day, o, from_date, text=None, reason=None):
        """From `from_date` on, the slot says `text`; None removes the period. `reason` is needed once frozen (CP-6)."""
        if reason:
            self.c.execute("select set_config('app.change_reason', %s, true)", (reason,))
        key = (klass, self.period[o], week, day)
        same_day = self.c.execute(
            "select id from timetable_slot where school_class_id = %s and period_id = %s and week_code = %s"
            " and weekday = %s and valid_from = %s", (*key, from_date)).fetchone()
        if same_day:
            assert text is not None, "a proof never removes a period on the day it began"
            self.c.execute("update timetable_slot set text = %s, kind = 'subject' where id = %s", (text, same_day["id"]))
        else:
            self.c.execute(
                "update timetable_slot set valid_to = %s::date - 1 where school_class_id = %s and period_id = %s"
                " and week_code = %s and weekday = %s and valid_from < %s and (valid_to is null or valid_to >= %s)",
                (from_date, *key, from_date, from_date))
            if text is not None:
                self.c.execute(
                    "insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind, text,"
                    " valid_from) values (%s, %s, %s, %s, %s, 'subject', %s, %s)", (self.t, *key, text, from_date))
        if reason:
            self.c.execute("select set_config('app.change_reason', '', true)")

    # ---- CP-6's cycle ----

    def move(self, n, state):
        with self.c.transaction():  # a savepoint: a refused move leaves the test's transaction usable
            self.c.execute("update fortnight_cycle set state = %s where fortnight_id = %s", (state, self.fn[n]))

    def freeze(self, *ns):
        for n in ns:
            self.move(n, "frozen")

    # ---- the three functions, called as their callers call them ----

    def draft(self, klass, n):
        """`engine timetable draft` calls this as app_engine, with app.changed_by set."""
        with acting(self.c, "app_engine"):
            return self.c.execute("select public.fortnight_draft(%s, %s) as id", (klass, self.fn[n])).fetchone()["id"]

    def decide(self, line, decision="approved", reason=None, who="approver"):
        with acting(self.c, "app_web", self.staff.get(who, who)):
            self.c.execute("select public.fortnight_line_decide(%s, %s, %s)", (line, decision, reason))

    def approve_open(self, plan, who="approver"):
        with acting(self.c, "app_web", self.staff.get(who, who)):
            return self.c.execute("select public.fortnight_approve_open(%s) as n", (plan,)).fetchone()["n"]

    def settle(self, klass, n):
        """Draft and approve every open line: the class's fortnight is settled."""
        plan = self.draft(klass, n)
        if self.plan(plan)["state"] == "draft":
            self.approve_open(plan)
        assert self.plan(plan)["state"] in ("approved", "rolled_forward")
        return plan

    # ---- reading what was written (as the owner) ----

    def plan(self, plan_id):
        return db.one(self.c, "select * from fortnight_plan where id = %s", (plan_id,))

    def lines(self, plan_id):
        return self.c.execute("select * from fortnight_plan_line where fortnight_plan_id = %s"
                              " order by week_code, weekday, period_id", (plan_id,)).fetchall()

    def line(self, plan_id, week, day, o):
        return db.one(self.c, "select * from fortnight_plan_line where fortnight_plan_id = %s and week_code = %s"
                              " and weekday = %s and period_id = %s", (plan_id, week, day, self.period[o]))

    def approvals(self, target=None, decision=None):
        """Rows of the approval ledger of kind timetable_line in this school, optionally for one line."""
        return self.c.execute(
            "select * from approval where tenant_id = %s and kind = 'timetable_line'"
            " and (%s::text is null or target = %s::text) and (%s::text is null or decision = %s::text)"
            " order by created_at, id",
            (self.t, target and str(target), target and str(target), decision, decision)).fetchall()

    def counts(self):
        return db.one(self.c, "select (select count(*) from fortnight_plan where tenant_id = %(t)s) as plans,"
                              " (select count(*) from fortnight_plan_line where tenant_id = %(t)s) as lines,"
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
