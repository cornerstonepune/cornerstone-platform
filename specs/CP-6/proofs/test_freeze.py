"""CP-6 item 3, read for the fortnight: changing a frozen fortnight's timetable or activities without a reason is refused
by the engine; with a reason it succeeds and the reason is recorded.

"Timetable or activities" = `timetable_slot` and `plan_entry` (design, decision 2). A fortnight is frozen when its
`fortnight_cycle` row is past planning. The engine's one gate is `fortnight_cycle.ensure_editable(conn, fortnight_ids,
*, reason, table, record_id, op, actor)`: no reason, empty or whitespace in a frozen fortnight raises `CycleError`
asking for a reason; with a reason it writes one `fortnight_edit` row (kind 'frozen_change', subject = table, record_id,
op, reason, changed_by = actor). Planning fortnights pass and write nothing. The engine's writers call it: the
timetable rules' fixed-slot change (`tt_rules.change`) and the loader's `k2_timetable_sql.apply`, each with an optional
`reason` keyword argument.

Two 2031 fortnights of a class made here: A (7-20 Jul) frozen, B (21 Jul-3 Aug) still planning.
"""

import datetime as dt

import pytest

from cp6_world import WHO, a_fortnight, advance_to, conn, edits, fc, school  # noqa: F401
from engine.core import db
from engine.w2_print import k2_timetable_load as ld
from engine.w2_print import k2_timetable_sql as sq
from engine.w2_print import tt_rules

REASON = "Sports day moved to Thursday"


@pytest.fixture
def frozen(conn, school):
    a = a_fortnight(conn, school, "2031-07-07")
    b = a_fortnight(conn, school, "2031-07-21")
    pe_a = db.one(
        conn,
        "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source)"
        " values (%s, %s, %s, 'math', 1, 'CP-6 proof line', 'CP-6 proof') returning id",
        (school["t"], school["class"], a["id"]),
    )["id"]
    # the class's timetable before any fortnight (so the rules page knows the class)
    conn.execute(
        "insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind, subject_code,"
        " text, valid_from, valid_to) values (%s, %s, %s, 'A', 1, 'subject', 'math', 'CP-6 proof slot', '2031-06-02',"
        " '2031-06-27')",
        (school["t"], school["class"], school["period"]),
    )
    advance_to(conn, a["id"], "frozen")
    return {"a": a, "b": b, "pe_a": pe_a, **school}


def _ensure(conn, ids, reason, record_id="r1"):
    return fc().ensure_editable(
        conn, ids, reason=reason, table="plan_entry", record_id=record_id, op="update", actor=WHO
    )


# ---- the engine's gate ----


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_3_a_frozen_fortnight_refuses_a_change_without_a_reason(conn, frozen, blank):
    """Item 3: no reason, an empty one or only spaces is refused, asking for a reason, and nothing is recorded."""
    with pytest.raises(fc().CycleError) as no:
        _ensure(conn, [frozen["a"]["id"]], blank, str(frozen["pe_a"]))
    assert "reason" in str(no.value).lower(), f"the refusal does not ask for a reason: {no.value}"
    assert edits(conn, frozen["a"]["id"], "frozen_change") == []


def test_3_a_change_touching_a_frozen_and_a_planning_fortnight_needs_a_reason(conn, frozen):
    """Item 3: one frozen fortnight among those touched is enough to need a reason."""
    with pytest.raises(fc().CycleError):
        _ensure(conn, [frozen["b"]["id"], frozen["a"]["id"]], None)


def test_3_with_a_reason_the_change_is_allowed_and_recorded(conn, frozen):
    """Item 3: with a reason it returns, and one row keeps the table, the record, the change, the reason and who."""
    _ensure(conn, [frozen["a"]["id"]], REASON, str(frozen["pe_a"]))
    rows = edits(conn, frozen["a"]["id"], "frozen_change")
    assert len(rows) == 1, f"expected one frozen_change row, found {len(rows)}"
    r = rows[0]
    assert (r["subject"], r["record_id"], r["op"], r["reason"], r["changed_by"]) == (
        "plan_entry", str(frozen["pe_a"]), "update", REASON, WHO,
    )  # fmt: skip
    assert r["created_at"] is not None


