"""Hidden tests for #955 (ADR 0117): offer-only groups reach K1 lessons of the named subject codes and nothing else; the
picker's list (`tt_heads.offers`) shows them; K2 and fixed lessons are offered exactly what they were. Rolls back."""

import os
import uuid
from pathlib import Path

import pytest

from engine.core import db, subject_map
from engine.w1_bank import apply_seed
from engine.w2_print import tt_heads
from engine.w2_print.tt_live_plan import Refused
from tests import tt_hand_world as tw
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
MIGRATION = (
    Path(__file__).resolve().parents[4] / "supabase" / "migrations" / "20270221090000_k1_offer_only.sql"
)


def _lesson(conn, subject_code, grade="K1", kind="subject", text=""):
    return {
        "tenant_id": tenant(conn),
        "subject_code": subject_code,
        "kind": kind,
        "text": text,
        "grade_code": grade,
    }


@pytest.fixture
def conn():
    with db.connect() as c:
        apply_seed.apply(c, tenant(c), True, part="activities")
        c.execute("delete from config where tenant_id = %s and key = 'timetable.offers'", (tenant(c),))
        c.execute(MIGRATION.read_text())
        yield c
        c.rollback()


def test_a_k2_lesson_is_offered_nothing_new(conn):
    with pytest.raises(Refused):
        tt_heads.ensure_offered(conn, _lesson(conn, "rhymes", grade="K2"), "ACT-K2-0198")  # K2 Music
    with pytest.raises(Refused):
        tt_heads.ensure_offered(conn, _lesson(conn, "clay", grade="K2"), "ACT-K2-0476")  # K2 English


def test_an_other_lesson_is_offered_only_its_named_group(conn):
    with pytest.raises(Refused, match="Music"):
        tt_heads.ensure_offered(conn, _lesson(conn, "other"), "ACT-K1-0652")  # K1 Music, not Block Room


def test_a_head_still_takes_what_it_teaches(conn):
    tt_heads.ensure_offered(conn, _lesson(conn, "rhymes"), "ACT-K1-F001")  # Rhymes (ADR 0113)


def test_a_lesson_with_no_subject_code_and_no_head_still_takes_no_activity(conn):
    with pytest.raises(Refused, match="takes no activity"):
        tt_heads.ensure_offered(
            conn, _lesson(conn, None, kind="fixed", text="Boarding the bus"), "ACT-K1-0665"
        )
    assert tt_heads.offered_only(conn, _lesson(conn, None, kind="fixed", text="Boarding the bus")) == []


def test_no_setting_means_no_offer_only_group(conn):
    conn.execute("delete from config where tenant_id = %s and key = 'timetable.offers'", (tenant(conn),))
    assert tt_heads.offered_only(conn, _lesson(conn, "rhymes")) == []
    with pytest.raises(Refused):
        tt_heads.ensure_offered(conn, _lesson(conn, "rhymes"), "ACT-K1-0665")


def test_every_grade_teaches_the_same_subjects_with_or_without_the_setting(conn):
    listed = tt_heads.heads(conn)
    spell = subject_map.spellings(conn, tenant(conn))
    before = {s: tt_heads.heads_in(listed, spell, [s]) for s in set(spell.values())}
    lessons = [_lesson(conn, h["code"], grade=g) for h in listed for g in ("K1", "K2", "G1")]
    taught = [tt_heads.subjects_of(conn, x) for x in lessons]
    conn.execute("delete from config where tenant_id = %s and key = 'timetable.offers'", (tenant(conn),))
    assert [tt_heads.subjects_of(conn, x) for x in lessons] == taught
    assert {s: tt_heads.heads_in(tt_heads.heads(conn), spell, [s]) for s in before} == before


def test_the_pickers_list_shows_the_offer_only_group_on_a_k1_lesson():
    with db.connect() as c:
        w = tw.school(c)
        c.execute("delete from config where tenant_id = %s and key = 'timetable.offers'", (w["tenant"],))
        c.execute(MIGRATION.read_text())
        s = tw.session_at(c, w, tw.START, "p1")
        c.execute("update school_class set grade_code = 'K1' where id = %s", (w["class"],))
        c.execute("update session set subject_code = 'rhymes' where id = %s", (s["id"],))
        music = f"ACT-K1-T{uuid.uuid4().hex[:6]}"
        c.execute(
            "insert into activity (tenant_id, code, band, strand, name) values (%s, %s, 'K1', 'Music', 'Placeholder')",
            (w["tenant"], music),
        )
        got = tt_heads.offers(c, str(s["id"]), who=w["staff"]["coordinator"]["id"])
        assert "Music" in got["groups"] and music in {a["code"] for a in got["activities"]}
        c.rollback()
