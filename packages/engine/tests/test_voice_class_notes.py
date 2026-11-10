"""Issue #565: a class's notes for a day, and a note she types (engine/w3_read/voice_class.py).

Placeholder class, educator and children (tests/voice_rows.py), inside a rolled-back transaction: no school data.
"""

import datetime as dt
import os
import uuid

import pytest

from engine.core import db
from engine.w3_read import voice_class as vcl
from engine.w3_read import voice_confirm as vc
from engine.w3_read import voice_store
from tests.voice_rows import a_k2_class, a_note

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _session(conn, k, on: dt.date, class_id: str | None = None) -> str:
    """A lesson of the class on a day, with its day and period made for it."""
    campus = conn.execute("select campus_id from school_class where id = %s", (k["class"],)).fetchone()[
        "campus_id"
    ]
    day = conn.execute(
        "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s, 'teaching')"
        " on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id",
        (k["tenant"], campus, on),
    ).fetchone()["id"]
    period = conn.execute(
        "insert into period (tenant_id, grade_code, ord, starts_at, label) values (%s, 'K2', %s, %s, 'slot')"
        " returning id",
        (k["tenant"], 900 + uuid.uuid4().int % 90, f"{uuid.uuid4().int % 20}:{uuid.uuid4().int % 60:02d}"),
    ).fetchone()["id"]
    return str(
        conn.execute(
            "insert into session (tenant_id, school_class_id, school_day_id, period_id, text)"
            " values (%s, %s, %s, %s, 'x') returning id",
            (k["tenant"], class_id or k["class"], day, period),
        ).fetchone()["id"]
    )


def _today(conn) -> dt.date:
    return vc._today(conn)


def test_a_typed_note_is_a_note_with_no_recording_that_she_can_confirm_like_any_other(conn):
    k = a_k2_class(conn)
    note_id = vcl.create_typed(conn, k["email"], k["class"])
    row = conn.execute("select * from pii.educator_note where id = %s", (note_id,)).fetchone()
    assert row["audio_key"] is None and row["status"] == "drafted" and row["staff_id"] == k["staff"]
    done = vc.confirm_note(conn, note_id, k["email"], vc.Confirmed(k["activity"], 2, {"above": ["3"]}, True))
    seen = conn.execute(
        "select child_id from activity_observation where confirmation_id = %s", (done,)
    ).fetchall()
    assert len(seen) == 5  # her one named child and the rest as expected
    assert conn.execute("select status from pii.educator_note where id = %s", (note_id,)).fetchone()[
        "status"
    ] == ("confirmed")


def test_a_typed_note_is_refused_for_a_class_she_does_not_hold(conn):
    k = a_k2_class(conn)
    other = a_k2_class(conn)
    with pytest.raises(voice_store.Refused) as no:
        vcl.create_typed(conn, k["email"], other["class"])
    assert no.value.status == 403


def test_a_typed_note_keeps_the_lesson_it_is_about_and_refuses_a_lesson_of_another_class(conn):
    k = a_k2_class(conn)
    other = a_k2_class(conn)
    mine = _session(conn, k, _today(conn))
    note_id = vcl.create_typed(conn, k["email"], k["class"], mine)
    got = conn.execute("select session_id from pii.educator_note where id = %s", (note_id,)).fetchone()
    assert str(got["session_id"]) == mine
    theirs = _session(conn, other, _today(conn))
    with pytest.raises(voice_store.Refused):
        vcl.create_typed(conn, k["email"], k["class"], theirs)


def test_a_confirmed_note_hands_its_lesson_to_each_observation(conn):
    k = a_k2_class(conn)
    lesson = _session(conn, k, _today(conn))
    note_id = vcl.create_typed(conn, k["email"], k["class"], lesson)
    done = vc.confirm_note(conn, note_id, k["email"], vc.Confirmed(k["activity"], 2, {"above": ["3"]}))
    got = conn.execute(
        "select session_id from activity_observation where confirmation_id = %s", (done,)
    ).fetchone()
    assert str(got["session_id"]) == lesson


def test_the_class_list_gives_each_note_its_state_children_and_problems_and_counts_children_waiting(conn):
    k = a_k2_class(conn)
    a_note(conn, k, "Activity 12. Above 3. Below 1.")
    a_note(
        conn, k, "Activity 12. Above 3. Absent 9."
    )  # 9 is not in the class: a problem, shown, never guessed
    vcl.create_typed(conn, k["email"], k["class"])
    out = vcl.class_notes(conn, k["email"], k["class"], _today(conn))
    assert len(out["notes"]) == 3
    typed = [n for n in out["notes"] if n["typed"]]
    assert len(typed) == 1 and typed[0]["children"] == [] and typed[0]["problems"] == []
    fixes = [n for n in out["notes"] if n["problems"]]
    assert len(fixes) == 1 and fixes[0]["state"] == "fix_this" and "#9" in fixes[0]["problems"][0]
    c = k["children"]
    assert out["waiting_by_child"] == {c["3"]: 2, c["1"]: 1}


def test_a_confirmed_claim_lists_the_children_it_covers_from_the_observations_not_from_a_copy(conn):
    k = a_k2_class(conn)
    note = a_note(conn, k, "Activity 12. Above 3. Below 1.")
    vc.confirm_note(
        conn,
        str(note["id"]),
        k["email"],
        vc.Confirmed(k["activity"], 2, {"above": ["3", "2"], "below": ["1"]}),
    )
    out = vcl.class_notes(conn, k["email"], k["class"], _today(conn))
    (shown,) = out["notes"]
    by = {c["section"]: c for c in shown["claims"]}
    c = k["children"]
    assert sorted(by["above"]["children"]) == sorted([c["3"], c["2"]])
    assert by["above"]["decision"] == "changed" and by["below"]["children"] == [c["1"]]
    assert out["waiting_by_child"] == {}  # a confirmed note is not waiting


def test_a_corrected_child_is_listed_by_the_correction_not_by_the_row_it_replaced(conn):
    k = a_k2_class(conn)
    note = a_note(conn, k, "Activity 12. Above 3.")
    done = vc.confirm_note(
        conn, str(note["id"]), k["email"], vc.Confirmed(k["activity"], 2, {"above": ["3"]})
    )
    old = conn.execute("select id from activity_observation where confirmation_id = %s", (done,)).fetchone()[
        "id"
    ]
    vc.correct(conn, str(old), k["email"], "below", "wrong child heard")
    (shown,) = vcl.class_notes(conn, k["email"], k["class"], _today(conn))["notes"]
    by = {c["section"]: c for c in shown["claims"]}
    assert by["above"]["children"] == []  # the child is no longer above


def test_the_list_is_only_her_own_notes_for_a_class_she_holds_and_for_the_day_asked(conn):
    k = a_k2_class(conn)
    stranger = a_k2_class(conn)
    a_note(conn, k, "Activity 12. Above 3.")
    old = a_note(conn, k, "Activity 12. Above 2.", hours_ago=72)
    assert len(vcl.class_notes(conn, k["email"], k["class"], _today(conn))["notes"]) == 1
    then = _today(conn) - dt.timedelta(days=3)
    assert [n["note_id"] for n in vcl.class_notes(conn, k["email"], k["class"], then)["notes"]] == [
        str(old["id"])
    ]
    with pytest.raises(voice_store.Refused) as no:
        vcl.class_notes(conn, stranger["email"], k["class"], _today(conn))
    assert no.value.status == 403
