"""The fortnight cycle (CP-6): the order of the steps, the freeze and the step dates. The locked proofs of the scope
(specs/CP-6/proofs) are the long form; these keep the module covered by the engine's own suite. Each test works in a
transaction that is rolled back, in a made-up 2033 year."""

import datetime as dt
import json
import uuid

import pytest

from engine.core import db
from engine.w2_print import fortnight_cycle as fc

WHO = f"staff:{uuid.uuid4()}"


@pytest.fixture
def world():
    with db.connect() as c:
        t = db.one(c, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        year = db.one(
            c,
            "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2033-34', '2033-06-01',"
            " '2034-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
            (t,),
        )["id"]
        yield c, t, year
        c.rollback()


def a_fortnight(c, t, year, starts_on: str):
    start = dt.date.fromisoformat(starts_on)
    fid = db.one(
        c,
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s, %s, %s, 'teaching', %s, %s) returning id",
        (t, year, 100000 + uuid.uuid4().int % 800000, start, start + dt.timedelta(days=13)),
    )["id"]
    c.execute("insert into fortnight_cycle (tenant_id, fortnight_id) values (%s, %s)", (t, fid))
    return fid


def test_a_fortnight_moves_one_step_at_a_time_and_each_step_is_kept(world):
    c, t, year = world
    fid = a_fortnight(c, t, year, "2033-07-04")
    for step in fc.STATES[1:]:
        fc.move(c, fid, step, WHO)
    row = db.one(c, "select * from fortnight_cycle where fortnight_id = %s", (fid,))
    assert row["state"] == "list_sent" and all(row[f"{s}_by"] == WHO for s in fc.STATES[1:])
    history = c.execute(
        "select subject from fortnight_edit where fortnight_id = %s and kind = 'state'", (fid,)
    )
    assert len(history.fetchall()) == 4


@pytest.mark.parametrize("to", ["approved", "planning", "closed"])
def test_a_step_cannot_be_skipped_repeated_or_invented(world, to):
    c, t, year = world
    fid = a_fortnight(c, t, year, "2033-07-04")
    with pytest.raises(fc.CycleError):
        fc.move(c, fid, to, WHO)
    assert (
        db.one(c, "select state from fortnight_cycle where fortnight_id = %s", (fid,))["state"] == "planning"
    )


def test_a_frozen_fortnight_needs_a_reason_and_keeps_it(world):
    c, t, year = world
    fid = a_fortnight(c, t, year, "2033-07-04")
    edit = {"reason": None, "table": "plan_entry", "record_id": "r1", "op": "update", "actor": WHO}
    fc.ensure_editable(c, [fid], **edit)  # planning: nothing asked, nothing kept
    assert not fc.is_frozen(c, t, dt.date(2033, 7, 5))
    fc.move(c, fid, "frozen", WHO)
    assert fc.is_frozen(c, t, dt.date(2033, 7, 5)) and not fc.is_frozen(c, t, dt.date(2033, 7, 18))
    with pytest.raises(fc.CycleError, match="reason"):
        fc.ensure_editable(c, [fid], **edit | {"reason": "  "})
    fc.ensure_editable(c, [fid], **edit | {"reason": "Sports day moved"})
    kept = c.execute("select reason, changed_by from fortnight_edit where kind = 'frozen_change'").fetchall()
    assert [(r["reason"], r["changed_by"]) for r in kept] == [("Sports day moved", WHO)]


def test_a_step_date_moves_back_past_a_weekend_and_a_holiday(world):
    c, t, year = world
    fid = a_fortnight(c, t, year, "2033-07-11")  # a Monday
    c.execute(
        "insert into config (tenant_id, key, value, description) values (%s, 'fortnight.freeze', %s::jsonb, 'test')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (t, json.dumps({"days_before_start": 1})),
    )
    assert fc.step_date(c, fid, "freeze") == dt.date(2033, 7, 8)  # Sunday to Friday
    campus = db.one(c, "select id from campus where tenant_id = %s limit 1", (t,))["id"]
    c.execute(
        "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, '2033-07-08', 'holiday')"
        " on conflict (tenant_id, campus_id, on_date) do update set kind = 'holiday'",
        (t, campus),
    )
    assert fc.step_date(c, fid, "freeze") == dt.date(2033, 7, 7)
    with pytest.raises(fc.CycleError):
        fc.step_date(c, fid, "publish")
