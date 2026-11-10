"""Who did something, as a member of staff's id (CP-27 group 4, step 4-prep: `engine.core.who`).

A "who" arrives in whatever form its caller holds: a staff id (the id the website signs a person in as), the
`staff:<id>` a database session names, an email, a name, or "Name (role)". Each is one member of staff or nobody;
a name two people share is nobody, never a guess; a script's own label (the loader, n8n) is kept as where it came
from. Every person here is made up; each test rolls back.
"""

import uuid

import pytest

from engine.core import db
from engine.core.who import Who, who
from tests import rows


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _member(conn, name, email):
    """A member of staff on the staff tables and on the sign-in list. → (staff id, the id they sign in as)."""
    t = rows.tenant(conn)
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    staff = conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus)
    ).fetchone()["id"]
    conn.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, %s, %s)",
        (t, staff, name, email),
    )
    return staff, rows.a_person(conn, email, name)["ask_as"]


def test_every_form_a_caller_holds_is_the_one_member_of_staff(conn):
    tag = uuid.uuid4().hex[:8]
    name, email = f"Who Test {tag}", f"who-{tag}@example.test"
    staff, signs_in_as = _member(conn, name, email)
    assert signs_in_as == str(staff), (
        "the id the website signs a person in as is their staff id (CP-27 group 4)"
    )
    for held in (staff, str(staff), signs_in_as, f"staff:{staff}", email, f"  {email.upper()} ", name,
                 f"{name} (educator)", f"{name}(coordinator)"):  # fmt: skip
        assert who(conn, held) == Who(staff, None), held


def test_a_name_two_people_share_an_unknown_id_or_email_is_nobody_and_a_script_keeps_its_label(conn):
    tag = uuid.uuid4().hex[:8]
    shared = f"Who Twin {tag}"
    _member(conn, shared, f"twin-a-{tag}@example.test")
    _member(conn, shared, f"twin-b-{tag}@example.test")
    assert who(conn, shared) == Who(None, shared), "two people share the name: never a guess"
    assert who(conn, f"{shared} (educator)") == Who(None, f"{shared} (educator)")
    nobody = str(uuid.uuid4())
    for label in ("loader", "n8n", "test fixture", nobody, f"staff:{nobody}", "nobody@example.test"):
        assert who(conn, label) == Who(None, label), label
    assert who(conn, "  loader ") == Who(None, "loader")
    for blank in (None, "", "   "):
        assert who(conn, blank) == Who(None, None)


def test_a_name_is_matched_within_the_school_asked_about(conn):
    tag = uuid.uuid4().hex[:8]
    name = f"Who School {tag}"
    staff, _ = _member(conn, name, f"school-{tag}@example.test")
    assert who(conn, name, tenant=rows.tenant(conn)) == Who(staff, None)
    other = conn.execute(
        "insert into tenant (slug, name) values (%s, 'Another school') returning id", (f"who-{tag}",)
    ).fetchone()["id"]
    assert who(conn, name, tenant=other) == Who(None, name)
