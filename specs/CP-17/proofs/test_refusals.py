"""CP-17 item 4: the system refuses
- new stock of an item that is not tracked, when the school's setting limits records to tracked items (`record_items`);
- issuing, returning or writing off more than is on hand, even when two people do it at the same moment;
- a write-off, or a count that changes the number, without a reason;
- a record by someone whose role the school has not allowed to record stock (`inventory.record_roles`, an open grant
  in the school).
Each refusal is shown next to the same record allowed, so a missing table never passes as a refusal. Everything is
rolled back, except the two-people proof, which must commit for a second connection to see the stock and removes every
row it made afterwards."""

import datetime as dt
import threading
import uuid

import psycopg
import pytest

from engine.core import db

from cp17_world import conn, item, make_school, move, on_hand, refused, school, set_config, staff  # noqa: F401

INSERT = ("insert into stock_move (tenant_id, material_code, kind, quantity, class_id, counted_on_hand, reason, who)"
          " values (%s, %s, %s, %s, %s, %s, %s, %s)")


@pytest.fixture
def ops(conn, school):
    set_config(conn, school["t"], "inventory.record_roles", ["ops"])
    return staff(conn, school, "ops")


def no(conn, s, code, kind, who, quantity=None, klass=None, reason=None, counted=None, t=None) -> str:
    return refused(conn, INSERT, (t or s["t"], code, kind, quantity, klass, counted, reason, who))


def test_4_new_stock_of_an_untracked_item_is_refused_when_records_are_limited_to_tracked(conn, school, ops):
    t = school["t"]
    set_config(conn, t, "inventory.track_from_rupees", 500)
    cheap, dear, blank = item(conn, school, 100), item(conn, school, 800), item(conn, school)
    move(conn, school, cheap, "received", ops, quantity=3)  # by default (all) an untracked item is recorded
    set_config(conn, t, "inventory.record_items", "tracked")
    move(conn, school, dear, "received", ops, quantity=3)
    msg = no(conn, school, blank, "received", ops, quantity=3)
    assert blank in msg, f"the refusal should name the item: {msg}"
    no(conn, school, cheap, "received", ops, quantity=1)
    no(conn, school, blank, "counted", ops, counted=4, reason="found in a cupboard")
    # stock already recorded can still be moved and written off after the limit
    move(conn, school, cheap, "issued", ops, quantity=1, klass=school["class"])
    move(conn, school, cheap, "written_off", ops, quantity=1, klass=school["class"], reason="lost")
    assert on_hand(conn, t, cheap) == {None: 2}


def test_4_more_than_on_hand_is_refused_for_issue_return_and_write_off(conn, school, ops):
    t, a, b = school["t"], school["class"], school["other_class"]
    code = item(conn, school)
    move(conn, school, code, "received", ops, quantity=3)
    no(conn, school, code, "issued", ops, quantity=4, klass=a)
    move(conn, school, code, "issued", ops, quantity=2, klass=a)
    no(conn, school, code, "returned", ops, quantity=3, klass=a)
    no(conn, school, code, "returned", ops, quantity=1, klass=b)  # class b never had any
    no(conn, school, code, "written_off", ops, quantity=2, reason="broken")  # the store has 1
    no(conn, school, code, "written_off", ops, quantity=3, klass=a, reason="broken")
    move(conn, school, code, "returned", ops, quantity=2, klass=a)
    move(conn, school, code, "written_off", ops, quantity=3, reason="broken")
    assert on_hand(conn, t, code) == {}


def test_4_a_write_off_or_a_count_that_changes_the_number_needs_a_reason(conn, school, ops):
    t = school["t"]
    code = item(conn, school)
    move(conn, school, code, "received", ops, quantity=5)
    no(conn, school, code, "written_off", ops, quantity=1)
    no(conn, school, code, "written_off", ops, quantity=1, reason="   ")
    no(conn, school, code, "counted", ops, counted=4)
    no(conn, school, code, "counted", ops, counted=6, reason=" ")
    move(conn, school, code, "counted", ops, counted=5)  # a count that changes nothing needs no reason
    move(conn, school, code, "written_off", ops, quantity=1, reason="cracked")
    move(conn, school, code, "counted", ops, counted=3, reason="one missing at the count")
    assert on_hand(conn, t, code) == {None: 3}


