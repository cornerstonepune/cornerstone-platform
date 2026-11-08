"""CP-6 item 3, read for the fortnight: changing a frozen fortnight's timetable or activities without a reason is refused
by the database; with a reason it succeeds and the reason is recorded.

"Timetable or activities" = `timetable_slot` and `plan_entry` (design, decision 2); `session` stays free. A fortnight is
frozen when its `fortnight_cycle` row is past planning. The reason is `app.change_reason` for this transaction; unset,
empty and whitespace mean none. A change with a reason writes one `fortnight_edit` row: kind 'frozen_change', subject =
the table, record_id = the row's id as text, op = insert|update|delete, the reason, changed_by = who.

Two 2031 fortnights of a class made here: A (7-20 Jul) frozen, B (21 Jul-3 Aug) still planning.
"""

import datetime as dt

import pytest

from cp6_world import WHO, a_fortnight, advance_to, conn, refused, school, with_reason  # noqa: F401
from engine.core import db

REASON = "Sports day moved to Thursday"


@pytest.fixture
def frozen(conn, school):
    a = a_fortnight(conn, school, "2031-07-07")
    b = a_fortnight(conn, school, "2031-07-21")
    pe_a = plan_line(conn, school, a["id"], 1)
    pe_b = plan_line(conn, school, b["id"], 1)
    slot_a = slot(conn, school, a["starts_on"], a["ends_on"], weekday=1)
    advance_to(conn, a["id"], "frozen")
    return {"a": a, "b": b, "pe_a": pe_a, "pe_b": pe_b, "slot_a": slot_a, **school}


def plan_line(conn, school, fortnight_id, ord_: int):
    return db.one(
        conn,
        "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source)"
        " values (%s, %s, %s, 'math', %s, 'CP-6 proof line', 'CP-6 proof') returning id",
        (school["t"], school["class"], fortnight_id, ord_),
    )["id"]


SLOT_SQL = (
    "insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind, subject_code, text,"
    " valid_from, valid_to) values (%s, %s, %s, 'A', %s, 'subject', 'math', 'CP-6 proof slot', %s, %s) returning id"
)


def slot(conn, school, valid_from, valid_to, weekday: int):
    return db.one(conn, SLOT_SQL, (school["t"], school["class"], school["period"], weekday, valid_from, valid_to))["id"]


def frozen_changes(conn, fortnight_id) -> list[dict]:
    return conn.execute(
        "select subject, record_id, op, reason, changed_by from fortnight_edit"
        " where fortnight_id = %s and kind = 'frozen_change' order by created_at",
        (fortnight_id,),
    ).fetchall()


# ---- a planning fortnight changes freely ----


def test_3_a_planning_fortnight_changes_freely(conn, frozen):
    w = frozen
    new = plan_line(conn, w, w["b"]["id"], 2)
    conn.execute("update plan_entry set text = 'changed' where id = %s", (w["pe_b"],))
    conn.execute("delete from plan_entry where id = %s", (new,))
    s = slot(conn, w, w["b"]["starts_on"], w["b"]["ends_on"], weekday=2)
    conn.execute("update timetable_slot set text = 'changed' where id = %s", (s,))
    conn.execute("delete from timetable_slot where id = %s", (s,))
    assert frozen_changes(conn, w["b"]["id"]) == []


# ---- a frozen fortnight refuses a change with no reason ----


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_3_frozen_plan_lines_refuse_a_change_without_a_reason(conn, frozen, blank):
    w = frozen
    if blank is not None:
        with_reason(conn, blank)
    msg = refused(
        conn,
        "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source)"
        " values (%s, %s, %s, 'math', 9, 'x', 'CP-6 proof')",
        (w["t"], w["class"], w["a"]["id"]),
    )
    assert "reason" in msg.lower(), f"the refusal does not ask for a reason: {msg}"
    refused(conn, "update plan_entry set text = 'changed' where id = %s", (w["pe_a"],))
    refused(conn, "delete from plan_entry where id = %s", (w["pe_a"],))
    assert frozen_changes(conn, w["a"]["id"]) == []


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_3_frozen_timetable_refuses_a_change_without_a_reason(conn, frozen, blank):
    w = frozen
    if blank is not None:
        with_reason(conn, blank)
    msg = refused(conn, SLOT_SQL, (w["t"], w["class"], w["period"], 3, w["a"]["starts_on"], w["a"]["ends_on"]))
    assert "reason" in msg.lower(), f"the refusal does not ask for a reason: {msg}"
    refused(conn, "update timetable_slot set text = 'changed' where id = %s", (w["slot_a"],))
    refused(conn, "delete from timetable_slot where id = %s", (w["slot_a"],))
    assert frozen_changes(conn, w["a"]["id"]) == []


