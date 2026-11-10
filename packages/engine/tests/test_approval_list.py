"""One approval list for everything new (goals/c5-one-approval-list.yaml, slice C5).

BUILD-ORDER, the locked scope of 22 Oct: "one approval list for everything new: draft beside approved, a second
approval before anything reaches a parent; the existing approvals unchanged". The list is `approval_list`; what the
existing approvals could not hold (a sending back with its reason, a second approval) is `approval`, never edited.
"""

import os

import psycopg
import pytest

from engine.core import db
from tests.rows import a_child, tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _decide(conn, kind, target, decision, by, reason=None):
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, reason) values (%s, %s, %s, %s, %s, %s)",
        (tenant(conn), kind, target, decision, by, reason),
    )


def _refused(conn, *args, **kw):
    try:
        with conn.transaction():
            _decide(conn, *args, **kw)
    except psycopg.errors.CheckViolation:
        return True
    return False


def _entry(conn, kind, target):
    return db.one(
        conn,
        "select state, first_by, second_by, sent_back_because from approval_list where kind = %s and target = %s",
        (kind, target),
    )


def _note(conn):
    return db.one(
        conn,
        "insert into parent_note (tenant_id, child_id, week, body) values (%s, %s, 'W1', 'a report') returning id",
        (tenant(conn), a_child(conn)),
    )["id"]


def test_what_is_approved_is_one_of_three_kinds_and_where_it_stands_one_of_four_words(conn):
    """A skill at a level, a way of asking, a report for a parent: a rule on the column (CP-27: it was the table
    approval_kind); a fourth kind is refused."""
    kinds = {r["kind"] for r in conn.execute("select distinct kind from approval_list")}
    assert kinds <= {"skill_level", "question_type", "parent_note"}, kinds
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
        conn.execute(
            "insert into approval (tenant_id, kind, target, decision, by, reason)"
            " values (%s, 'a_new_kind', 'x', 'sent_back', 'a coordinator', 'a reason')",
            (tenant(conn),),
        )
    states = {r["state"] for r in conn.execute("select distinct state from approval_list")}
    assert states <= {"draft", "sent_back", "waiting_second", "approved"}, states


def test_draft_beside_approved_in_one_list(conn):
    """A level approved and one not, a way of asking approved and one not, a report: one list, each with its state."""
    level = db.one(conn, "select skill_code, difficulty from skill_level order by 1, 2 limit 1")
    conn.execute(
        "update skill set level_approved = level_approved - %s where code = %s",
        (level["difficulty"], level["skill_code"]),
    )
    conn.execute(
        "insert into question_type (tenant_id, code, fmt, words, marked) values (%s, 'C5.DRAFT', 'C5.DRAFT',"
        " 'a way of asking not yet approved', '{computable}')",
        (tenant(conn),),
    )
    note = _note(conn)
    states = {
        (r["kind"], r["target"]): r["state"]
        for r in conn.execute("select kind, target, state from approval_list").fetchall()
    }
    assert states[("skill_level", f"{level['skill_code']} {level['difficulty']}")] == "draft"
    assert states[("question_type", "C5.DRAFT")] == "draft"
    assert states[("parent_note", str(note))] == "draft"
    assert "approved" in {s for (k, _), s in states.items() if k == "skill_level"}
    assert "approved" in {s for (k, _), s in states.items() if k == "question_type"}


def test_send_back_with_a_reason(conn):
    """A draft is sent back to its writer with the reason; without one it is refused; approved later, it is approved."""
    conn.execute(
        "insert into question_type (tenant_id, code, fmt, words, marked) values (%s, 'C5.BACK', 'C5.BACK', 'w',"
        " '{computable}')",
        (tenant(conn),),
    )
    assert _refused(conn, "question_type", "C5.BACK", "sent_back", "a coordinator")
    _decide(conn, "question_type", "C5.BACK", "sent_back", "a coordinator", "the stem names no number")
    assert dict(_entry(conn, "question_type", "C5.BACK")) == {
        "state": "sent_back",
        "first_by": None,
        "second_by": None,
        "sent_back_because": "the stem names no number",
    }
    _decide(
        conn, "question_type", "C5.BACK", "approved", "an educator"
    )  # a way of asking is approved in the list
    assert _entry(conn, "question_type", "C5.BACK")["state"] == "approved"


def test_a_second_approval_before_anything_reaches_a_parent(conn):
    """A report approved once waits for a second approval, by someone else; it cannot be sent before, and can after."""
    note = _note(conn)
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
        conn.execute("update parent_note set sent_at = now() where id = %s", (note,))
    conn.execute("update parent_note set approved_by = 'an educator' where id = %s", (note,))
    assert _entry(conn, "parent_note", str(note))["state"] == "waiting_second"
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
        conn.execute("update parent_note set sent_at = now() where id = %s", (note,))
    assert _refused(conn, "parent_note", str(note), "approved", "an educator")  # the same person, twice
    _decide(conn, "parent_note", str(note), "approved", "a coordinator")
    assert dict(_entry(conn, "parent_note", str(note))) == {
        "state": "approved",
        "first_by": "an educator",
        "second_by": "a coordinator",
        "sent_back_because": None,
    }
    conn.execute("update parent_note set sent_at = now() where id = %s", (note,))
    assert _entry(conn, "parent_note", str(note))["state"] == "approved"


