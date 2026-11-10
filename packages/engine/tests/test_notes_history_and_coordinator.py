"""The frontend's gaps after issue 565: a child's history, the lesson on an uploaded recording, and the coordinator's
view of every class's notes (engine/w3_read/child_history.py, voice_class.py, voice_intake.py).

Placeholder class, educator and children (tests/voice_rows.py), inside a rolled-back transaction: no school data.
"""

import datetime as dt
import os
import re

import pytest

from engine.core import db
from engine.w3_read import child_history as ch
from engine.w3_read import voice_class as vcl
from engine.w3_read import voice_confirm as vc
from engine.w3_read import voice_intake, voice_store
from tests.test_voice_class_notes import _session, _today
from tests.voice_rows import a_k2_class, a_note

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _coordinator(conn, k):
    """A second member of staff holding a coordinator role across the campus (no class)."""
    campus = conn.execute("select campus_id from school_class where id = %s", (k["class"],)).fetchone()[
        "campus_id"
    ]
    staff = conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (k["tenant"], campus)
    ).fetchone()["id"]
    email = f"placeholder.coord.{staff}@example.test"
    conn.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder Coordinator', %s)",
        (k["tenant"], staff, email),
    )
    role = conn.execute(
        "select (value->'coordinator_roles'->>0) as r from config where key = 'k2.reads'"
    ).fetchone()
    conn.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)"
        " values (%s, %s, %s, '2026-01-01', 'test')",
        (k["tenant"], staff, role["r"]),
    )
    return email


# ---- the lesson on an uploaded recording -----------------------------------------------------------------------------


def test_a_recording_sent_with_its_lesson_keeps_it_and_one_of_another_class_is_refused(conn, monkeypatch):
    monkeypatch.setattr(voice_store, "save", lambda key, data: None)
    k, other = a_k2_class(conn), a_k2_class(conn)
    mine = _session(conn, k, _today(conn))
    note = voice_intake.receive(conn, k["email"], k["class"], "a.m4a", b"x", session_id=mine)
    assert str(note["session_id"]) == mine
    with pytest.raises(voice_store.Refused):
        voice_intake.receive(
            conn, k["email"], k["class"], "a.m4a", b"x", session_id=_session(conn, other, _today(conn))
        )
    assert voice_intake.receive(conn, k["email"], k["class"], "a.m4a", b"x")["session_id"] is None


# ---- the coordinator's view -----------------------------------------------------------------------------------------


def test_the_coordinator_sees_every_class_of_the_campus_and_an_educator_is_refused(conn):
    k, other = a_k2_class(conn), a_k2_class(conn)
    a_note(conn, k, "Activity 12. Above 3.")
    a_note(conn, other, "Activity 12. Below 1.")
    boss = _coordinator(conn, k)
    out = vcl.coordinator_notes(conn, boss, _today(conn))
    classes = {n["class_id"] for n in out["notes"]}
    assert {k["class"], other["class"]} <= classes
    assert all(re.match(r"^K2 ", n["class"]) for n in out["notes"])
    with pytest.raises(voice_store.Refused) as no:
        vcl.coordinator_notes(conn, k["email"], _today(conn))
    assert no.value.status == 403


def test_the_coordinators_children_waiting_are_counted_by_child(conn):
    k = a_k2_class(conn)
    a_note(conn, k, "Activity 12. Above 3.")
    out = vcl.coordinator_notes(conn, _coordinator(conn, k), _today(conn))
    assert out["waiting_by_child"].get(k["children"]["3"]) == 1


# ---- a child's history ----------------------------------------------------------------------------------------------


def _confirmed(conn, k):
    note = a_note(conn, k, "Activity 12. Above 3.")
    vc.confirm_note(conn, str(note["id"]), k["email"], vc.Confirmed(k["activity"], 2, {"above": ["3"]}))
    return str(note["id"])