def test_4_only_a_role_the_school_allows_may_record(conn, school):
    t = school["t"]
    set_config(conn, t, "inventory.record_roles", ["ops"])
    code = item(conn, school)
    allowed = staff(conn, school, "ops")
    move(conn, school, code, "received", allowed, quantity=2)
    no(conn, school, code, "received", staff(conn, school, "assistant", school["class"]), quantity=2)
    no(conn, school, code, "received", staff(conn, school, None), quantity=2)  # no grant at all
    ended = staff(conn, school, "ops", valid_to=dt.date.today() - dt.timedelta(days=400))
    no(conn, school, code, "received", ended, quantity=2)
    other = conn.execute("insert into tenant (slug, name) values (%s, 'Proof School') returning id",
                         (f"cp17-{uuid.uuid4().hex[:8]}",)).fetchone()["id"]
    other_campus = conn.execute("select id from campus where tenant_id = %s limit 1", (other,)).fetchone()["id"]
    elsewhere = staff(conn, school, "ops", t=other, campus=other_campus)
    no(conn, school, code, "received", elsewhere, quantity=2)  # an ops grant in another school
    set_config(conn, t, "inventory.record_roles", ["head"])
    no(conn, school, code, "received", allowed, quantity=2)  # the setting, not code, decides
    assert on_hand(conn, t, code) == {None: 2}


# ---- two people at the same moment: committed rows, removed afterwards ---------------------------------------------

@pytest.fixture
def committed():
    """A fake class, recorder and item committed for two connections to share; every row removed at the end, with the
    append-only triggers off for that one clean-up transaction (as the engine's `forgets_what_it_commits`)."""
    made = {}
    try:
        with db.connect() as c:
            s = make_school(c)
            roles = c.execute("select value from config where tenant_id = %s and key = 'inventory.record_roles'",
                              (s["t"],)).fetchone()
            assert roles and roles["value"], "the school has no inventory.record_roles setting"
            role = roles["value"][0]
            who = staff(c, s, role, None if role in ("ops", "coordinator", "head") else s["class"])
            code = item(c, s, 10**6)  # far above any threshold: tracked whatever the settings say
            made = {"s": s, "who": who, "code": code}
            move(c, s, code, "received", who, quantity=5)
            c.commit()
        yield made
    finally:
        if made:
            s = made["s"]
            with db.connect() as c:
                c.execute("set local session_replication_role = replica")
                if c.execute("select to_regclass('public.stock_move') is not null as ok").fetchone()["ok"]:
                    c.execute("delete from stock_move where tenant_id = %s and material_code = %s", (s["t"], made["code"]))
                c.execute("delete from material_item where tenant_id = %s and code = %s", (s["t"], made["code"]))
                c.execute("delete from staff_role_grant where staff_id = %s", (made["who"],))
                c.execute("delete from staff where id = %s", (made["who"],))
                c.execute("delete from school_class where id = any(%s)", ([s["class"], s["other_class"]],))
                if s["year_made"]:
                    c.execute("delete from academic_year where id = %s", (s["year"],))
                c.commit()


def test_4_two_issues_at_the_same_moment_cannot_take_stock_below_zero(committed):
    s, who, code = committed["s"], committed["who"], committed["code"]
    args = (s["t"], code, "issued", 4, s["class"], None, None, who)
    outcome = {}
    with db.connect() as first:
        first.execute(INSERT, args)  # holds its transaction open

        def second():
            try:
                with db.connect() as c:
                    c.execute("set local lock_timeout = '20s'")
                    c.execute(INSERT, args)
                    c.commit()
                    outcome["second"] = "recorded"
            except psycopg.Error as e:
                outcome["second"] = f"refused: {e}"

        th = threading.Thread(target=second)
        th.start()
        th.join(2)  # the second waits for the first's lock on this item
        first.commit()
    th.join(30)
    assert not th.is_alive(), "the second issue never finished"
    with db.connect() as c:
        here = on_hand(c, s["t"], code)
    assert outcome["second"].startswith("refused"), f"both issues of 4 from 5 were recorded: on hand {here}"
    assert here == {None: 1, s["class"]: 4}