def test_3_a_plan_line_cannot_be_moved_out_of_or_into_a_frozen_fortnight_quietly(conn, frozen):
    w = frozen
    refused(conn, "update plan_entry set fortnight_id = %s where id = %s", (w["b"]["id"], w["pe_a"]))
    refused(conn, "update plan_entry set fortnight_id = %s where id = %s", (w["a"]["id"], w["pe_b"]))


def test_3_an_open_ended_slot_covering_a_frozen_fortnight_is_refused(conn, frozen):
    w = frozen
    refused(conn, SLOT_SQL, (w["t"], w["class"], w["period"], 4, w["a"]["starts_on"] - dt.timedelta(days=7), None))


# ---- with a reason the change goes through and is recorded ----


def _recorded(conn, w, table: str, record_id, op: str) -> None:
    rows = frozen_changes(conn, w["a"]["id"])
    assert len(rows) == 1, f"{table} {op}: expected one frozen_change row, found {len(rows)}"
    r = rows[0]
    assert (r["subject"], r["record_id"], r["op"], r["reason"], r["changed_by"]) == (
        table, str(record_id), op, REASON, WHO,
    )


def test_3_with_a_reason_a_plan_line_insert_goes_through_and_is_recorded(conn, frozen):
    with_reason(conn, REASON)
    new = plan_line(conn, frozen, frozen["a"]["id"], 9)
    _recorded(conn, frozen, "plan_entry", new, "insert")


def test_3_with_a_reason_a_plan_line_update_goes_through_and_is_recorded(conn, frozen):
    with_reason(conn, REASON)
    conn.execute("update plan_entry set text = 'changed' where id = %s", (frozen["pe_a"],))
    assert db.one(conn, "select text from plan_entry where id = %s", (frozen["pe_a"],))["text"] == "changed"
    _recorded(conn, frozen, "plan_entry", frozen["pe_a"], "update")


def test_3_with_a_reason_a_plan_line_delete_goes_through_and_is_recorded(conn, frozen):
    with_reason(conn, REASON)
    conn.execute("delete from plan_entry where id = %s", (frozen["pe_a"],))
    _recorded(conn, frozen, "plan_entry", frozen["pe_a"], "delete")


def test_3_with_a_reason_a_timetable_insert_goes_through_and_is_recorded(conn, frozen):
    with_reason(conn, REASON)
    new = slot(conn, frozen, frozen["a"]["starts_on"], frozen["a"]["ends_on"], weekday=3)
    _recorded(conn, frozen, "timetable_slot", new, "insert")


def test_3_with_a_reason_a_timetable_update_goes_through_and_is_recorded(conn, frozen):
    with_reason(conn, REASON)
    conn.execute("update timetable_slot set text = 'changed' where id = %s", (frozen["slot_a"],))
    _recorded(conn, frozen, "timetable_slot", frozen["slot_a"], "update")


def test_3_with_a_reason_a_timetable_delete_goes_through_and_is_recorded(conn, frozen):
    with_reason(conn, REASON)
    conn.execute("delete from timetable_slot where id = %s", (frozen["slot_a"],))
    _recorded(conn, frozen, "timetable_slot", frozen["slot_a"], "delete")


# ---- what the freeze does not touch ----


def test_3_sessions_in_a_frozen_fortnight_are_recorded_without_a_reason(conn, frozen):
    w = frozen
    day = db.one(
        conn,
        "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, '2031-07-08', 'teaching')"
        " on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id",
        (w["t"], w["campus"]),
    )["id"]
    sid = db.one(
        conn,
        "insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code)"
        " values (%s, %s, %s, %s, 'math') returning id",
        (w["t"], w["class"], day, w["period"]),
    )["id"]
    conn.execute("update session set state = 'done' where id = %s", (sid,))
    assert frozen_changes(conn, w["a"]["id"]) == []