def test_the_existing_approvals_are_unchanged(conn):
    """Every level and way of asking approved before is approved in the list, by the same person, and a school's setup
    run again moves none of them; a decision is never edited."""
    before = (
        conn.execute(
            "select md5(string_agg(code || level_approved::text, ',' order by code)) as s from skill"
        ).fetchone()["s"],
        conn.execute(
            "select md5(string_agg(target || first_by, ',' order by target)) as s from approval_list"
            " where kind = 'question_type'"
        ).fetchone()["s"],
    )
    approved = db.one(
        conn,
        "select count(*) as n from skill_level l join skill s on s.code = l.skill_code and s.tenant_id = l.tenant_id"
        " where s.level_approved ? l.difficulty",
    )["n"]
    assert (
        approved
        == db.one(
            conn, "select count(*) as n from approval_list where kind = 'skill_level' and state = 'approved'"
        )["n"]
    )
    conn.execute(
        "insert into tenant (slug, name) values ('a-second-school', 'A second school')"
    )  # a new school's setup
    after = (
        conn.execute(
            "select md5(string_agg(code || level_approved::text, ',' order by code)) as s from skill"
        ).fetchone()["s"],
        conn.execute(
            "select md5(string_agg(target || first_by, ',' order by target)) as s from approval_list"
            " where kind = 'question_type'"
        ).fetchone()["s"],
    )
    assert after == before
    note = _note(conn)
    _decide(conn, "parent_note", str(note), "sent_back", "a coordinator", "a reason")
    with pytest.raises(psycopg.Error), conn.transaction():
        conn.execute("update approval set reason = 'another'")


def _rows(conn, kind, target):
    return [
        (r["decision"], r["by"])
        for r in conn.execute(
            "select decision, by from approval where kind = %s and target = %s order by seq", (kind, target)
        )
    ]


def test_every_yes_and_every_taking_back_is_a_row_of_the_one_list(conn):
    """CP-27 (Done when 10): an approval still kept on the row it approves (a level, a report, a paper, a micro-step
    link) writes a row of `approval` when it is given and when it is taken back, so the list is read from `approval`
    alone; approved again by someone else, the level stands approved by them."""
    level = db.one(
        conn,
        "select l.skill_code, l.difficulty from skill_level l join skill s on s.tenant_id = l.tenant_id"
        " and s.code = l.skill_code where s.level_approved ? l.difficulty order by 1, 2 limit 1",
    )
    target = f"{level['skill_code']} {level['difficulty']}"
    before = len(_rows(conn, "skill_level", target))
    conn.execute(
        "update skill set level_approved = level_approved - %s where code = %s",
        (level["difficulty"], level["skill_code"]),
    )
    assert _entry(conn, "skill_level", target)["state"] == "draft"
    conn.execute(
        "update skill set level_approved = level_approved || jsonb_build_object(%s::text,"
        " jsonb_build_object('by', 'a second coordinator', 'at', clock_timestamp())) where code = %s",
        (level["difficulty"], level["skill_code"]),
    )
    assert dict(_entry(conn, "skill_level", target)) == {
        "state": "approved",
        "first_by": "a second coordinator",
        "second_by": None,
        "sent_back_because": None,
    }
    assert [d for d, _ in _rows(conn, "skill_level", target)[before:]] == ["withdrawn", "approved"]

    note = _note(conn)
    conn.execute("update parent_note set approved_by = 'an educator' where id = %s", (note,))
    conn.execute("update parent_note set approved_by = null where id = %s", (note,))
    assert [d for d, _ in _rows(conn, "parent_note", str(note))] == ["approved", "withdrawn"]
    assert _entry(conn, "parent_note", str(note))["state"] == "draft"

    template = db.one(conn, "select id from sheet_template limit 1")["id"]
    paper = db.one(
        conn,
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, print_status, approved_by, approved_at)"
        " values (%s, %s, %s, 'printed', 'an educator', now()) returning id",
        (tenant(conn), "CSA3" + str(note)[:4].upper(), template),
    )["id"]
    assert _rows(conn, "sheet", str(paper)) == [("approved", "an educator")]

    link = db.one(conn, "select id from skill_prerequisite where tenant_id = %s limit 1", (tenant(conn),))[
        "id"
    ]
    campus = db.one(conn, "select id from campus where tenant_id = %s limit 1", (tenant(conn),))["id"]
    staff = db.one(
        conn,
        "insert into staff (tenant_id, campus_id, active) values (%s, %s, true) returning id",
        (tenant(conn), campus),
    )["id"]
    assert db.one(conn, "select confirm_skill_link(%s, %s) as r", (link, staff))["r"] == "confirmed"
    assert _rows(conn, "skill_prerequisite", str(link)) == [("approved", str(staff))]


def test_a_report_is_first_approved_on_its_own_row_and_only_ever_added_to(conn):
    """The first approval of a report is the one the report names (`parent_note.approved_by`): a row that says another
    person approved it first is refused; a decision, once a row, is never changed or taken out."""
    note = _note(conn)
    assert _refused(conn, "parent_note", str(note), "approved", "someone")  # nothing on the report yet
    conn.execute("update parent_note set approved_by = 'an educator' where id = %s", (note,))
    _decide(conn, "parent_note", str(note), "approved", "a coordinator")
    for change in (
        "update approval set by = 'x' where target = %s",
        "delete from approval where target = %s",
    ):
        with pytest.raises(psycopg.Error), conn.transaction():
            conn.execute(change, (str(note),))
