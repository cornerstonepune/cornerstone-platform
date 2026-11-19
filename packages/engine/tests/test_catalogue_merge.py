"""Two catalogue items that are one thing, made one (CP-84, found on the live catalogue on 19 Nov: eight things held twice, written with a space and
without). `engine materials merge [--dry-run]` through the engine's function and the command. Placeholder rows made in the test's own transaction and
rolled back (the duplicates are inserted directly: `make` would no longer make them)."""

import itertools
import os
import uuid
from contextlib import contextmanager

import pytest
from typer.testing import CliRunner

from engine import cli
from engine.core import catalogue, db, history
from engine.w2_print import materials_merge as mm
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
PAIRS = [
    ("Big bowl", "Bigbowl"),
    ("black board", "Blackboard"),
    ("Dust bin", "Dustbin"),
    ("flash card", "flashcard"),
    ("Note Book", "Notebook"),
    ("rubber band", "rubberband"),
    ("Sketch pen", "sketchpen"),
    ("T-Shirt", "tshirt"),
]


CODES = itertools.count(1)


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def this_transaction(conn, monkeypatch):
    """The command's own connection is the test's, so that what it writes is rolled back with the test."""

    @contextmanager
    def connect():
        yield conn

    monkeypatch.setattr("engine.w2_print.cli_materials.db.connect", connect)


def _item(conn, name, aliases=(), category=None):
    """An item made directly, as the live catalogue made its pairs before the two were one: its code."""
    code = f"MAT-X{next(CODES):04d}{uuid.uuid4().hex[:4]}"  # an item made later has the later code
    conn.execute(
        "insert into material_item (tenant_id, code, name, unit, aliases, category) values (%s, %s, %s, 'piece', %s, %s)",
        (rows.tenant(conn), code, name, list(aliases), category),
    )
    return code


def _activity(conn):
    code = f"KX-{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, objective, level_1) values (%s,%s,'K2','Play','A test','','')",
        (rows.tenant(conn), code),
    )
    return code


def _use(conn, activity, item, ord_=1):
    conn.execute(
        "insert into activity_material (tenant_id, activity_code, material_code, quantity, ord) values (%s, %s, %s, 2, %s)",
        (rows.tenant(conn), activity, item, ord_),
    )


def _list(conn):
    """A materials list of a class of this test's own: its id."""
    klass = rows.a_class(conn, f"T{uuid.uuid4().hex[:5]}", "K2")
    return conn.execute(
        "insert into materials_list (tenant_id, school_class_id, period, from_on, to_on) values (%s, %s, 'week', '2031-11-03', '2031-11-09') returning id",
        (rows.tenant(conn), klass),
    ).fetchone()["id"]


def _line(conn, list_id, item, activity):
    conn.execute(
        "insert into materials_line (tenant_id, list_id, material_code, unit, quantity, needed_on, activity_code)"
        " values (%s, %s, %s, 'piece', 3, '2031-11-04', %s)",
        (rows.tenant(conn), list_id, item, activity),
    )


def _stock(conn, item):
    staff, _ = rows.a_member_of_staff(conn)
    t = rows.tenant(conn)
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    conn.execute(
        "insert into stock_move (tenant_id, campus_id, material_code, kind, quantity, staff_id) values (%s, %s, %s, 'in', 4, %s)",
        (t, campus, item, staff),
    )


def _exists(conn, code):
    return conn.execute("select 1 from material_item where code = %s", (code,)).fetchone() is not None


def _on(conn, table, item):
    return conn.execute(f"select count(*) as n from {table} where material_code = %s", (item,)).fetchone()[
        "n"
    ]


def _state(conn):
    """Everything a merge could change, counted."""
    return {
        t: db.counts(conn, [t])[t]
        for t in ("material_item", "activity_material", "materials_line", "stock_move", "change_log")
    }


def _mine(plan, *codes):
    """The groups of the plan that hold one of these codes (the test database may hold others)."""
    return [
        g
        for g in plan["groups"]
        if {g["keeper"]["code"], *(m["code"] for m in g["merged"]), *(m["code"] for m in g["left"])}
        & set(codes)
    ]


