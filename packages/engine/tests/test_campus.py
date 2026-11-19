"""Money & Materials MM-0 (specs/CP-76/spec.md, D-077): two campuses, each class on one, and an operations lead for each."""

import os

import pytest

from engine.core import db, people, staff
from engine.core.report import Report
from tests import rows
from tests.test_cli import run

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")
EMAIL = "ops-lead@cornerstone.test"


def _ops(monkeypatch, *args):
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "a-long-test-password")
    return run("staff", "add", EMAIL, "--name", "Ops Lead", "--role", "ops", *args)


@pytest.fixture
def conn():
    if not os.getenv("DATABASE_URL"):
        pytest.skip("needs DATABASE_URL (see .env.example)")
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def clean():
    yield
    with db.connect() as conn:
        rows.forget_person(conn, EMAIL)
        conn.commit()


def test_the_school_is_two_campuses_and_the_change_runs_twice(conn):
    sql = (db.REPO_ROOT / "supabase/migrations/20270206090000_two_campuses.sql").read_text()
    conn.execute(sql)
    assert [r["name"] for r in conn.execute("select name from campus order by name")] == ["Gurukul", "Neev"]


def test_a_class_has_a_campus_and_a_new_one_goes_to_the_campus_that_holds_its_grade(conn):
    t = rows.tenant(conn)
    assert conn.execute("select count(*) n from school_class where campus_id is null").fetchone()["n"] == 0
    year = conn.execute("select label from academic_year order by starts_on desc limit 1").fetchone()["label"]
    out = Report()
    for grade, campus in (("PG", "Neev"), ("G4", "Gurukul")):
        cid = people._class_ids(conn, t, grade, year, "Z", True, out)
        got = conn.execute(
            "select c.name from school_class k join campus c on c.id = k.campus_id where k.id = %s", (cid,)
        ).fetchone()["name"]
        assert got == campus, grade


def test_an_operations_lead_must_name_their_campus_and_it_is_kept(monkeypatch, clean):
    no = _ops(monkeypatch)
    assert no.exit_code != 0 and "name it (--campus)" in no.output_plain
    assert _ops(monkeypatch, "--campus", "Atlantis").exit_code != 0
    assert _ops(monkeypatch, "--campus", "Neev").exit_code == 0
    with db.connect() as conn:
        me = conn.execute("select staff_id from pii.staff where email = %s", (EMAIL,)).fetchone()["staff_id"]
        assert (
            conn.execute(
                "select c.name from staff s join campus c on c.id = s.campus_id where s.id = %s", (me,)
            ).fetchone()["name"]
            == "Neev"
        )
        log = conn.execute(
            "select after from change_log where table_name = 'staff' and row_id = %s and op = 'campus'",
            (str(me),),
        ).fetchone()
        assert log["after"] == {"role": "ops", "campus": "Neev"}


def test_campuses_of_is_one_for_an_operations_lead_and_the_whole_school_for_a_coordinator(monkeypatch, clean):
    assert _ops(monkeypatch, "--campus", "Neev").exit_code == 0
    with db.connect() as conn:
        lead = conn.execute("select staff_id from pii.staff where email = %s", (EMAIL,)).fetchone()[
            "staff_id"
        ]
        assert staff.campuses_of(conn, lead) == ["Neev"]
        coordinator = conn.execute(
            "select id from staff where role_code = 'coordinator' and active limit 1"
        ).fetchone()
        if coordinator:
            assert staff.campuses_of(conn, coordinator["id"]) == ["Gurukul", "Neev"]
