"""Every question names its skill in the registry (goals/c1-questions-name-their-skills.yaml, slice C1), and writing a
question type keeps the kinds a level declared (E0's fragility, fixed in the same slice).

The per-step rows C1 added (`item_registry_skill`) only ever held each question's own skill, kept by a trigger: no
question on live named a step. CP-27 retired them; a question's skill is the one its results count
(`spec ->> 'skill'`, else the first of `skill_codes`), and that is a registry skill.
"""

import os

import pytest

from engine.core import db
from tests.test_rung_folded import _kind

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_every_question_names_a_registry_skill(conn):
    """The skill each question's results count is a skill in the registry."""
    assert (
        db.one(
            conn,
            "select count(*) as n from item i where not exists (select 1 from registry_skill r"
            " where r.tenant_id = i.tenant_id and r.code = coalesce(i.spec ->> 'skill', i.skill_codes[1]))",
        )["n"]
        == 0
    )


def test_writing_a_question_type_keeps_a_levels_declared_kinds(conn):
    """E0's fragility (PR #284): a level's kind the curriculum names, with no question in the bank yet, outlives a
    new question type; a kind the bank stops holding still goes."""
    lvl = db.one(
        conn,
        "select tenant_id, skill_code, difficulty from skill_level order by skill_code, difficulty limit 1",
    )
    conn.execute(
        "insert into question_type (tenant_id, code, fmt, words, marked) values (%s, 'C1.DECLARED', 'C1.DECLARED',"
        " 'a kind no question holds yet', '{computable}')",
        (lvl["tenant_id"],),
    )
    conn.execute(
        "insert into skill_level_question_type (tenant_id, skill_code, difficulty, question_type)"
        " values (%s, %s, %s, 'C1.DECLARED')",
        (lvl["tenant_id"], lvl["skill_code"], lvl["difficulty"]),
    )
    held = db.one(conn, "select count(*) as n from skill_level_question_type where not declared")["n"]
    conn.execute(
        "insert into question_type (tenant_id, code, fmt, words, marked) values (%s, 'C1.OTHER', 'C1.OTHER',"
        " 'another kind', '{computable}')",
        (lvl["tenant_id"],),
    )
    assert (
        db.one(
            conn, "select count(*) as n from skill_level_question_type where question_type = 'C1.DECLARED'"
        )["n"]
        == 1
    )
    assert db.one(conn, "select count(*) as n from skill_level_question_type where not declared")["n"] == held
    link = db.one(
        conn,
        "select skill_code, difficulty, question_type from skill_level_question_type where not declared"
        " order by skill_code, difficulty, question_type limit 1",
    )
    conn.execute(
        "update item set status = 'retired' where skill_set_code = %s and difficulty = %s"
        " and question_type_of(fmt, template) = %s",
        (link["skill_code"], link["difficulty"], link["question_type"]),
    )
    assert (
        db.one(
            conn,
            "select count(*) as n from skill_level_question_type where skill_code = %s and difficulty = %s"
            " and question_type = %s",
            tuple(link.values()),
        )["n"]
        == 0
    )


def test_the_view_b4b_kept_for_one_deploy_is_gone(conn):
    assert _kind(conn, "skill_set") is None
