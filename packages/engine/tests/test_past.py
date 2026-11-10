"""`engine past` lists which children's states changed, and why (goals/gr1-state-from-recent-evidence.yaml).

Nimish, 2026-11-03: "Rehearse on a copy of live. engine past must show which children's states change, and why." The
rehearsal keeps every child's states before the migration and lists, after the graph is rebuilt, each that moved: the
child's id (never a name), the skill, from what to what, and the numbers the rule decided it on. Rolls back.
"""

import uuid

import pytest
import yaml

from engine.checks import past, scenarios_graph
from engine.core import db
from tests import rows

GOAL = db.REPO_ROOT / "goals" / "gr1-state-from-recent-evidence.yaml"
CLEARED = next(
    sc
    for sc in yaml.safe_load(GOAL.read_text())["scenarios"]
    if sc["name"] == "Two September mistakes then twenty right is not a repeating mistake"
)


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_past_lists_each_state_that_changed_and_why(conn):
    child, skill = scenarios_graph.ledger(conn, CLEARED)
    conn.execute("select rebuild_child_skill_state(%s)", (child,))
    # the graph as the old rule left it: the two September mistakes, repeating for ever
    conn.execute(
        "update child_skill_state set state = 'patterned_error', repeating_misconception = 'M_ALIGN_LEFT'"
        " where child_id = %s",
        (child,),
    )
    before = past.snapshot(conn)
    conn.execute("select rebuild_child_skill_state(%s)", (child,))
    c = past.changes(conn, before)
    mine = [m for m in c["states"] if m["child"] == str(child)]
    assert [(m["skill"], m["rung"], m["from"], m["to"]) for m in mine] == [
        (skill["registry"], skill["rung_code"], "patterned_error", "secure_to_recheck")
    ]
    assert (
        mine[0]["why"]
        == "at Medium: 10 of 10 right (1.00) on 2 day(s), latest day 1.00, not re-checked, repeating none"
    )
    lines = past.report(c)
    assert lines[0].startswith("children with a state: ") and "whose state changed: 1;" in lines[0]
    assert "  patterned_error -> secure_to_recheck: 1" in lines
    assert any(str(child) in line and "(was repeating M_ALIGN_LEFT)" in line for line in lines)
    assert not any("Goal" in line for line in lines), "rule 6: the child's id, never their name"
    # nothing moved: nothing listed
    assert past.changes(conn, past.snapshot(conn)) == {"children": c["children"], "states": [], "levels": []}


def _curriculum(conn):
    return past.fingerprint(conn, past.CURRICULUM)


def test_a_question_or_level_stamped_but_not_changed_keeps_the_curriculum_fingerprint(conn):
    """CP-27 group 3: a clock rewritten, a stamp, a usage count or a column added later says nothing new about a question
    or a level, so `engine past --curriculum` reads the same before and after it."""
    before = _curriculum(conn)
    item = db.one(conn, "select id from item order by id limit 1")["id"]
    level = db.one(conn, "select id from skill_level order by id limit 1")["id"]
    conn.execute(
        "update item set updated_at = now() + interval '1 day', times_used = times_used + 1 where id = %s",
        (item,),
    )
    conn.execute(
        "update skill_level set updated_at = now() + interval '1 day', confirmed_by = 'a later step',"
        " confirmed_at = now() where id = %s",
        (level,),
    )
    conn.execute("alter table item add column a_later_step jsonb")  # rolled back with the test
    conn.execute("alter table skill_level add column a_later_step jsonb")
    assert _curriculum(conn) == before


def test_a_question_or_level_changed_moves_the_curriculum_fingerprint(conn):
    """What a question asks and what a level says are what the fingerprint guards: either changing moves it."""
    before = _curriculum(conn)
    conn.execute(
        "update item set stem = coalesce(stem, '') || ' changed' where id = (select min(id::text)::uuid from item)"
    )
    after = _curriculum(conn)
    assert after["questions"] != before["questions"] and after["levels"] == before["levels"]
    conn.execute(
        "update skill_level set looks_like = looks_like || ' changed' where id = (select min(id::text)::uuid from skill_level)"
    )
    assert _curriculum(conn)["levels"] != before["levels"]


def test_who_confirmed_an_answer_and_when_its_row_was_touched_keep_the_fingerprint(conn):
    """CP-27 group 4: who confirmed a piece of evidence or a scored answer is rewritten from a name or an email to a
    member of staff's id, and that rewrite touches the row's clock. Neither says anything new about what a child did,
    so `engine past` reads the same before and after; whether the answer is confirmed is what it keeps."""
    paper = rows.a_read_paper(conn, [{"status": "correct", "read": "35", "state": "confirmed"}])
    conn.execute("update item_result set confirmed_by = 'one person', confirmed_at = now() where id = %s",
                 (paper["results"][0],))  # fmt: skip
    evidence = _evidence(conn, paper["child"], "one person")
    before = past.fingerprint(conn)
    conn.execute(
        "set local session_replication_role = replica"
    )  # evidence is append-only; rolled back with the test
    conn.execute(
        "update evidence_event set confirmed_by = %s, updated_at = now() + interval '1 day' where id = %s",
        (str(uuid.uuid4()), evidence),
    )
    conn.execute(
        "update item_result set confirmed_by = 'one.person@example.org' where id = %s", (paper["results"][0],)
    )
    assert past.fingerprint(conn) == before


def test_a_mark_changed_or_an_answer_confirmed_or_unconfirmed_moves_the_fingerprint(conn):
    """What the fingerprint guards is still guarded: a mark, and whether an answer counts."""
    paper = rows.a_read_paper(conn, [{"status": "correct", "read": "35"}])
    evidence = _evidence(conn, paper["child"], None)
    before = past.fingerprint(conn)
    conn.execute("set local session_replication_role = replica")
    conn.execute("update evidence_event set confirmed_by = 'one person' where id = %s", (evidence,))
    confirmed = past.fingerprint(conn)
    assert confirmed["evidence"] != before["evidence"]
    conn.execute("update evidence_event set correct = not correct where id = %s", (evidence,))
    assert past.fingerprint(conn)["evidence"] != confirmed["evidence"]
    conn.execute("update item_result set confirmed_by = 'one person' where id = %s", (paper["results"][0],))
    scored = past.fingerprint(conn)["scored"]
    assert scored != before["scored"]
    conn.execute("update item_result set status = 'wrong' where id = %s", (paper["results"][0],))
    assert past.fingerprint(conn)["scored"] != scored


def _evidence(conn, child, by):
    return conn.execute(
        "insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, channel, observed_at,"
        " confirmed_by) values (%s, %s, 'NUM.OPS.01', 'R22', true, 'item', now(), %s) returning id",
        (rows.tenant(conn), child, by),
    ).fetchone()["id"]
