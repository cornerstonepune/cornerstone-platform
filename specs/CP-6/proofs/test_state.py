"""CP-6 items 1 and 4, read for the fortnight (Nimish, 8 Nov 2026), lean design: the engine's `move` enforces the order.

Item 1 ("a fortnight has one state from the list above, with who and when recorded for every step"): a teaching
fortnight has one `fortnight_cycle` row (pk `fortnight_id`) whose `state` is one of planning, frozen, aligned, approved,
list_sent; the planning row carries its own `planning_at`/`planning_by`; every `move` stamps `<state>_at` and
`<state>_by` (the actor's staff id) and keeps the earlier stamps. Both new tables are listed `school_wide` in
`access_table` (CP-4's `data_class` and `reason`; fails loudly until CP-4 is on main).

Item 4 ("a step cannot be skipped: approving a fortnight that was never frozen is refused"): `move` raises `CycleError`
for planning to approved, planning to aligned, any other skip, every step back, the same state and a non-teaching
fortnight, and changes nothing; the full ladder one step at a time succeeds.
"""

import uuid

import pytest

from cp6_world import STATES, WHO, a_fortnight, advance_to, conn, cycle_row, edits, fc, refused_sql, school  # noqa: F401


# ---- item 1: one state, who and when per step ----


def test_1_a_fortnight_starts_at_planning_with_who_and_when(conn, school):
    """Item 1: the planning step is stamped too; later steps are not stamped before they happen."""
    f = a_fortnight(conn, school, "2031-07-07")
    r = cycle_row(conn, f["id"])
    assert r["state"] == "planning"
    assert r["planning_at"] is not None and (r["planning_by"] or "").strip(), "planning has no who or when"
    for s in STATES[1:]:
        assert r[f"{s}_at"] is None and r[f"{s}_by"] is None, f"{s} is stamped before it happened"


def test_1_every_step_records_its_own_who_and_when_and_keeps_earlier_ones(conn, school):
    """Item 1: each `move` stamps its step with the actor and the time; earlier stamps stay."""
    f = a_fortnight(conn, school, "2031-07-07")
    seen = {}
    for s in STATES[1:]:
        who = f"staff:{uuid.uuid4()}"
        fc().move(conn, f["id"], s, who)
        seen[s] = who
        r = cycle_row(conn, f["id"])
        assert r["state"] == s
        assert r[f"{s}_by"] == who and r[f"{s}_at"] is not None, f"{s} did not record who and when"
        for earlier, by in seen.items():
            assert r[f"{earlier}_by"] == by and r[f"{earlier}_at"] is not None, f"{earlier}'s stamp was lost at {s}"
        assert r["planning_at"] is not None, f"planning's stamp was lost at {s}"


def test_1_a_state_outside_the_list_is_refused(conn, school):
    """Item 1: the state is one from the list, by the engine and by the table's own check."""
    f = a_fortnight(conn, school, "2031-07-07")
    with pytest.raises(fc().CycleError):
        fc().move(conn, f["id"], "closed", WHO)
    refused_sql(conn, "update fortnight_cycle set state = 'closed' where fortnight_id = %s", (f["id"],))
    assert cycle_row(conn, f["id"])["state"] == "planning"


def test_1_a_fortnight_has_one_state_row_only(conn, school):
    """Item 1: one row per fortnight (fortnight_id is the key)."""
    f = a_fortnight(conn, school, "2031-07-07")
    refused_sql(
        conn,
        "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')",
        (school["t"], f["id"]),
    )


def test_1_both_new_tables_are_listed_school_wide_with_a_reason(conn):
    """Item 1 (design, CP-4 dependency): needs CP-4's access_table.data_class; until CP-4 is on main this fails on the
    missing table or column, by design."""
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


def _refused_move(conn, f, to: str, now: str) -> None:
    before = len(edits(conn, f["id"], "state"))
    with pytest.raises(fc().CycleError):
        fc().move(conn, f["id"], to, WHO)
    assert cycle_row(conn, f["id"])["state"] == now, f"a refused move to {to} changed the state"
    assert len(edits(conn, f["id"], "state")) == before, f"a refused move to {to} wrote history"


@pytest.mark.parametrize(
    "start, to",
    [("planning", "approved"), ("planning", "aligned"), ("planning", "list_sent"), ("frozen", "approved"),
     ("frozen", "list_sent"), ("aligned", "list_sent")],
)  # fmt: skip
def test_4_skipping_a_step_is_refused(conn, school, start, to):
    """Item 4: approving a fortnight never frozen (and every other skip) raises CycleError and changes nothing."""
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], start)
    _refused_move(conn, f, to, start)


@pytest.mark.parametrize("start", STATES[1:])
def test_4_every_step_back_is_refused(conn, school, start):
    """Item 4: no step goes back."""
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], start)
    for back in STATES[: STATES.index(start)]:
        _refused_move(conn, f, back, start)


@pytest.mark.parametrize("start", STATES)
def test_4_moving_to_the_same_state_is_refused(conn, school, start):
    """Item 4: the same state again is not a step."""
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], start)
    _refused_move(conn, f, start, start)


def test_4_a_non_teaching_fortnight_cannot_be_moved(conn, school):
    """Item 4: only a teaching fortnight has a cycle."""
    f = a_fortnight(conn, school, "2031-07-21", kind="buffer")
    with pytest.raises(fc().CycleError):
        fc().move(conn, f["id"], "frozen", WHO)
    assert edits(conn, f["id"], "state") == []


def test_4_the_full_ladder_one_step_at_a_time_succeeds(conn, school):
    """Item 4: planning, frozen, aligned, approved, list sent, in order, all succeed."""
    f = a_fortnight(conn, school, "2031-07-07")
    advance_to(conn, f["id"], "list_sent")
    assert cycle_row(conn, f["id"])["state"] == "list_sent"
