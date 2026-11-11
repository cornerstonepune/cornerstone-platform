"""Issue 590: one access rule. The site's sign-in reads a person's classes and subjects from their open grants (the rule
the engine already uses), not from the `staff.classes` / `staff.subjects` columns only the old staff editor writes.

Each test runs in a transaction that is rolled back, so the test database is as it was."""

import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest

from engine.core import db
from tests import rows

MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "20270126110000_grants_one_source.sql"
)
needs_db = pytest.mark.skipif(not db.dsn(), reason="needs DATABASE_URL")


@contextmanager
def school():
    with db.connect() as conn:
        rows.this_year(conn)
        try:
            yield conn
        finally:
            conn.rollback()


def a_class(conn, grade="G2"):
    t = rows.tenant(conn)
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    year = rows.this_year(conn, t)
    label = f"T{uuid.uuid4().hex[:5]}"
    cid = conn.execute(
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label)"
        " values (%s, %s, %s, %s, %s, %s) returning id",
        (t, campus, year, grade, label, label),
    ).fetchone()["id"]
    return cid, label


def grant(conn, person, role, class_id=None, subject=None, valid_from="2020-01-01", valid_to=None):
    conn.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code, valid_from,"
        " valid_to, granted_by) values (%s, %s, %s, %s, %s, %s, %s, 'test')",
        (rows.tenant(conn), person["ask_as"], role, class_id, subject, valid_from, valid_to),
    )


def person(conn, role="educator", classes=(), subjects=()):
    return rows.a_person(
        conn,
        f"{uuid.uuid4().hex[:8]}@example.test",
        role=role,
        classes=list(classes),
        subjects=list(subjects),
    )


def signs_in_with(conn, p):
    me = next(
        r
        for r in conn.execute("select * from public.staff_list(%s)", (db.tenant_slug(),)).fetchall()
        if r["id"] == uuid.UUID(p["ask_as"])
    )
    return sorted(me["classes"]), sorted(me["subjects"])


def run_migration(conn):
    conn.execute(MIGRATION.read_text())


@needs_db
def test_the_sign_in_reads_classes_from_open_grants_and_ignores_the_staff_columns():
    with school() as conn:
        k, label = a_class(conn)
        p = person(conn)
        grant(conn, p, "class_teacher", k)
        run_migration(conn)
        # the old editor writes the columns: the sign-in no longer reads them
        conn.execute(
            "update staff set classes = %s, subjects = %s where id = %s",
            (["NOT-A-CLASS"], ["ENG"], p["ask_as"]),
        )
        assert signs_in_with(conn, p) == ([label], [])


@needs_db
def test_an_ended_or_not_yet_started_grant_gives_no_class():
    with school() as conn:
        a, _ = a_class(conn)
        b, _ = a_class(conn)
        p = person(conn)
        grant(conn, p, "assistant", a, valid_to="2020-02-01")
        grant(conn, p, "assistant", b, valid_from="2999-01-01")
        run_migration(conn)
        assert signs_in_with(conn, p) == ([], [])


@needs_db
def test_subjects_come_from_subject_grants_and_a_whole_class_grant_narrows_nothing():
    with school() as conn:
        a, la = a_class(conn)
        b, lb = a_class(conn)
        only = person(conn)
        grant(conn, only, "subject_educator", a, "NUM")
        both = person(conn)
        grant(conn, both, "subject_educator", a, "NUM")
        grant(
            conn, both, "assistant", b
        )  # all subjects of class b: the flat rule cannot say "NUM in a, all in b"
        run_migration(conn)
        assert signs_in_with(conn, only) == ([la], ["NUM"])
        assert signs_in_with(conn, both) == (sorted([la, lb]), [])


@needs_db
def test_a_coordinator_or_a_person_with_no_class_grant_signs_in_with_no_classes():
    with school() as conn:
        c = person(conn, role="coordinator")
        e = person(conn)
        run_migration(conn)
        assert signs_in_with(conn, c) == ([], [])
        assert signs_in_with(conn, e) == ([], [])


@needs_db
def test_a_coordinator_who_also_holds_a_class_grant_is_not_narrowed_by_it():
    """A coordinator sees every class (the rule `staff_sees` already has), so a class grant they also hold must not narrow
    the site for them; the same grant narrows an educator."""
    with school() as conn:
        k, label = a_class(conn)
        c, e = person(conn, role="coordinator"), person(conn)
        grant(conn, c, "assistant", k)
        grant(conn, e, "assistant", k)
        run_migration(conn)
        assert signs_in_with(conn, c) == ([], [])
        assert signs_in_with(conn, e)[0] == [label]


@needs_db
def test_the_backfill_gives_each_educator_the_grants_their_old_entry_implied_and_changes_nothing_they_see():
    with school() as conn:
        a, la = a_class(conn)
        b, lb = a_class(conn)
        c, lc = a_class(conn, "K2")
        d, ld = a_class(conn)
        taught = person(conn, classes=[la, lb], subjects=["NUM"])  # two classes, one subject
        whole = person(conn, classes=[lc])  # a class, no subject
        had = person(conn, classes=[ld], subjects=["ENG"])
        grant(conn, had, "subject_educator", d, "ENG")  # already granted: not doubled
        coordinator = person(conn, role="coordinator")
        run_migration(conn)
        n = conn.execute(
            "select count(*) as n from staff_role_grant where staff_id = %s", (taught["ask_as"],)
        ).fetchone()["n"]
        assert n == 2
        assert signs_in_with(conn, taught) == (sorted([la, lb]), ["NUM"])
        assert signs_in_with(conn, whole) == ([lc], [])
        assert (
            conn.execute(
                "select role_code from staff_role_grant where staff_id = %s", (whole["ask_as"],)
            ).fetchone()["role_code"]
            == "class_teacher"
        )
        assert signs_in_with(conn, had) == ([ld], ["ENG"])
        assert (
            conn.execute(
                "select count(*) as n from staff_role_grant where staff_id = %s", (had["ask_as"],)
            ).fetchone()["n"]
            == 1
        )
        assert signs_in_with(conn, coordinator) == ([], [])
        # running it again adds nothing
        before = conn.execute("select count(*) as n from staff_role_grant").fetchone()["n"]
        run_migration(conn)
        assert conn.execute("select count(*) as n from staff_role_grant").fetchone()["n"] == before


@needs_db
def test_the_backfill_refuses_rather_than_leave_an_educator_with_fewer_classes():
    with school() as conn:
        # a class with no row of its own this year: nothing to grant on, so the migration must stop
        p = person(conn, classes=["NO-SUCH-CLASS"], subjects=["NUM"])
        with pytest.raises(psycopg.errors.RaiseException, match="fewer classes"):
            run_migration(conn)
        assert p


@needs_db
def test_a_second_class_teacher_in_the_backfill_is_refused_by_the_grant_rule_not_skipped():
    with school() as conn:
        k, label = a_class(conn, "K2")
        first = person(conn)
        grant(conn, first, "class_teacher", k)
        person(conn, classes=[label])  # old entry, no subjects: would be a second class teacher
        with pytest.raises(psycopg.errors.RaiseException, match="one_per_class"):
            run_migration(conn)
