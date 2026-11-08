"""CP-6 items 1 and 4, read for the fortnight (Nimish, 8 Nov 2026: "Freeze by fortnight, not month").

Item 1 ("a month has one state from the list, with who and when recorded for every step") is proved as: a teaching
fortnight has one `fortnight_cycle` row (pk `fortnight_id`) whose `state` is one of planning, frozen, aligned, approved,
list_sent, and every step stamps its own `<state>_at` and `<state>_by` (who = `app.changed_by`). A row starts at planning,
only a teaching fortnight has one, and both new tables are listed `school_wide` in `access_table` (this last part needs
CP-4's `data_class` column and fails loudly until CP-4 is on main).

Item 4 ("a step cannot be skipped: approving a month that was never frozen is refused") is proved as: for a fortnight,
planning to approved, planning to aligned, frozen to approved and every step back are refused by the database; the full
ladder one step at a time succeeds; a cycle row cannot be deleted or truncated (no row would mean planning again).
"""

import uuid

import psycopg
import pytest

from cp6_world import STATES, WHO, a_fortnight, advance_to, conn, cycle_row, move, refused, school  # noqa: F401
from engine.core import db


# ---- item 1: one state, who and when per step ----


def test_1_a_fortnight_starts_at_planning_with_who_and_when(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    r = cycle_row(conn, f["id"])
    assert r["state"] == "planning"
    assert r["planning_by"] == WHO and r["planning_at"] is not None
    for s in STATES[1:]:
        assert r[f"{s}_at"] is None and r[f"{s}_by"] is None, f"{s} is stamped before it happened"


def test_1_every_step_records_its_own_who_and_when_and_keeps_earlier_ones(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    seen = {"planning": cycle_row(conn, f["id"])["planning_by"]}
    for s in STATES[1:]:
        who = f"staff:{uuid.uuid4()}"
        conn.execute("select set_config('app.changed_by', %s, true)", (who,))
        move(conn, f["id"], s)
        seen[s] = who
        r = cycle_row(conn, f["id"])
        assert r["state"] == s
        assert r[f"{s}_by"] == who and r[f"{s}_at"] is not None, f"{s} did not record who and when"
        for earlier, by in seen.items():
            assert r[f"{earlier}_by"] == by and r[f"{earlier}_at"] is not None, f"{earlier}'s stamp was lost at {s}"


def test_1_a_state_outside_the_list_is_refused(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    refused(conn, "update fortnight_cycle set state = 'closed' where fortnight_id = %s", (f["id"],))


def test_1_a_fortnight_has_one_state_row_only(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    refused(
        conn,
        "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')",
        (school["t"], f["id"]),
    )


def test_1_a_cycle_row_starts_at_planning_not_frozen(conn, school):
    f = a_fortnight(conn, school, "2031-07-07", cycle=False)
    refused(
        conn,
        "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'frozen')",
        (school["t"], f["id"]),
    )


def test_1_only_a_teaching_fortnight_has_a_cycle(conn, school):
    f = a_fortnight(conn, school, "2031-07-21", kind="buffer")
    refused(
        conn,
        "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')",
        (school["t"], f["id"]),
    )


def test_1_an_earlier_steps_who_cannot_be_rewritten(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], "aligned")
    before = cycle_row(conn, f["id"])
    try:
        with conn.transaction():
            conn.execute(
                "update fortnight_cycle set frozen_by = 'staff:someone-else', frozen_at = now() - interval '9 days'"
                " where fortnight_id = %s",
                (f["id"],),
            )
    except psycopg.Error:  # refusing outright is one accepted answer; the assert below is the proof either way
        pass
    after = cycle_row(conn, f["id"])
    assert (after["frozen_by"], after["frozen_at"]) == (before["frozen_by"], before["frozen_at"])


def test_1_both_new_tables_are_listed_school_wide_with_a_reason(conn):
    """Needs CP-4's access_table.data_class: until CP-4 is on main this fails on the missing column, by design."""
    rows = conn.execute(
        "select table_name, data_class, reason from public.access_table where schema_name = 'public'"
        " and table_name in ('fortnight_cycle', 'fortnight_edit')"
    ).fetchall()
    got = {r["table_name"]: r for r in rows}
    assert set(got) == {"fortnight_cycle", "fortnight_edit"}, f"listed: {sorted(got)}"
    for name, r in got.items():
        assert r["data_class"] == "school_wide", f"{name} is {r['data_class']}"
        assert r["reason"] and r["reason"].strip(), f"{name} has no reason"


# ---- item 4: a step cannot be skipped ----


@pytest.mark.parametrize(
    "start, to",
    [("planning", "approved"), ("planning", "aligned"), ("planning", "list_sent"), ("frozen", "approved"),
     ("frozen", "list_sent"), ("aligned", "list_sent")],
)
def test_4_skipping_a_step_is_refused(conn, school, start, to):
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], start)
    refused(conn, "update fortnight_cycle set state = %s where fortnight_id = %s", (to, f["id"]))
    assert cycle_row(conn, f["id"])["state"] == start


@pytest.mark.parametrize("start", STATES[1:])
def test_4_every_step_back_is_refused(conn, school, start):
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], start)
    for back in STATES[: STATES.index(start)]:
        refused(conn, "update fortnight_cycle set state = %s where fortnight_id = %s", (back, f["id"]))
    assert cycle_row(conn, f["id"])["state"] == start


def test_4_the_full_ladder_one_step_at_a_time_succeeds(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], "list_sent")
    assert cycle_row(conn, f["id"])["state"] == "list_sent"


def test_4_a_cycle_row_cannot_be_deleted(conn, school):
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], "frozen")
    refused(conn, "delete from fortnight_cycle where fortnight_id = %s", (f["id"],))
    assert cycle_row(conn, f["id"])["state"] == "frozen"


def test_4_the_cycle_table_cannot_be_truncated(conn, school):
    a_fortnight(conn, school, "2031-07-07")
    refused(conn, "truncate fortnight_cycle")
    assert db.one(conn, "select count(*) as n from fortnight_cycle")["n"] > 0
