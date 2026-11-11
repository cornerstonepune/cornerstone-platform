"""UI-5: a coordinator gives and ends a class grant from the website (engine/w3_read/staff_grants.py).

Coordinators only; only the class and subject roles (the role table's own-classes group, held for a class); never a
person or class of another campus; ending keeps the row (a grant is never deleted); every give and end is a
`change_log` row; and the grant table's own rules (one class teacher to a class, D-039) answer in their own words.
Placeholder people and classes, rolled back."""

import datetime as dt
import os

import pytest

from engine.core import db, settings
from engine.w3_read import staff_grants as sg
from engine.w3_read.voice_store import Refused
from tests.test_notes_history_and_coordinator import _coordinator
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _label(conn, k):
    return conn.execute("select label from school_class where id = %s", (k["class"],)).fetchone()["label"]


def _another(conn, k, campus=None):
    """A member of staff with no grant, on `k`'s campus (or `campus`)."""
    campus = (
        campus
        or conn.execute("select campus_id from school_class where id = %s", (k["class"],)).fetchone()[
            "campus_id"
        ]
    )
    sid = conn.execute(
        "insert into staff (tenant_id, campus_id, role_code) values (%s, %s, 'educator') returning id",
        (k["tenant"], campus),
    ).fetchone()["id"]
    conn.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder Person', %s)",
        (k["tenant"], sid, f"placeholder.{sid}@example.test"),
    )
    return str(sid)


def _world(conn):
    k = a_k2_class(conn)
    return k, _coordinator(conn, k), _another(conn, k)


def _open(conn, staff):
    return conn.execute(
        "select role_code, subject_code, valid_from, valid_to, granted_by from staff_role_grant where staff_id = %s order by created_at",
        (staff,),
    ).fetchall()


def test_a_coordinator_gives_a_class_grant_signed_by_her_staff_id_and_it_is_logged(conn):
    k, boss, person = _world(conn)
    got = sg.give(conn, boss, person, "assistant", _label(conn, k))
    [g] = _open(conn, person)
    assert (g["role_code"], g["subject_code"], g["valid_from"], g["valid_to"]) == (
        "assistant",
        None,
        settings.school_today(conn),
        None,
    )
    assert g["granted_by"] == str(
        conn.execute("select public.staff_of_email(%s) as s", (boss,)).fetchone()["s"]
    )
    log = conn.execute(
        "select op, staff_id::text as who from change_log where table_name = 'staff_role_grant' and row_id = %s",
        (got["grant_id"],),
    ).fetchone()
    assert log["op"] == "give" and log["who"] == g["granted_by"]


def test_a_subject_role_needs_a_subject_and_a_class_role_refuses_one(conn):
    k, boss, person = _world(conn)
    with pytest.raises(Refused, match="needs_subject"):
        sg.give(conn, boss, person, "subject_educator", _label(conn, k))
    with pytest.raises(Refused, match="wrong_scope"):
        sg.give(conn, boss, person, "assistant", _label(conn, k), subject="NUM")
    sg.give(conn, boss, person, "subject_educator", _label(conn, k), subject="NUM")
    assert [g["subject_code"] for g in _open(conn, person)] == ["NUM"]


def test_only_a_coordinator_may_give_or_end_or_list(conn):
    k, boss, person = _world(conn)
    for call in (
        lambda: sg.give(conn, k["email"], person, "assistant", _label(conn, k)),
        lambda: sg.listing(conn, k["email"]),
    ):
        with pytest.raises(Refused) as no:
            call()
        assert no.value.status == 403
    got = sg.give(conn, boss, person, "assistant", _label(conn, k))
    with pytest.raises(Refused) as no:
        sg.end(conn, k["email"], got["grant_id"])
    assert no.value.status == 403


def test_a_coordinator_cannot_give_a_role_beyond_the_class_roles(conn):
    k, boss, person = _world(conn)
    for role in ("coordinator", "head", "deputy_coordinator", "curriculum_team", "educator", "no_such_role"):
        with pytest.raises(Refused) as no:
            sg.give(conn, boss, person, role, _label(conn, k))
        assert no.value.status == 422, role
    assert _open(conn, person) == []


