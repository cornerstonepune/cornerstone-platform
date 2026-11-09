"""CP-1 item 3: moving a child (`public.move_child`) closes the child's open enrolment row and opens a new one in the
same call; a child never has two open rows; a refused move changes nothing.

The classes and children are made here, in a transaction rolled back at the end; no child has a name.
"""

import uuid
from datetime import date

import pytest

from engine.core import db, people

BY = "proof.coordinator@example.test"


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _tenant(conn):
    return db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]


def _year(conn, t):
    """The school year today is in: the one already there, or one made for the test."""
    label = people.year_label(date.today())
    start = int(label[:4])
    conn.execute(
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, %s, %s, %s)"
        " on conflict (tenant_id, label) do nothing",
        (t, label, date(start, 4, 1), date(start + 1, 3, 31)),
    )
    return db.one(conn, "select id, starts_on from academic_year where tenant_id = %s and label = %s", (t, label))


def _campus(conn, t):
    row = conn.execute("select id from campus where tenant_id = %s order by created_at limit 1", (t,)).fetchone()
    return row["id"] if row else db.one(
        conn, "insert into campus (tenant_id, name) values (%s, 'CP-1 proof campus') returning id", (t,)
    )["id"]


def _class(conn, t, campus, year, band="G3"):
    section = f"CP1-{uuid.uuid4().hex[:6].upper()}"
    cid = db.one(
        conn,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, %s, %s) returning id",
        (t, campus, year["id"], band, section),
    )["id"]
    return section, cid


def _child_in(conn, t, section, class_id, roll, since, band="G3"):
    child = db.one(
        conn,
        "insert into child (tenant_id, roll_no, section, band) values (%s, %s, %s, %s) returning id",
        (t, roll, section, band),
    )["id"]
    conn.execute("select enrol_child(%s, %s, %s, %s, %s)", (child, class_id, roll, since, BY))
    return child


@pytest.fixture
def school(conn):
    """Two Grade 3 classes of this year; child `x` is roll 1 of class A, child `y` roll 1 of class B, and child `z`
    roll 2 of class A, so class A still has a child when `x` leaves it."""
    t = _tenant(conn)
    year, campus = _year(conn, t), _campus(conn, t)
    a, a_id = _class(conn, t, campus, year)
    b, b_id = _class(conn, t, campus, year)
    since = year["starts_on"]
    x = _child_in(conn, t, a, a_id, "1", since)
    y = _child_in(conn, t, b, b_id, "1", since)
    _child_in(conn, t, a, a_id, "2", since)
    return {"a": a, "a_id": a_id, "b": b, "b_id": b_id, "x": x, "y": y}


def _move(conn, child, band, section, roll):
    return db.one(
        conn, "select move_child(%s, %s, %s, %s, %s, %s) as r", (child, band, section, roll, BY, "CP-1 proof")
    )["r"]


def _rows(conn, child):
    return conn.execute(
        "select id, class_id, roll_no, from_date, to_date from enrolment where child_id = %s order by created_at, id",
        (child,),
    ).fetchall()


def _open(conn, child):
    return [r for r in _rows(conn, child) if r["to_date"] is None]


def test_a_move_closes_the_open_enrolment_and_opens_one_in_the_new_class(conn, school):
    x = school["x"]
    [was] = _rows(conn, x)
    said = _move(conn, x, "G3", school["b"], "2")
    assert said["moved"] is True, said
    after = {r["id"]: r for r in _rows(conn, x)}
    assert len(after) == 2, f"expected the old row closed and one new row, found {len(after)} rows"
    assert after[was["id"]]["to_date"] is not None, "the child's old enrolment row was not closed"
    [now] = _open(conn, x)
    assert (now["class_id"], now["roll_no"]) == (school["b_id"], "2")


def test_a_child_never_has_two_open_enrolment_rows(conn, school):
    x = school["x"]
    for where, roll in (("b", "2"), ("a", "3")):
        said = _move(conn, x, "G3", school[where], roll)
        assert said["moved"] is True, said
    opened = _open(conn, x)
    assert len(opened) == 1, f"{len(opened)} open enrolment rows"
    assert (opened[0]["class_id"], opened[0]["roll_no"]) == (school["a_id"], "3")
    assert len(_rows(conn, x)) == 3, "each move keeps the row it closed"


@pytest.mark.parametrize(
    "band, where, roll, why",
    [("G3", "b", "1", "roll_taken"), ("NOT-A-GRADE", "b", "2", "no_such_grade")],
)
def test_a_refused_move_changes_nothing(conn, school, band, where, roll, why):
    x = school["x"]
    child_before = db.one(conn, "select band, section, roll_no from child where id = %s", (x,))
    enrol_before = _rows(conn, x)
    moves_before = db.one(conn, "select count(*) as n from child_move where child_id = %s", (x,))["n"]
    said = _move(conn, x, band, school[where], roll)
    assert said["moved"] is False and said.get("refused") == why, said
    assert db.one(conn, "select band, section, roll_no from child where id = %s", (x,)) == child_before
    assert _rows(conn, x) == enrol_before, "a refused move changed the child's enrolment"
    assert db.one(conn, "select count(*) as n from child_move where child_id = %s", (x,))["n"] == moves_before