@pytest.mark.parametrize("reason", [None, REASON])
def test_3_a_planning_fortnight_changes_freely_and_writes_nothing(conn, frozen, reason):
    """Item 3: before the freeze nothing is asked and nothing is recorded."""
    assert _ensure(conn, [frozen["b"]["id"]], reason) is None
    assert edits(conn, frozen["b"]["id"], "frozen_change") == []


# ---- the engine's writers go through the gate ----


def _fixed(conn, w, **kw):
    c = tt_rules.Change(rule="fixed", action="set", period_id=str(w["period"]), week_code="A", weekday=2,
                        text="CP-6 proof assembly")  # fmt: skip
    return tt_rules.change(conn, w["staff"], str(w["class"]), c, dt.date(2031, 7, 1), **kw)


def _fixed_slots(conn, w) -> int:
    return db.one(
        conn,
        "select count(*) as n from timetable_slot where school_class_id = %s and kind = 'fixed'",
        (w["class"],),
    )["n"]


def test_3_a_fixed_slot_over_a_frozen_fortnight_is_refused_without_a_reason(conn, frozen):
    """Item 3: the timetable rules' fixed-slot change (open from 1 Jul, so it covers frozen A) is refused, unwritten."""
    errors = (fc().CycleError, tt_rules.Refused)
    with pytest.raises(errors) as no:
        with conn.transaction():
            _fixed(conn, frozen)
    assert "reason" in str(no.value).lower(), f"the refusal does not ask for a reason: {no.value}"
    assert _fixed_slots(conn, frozen) == 0
    assert edits(conn, frozen["a"]["id"], "frozen_change") == []


def test_3_a_fixed_slot_over_a_frozen_fortnight_goes_through_with_a_reason(conn, frozen):
    """Item 3: with `reason=` the fixed slot is written and the reason is recorded against the frozen fortnight."""
    _fixed(conn, frozen, reason=REASON)
    assert _fixed_slots(conn, frozen) == 1
    rows = edits(conn, frozen["a"]["id"], "frozen_change")
    assert rows, "no frozen_change row for the fixed slot"
    assert all(r["subject"] == "timetable_slot" and r["reason"] == REASON for r in rows), rows
    assert str(frozen["staff"]) in {r["changed_by"] for r in rows}, "who made the change is not the staff id"


def _load(w, text):
    load = ld.Load(plan_entries=[ld.PlanEntry(fortnight=w["a"]["number"], key="math", ord=50, text=text)])
    return load, ld.Target("K2", w["section"], "2031-32", db.tenant_slug(), "CP-6 proof")


def _lines(conn, w, text) -> int:
    return db.one(
        conn, "select count(*) as n from plan_entry where school_class_id = %s and text = %s", (w["class"], text)
    )["n"]


def test_3_the_loader_into_a_frozen_fortnight_is_refused_without_a_reason(conn, frozen):
    """Item 3: the loader's apply adding a plan line to frozen A is refused, unwritten."""
    load, t = _load(frozen, "CP-6 proof loader line")
    with pytest.raises(fc().CycleError) as no:
        with conn.transaction():
            sq.apply(conn, load, t)
    assert "reason" in str(no.value).lower(), f"the refusal does not ask for a reason: {no.value}"
    assert _lines(conn, frozen, "CP-6 proof loader line") == 0
    assert edits(conn, frozen["a"]["id"], "frozen_change") == []


def test_3_the_loader_into_a_frozen_fortnight_goes_through_with_a_reason(conn, frozen):
    """Item 3: with `reason=` the loader writes the line and the reason is recorded against the frozen fortnight."""
    load, t = _load(frozen, "CP-6 proof loader line")
    sq.apply(conn, load, t, reason=REASON)
    assert _lines(conn, frozen, "CP-6 proof loader line") == 1
    rows = edits(conn, frozen["a"]["id"], "frozen_change")
    assert rows, "no frozen_change row for the loader's line"
    assert all(r["subject"] == "plan_entry" and r["reason"] == REASON for r in rows), rows
