"""The bank learns from children's confirmed answers and proposes; a person decides (goals/s21-real-difficulty.yaml,
`w1_bank/learn.py`). Runs on the local copy of the database in a transaction that is rolled back."""

import dataclasses
import json
import os
import random
import uuid

import pytest

from engine.assess import items
from engine.core import db
from engine.w1_bank import learn, story_keys
from tests.rows import a_member_of_staff

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _question(conn, tenant, difficulty="Hard"):
    """One sum in the bank at `difficulty`, of a skill set the seed holds."""
    q = items.bare_sum(random.Random(uuid.uuid4().int), "R5", "Procedural", "+", 2, 2, [0, 1])
    rung = conn.execute("select rung_code from skill order by rung_code limit 1").fetchone()["rung_code"]
    key = f"T-LEARN-{uuid.uuid4().hex[:8]}"
    conn.execute(
        "insert into item (tenant_id, item_key, template, rung_code, signal, fmt, stem, spec, responses,"
        " skill_set_code, difficulty, skill_codes) values (%s,%s,%s,%s,%s,'bare_sum','',%s,%s,'ADD.2D2D',%s,"
        " '{NUM.OPS.01}')",
        (tenant, key, q.template, rung, q.signal, json.dumps(q.spec),
         json.dumps([dataclasses.asdict(r) for r in q.responses]), difficulty),
    )  # fmt: skip
    return key


def _answered(conn, tenant, key, statuses, state="confirmed"):
    """`statuses` answers to the question `key`, one child's paper each, as a person left them."""
    item = conn.execute("select id from item where item_key = %s", (key,)).fetchone()["id"]
    t = conn.execute(
        "insert into sheet_template (tenant_id, band, week) values (%s, 'G2', '2026-09-28') returning id",
        (tenant,),
    ).fetchone()["id"]
    for status in statuses:
        si = conn.execute(
            "insert into sheet_instance (tenant_id, qr_code, sheet_template_id) values (%s,%s,%s) returning id",
            (tenant, f"CS{uuid.uuid4().hex}", t),
        ).fetchone()["id"]
        cap = conn.execute(
            "insert into capture (tenant_id, path, sheet_instance_id) values (%s,'~/x.pdf',%s) returning id",
            (tenant, si),
        ).fetchone()["id"]
        conn.execute(
            "insert into item_result (tenant_id, capture_id, item_id, rid, status, state) values (%s,%s,%s,'ans',%s,%s)",
            (tenant, cap, item, status, state),
        )


def _tenant(conn):
    return conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]


def test_each_questions_share_right_comes_from_confirmed_answers_only(conn):
    """Nimish: systems "that become smarter with every other iteration". A question's share right is counted from
    answers a person has confirmed — a reading still waiting, or one a later read replaced, does not count."""
    tenant = _tenant(conn)
    key = _question(conn, tenant)
    _answered(conn, tenant, key, ["correct"] * 6 + ["wrong"] * 2 + ["blank"] * 2)
    _answered(conn, tenant, key, ["correct"] * 5, state="candidate")  # not yet confirmed: not evidence

    learn.item_stats(conn)
    stat = learn.stat(conn, key)
    assert (stat["n"], float(stat["p_correct"])) == (10, 0.6)


def test_a_question_far_off_its_level_is_proposed_once_and_a_person_removes_or_keeps_it(conn):
    """Nimish, 2026-09-28: a question far off its level — "Remove or keep". 20 of 20 right at Hard is far easier
    than Hard (above `item.flag_high_p`); 2 of 20 is far harder (below `item.flag_low_p`); 12 of 20 is where Hard
    should be. Fewer than `item.min_attempts` answers say nothing yet."""
    tenant = _tenant(conn)
    easy, hard, fine, few = (_question(conn, tenant) for _ in range(4))
    _answered(conn, tenant, easy, ["correct"] * 20)
    _answered(conn, tenant, hard, ["correct"] * 2 + ["wrong"] * 18)
    _answered(conn, tenant, fine, ["correct"] * 12 + ["wrong"] * 8)
    _answered(conn, tenant, few, ["correct"] * 3)

    got = {p["subject"]: p for p in learn.refresh(conn)}
    assert {k: got[k]["direction"] for k in (easy, hard) if k in got} == {easy: "easier", hard: "harder"}
    assert fine not in got and few not in got
    assert got[easy]["evidence"]["n"] == 20 and got[easy]["evidence"]["difficulty"] == "Hard"
    assert [p["subject"] for p in learn.refresh(conn)].count(easy) == 1, "proposed once, not on every refresh"

    _, neha = a_member_of_staff(conn)
    _, achal = a_member_of_staff(conn)
    kept = learn.decide(conn, got[hard]["id"], "keep", neha, "a hard one on purpose")
    assert kept["verdict"] == "keep"
    assert (
        conn.execute("select status from item where item_key = %s", (hard,)).fetchone()["status"] == "active"
    )
    removed = learn.decide(conn, got[easy]["id"], "remove", neha, "too easy for Hard")
    assert removed["verdict"] == "remove"
    assert (
        conn.execute("select status from item where item_key = %s", (easy,)).fetchone()["status"] != "active"
    )
    with pytest.raises(ValueError, match="already decided"):
        learn.decide(conn, got[easy]["id"], "keep", achal, "")
    open_now = {p["subject"] for p in learn.refresh(conn)}
    assert easy not in open_now and hard not in open_now, "a decided proposal is not proposed again"


def test_a_decision_is_a_member_of_staffs_and_one_by_anyone_else_changes_nothing(conn):
    """Who decided is a member of staff, by their id, found from the sign-in email the website sends (CP-27: the one
    proposal list keeps a person's answer by staff id, never a typed name). An email no member of staff signs in with
    is refused, and the proposal stays open."""
    tenant = _tenant(conn)
    easy = _question(conn, tenant)
    _answered(conn, tenant, easy, ["correct"] * 20)
    proposal = next(p for p in learn.refresh(conn) if p["subject"] == easy)
    for nobody in ("neha", "nobody@school.invalid"):
        with pytest.raises(ValueError, match="member of staff"):
            learn.decide(conn, proposal["id"], "remove", nobody, "too easy")
    assert (
        conn.execute("select status from item where item_key = %s", (easy,)).fetchone()["status"] == "active"
    )
    assert easy in {p["subject"] for p in learn.refresh(conn)}, "still waiting for a person"
    staff, email = a_member_of_staff(conn)
    assert learn.decide(conn, proposal["id"], "remove", email.upper(), "too easy")["staff_id"] == str(staff)


def test_a_proposal_made_under_a_questions_old_key_is_not_made_again_after_a_rekey(conn):
    """A question re-keyed (ADR 0053) is the same question: a proposal made under the key it had then still counts, so
    the bank does not propose it a second time."""
    tenant = _tenant(conn)
    key = _question(conn, tenant)
    _answered(conn, tenant, key, ["correct"] * 20)
    assert key in {p["subject"] for p in learn.refresh(conn)}
    item = conn.execute("select id from item where item_key = %s", (key,)).fetchone()["id"]
    new_key = key + "-NEW"
    conn.execute("update item set item_key = %s where id = %s", (new_key, item))
    story_keys.kept(conn, tenant, item, key, new_key, "a test")
    subjects = [p["subject"] for p in learn.refresh(conn)]
    assert new_key not in subjects and subjects.count(key) == 1
