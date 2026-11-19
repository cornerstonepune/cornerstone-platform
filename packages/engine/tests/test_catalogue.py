"""One list of materials, with categories (CP-84, specs/CP-84/spec.md), Done-when 1, 2, 3 and 5, through the engine's functions:
an item's category, the command that gives the ones with none their category, one thing one item, and who changes a category.
Placeholder rows made in the test's own transaction and rolled back; the people are placeholders (tests/rows.py)."""

import json
import os
import uuid
from contextlib import contextmanager

import pytest
from typer.testing import CliRunner

from engine import cli
from engine.core import catalogue, catalogue_key, db, history, money_rules, settings
from engine.core import catalogue_category as cc
from engine.w1_bank import map_ledger
from engine.w2_print import materials_list as ml
from engine.w2_print import materials_review as review
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
STATIONERY, TLM, OTHER = "Stationery & art supplies", "Teaching & activity materials (TLM)", "Other / unclear"
WORDS = {"pencil": STATIONERY, "paper": STATIONERY, "chalk": STATIONERY, "flashcard": TLM, "dice": TLM}


@pytest.fixture
def conn():
    with db.connect() as c:
        settings.put(c, "materials.category_words", WORDS)  # this test's own words, rolled back with it
        yield c
        c.rollback()


def _person(conn, role=None):
    sid, _ = rows.a_member_of_staff(conn)
    conn.execute("update staff set role_code = %s where id = %s", (role, sid))
    return sid


def _category(conn, code):
    return conn.execute("select category from material_item where code = %s", (code,)).fetchone()["category"]


def _propose(conn, name, who, category=None):
    return ml.propose_item(conn, rows.tenant(conn), name, "piece", who, category)


def _codes(groups):
    return [i["code"] for g in groups for i in g["items"]]


def test_an_item_has_a_category_from_the_schools_list_and_one_with_none_reads_needs_a_category(conn):
    t, educator = rows.tenant(conn), _person(conn)
    assert {STATIONERY, TLM, OTHER} <= set(money_rules.categories(conn))
    sand, glue = _propose(conn, "Sand", educator), _propose(conn, "Glue", educator, STATIONERY)
    assert (_category(conn, sand), _category(conn, glue)) == (None, STATIONERY)
    groups = catalogue.search(conn, t, None)["groups"]
    assert groups[-1]["category"] is None and sand in _codes(groups[-1:]), "needs a category comes last"
    assert [g["category"] for g in groups if glue in _codes([g])] == [STATIONERY]
    with pytest.raises(ValueError, match="Moonshine is not one of the school's categories"):
        _propose(conn, "Moon dust", educator, "Moonshine")


def test_categorise_gives_each_item_with_no_category_the_one_its_last_word_names(conn):
    t, educator = rows.tenant(conn), _person(conn)
    made = {
        n: _propose(conn, n, educator)
        for n in ("Pencils", "Colour pencils", "Chart paper", "Flashcards", "Sand")
    }
    made["Sand tray"] = _propose(conn, "Sand tray", educator)
    plan = cc.categorise(conn, t, dry_run=False)
    got = {n: _category(conn, c) for n, c in made.items()}
    assert got == {
        "Pencils": STATIONERY,
        "Colour pencils": STATIONERY,
        "Chart paper": STATIONERY,
        "Flashcards": TLM,
        "Sand": None,
        "Sand tray": None,
    }
    assert {i["name"] for i in plan["set"]} >= {"Pencils", "Flashcards"}
    assert {i["name"] for i in plan["left"]} >= {"Sand", "Sand tray"}
    assert cc.categorise(conn, t, dry_run=False)["set"] == [], "a second run has nothing left to do"
    kept = history.of(conn, "material_item", made["Pencils"], t)
    assert [(h["op"], h["after"], h["origin"]) for h in kept] == [
        ("category", {"category": STATIONERY}, "engine:categorise")
    ]


