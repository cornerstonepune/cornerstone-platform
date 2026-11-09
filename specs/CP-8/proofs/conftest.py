"""CP-8 proofs run on the engine's own test harness: packages/engine/tests/conftest.py, loaded here as it is.

It points DATABASE_URL at the local copy named by TEST_DATABASE_URL (refusing any other address) and fails a module
that leaves a committed row. Every proof here works inside one transaction that is rolled back.

The fixture `k2` builds one K2 class with placeholder rows only (no person, no child), and loads its plan lines through
the real loader (`k2_timetable_sql.apply`), so the lines the loader links are made exactly as live's 40 were:
  - `loader` : text equal to exactly one activity name   -> the loader links it (rule exact_name)
  - `none`   : text equal to no activity                 -> unlinked, reason no_match
  - `tie`    : text equal to two activities' names       -> unlinked, reason several_matches
  - `ready`, `ready2` (fortnight 37), `ready_b` (fortnight 38) : text equal to an activity added after the load (as
                                                           CP-15 will add them) -> unlinked, reason ready_to_link
"""

import runpy
import sys
import uuid
from datetime import date
from pathlib import Path

import pytest

ENGINE = Path(__file__).resolve().parents[3] / "packages" / "engine"
sys.path.insert(0, str(ENGINE))

globals().update(
    {k: v for k, v in runpy.run_path(str(ENGINE / "tests" / "conftest.py")).items() if not k.startswith("__")}
)

from engine.core import db  # noqa: E402  (after the harness has pointed DATABASE_URL at the copy)
from engine.w2_print import k2_timetable_load as ld  # noqa: E402
from engine.w2_print import k2_timetable_sql as sq  # noqa: E402

BY = "cp8.proof@example.test"
YEAR = "2087-88"  # a school year no other row uses: its fortnights are this test's own
FN_A, FN_B = 37, 38  # fortnight numbers no real plan uses, so a count per fortnight is this test's alone


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _activity(conn, t, name, tag, n):
    return db.one(
        conn,
        "insert into activity (tenant_id, code, band, strand, name) values (%s, %s, 'K2', 'Maths', %s) returning id",
        (t, f"ACT-K2-CP8{tag}{n}", name),
    )["id"]


def line(conn, k, key, ord_, fortnight=FN_A):
    return db.one(
        conn,
        "select pe.* from plan_entry pe join fortnight f on f.id = pe.fortnight_id"
        " where pe.school_class_id = %s and pe.plan_key = %s and pe.ord = %s and f.number = %s",
        (k["class"], key, ord_, fortnight),
    )


def row(conn, line_id):
    return db.one(
        conn,
        "select activity_id, link_rule, link_run, linked_at, linked_by from plan_entry where id = %s",
        (line_id,),
    )


def add_line(conn, k, text, ord_, fortnight=FN_A):
    """A plan line written after the load, unlinked (as a reload or a hand entry would add one)."""
    return db.one(
        conn,
        "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source)"
        " select %s, %s, f.id, 'math', %s, %s, 'CP-8 proof' from fortnight f"
        " where f.academic_year_id = %s and f.number = %s returning id",
        (k["tenant"], k["class"], ord_, text, k["year"], fortnight),
    )["id"]


@pytest.fixture
def k2(conn):
    t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    tag = uuid.uuid4().hex[:6].upper()
    campus = db.one(conn, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))[
        "id"
    ]
    year = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, %s, '2087-04-01', '2088-03-31')"
        " on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t, YEAR),
    )["id"]
    section = f"CP8{tag}"
    klass = db.one(
        conn,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id",
        (t, campus, year, section),
    )["id"]
    names = {
        "loader": f"Placeholder sorting {tag}",
        "none": f"Placeholder nothing {tag}",
        "tie": f"Placeholder pairs {tag}",
        "ready": f"Placeholder later {tag}",
        "ready2": f"Placeholder later two {tag}",
        "other": f"Placeholder other {tag}",
    }
    acts = {
        "loader": _activity(conn, t, names["loader"], tag, 1),
        "tie_1": _activity(conn, t, names["tie"], tag, 2),
        "tie_2": _activity(conn, t, names["tie"], tag, 3),
        "other": _activity(conn, t, names["other"], tag, 4),
    }
    names["ready_b"] = f"Placeholder later bee {tag}"
    # Fortnight FN_A: loader, none (week A), tie, ready, ready2 (5 lines).
    # Fortnight FN_B: two no_match lines (week B) and ready_b (3 lines).
    load = ld.Load(
        fortnights=[
            (FN_A, date(2087, 11, 17), date(2087, 11, 30)),
            (FN_B, date(2087, 12, 1), date(2087, 12, 14)),
        ],
        plan_entries=[
            ld.PlanEntry(FN_A, "math", 1, names["loader"]),
            ld.PlanEntry(FN_A, "math", 2, names["none"], week="A"),
            ld.PlanEntry(FN_A, "math", 3, names["tie"]),
            ld.PlanEntry(FN_A, "math", 4, names["ready"].upper()),
            ld.PlanEntry(FN_A, "math", 5, names["ready2"]),
            ld.PlanEntry(FN_B, "math", 1, f"Placeholder unmatched b1 {tag}", week="B"),
            ld.PlanEntry(FN_B, "math", 2, f"Placeholder unmatched b2 {tag}", week="B"),
            ld.PlanEntry(FN_B, "math", 3, names["ready_b"]),
        ],
    )
    sq.apply(conn, load, ld.Target("K2", section, YEAR, db.tenant_slug(), "CP-8 proof"))
    # Activities written after the load (as CP-15 will write them): their lines are unlinked but now have a match.
    acts["ready"] = _activity(conn, t, names["ready"], tag, 5)
    acts["ready2"] = _activity(conn, t, names["ready2"], tag, 6)
    acts["ready_b"] = _activity(conn, t, names["ready_b"], tag, 7)
    k = {
        "tenant": t,
        "class": klass,
        "year": year,
        "section": section,
        "names": names,
        "acts": acts,
        "tag": tag,
    }
    k["lines"] = {
        role: line(conn, k, "math", o)["id"]
        for role, o in (("loader", 1), ("none", 2), ("tie", 3), ("ready", 4), ("ready2", 5))
    }
    k["lines"]["ready_b"] = line(conn, k, "math", 3, FN_B)["id"]
    k["lines_b"] = [line(conn, k, "math", o, FN_B)["id"] for o in (1, 2)]
    return k


def apply_run(conn, k, fortnight=None):
    """A run over every fortnight (the three-argument call), or limited to one fortnight number."""
    if fortnight is None:
        return db.one(conn, "select plan_link_apply(%s, 'K2', %s) as run", (k["tenant"], BY))["run"]
    return db.one(conn, "select plan_link_apply(%s, 'K2', %s, %s) as run", (k["tenant"], BY, fortnight))[
        "run"
    ]


def undo_run(conn, run):
    return db.one(conn, "select plan_link_undo(%s, %s) as n", (run, BY))["n"]


def unmatched(conn, k):
    """{plan_entry_id: (reason, candidates)} of this class's lines on the unmatched list."""
    return {
        r["plan_entry_id"]: (r["reason"], r["candidates"])
        for r in conn.execute(
            "select plan_entry_id, reason, candidates from plan_unmatched where school_class_id = %s",
            (k["class"],),
        ).fetchall()
    }
