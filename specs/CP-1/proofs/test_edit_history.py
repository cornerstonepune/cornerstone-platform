"""CP-1 item 5: adding an activity writes an edit-history row (`curriculum_edit`) saying who and when; adding, changing
or removing an activity-to-objective link (`activity_objective`) writes one too.

"Who" is said for the transaction with `app.changed_by`, as the engine's writers do. The activity and objectives are
made here, in a transaction rolled back at the end.
"""

import uuid

import pytest

from engine.core import db

WHO = f"staff:{uuid.uuid4()}"  # a staff id, never a name (rule 6)


@pytest.fixture
def conn():
    with db.connect() as c:
        c.execute("select set_config('app.changed_by', %s, true)", (WHO,))
        yield c
        c.rollback()


@pytest.fixture
def made(conn):
    t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    tag = uuid.uuid4().hex[:6].upper()
    los = [f"LO-CP1-{tag}-{i}" for i in (1, 2)]
    for lo in los:
        conn.execute(
            "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal)"
            " values (%s, %s, 'K2', 'Numeracy', 'CP-1 proof', 'CP-1 proof objective', 'Foundational')",
            (t, lo),
        )
    return {"t": t, "act": f"ACT-CP1-{tag}", "los": los}


def _add_activity(conn, made):
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name) values (%s, %s, 'K2', 'Maths', 'CP-1 proof')",
        (made["t"], made["act"]),
    )


def _history(conn, made, record):
    return conn.execute(
        "select field, before, after, changed_by, created_at from curriculum_edit"
        " where tenant_id = %s and record = %s and code = %s order by created_at",
        (made["t"], record, made["act"]),
    ).fetchall()


def _says_who_and_when(rows):
    assert rows, "no edit-history row"
    for r in rows:
        assert r["changed_by"] == WHO, f"edit-history row names {r['changed_by']!r}, not who made the change"
        assert r["created_at"] is not None


def test_adding_an_activity_writes_an_edit_history_row(conn, made):
    _add_activity(conn, made)
    _says_who_and_when(_history(conn, made, "activity"))


def test_adding_a_link_writes_an_edit_history_row(conn, made):
    _add_activity(conn, made)
    conn.execute(
        "insert into activity_objective (tenant_id, activity_code, lo_code, ord) values (%s, %s, %s, 1)",
        (made["t"], made["act"], made["los"][0]),
    )
    _says_who_and_when(_history(conn, made, "activity_objective"))


def test_changing_a_link_writes_an_edit_history_row(conn, made):
    _add_activity(conn, made)
    conn.execute(
        "insert into activity_objective (tenant_id, activity_code, lo_code, ord) values (%s, %s, %s, 1)",
        (made["t"], made["act"], made["los"][0]),
    )
    before = len(_history(conn, made, "activity_objective"))
    conn.execute(
        "update activity_objective set lo_code = %s where tenant_id = %s and activity_code = %s and lo_code = %s",
        (made["los"][1], made["t"], made["act"], made["los"][0]),
    )
    rows = _history(conn, made, "activity_objective")
    assert len(rows) > before, "changing the link wrote no edit-history row"
    _says_who_and_when(rows[before:])


def test_removing_a_link_writes_an_edit_history_row(conn, made):
    _add_activity(conn, made)
    conn.execute(
        "insert into activity_objective (tenant_id, activity_code, lo_code, ord) values (%s, %s, %s, 1)",
        (made["t"], made["act"], made["los"][0]),
    )
    before = len(_history(conn, made, "activity_objective"))
    conn.execute(
        "delete from activity_objective where tenant_id = %s and activity_code = %s", (made["t"], made["act"])
    )
    rows = _history(conn, made, "activity_objective")
    assert len(rows) > before, "removing the link wrote no edit-history row"
    _says_who_and_when(rows[before:])