def test_the_tables_that_name_an_item_are_read_from_the_database_not_listed_here(conn):
    got = {r.table: r for r in mm.refs(conn)}
    assert {"activity_material", "materials_line", "stock_move"} <= set(got)
    assert got["stock_move"].kept_for_ever and not got["activity_material"].kept_for_ever
    assert ("tenant_id", "activity_code") in got["activity_material"].alongside, (
        "one row an activity has of an item"
    )
    assert ("list_id",) in got["materials_line"].alongside, "one line a list has of an item"
    conn.execute(  # a table made after this was written: it is moved too, with no change here
        "create table merge_probe (tenant_id uuid not null, material_code text not null, n int not null,"
        " primary key (tenant_id, n, material_code), foreign key (tenant_id, material_code) references material_item (tenant_id, code))"
    )
    t = rows.tenant(conn)
    keeper, loser, other = _item(conn, "Big bowl"), _item(conn, "Bigbowl"), _item(conn, "Sand")
    for n, code in ((1, loser), (2, loser), (1, keeper), (3, other)):
        conn.execute("insert into merge_probe values (%s, %s, %s)", (t, code, n))
    mm.merge(conn, t, dry_run=False)
    left = conn.execute("select material_code, n from merge_probe order by n, material_code").fetchall()
    kept = {r["n"] for r in left if r["material_code"] == keeper}
    assert kept == {1, 2} and len(left) == 3 and _exists(conn, keeper) != _exists(conn, loser)


def test_a_dry_run_says_what_it_would_do_and_changes_nothing(conn):
    t = rows.tenant(conn)
    acts = [_activity(conn) for _ in range(3)]
    spaced, joined = _item(conn, "flash card"), _item(conn, "flashcard")
    _use(conn, acts[0], spaced)
    _use(conn, acts[1], joined)
    _use(conn, acts[2], joined)
    lone = _item(conn, "Sand")
    before = _state(conn)
    plan = mm.merge(conn, t, dry_run=True)
    (group,) = _mine(plan, spaced, joined, lone)
    assert group["keeper"]["code"] == joined, "the item the most activities use"
    assert [(m["code"], m["moved"], m["dropped"]) for m in group["merged"]] == [(spaced, 1, 0)]
    assert _state(conn) == before and _exists(conn, spaced) and _on(conn, "activity_material", spaced) == 1
    assert not history.of(conn, "material_item", joined, t)


def test_a_real_run_moves_the_rows_to_the_keeper_drops_the_ones_it_already_has_and_keeps_a_history_row(conn):
    t = rows.tenant(conn)
    both, only_loser, only_keeper = _activity(conn), _activity(conn), _activity(conn)
    keeper = _item(conn, "Dust bin", aliases=["bin"])
    loser = _item(conn, "Dustbin", aliases=["trash can"], category="Other / unclear")
    _use(conn, both, keeper)
    _use(conn, both, loser, 2)  # the activity has both: the loser's row would be a second of the keeper's
    _use(conn, only_loser, loser)
    _use(conn, only_keeper, keeper)
    _use(conn, only_keeper, _item(conn, "Chalk"), 2)
    first, second = _list(conn), _list(conn)
    _line(conn, first, keeper, both)
    _line(conn, first, loser, both)  # a list has one line of an item: the same clash
    _line(conn, second, loser, only_loser)
    got = mm.merge(conn, t, dry_run=False)
    (group,) = _mine(got, keeper, loser)
    assert group["keeper"] == {"code": keeper, "name": "Dust bin"}, (
        "the same activities: the lowest code, and keeper's name is kept"
    )
    (done,) = group["merged"]
    assert (done["code"], done["moved"], done["dropped"]) == (loser, 2, 2), (
        "an activity's row and a line from the second list moved; one of each dropped"
    )
    assert not _exists(conn, loser) and _on(conn, "activity_material", loser) == 0
    assert _on(conn, "activity_material", keeper) == 3 and _on(conn, "materials_line", keeper) == 2
    item = conn.execute("select aliases, category from material_item where code = %s", (keeper,)).fetchone()
    assert item["aliases"] == ["bin", "dustbin", "trash can"], (
        "the loser's name and its approved words are the keeper's now"
    )
    assert item["category"] == "Other / unclear", "a blank is filled from the loser; nothing is overwritten"
    (kept,) = [h for h in history.of(conn, "material_item", keeper, t) if h["op"] == "merge"]
    assert kept["origin"] == "engine:merge" and kept["staff_id"] is None
    assert kept["before"]["item"]["code"] == loser and kept["before"]["item"]["name"] == "Dustbin"
    assert kept["after"]["into"] == keeper and kept["after"]["moved"] == {
        "activity_material": 1,
        "materials_line": 1,
    }
    assert catalogue.find(conn, t, "Dustbins") == keeper and catalogue.find(conn, t, "trash can") == keeper


def test_the_keeper_is_the_item_the_most_activities_use_then_the_lowest_code(conn):
    t = rows.tenant(conn)
    a, b, c = _activity(conn), _activity(conn), _activity(conn)
    low, high = sorted([_item(conn, "Black board"), _item(conn, "Blackboard")])
    _use(conn, a, high)
    _use(conn, b, high)
    _use(conn, c, low)
    (group,) = _mine(mm.merge(conn, t, dry_run=True), low, high)
    assert group["keeper"]["code"] == high
    other = [_item(conn, "Note book"), _item(conn, "Notebook"), _item(conn, "note-books")]
    (tied,) = _mine(mm.merge(conn, t, dry_run=True), *other)
    assert tied["keeper"]["code"] == min(other) and {m["code"] for m in tied["merged"]} == set(other) - {
        min(other)
    }