def test_a_childs_history_is_newest_first_with_who_as_a_staff_id_and_no_free_text(conn):
    k = a_k2_class(conn)
    note_id = _confirmed(conn, k)
    got = ch.history(conn, k["email"], k["class"], "3")
    kinds = [e["kind"] for e in got["entries"]]
    assert "observation" in kinds
    assert [e["at"] for e in got["entries"]] == sorted((e["at"] for e in got["entries"]), reverse=True)
    seen = next(e for e in got["entries"] if e["kind"] == "observation")
    assert seen["what"]["note_id"] == note_id and seen["what"]["outcome"] == "above"
    assert seen["who"] == str(k["staff"])
    for e in got["entries"]:
        assert e["who"] is None or UUID.match(e["who"])
        assert set(e["what"]) <= {
            "skill",
            "mark",
            "source",
            "kind",
            "activity",
            "outcome",
            "note_id",
            "session_id",
            "week",
            "status",
            "qr",
        }


def test_evidence_made_by_an_observation_is_not_listed_twice(conn):
    k = a_k2_class(conn)
    _confirmed(conn, k)
    got = ch.history(conn, k["email"], k["class"], "3")
    n = conn.execute(
        "select count(*) n from evidence_event where child_id = %s and observation_id is not null",
        (k["children"]["3"],),
    ).fetchone()["n"]
    assert n >= 1
    assert [e["kind"] for e in got["entries"]].count("evidence") == 0


def test_a_correction_replaces_the_row_it_corrects_in_the_history(conn):
    k = a_k2_class(conn)
    note_id = _confirmed(conn, k)
    old = conn.execute(
        "select id from activity_observation where note_id = %s and child_id = %s",
        (note_id, k["children"]["3"]),
    ).fetchone()["id"]
    vc.correct(conn, str(old), k["email"], "below", "wrong child heard")
    seen = [e for e in ch.history(conn, k["email"], k["class"], "3")["entries"] if e["kind"] == "observation"]
    assert [e["what"]["outcome"] for e in seen] == ["below"]


def test_a_paper_given_to_a_child_is_in_the_history_without_its_approvers_name(conn):
    k = a_k2_class(conn)
    child = k["children"]["3"]
    template = conn.execute(
        "insert into sheet_template (tenant_id, band, week, item_ids, source, child_id)"
        " values (%s, 'K2', %s, '{}', 'focus', %s) returning id",
        (k["tenant"], dt.date(2026, 11, 2), child),
    ).fetchone()["id"]
    conn.execute(
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, kind, print_status,"
        " approved_by, approved_at) values (%s, 'CSABC123', %s, %s, %s, 'practice', 'printed', 'someone@school.test', now())",
        (k["tenant"], template, child, dt.date(2026, 11, 2)),
    )
    paper = next(e for e in ch.history(conn, k["email"], k["class"], "3")["entries"] if e["kind"] == "paper")
    assert paper["who"] is None and paper["what"]["status"] == "printed"
    assert "someone@school.test" not in repr(paper)


def test_history_pages_by_a_moment_and_is_limited(conn):
    k = a_k2_class(conn)
    _confirmed(conn, k)
    first = ch.history(conn, k["email"], k["class"], "3", limit=1)
    assert len(first["entries"]) == 1
    rest = ch.history(conn, k["email"], k["class"], "3", before=first["entries"][-1]["at"])
    assert all(e["at"] < first["entries"][-1]["at"] for e in rest["entries"])


def test_only_someone_on_the_class_or_a_coordinator_sees_a_childs_history_and_the_roll_must_exist(conn):
    k, stranger = a_k2_class(conn), a_k2_class(conn)
    with pytest.raises(voice_store.Refused) as no:
        ch.history(conn, stranger["email"], k["class"], "3")
    assert no.value.status == 403
    assert ch.history(conn, _coordinator(conn, k), k["class"], "3")["entries"] == []
    with pytest.raises(voice_store.Refused) as gone:
        ch.history(conn, k["email"], k["class"], "99")
    assert gone.value.status == 404
