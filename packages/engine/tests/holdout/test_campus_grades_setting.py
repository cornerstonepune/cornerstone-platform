"""#923: the class-list import finds a grade's campus from the setting `school.campus_grades`, read through
`settings.config`. Each test runs in one transaction that is rolled back; the year 2099-00 is never a real one."""

import pytest
from psycopg.types.json import Jsonb

from engine.core import db, people
from engine.core.report import Report

YEAR = "2099-00"


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _school(conn, campuses, setting):
    """A school of its own (so the tests' school is never changed), with only these campuses and only this setting
    (None: no setting row). A new school is made with the starting campuses, grades and settings; K2 is kept."""
    t = db.one(
        conn, "insert into tenant (slug, name) values ('t923-holdout', 'Holdout school') returning id"
    )["id"]
    conn.execute("delete from config where tenant_id = %s and key = 'school.campus_grades'", (t,))
    conn.execute("delete from campus where tenant_id = %s", (t,))
    for name in campuses:
        conn.execute("insert into campus (tenant_id, name) values (%s, %s)", (t, name))
    if setting is not None:
        conn.execute(
            "insert into config (tenant_id, key, value) values (%s, 'school.campus_grades', %s)",
            (t, Jsonb(setting)),
        )
    return t


def _campus_of_new_class(conn, t):
    class_id = people._class_ids(conn, t, "K2", YEAR, "A", True, Report())
    return db.one(
        conn,
        "select p.name from school_class c join campus p on p.id = c.campus_id where c.id = %s",
        (class_id,),
    )["name"]


@pytest.mark.parametrize("holder", ["North", "South"])
def test_with_two_campuses_the_class_goes_to_the_campus_the_setting_names(conn, holder):
    other = "South" if holder == "North" else "North"
    t = _school(conn, ["North", "South"], {holder: ["K2"], other: ["K1"]})
    assert _campus_of_new_class(conn, t) == holder


def test_one_campus_with_no_setting_still_gets_the_class(conn):
    t = _school(conn, ["Only"], None)
    assert _campus_of_new_class(conn, t) == "Only"


def test_two_campuses_and_no_campus_named_for_the_grade_is_refused_in_words(conn):
    t = _school(conn, ["North", "South"], {"North": ["K1"]})
    with pytest.raises(ValueError, match="no campus holds grade K2"):
        people._class_ids(conn, t, "K2", YEAR, "A", True, Report())


def test_another_schools_setting_is_not_read(conn):
    """The tests' own school's setting names Gurukul and Neev; a second school with campuses of those names and no
    setting of its own must not borrow it."""
    t = _school(conn, ["Gurukul", "Neev"], None)
    with pytest.raises(ValueError, match="no campus holds grade K2"):
        people._class_ids(conn, t, "K2", YEAR, "A", True, Report())
