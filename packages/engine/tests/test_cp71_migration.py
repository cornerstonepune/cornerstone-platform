"""CP-71's one migration (20270202090000): a day shape has dates, a rule says who made it and whom it is about, an educator can be
away, and the Grade 1 to 4 heads reach a live row that already holds the K2 ones. Each test rolls back."""

import json
import os
from pathlib import Path

import psycopg
import pytest

from engine.core import db
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "20270202090000_cp71_pattern_rules.sql"
)


@pytest.fixture
def world():
    with db.connect() as c:
        yield c, tw.school(c)
        c.rollback()


def _refused(c, sql, args=()):
    c.execute("savepoint s")
    with pytest.raises(psycopg.errors.CheckViolation):
        c.execute(sql, args)
    c.execute("rollback to savepoint s")


def test_two_day_shapes_may_share_a_start_time_and_a_shape_ends_after_it_starts(world):
    c, w = world
    one = "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, valid_from, valid_to) values (%s, 'K2', 95, '04:15', %s, 'Shape', %s, %s)"
    c.execute(one, (w["tenant"], "04:30", "2033-06-01", "2033-09-30"))
    c.execute(one, (w["tenant"], "04:35", "2033-10-01", None))  # the same start, a later shape
    c.execute("savepoint s")
    with pytest.raises(psycopg.errors.UniqueViolation):
        c.execute(one, (w["tenant"], "04:35", "2033-10-01", None))
    c.execute("rollback to savepoint s")
    _refused(c, one, (w["tenant"], "04:30", "2033-09-30", "2033-06-01"))


def test_an_away_rule_names_an_educator_and_no_class_and_a_frame_still_needs_its_class(world):
    c, w = world
    away = (
        "insert into timetable_rule (tenant_id, school_class_id, staff_id, kind, weekday, reason)"
        " values (%s, %s, %s, 'away', 5, 'Not in school on Fridays')"
    )
    staff = w["staff"]["educator"]["id"]
    c.execute(away, (w["tenant"], None, staff))
    _refused(c, away, (w["tenant"], w["class"], staff))  # an away rule is not one class's
    _refused(c, away, (w["tenant"], None, None))  # and it is about someone
    c.execute(
        "insert into timetable_rule (tenant_id, school_class_id, kind, span, subject_code, most, weight)"
        " values (%s, %s, 'limit', 'day', 'math', 2, 1)",
        (w["tenant"], w["class"]),
    )
    _refused(
        c,
        "insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, text, valid_from)"
        " values (%s, null, 'frame', %s, 'A', 1, 'fixed', 'x', '2033-06-01')",
        (w["tenant"], w["period"]["circle"]),
    )


def test_the_grade_1_to_4_heads_are_added_once_and_a_head_the_school_changed_stays_as_it_is(world):
    c, _ = world
    block = MIGRATION.read_text().split("-- 4.", 1)[1]
    mine = {"code": "NUM", "label": "My maths", "groups": ["Maths"]}
    k2 = [
        h
        for h in c.execute("select value from config where key = 'timetable.heads'").fetchone()["value"]
        if h["code"].islower()
    ]
    c.execute("update config set value = %s::jsonb where key = 'timetable.heads'", (json.dumps([*k2, mine]),))
    c.execute(
        'update config set value = \'{"math": "numeracy", "NUM": "arts"}\'::jsonb where key = \'timetable.subject_looks\''
    )
    for _ in range(2):  # twice is the same
        c.execute(block.split("\n", 1)[1])
        heads = c.execute("select value from config where key = 'timetable.heads'").fetchone()["value"]
        assert [h["code"] for h in heads].count("NUM") == 1 and next(
            h for h in heads if h["code"] == "NUM"
        ) == mine
        assert {"ENG", "HIN", "MAR", "SCI", "GP", "HSC", "COM", "ART", "MUS", "FMS", "GMS", "PE"} <= {
            h["code"] for h in heads
        }
        looks = c.execute("select value from config where key = 'timetable.subject_looks'").fetchone()[
            "value"
        ]
        assert looks["NUM"] == "arts" and looks["ENG"] == "language" and looks["math"] == "numeracy"