def test_the_longest_ending_of_a_name_that_the_words_know_decides_and_a_single_last_word_is_the_fallback(
    conn,
):
    settings.put(
        conn,
        "materials.category_words",
        {"Glue": STATIONERY, "Stick": TLM, "Glue Stick": STATIONERY, "box": TLM, "Pencil box": STATIONERY},
    )
    word_of = cc.word_map(conn)[0]
    assert "glue stick" in word_of, "a phrase is kept as its singular words, lower case"
    got = {
        n: cc.named(word_of, n)
        for n in ("Glue sticks", "Ice cream sticks", "Pencil box", "Wooden pencil boxes", "Toy box")
    }
    assert got == {
        "Glue sticks": STATIONERY,  # its own row, not the TLM that "stick" alone names
        "Ice cream sticks": TLM,
        "Pencil box": STATIONERY,
        "Wooden pencil boxes": STATIONERY,  # an ending of the name, whatever comes before
        "Toy box": TLM,
    }


def test_categorise_never_changes_a_category_a_person_set_and_a_dry_run_changes_nothing(conn):
    t, educator, lead = rows.tenant(conn), _person(conn), _person(conn, "coordinator")
    chalk, dice = _propose(conn, "Chalk", educator), _propose(conn, "Dice", educator)
    cc.set_category(conn, t, lead, chalk, OTHER)  # a person's word, though the words say stationery
    said = cc.categorise(conn, t, dry_run=True)
    assert [i["name"] for i in said["set"] if i["code"] in (chalk, dice)] == ["Dice"]
    assert (_category(conn, chalk), _category(conn, dice)) == (OTHER, None), "a dry run changes nothing"
    assert not [h for h in history.of(conn, "material_item", dice, t) if h["op"] == "category"]
    cc.categorise(conn, t, dry_run=False)
    assert (_category(conn, chalk), _category(conn, dice)) == (OTHER, TLM)


def test_the_command_says_what_it_would_do_and_then_does_it(conn, monkeypatch):
    educator = _person(conn)
    pencils, sand = _propose(conn, "Pencils", educator), _propose(conn, "Sand", educator)

    @contextmanager
    def this_transaction():  # the command's own connection, so that what it writes is rolled back with the test
        yield conn

    monkeypatch.setattr("engine.w2_print.cli_materials.db.connect", this_transaction)
    said = CliRunner().invoke(cli.app, ["materials", "categorise", "--dry-run"])
    assert said.exit_code == 0, said.output
    assert (
        "would give" in said.output
        and f"Pencils: {STATIONERY}" in said.output
        and "(a dry run" in said.output
    )
    assert "Sand" in said.output and "needs a category" in said.output and _category(conn, pencils) is None
    done = CliRunner().invoke(cli.app, ["materials", "categorise"])
    assert done.exit_code == 0 and done.output.startswith("gave ") and _category(conn, pencils) == STATIONERY
    assert _category(conn, sand) is None


def test_the_same_words_are_the_one_item_and_propose_item_makes_no_second(conn):
    t, educator = rows.tenant(conn), _person(conn)
    pencils = _propose(conn, "pencils", educator)
    for typed in ("PENCIL pencils", "Pencils ", "pencil", "  PENCILS  pencil ", "Pencils, pencil"):
        assert _propose(conn, typed, educator) == pencils, typed
    count = conn.execute(
        "select count(*) as n from material_item where tenant_id = %s and code = %s", (t, pencils)
    )
    assert count.fetchone()["n"] == 1
    assert (
        conn.execute("select count(*) as n from material_item where name ilike '%%pencil%%'").fetchone()["n"]
        == 1
    )


