"""Why a signed-in head sees a 404 on the curriculum screens, read as counts (goals/m1-12s-curriculum-404.yaml).

The screens ask the engine's gate, and the gate looks in the people tables (a member of staff by email, and a dated grant
of a role), not in the sign-in list the person signed in from. A person on the sign-in list who was never copied into
the people tables, or whose grant is missing or ended, or a config row that was never loaded, is refused, and the site
shows a refused person a 404. The check says which, by role, with no name or email."""

import json
import os
import uuid

import pytest

from engine.checks import gate_check
from engine.core import db
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        c.t = tenant(c)  # type: ignore[attr-defined]
        c.execute(
            "insert into config (tenant_id, key, value, description) values (%s, 'curriculum.review_roles', %s, 't')"
            " on conflict (tenant_id, key) do update set value = excluded.value",
            (c.t, json.dumps(["head", "coordinator"])),
        )
        c.execute(
            "insert into config (tenant_id, key, value, description) values (%s, 'educator.timetable_enabled', 'false', 't')"
            " on conflict (tenant_id, key) do update set value = excluded.value",
            (c.t,),
        )
        yield c
        c.rollback()


def sign_in(conn, *entries):
    conn.execute(
        "insert into config (tenant_id, key, value, description) values (%s, 'app.staff', %s, 't')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (conn.t, json.dumps([{"email": e, "role": r} for e, r in entries])),
    )


def person(conn, email, role=None, ended=False):
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (conn.t,)).fetchone()["id"]
    sid = conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (conn.t, campus)
    ).fetchone()["id"]
    conn.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'A placeholder', %s)",
        (conn.t, sid, email),
    )
    if role:
        conn.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, valid_to, granted_by)"
            " values (%s, %s, %s, current_date - 60, %s, 'test')",
            (conn.t, sid, role, None if not ended else db.one(conn, "select current_date - 30 as d")["d"]),
        )
    return sid


def mail():
    return f"placeholder.{uuid.uuid4().hex[:8]}@example.test"


def head(report):
    return report["sign_in_list"]["head"]


def test_a_head_on_the_sign_in_list_with_no_staff_row_is_counted_as_not_in_the_people_tables(conn):
    sign_in(conn, (mail(), "head"))
    assert head(gate_check.report(conn)) == {
        "entries": 1,
        "in_staff_tables": 0,
        "grant_in_same_role_today": 0,
        "gate_open": 0,
        "may_review": 0,
    }


def test_a_head_with_a_staff_row_and_no_grant_is_in_the_tables_and_still_refused(conn):
    email = mail()
    person(conn, email)
    sign_in(conn, (email, "head"))
    got = head(gate_check.report(conn))
    assert got["in_staff_tables"] == 1 and got["grant_in_same_role_today"] == 0 and got["gate_open"] == 0


def test_a_head_with_an_open_grant_passes_and_may_review(conn):
    email = mail()
    person(conn, email, "head")
    sign_in(conn, (email, "head"))
    assert head(gate_check.report(conn)) == {
        "entries": 1,
        "in_staff_tables": 1,
        "grant_in_same_role_today": 1,
        "gate_open": 1,
        "may_review": 1,
    }


def test_a_grant_that_ended_does_not_count(conn):
    email = mail()
    person(conn, email, "head", ended=True)
    sign_in(conn, (email, "head"))
    got = head(gate_check.report(conn))
    assert got["in_staff_tables"] == 1 and got["grant_in_same_role_today"] == 0 and got["gate_open"] == 0


def test_a_review_roles_row_that_was_never_loaded_shuts_the_gate_for_everyone_and_the_report_says_so(conn):
    email = mail()
    person(conn, email, "head")
    sign_in(conn, (email, "head"))
    conn.execute("delete from config where key in ('curriculum.review_roles', 'educator.preview_roles')")
    got = gate_check.report(conn)
    assert got["config"]["review_roles"] is None and got["config"]["preview_roles"] is None
    assert head(got)["gate_open"] == 0 and head(got)["grant_in_same_role_today"] == 1


def test_the_report_holds_no_email_and_no_name(conn):
    email = mail()
    person(conn, email, "head")
    sign_in(conn, (email, "head"))
    text = json.dumps(gate_check.report(conn))
    assert email not in text and "placeholder" not in text.lower()
