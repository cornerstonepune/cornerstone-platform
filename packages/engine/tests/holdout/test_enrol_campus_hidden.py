"""#939 hidden: a grade at two campuses. Each test runs in one transaction that is rolled back, in a school of its own;
the year 2099-00 is never a real one."""

import pytest

from engine.core import db, people
from engine.core.report import Report
from tests.holdout.test_campus_grades_setting import _school

YEAR = "2099-00"
BOTH = {"North": ["K1", "K2"], "South": ["K1"]}


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _campus_of(conn, class_id):
    return db.one(
        conn,
        "select p.name from school_class c join campus p on p.id = c.campus_id where c.id = %s",
        (class_id,),
    )["name"]


def test_two_campuses_holding_the_grade_and_none_named_refuses_naming_both_in_order(conn):
    t = _school(conn, ["South", "North"], BOTH)
    with pytest.raises(ValueError, match="grade K1 is at North and South: name the campus with --campus"):
        people._class_ids(conn, t, "K1", YEAR, "A", True, Report())
    assert conn.execute("select 1 from school_class where tenant_id = %s", (t,)).fetchone() is None


@pytest.mark.parametrize("named", ["South", "south", " SOUTH "])
def test_the_named_campus_is_found_whatever_its_case(conn, named):
    t = _school(conn, ["North", "South"], BOTH)
    assert _campus_of(conn, people._class_ids(conn, t, "K1", YEAR, "A", True, Report(), named)) == "South"


def test_a_named_campus_the_setting_does_not_give_the_grade_refuses(conn):
    t = _school(conn, ["North", "South"], BOTH)
    with pytest.raises(ValueError, match="South does not hold grade K2 in the setting school.campus_grades"):
        people._class_ids(conn, t, "K2", YEAR, "A", True, Report(), "South")


def test_one_campus_holding_the_grade_needs_no_name(conn):
    t = _school(conn, ["North", "South"], BOTH)
    assert _campus_of(conn, people._class_ids(conn, t, "K2", YEAR, "A", True, Report())) == "North"


def test_the_other_campus_class_of_the_same_grade_and_letter_is_never_reused(conn):
    t = _school(conn, ["North", "South"], BOTH)
    north = people._class_ids(conn, t, "K1", YEAR, "A", True, Report(), "North")
    south = people._class_ids(conn, t, "K1", YEAR, "A", True, Report(), "South")
    assert north != south
    assert (_campus_of(conn, north), _campus_of(conn, south)) == ("North", "South")
    assert people._class_ids(conn, t, "K1", YEAR, "A", True, Report(), "North") == north


def test_a_dry_run_at_a_new_campus_says_it_would_add_the_class(conn):
    t = _school(conn, ["North", "South"], BOTH)
    people._class_ids(conn, t, "K1", YEAR, "A", True, Report(), "North")
    out = Report()
    assert people._class_ids(conn, t, "K1", YEAR, "A", False, out, "South") is None
    assert any("would add the class K1-A" in line for line in out.lines)