def test_a_person_or_class_of_another_campus_is_not_reachable(conn):
    k, boss, person = _world(conn)
    other = conn.execute(
        "insert into campus (tenant_id, name) values (%s, 'Another placeholder campus') returning id",
        (k["tenant"],),
    ).fetchone()["id"]
    stranger = _another(conn, k, campus=other)
    with pytest.raises(Refused) as no:
        sg.give(conn, boss, stranger, "assistant", _label(conn, k))
    assert no.value.status == 404
    with pytest.raises(Refused) as no:
        sg.give(conn, boss, person, "assistant", "NO-SUCH-CLASS")
    assert no.value.status == 404


def test_ending_closes_the_grant_keeps_the_row_and_is_logged_and_a_second_end_is_refused(conn):
    k, boss, person = _world(conn)
    got = sg.give(conn, boss, person, "assistant", _label(conn, k))
    sg.end(conn, boss, got["grant_id"])
    [g] = _open(conn, person)
    assert g["valid_to"] == settings.school_today(conn)
    ended = conn.execute(
        "select op from change_log where table_name = 'staff_role_grant' and row_id = %s order by at",
        (got["grant_id"],),
    ).fetchall()
    assert [r["op"] for r in ended] == ["give", "end"]
    with pytest.raises(Refused) as no:
        sg.end(conn, boss, got["grant_id"])
    assert no.value.status == 409


def test_a_grant_of_a_role_this_page_does_not_give_cannot_be_ended_here(conn):
    k, boss, person = _world(conn)
    mine = conn.execute(
        "select g.id::text as id from staff_role_grant g where g.staff_id = public.staff_of_email(%s)"
        " and g.school_class_id is null",
        (boss,),
    ).fetchone()
    assert mine, "the placeholder coordinator holds a campus role"
    with pytest.raises(Refused) as no:
        sg.end(conn, boss, mine["id"])
    assert no.value.status == 422


def test_the_grant_tables_own_rules_answer_in_their_words_and_a_reason_lets_a_second_class_teacher_stand(
    conn,
):
    k, boss, person = _world(conn)
    label = _label(conn, k)  # k's educator already holds class_teacher here
    with pytest.raises(Refused, match="one_per_class") as no:
        sg.give(conn, boss, person, "class_teacher", label)
    assert no.value.status == 409
    sg.give(conn, boss, person, "class_teacher", label, reason="job share this term")
    assert [g["role_code"] for g in _open(conn, person)] == ["class_teacher"]
    again = None
    with pytest.raises(Refused, match="already_holds") as no:
        again = sg.give(conn, boss, person, "class_teacher", label, reason="job share this term")
    assert again is None and no.value.status == 409


def test_the_listing_gives_ids_roles_classes_and_dates_never_a_name_or_an_email(conn):
    k, boss, person = _world(conn)
    got = sg.give(conn, boss, person, "subject_educator", _label(conn, k), subject="NUM")
    sg.end(conn, boss, got["grant_id"])
    sg.give(conn, boss, person, "assistant", _label(conn, k))
    out = sg.listing(conn, boss)
    mine = [g for g in out["grants"] if g["staff_id"] == person]
    # one transaction, one clock: the order of two grants made in it is not asserted
    assert sorted((g["role"], g["subject"], g["open"]) for g in mine) == [
        ("assistant", None, True),
        ("subject_educator", "NUM", False),
    ]
    assert {r["code"] for r in out["roles"]} >= {"assistant", "class_teacher", "subject_educator"}
    assert not {"coordinator", "head", "educator"} & {r["code"] for r in out["roles"]}
    assert _label(conn, k) in out["classes"] and "NUM" in out["subjects"]
    text = repr(out)
    assert "Placeholder" not in text and "@example.test" not in text
    assert out["today"] == settings.school_today(conn).isoformat()
    assert dt.date.fromisoformat(mine[0]["from"]) <= dt.date.fromisoformat(out["today"])
