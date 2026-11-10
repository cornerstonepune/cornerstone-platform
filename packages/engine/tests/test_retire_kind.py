"""An educator stops a kind of question at a level, or across a skill, and can start it again (goals/gen_retire_a_kind.yaml).
Nimish, 2026-10-26: "They should be able to delete those kinds of questions from the bank itself."

Answers already given must stay readable (rule 4), so a stop deletes nothing: the next paper draws no question of the kind
there, past papers keep theirs, an approved paper not yet given is sent back for approval and named, and that level's
approval, no other, is withdrawn. A stop stands on the level's own row for the kind, kept while it stands; each stop
and restart is a row of the one history log, never changed. Each test rolls back.
"""

import os

import psycopg
import pytest

from engine.core import db, history
from engine.w1_bank import question_types, retire

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs the local copy (bin/testdb)")
BY = "Shweta (Maths)"
THIS_WEEK = "to_char(now() at time zone 'Asia/Kolkata', 'IYYY-\"W\"IW')"


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def kept(conn, k):
    """What the history log keeps of the kind at the level: (op, by, what it did), oldest first."""
    rows = history.of(conn, "skill_level_question_type", f"{k['code']} {k['level']} {k['kind']}")
    return [(h["op"], h["origin"], h["after"]) for h in rows]


def one(conn, sql, *params):
    return next(iter(conn.execute(sql, params or None).fetchone().values()))


def a_kind(conn):
    """A level that draws two kinds or more, one of them, and its skill approved at every level."""
    row = conn.execute(
        "with k as (select skill_set_code as code, difficulty as level, question_type as kind, array_agg(id) as ids"
        "           from drawable_item group by 1, 2, 3),"
        " many as (select code, level from k group by 1, 2 having count(*) > 1)"
        " select k.code, k.level, k.kind from k join many using (code, level)"
        " where exists (select 1 from sheet_template t where t.source = 'library' and t.retired_at is null"
        "               and t.item_ids && k.ids)"
        " order by 1, 2, 3 limit 1"
    ).fetchone()
    conn.execute(
        "update skill set level_approved = (select jsonb_object_agg(k, jsonb_build_object('by', 'Achal', 'at', now()))"
        " from jsonb_object_keys(difficulty) k) where code = %s",
        (row["code"],),
    )
    return row


def approve(conn, k):
    """The level approved again, as the approver does after reading it."""
    conn.execute(
        "update skill set level_approved = level_approved || jsonb_build_object(%s::text,"
        " jsonb_build_object('by', 'Achal', 'at', now())) where code = %s",
        (k["level"], k["code"]),
    )


def drawable(conn, k, level=None):
    return one(
        conn,
        "select count(*) from drawable_item where skill_set_code = %s and difficulty = %s and question_type = %s",
        k["code"],
        level or k["level"],
        k["kind"],
    )


def paper(conn, k, qr, week=None, approved=True):
    """A copy of a library worksheet holding a question of the kind, approved (or not), made for `week` (this one)."""
    t = one(
        conn,
        "select id from sheet_template where source = 'library' and retired_at is null and item_ids && array("
        "  select id from drawable_item where skill_set_code = %s and difficulty = %s and question_type = %s)"
        " order by code limit 1",
        k["code"],
        k["level"],
        k["kind"],
    )
    conn.execute(
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, week, kind, print_status, printed_at,"
        " approved_by, approved_at) select tenant_id, %s, id, coalesce(%s, " + THIS_WEEK + "), 'practice',"
        " case when %s then 'printed' else 'new' end, case when %s then now() end, case when %s then 'Achal' end,"
        " case when %s then now() end from sheet_template where id = %s",
        (qr, week, approved, approved, approved, approved, t),
    )


def test_stopping_says_what_it_touches_and_changes_nothing(conn):
    k = a_kind(conn)
    paper(conn, k, "CSTEST1")
    before = drawable(conn, k)
    got = retire.touches(conn, k["code"], k["kind"], k["level"])
    assert got["levels"] == [k["level"]]
    assert got["questions"] == before > 0
    assert got["papers"] >= 1 and "CSTEST1" in got["withdraw"]
    assert drawable(conn, k) == before
    assert kept(conn, k) == []


def test_a_stopped_kind_is_drawn_by_no_new_paper_and_past_papers_keep_their_questions(conn):
    k = a_kind(conn)
    items = one(conn, "select count(*) from item where skill_set_code = %s", k["code"])
    held = one(
        conn, "select sum(cardinality(item_ids)) from sheet_template where skill_set_code = %s", k["code"]
    )
    got = retire.stop(conn, k["code"], k["kind"], BY, k["level"])
    assert got["stopped"], got["why"]
    assert drawable(conn, k) == 0
    # nothing deleted, nothing changed: every question keeps its row and status, every paper its questions
    assert one(conn, "select count(*) from item where skill_set_code = %s", k["code"]) == items
    assert (
        one(
            conn, "select sum(cardinality(item_ids)) from sheet_template where skill_set_code = %s", k["code"]
        )
        == held
    )
    # the level waits for approval, so it draws nothing; approved again, it draws its other kinds and not this one
    assert one(conn, "select count(*) from drawable_item where skill_set_code = %s and difficulty = %s",
               k["code"], k["level"]) == 0  # fmt: skip
    approve(conn, k)
    assert drawable(conn, k) == 0
    assert (
        one(
            conn,
            "select count(*) from drawable_item where skill_set_code = %s and difficulty = %s",
            k["code"],
            k["level"],
        )
        > 0
    )