def test_a_bank_of_the_real_pairs_is_one_item_each_and_the_close_ones_are_left_alone(conn):
    t = rows.tenant(conn)
    made = {p: (_item(conn, p[0]), _item(conn, p[1])) for p in PAIRS}
    pencils, coloured = _item(conn, "Pencils"), _item(conn, "Colour pencils")
    ours = [c for two in made.values() for c in two] + [pencils, coloured]
    plan = mm.merge(conn, t, dry_run=True)
    assert len(_mine(plan, *ours)) == len(PAIRS) and all(len(g["merged"]) == 1 for g in _mine(plan, *ours))
    mm.merge(conn, t, dry_run=False)
    for pair, (one, two) in made.items():
        assert _exists(conn, one) != _exists(conn, two), pair
    assert _exists(conn, pencils) and _exists(conn, coloured), "close, never merged"
    assert _mine(mm.merge(conn, t, dry_run=False), *ours) == [], "a second run finds nothing"


def test_an_item_with_stock_recorded_is_left_alone_and_said_so_and_a_keeper_with_stock_absorbs_the_others(
    conn,
):
    t = rows.tenant(conn)
    act = _activity(conn)
    keeper, with_stock = _item(conn, "Flash card"), _item(conn, "Flashcard")
    _use(conn, act, keeper)
    _stock(conn, with_stock)
    got = mm.merge(conn, t, dry_run=False)
    (group,) = _mine(got, keeper, with_stock)
    assert group["merged"] == [] and [m["code"] for m in group["left"]] == [with_stock]
    assert group["left"][0]["why"] == "has stock recorded; merge it by hand"
    assert _exists(conn, with_stock) and _on(conn, "stock_move", with_stock) == 1
    assert not [h for h in history.of(conn, "material_item", keeper, t) if h["op"] == "merge"]
    # the stock-bearing one used by more activities is the keeper, and the one without stock is merged into it
    act2, act3 = _activity(conn), _activity(conn)
    _use(conn, act2, with_stock)
    _use(conn, act3, with_stock)
    (again,) = _mine(mm.merge(conn, t, dry_run=False), keeper, with_stock)
    assert again["keeper"]["code"] == with_stock and [m["code"] for m in again["merged"]] == [keeper]
    assert not _exists(conn, keeper) and _on(conn, "stock_move", with_stock) == 1


def test_a_merge_changes_nothing_for_a_name_that_is_not_one_thing(conn):
    t = rows.tenant(conn)
    ours = [_item(conn, n) for n in ("Pencil case", "Pencil", "Colour pencils", "Card", "Flash card")]
    before = _state(conn)
    assert _mine(mm.merge(conn, t, dry_run=False), *ours) == [] and _state(conn) == before


def test_the_command_says_it_with_the_keeper_first_and_then_does_it(conn, this_transaction):
    one, two, three = _activity(conn), _activity(conn), _activity(conn)
    spaced, joined = _item(conn, "T-Shirt"), _item(conn, "tshirt")
    _use(conn, one, joined)
    _use(conn, two, joined)
    _use(conn, three, spaced)  # the joined one is used more: it is the keeper
    held = _item(conn, "Rubber band")
    _stock(conn, held)
    after = _item(conn, "rubberband")
    _use(
        conn, one, after, 2
    )  # the one with no stock is used, so it is the keeper and the one with stock is left
    said = CliRunner().invoke(cli.app, ["materials", "merge", "--dry-run"])
    assert said.exit_code == 0, said.output
    assert f"  {joined} tshirt <- {spaced} T-Shirt: 1 row would move\n" in said.output
    assert "a dry run: nothing is changed" in said.output and _exists(conn, spaced)
    assert (
        f"  {held} Rubber band: has stock recorded; merge it by hand (it is {after} rubberband too)"
        in said.output
    )
    done = CliRunner().invoke(cli.app, ["materials", "merge"])
    assert done.exit_code == 0, done.output
    assert f"  {joined} tshirt <- {spaced} T-Shirt: 1 row moved\n" in done.output
    assert "dry run" not in done.output and not _exists(conn, spaced) and _exists(conn, joined)
    again = CliRunner().invoke(cli.app, ["materials", "merge"])
    assert again.exit_code == 0 and f"{spaced} T-Shirt" not in again.output
    assert f"  {held} Rubber band: has stock recorded" in again.output, (
        "what only a person can merge is said again"
    )