def test_a_word_a_person_approved_names_the_item_and_a_word_is_never_two_items_names(conn):
    t, educator = rows.tenant(conn), _person(conn)
    eraser, pencils = _propose(conn, "Eraser", educator), _propose(conn, "Pencils", educator)
    review.approve_alias(conn, t, "rubber", eraser, educator)
    assert _propose(conn, "Rubbers", educator) == eraser
    with pytest.raises(review.AliasTaken):
        review.approve_alias(conn, t, "Pencil", eraser, educator)  # that is the name of pencils
    assert pencils != eraser


def test_names_that_only_share_words_are_close_and_never_merged(conn):
    t, educator = rows.tenant(conn), _person(conn)
    pencils = _propose(conn, "Pencils", educator)
    coloured = _propose(conn, "Colour pencils", educator)
    assert coloured != pencils
    assert [c["code"] for c in catalogue.close(conn, t, "pencils")] == [coloured]
    assert [c["code"] for c in catalogue.close(conn, t, "Colour pencils")] == [pencils]
    assert catalogue.close(conn, t, "Sand") == [] and catalogue.find(conn, t, "colour pencil") == coloured
    assert catalogue.find(conn, t, "Pencil case") is None


def test_the_catalogue_fills_apply_step_returns_the_existing_item_and_makes_no_second(conn):
    t, educator = rows.tenant(conn), _person(conn)
    pencils = _propose(conn, "Pencils", educator)
    act = f"KX-{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, objective, level_1) values (%s,%s,'K2','Play','A test','','')",
        (t, act),
    )
    items = [
        {"name": "PENCIL pencils", "quantity": 4, "unit": "piece"},
        {"name": "Colour pencils", "quantity": 1, "unit": "box"},
        {"name": "Pencils ", "quantity": 2, "unit": "piece"},
    ]
    conn.execute(
        "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, machine)"
        " values (%s, gen_random_uuid(), 'material', %s, %s, 'auto_passed', 'code:test')",
        (t, act, json.dumps({"items": items})),
    )
    map_ledger.apply(conn, t, educator, True, kind="material")
    used = [
        r["material_code"]
        for r in conn.execute(
            "select material_code from activity_material where activity_code = %s order by ord", (act,)
        )
    ]
    assert used[0] == pencils and len(used) == 2 and used[1] != pencils, "the third line is the first again"
    assert (
        conn.execute("select count(*) as n from material_item where name ilike '%%pencil%%'").fetchone()["n"]
        == 2
    )
    made = conn.execute("select category from material_item where code = %s", (used[1],)).fetchone()
    assert made["category"] == STATIONERY, "a new item the fill makes is given the category its words name"


def test_a_new_item_waits_for_a_person_to_give_it_a_home_and_a_value_as_it_does_today(conn):
    t, educator = rows.tenant(conn), _person(conn)
    made = catalogue.make(conn, t, "Beads", "packet", educator, TLM)
    assert (made.created, _category(conn, made.code)) == (True, TLM)
    assert made.code in [i["code"] for i in ml.waiting_items(conn, t)]
    again = catalogue.make(conn, t, "bead", "box", educator, STATIONERY)
    assert (again.code, again.created, _category(conn, made.code)) == (made.code, False, TLM)
    with pytest.raises(ValueError, match="needs a name"):
        catalogue.make(conn, t, " - ", "piece", educator, None)


def test_only_a_coordinator_or_a_founder_sets_a_category_and_every_change_is_kept(conn):
    t, educator, lead, founder = (
        rows.tenant(conn),
        _person(conn),
        _person(conn, "coordinator"),
        _person(conn, "founder"),
    )
    paper = _propose(conn, "Sketch paper", educator)
    with pytest.raises(PermissionError, match="coordinator"):
        cc.set_category(conn, t, educator, paper, STATIONERY)
    with pytest.raises(ValueError, match="not one of the school's categories"):
        cc.set_category(conn, t, lead, paper, "Moonshine")
    with pytest.raises(ValueError, match="no item MAT-NOPE"):
        cc.set_category(conn, t, lead, "MAT-NOPE", STATIONERY)
    cc.set_category(conn, t, lead, paper, STATIONERY)
    cc.set_category(conn, t, lead, paper, STATIONERY)  # the same again changes nothing and keeps nothing
    cc.set_category(conn, t, founder, paper, TLM)
    assert _category(conn, paper) == TLM
    kept = [h for h in history.of(conn, "material_item", paper, t) if h["op"] == "category"]
    assert [(h["before"], h["after"], h["staff_id"]) for h in kept] == [
        ({"category": None}, {"category": STATIONERY}, lead),
        ({"category": STATIONERY}, {"category": TLM}, founder),
    ]


