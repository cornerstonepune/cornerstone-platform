"""ADR 0117 (PROJECT.md G6.8): a K1 lesson is offered the groups `timetable.offers` names for its subject code, without its
head coming to teach them. The setting reaches the database as a release puts it there (live has no such row; the
migration adds it), and the signed-off choices for 30 Nov, 1 Dec and 2 Dec are then offered. Rolls back."""

import json
import os
from pathlib import Path

import pytest

from engine.core import db
from engine.w1_bank import apply_seed
from engine.w2_print import tt_heads
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "20270221090000_k1_offer_only.sql"
SEED = {
    c["key"]: c["value"]
    for c in json.loads((ROOT / "supabase" / "seed" / "config.json").read_text())["config"]
}
# the signed-off K1 choices still refused after ADR 0113: lesson subject code, activity (its group)
CHOICES = [
    ("rhymes", "ACT-K1-0665"),  # French rhyme (Music), 30 Nov and 1 Dec
    ("clay", "ACT-K1-F003"),  # trace and write R and D (English), 30 Nov
    ("other", "ACT-K1-0783"),  # smelling bottles (Block Room), 1 Dec: a lesson whose head takes no activity
    ("music", "ACT-K1-F002"),  # number tracing 5 and 6 (Maths), 2 Dec
]


def _lesson(conn, subject_code, grade="K1"):
    return {
        "tenant_id": tenant(conn),
        "subject_code": subject_code,
        "kind": "subject",
        "text": "",
        "grade_code": grade,
    }


@pytest.fixture
def conn():
    with db.connect() as c:
        t = tenant(c)
        apply_seed.apply(c, t, True, part="activities")  # F002 and F003, as live has them (ADR 0111)
        c.execute("delete from config where tenant_id = %s and key = 'timetable.offers'", (t,))  # live today
        c.execute(MIGRATION.read_text())
        yield c
        c.rollback()


def _value(conn):
    return conn.execute(
        "select value from config where tenant_id = %s and key = 'timetable.offers'", (tenant(conn),)
    ).fetchone()["value"]


def test_the_migration_lands_the_seed_files_setting_once(conn):
    assert _value(conn) == SEED["timetable.offers"]
    conn.execute(MIGRATION.read_text())  # a second run changes nothing
    assert _value(conn) == SEED["timetable.offers"]


@pytest.mark.parametrize(("subject_code", "activity"), CHOICES)
def test_each_signed_off_k1_choice_is_offered(conn, subject_code, activity):
    tt_heads.ensure_offered(conn, _lesson(conn, subject_code), activity)  # refuses (raises) when not offered


def test_offered_only_reads_the_setting_by_grade_then_subject_code(conn):
    assert tt_heads.offered_only(conn, _lesson(conn, "rhymes")) == ["Music"]
    assert tt_heads.offered_only(conn, _lesson(conn, "rhymes", grade="K2")) == []
    assert tt_heads.offered_only(conn, _lesson(conn, "story")) == []


@pytest.mark.parametrize("subject_code", [s for s, _ in CHOICES])
def test_no_head_comes_to_teach_a_new_subject(conn, subject_code):
    """What a head teaches (offer sequence, objectives, who may edit) is the same with the setting as without it."""
    lesson = _lesson(conn, subject_code)
    with_offers = tt_heads.subjects_of(conn, lesson)
    conn.execute("delete from config where tenant_id = %s and key = 'timetable.offers'", (tenant(conn),))
    assert tt_heads.subjects_of(conn, lesson) == with_offers
    assert _heads_unchanged(conn)


def _heads_unchanged(conn) -> bool:
    got = conn.execute(
        "select value from config where tenant_id = %s and key = 'timetable.heads'", (tenant(conn),)
    ).fetchone()
    return got is None or got["value"] == SEED["timetable.heads"]