def test_an_approved_paper_not_yet_given_is_withdrawn_and_named(conn):
    k = a_kind(conn)
    paper(conn, k, "CSTEST2")  # approved this week, not given, not read: withdrawn
    paper(conn, k, "CSTEST3")  # given: kept
    paper(conn, k, "CSTEST4", week="2020-W01")  # an earlier week's: it was given, kept
    paper(conn, k, "CSTEST5", approved=False)  # never approved: nothing to withdraw
    conn.execute(
        "insert into flow_run (tenant_id, flow, trigger, status, started_at, finished_at, request)"
        " select id, 'given', 'test', 'ok', now(), now(), '{\"qrs\": [\"CSTEST3\"]}' from tenant limit 1"
    )
    got = retire.stop(conn, k["code"], k["kind"], BY, k["level"])
    assert got["withdrawn"] == ["CSTEST2"]
    rows = {
        r["qr_code"]: r
        for r in conn.execute(
            "select qr_code, print_status, approved_by from sheet_instance where qr_code like 'CSTEST%'"
        )
    }
    assert rows["CSTEST2"]["print_status"] == "new" and rows["CSTEST2"]["approved_by"] is None
    assert rows["CSTEST3"]["print_status"] == "printed" and rows["CSTEST4"]["print_status"] == "printed"
    assert kept(conn, k) == [("stop_kind", BY, {"stopped": True, "withdrawn": ["CSTEST2"]})]


def test_a_stop_is_kept_and_a_restart_switches_it_back(conn):
    k = a_kind(conn)
    before = drawable(conn, k)
    assert retire.stop(conn, k["code"], k["kind"], BY, k["level"])["stopped"]
    assert not retire.stop(conn, k["code"], k["kind"], BY, k["level"])[
        "stopped"
    ]  # already stopped: said, not repeated
    got = retire.start(conn, k["code"], k["kind"], BY, k["level"])
    assert got["started"], got["why"]
    assert drawable(conn, k) == 0  # the level waits for approval again
    approve(conn, k)
    assert drawable(conn, k) == before
    assert [(op, by) for op, by, _ in kept(conn, k)] == [("stop_kind", BY), ("start_kind", BY)]
    row = f"{k['code']} {k['level']} {k['kind']}"
    with pytest.raises(psycopg.Error):  # the history is never changed or removed
        with conn.transaction():
            conn.execute("update change_log set op = 'start_kind' where row_id = %s", (row,))
    with pytest.raises(psycopg.Error):
        with conn.transaction():
            conn.execute("delete from change_log where row_id = %s", (row,))


def test_a_stop_stands_when_the_levels_questions_of_the_kind_all_leave_the_bank_and_come_back(conn):
    """The bank's links follow its questions: a link to a kind no active question holds goes. A stop stands on that
    link, so the bank keeps it while it is stopped, and a question of the kind made again is still not drawn there."""
    k = a_kind(conn)
    assert retire.stop(conn, k["code"], k["kind"], BY, k["level"])["stopped"]
    mine = "skill_set_code = %s and difficulty = %s and question_type_of(fmt, template) = %s and status = 'active'"
    ids = [
        r["id"] for r in conn.execute(f"select id from item where {mine}", (k["code"], k["level"], k["kind"]))
    ]
    conn.execute("update item set status = 'retired' where id = any(%s)", (ids,))
    assert "stopped by an educator" in question_types.why_not(conn, k["code"], k["level"])
    conn.execute("update item set status = 'active' where id = any(%s)", (ids,))
    approve(conn, k)
    assert drawable(conn, k) == 0
    assert retire.start(conn, k["code"], k["kind"], BY, k["level"])["started"]
    approve(conn, k)
    assert drawable(conn, k) == len(ids)


def test_stopping_withdraws_that_levels_approval_and_no_other(conn):
    k = a_kind(conn)
    levels = set(one(conn, "select level_approved from skill where code = %s", k["code"]))
    retire.stop(conn, k["code"], k["kind"], BY, k["level"])
    assert set(one(conn, "select level_approved from skill where code = %s", k["code"])) == levels - {
        k["level"]
    }


def test_stopping_across_the_skill_stops_it_at_every_level(conn):
    k = a_kind(conn)
    at = [
        r["difficulty"]
        for r in conn.execute(
            "select difficulty from skill_level_question_type where skill_code = %s and question_type = %s"
            " order by difficulty",
            (k["code"], k["kind"]),
        )
    ]
    got = retire.stop(conn, k["code"], k["kind"], BY)
    assert got["stopped"], got["why"]
    for level in got["levels"]:
        assert drawable(conn, k, level) == 0
    assert set(got["levels"]) <= set(at) and k["level"] in got["levels"]


def test_a_level_keeps_one_kind_in_use_and_a_stop_names_a_person(conn):
    k = a_kind(conn)
    kinds = [
        r["question_type"]
        for r in conn.execute(
            "select question_type from skill_level_question_type where skill_code = %s and difficulty = %s"
            " order by question_type <> %s",  # the kind found first, so a stop of it is among those that land
            (k["code"], k["level"], k["kind"]),
        )
    ]
    for q in kinds[:-1]:
        assert retire.stop(conn, k["code"], q, BY, k["level"])["stopped"]
    last = retire.stop(conn, k["code"], kinds[-1], BY, k["level"])
    assert not last["stopped"] and "at least one kind" in last["why"]
    assert not retire.stop(conn, k["code"], k["kind"], " ", k["level"])["stopped"]
