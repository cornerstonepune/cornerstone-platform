"""CP-40: a form saved from a lesson is about that lesson (specs/CP-40/spec.md). Made-up class, no real name."""

import os

import pytest

from engine.core import db
from engine.w3_read import voice_confirm as vc
from engine.w3_read.voice_store import Refused
from tests.test_voice_class_notes import _session, _today
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


def _held(c, k):
    lesson = _session(c, k, _today(c))
    c.execute("update session set activity_code = %s where id = %s", (k["activity"], lesson))
    return lesson


def test_a_form_saved_from_a_lesson_records_the_lesson_and_uses_its_activity():
    with db.connect() as c:
        k = a_k2_class(c)
        lesson = _held(c, k)
        done = vc.save_form(
            c, k["email"], k["class"], vc.Confirmed("", 2, {"above": ["3"]}, session_id=lesson)
        )
        o = c.execute("select * from activity_observation where confirmation_id = %s", (done,)).fetchone()
        assert str(o["session_id"]) == lesson and o["activity_code"] == k["activity"]
        assert c.execute("select 1 from evidence_event where observation_id = %s", (o["id"],)).fetchone()
        c.rollback()


def test_a_lesson_of_another_class_or_no_lesson_is_refused_and_nothing_is_written():
    with db.connect() as c:
        k = a_k2_class(c)
        for bad in ("00000000-0000-0000-0000-000000000000", "not-an-id"):
            with pytest.raises(Refused):
                vc.save_form(
                    c,
                    k["email"],
                    k["class"],
                    vc.Confirmed(k["activity"], 2, {"above": ["3"]}, session_id=bad),
                )
        assert not c.execute(
            "select 1 from activity_observation where class_id = %s", (k["class"],)
        ).fetchone()
        c.rollback()


def test_a_lesson_with_no_activity_and_none_given_is_refused():
    with db.connect() as c:
        k = a_k2_class(c)
        lesson = _session(c, k, _today(c))
        with pytest.raises(Refused, match="no activity"):
            vc.save_form(c, k["email"], k["class"], vc.Confirmed("", 2, {"above": ["3"]}, session_id=lesson))
        c.rollback()


def test_a_form_with_no_lesson_saves_as_before():
    with db.connect() as c:
        k = a_k2_class(c)
        done = vc.save_form(c, k["email"], k["class"], vc.Confirmed(k["activity"], 2, {"above": ["3"]}))
        o = c.execute(
            "select session_id from activity_observation where confirmation_id = %s", (done,)
        ).fetchone()
        assert o["session_id"] is None
        c.rollback()