def test_teaching_a_word_sets_the_items_that_end_in_it_and_keeps_the_word(conn):
    t, educator, lead = rows.tenant(conn), _person(conn), _person(conn, "coordinator")
    wooden = _propose(conn, "Wooden beads", educator)
    plain = _propose(conn, "Bead", educator)
    tray = _propose(conn, "Bead tray", educator)
    chosen = _propose(conn, "Glass beads", educator, STATIONERY)
    got = cc.teach_word(conn, t, lead, " BEADS ", TLM)
    assert got == {"word": "bead", "category": TLM, "items_set": 2}
    assert [_category(conn, c) for c in (wooden, plain, tray, chosen)] == [TLM, TLM, None, STATIONERY]
    assert settings.config(conn, "materials.category_words")["bead"] == TLM
    assert cc.named_by_words(conn, "Shiny bead") == TLM, "the next fill reads the word"
    kept = [h for h in history.of(conn, "material_item", wooden, t) if h["op"] == "category"]
    assert [(h["before"], h["after"], h["staff_id"], h["origin"]) for h in kept] == [
        ({"category": None}, {"category": TLM}, lead, f"staff:{lead}")
    ]
    with pytest.raises(PermissionError, match="coordinator"):
        cc.teach_word(conn, t, educator, "tray", TLM)
    assert "tray" not in settings.config(conn, "materials.category_words")


def test_the_commonest_last_words_of_the_items_with_no_category_are_offered_to_teach(conn):
    t, educator = rows.tenant(conn), _person(conn)
    for name in ("Wooden zorbs", "Glass zorb", "Zorb yelp", "Moon yelp", "Sand yelps"):
        _propose(conn, name, educator)
    _propose(conn, "Chart plank", educator, STATIONERY)  # it has a category: its last word is not offered
    got = cc.common_words(conn, t, 1000)
    mine = [w for w in got if w["word"] in ("zorb", "yelp", "plank")]
    assert mine == [{"word": "yelp", "items": 3}, {"word": "zorb", "items": 2}], "singular, commonest first"
    assert [w["items"] for w in got] == sorted((w["items"] for w in got), reverse=True)
    assert cc.common_words(conn, t, 1) == got[:1]


def test_a_category_the_school_dropped_from_its_list_reads_needs_a_category(conn):
    t, educator = rows.tenant(conn), _person(conn)
    ball = _propose(conn, "Ball", educator, TLM)
    settings.put(conn, "money.categories", [c for c in money_rules.categories(conn) if c != TLM])
    got = [i for g in catalogue.search(conn, t, "ball")["groups"] for i in g["items"] if i["code"] == ball]
    assert [(i["category"]) for i in got] == [None]


def test_the_seeded_words_are_singular_and_name_only_the_schools_own_categories():
    seed = json.loads((db.REPO_ROOT / "supabase/seed/config.json").read_text())["config"]
    by = {c["key"]: c for c in seed}
    words, own = by["materials.category_words"], by["money.categories"]["value"]
    assert words["seed_once"] is True and set(words["value"].values()) <= set(own)
    assert all(" ".join(catalogue_key.words(w)) == w for w in words["value"]), (
        "a plural is read as its singular, not listed; a phrase is its words in the singular, one space between"
    )
    assert by["materials.category_role"]["value"] in ("ops", "coordinator", "founder")
