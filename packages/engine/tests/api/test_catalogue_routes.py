"""The one list of materials, by its routes (CP-84, engine/api/routes/materials_items.py), Done-when 4 and 5: search it by category, add to it,
and give an item its category. Every call a POST carrying the signed-in email as `actor`, as Money's and Stock's are. The site's calls run on the
test's own transaction, rolled back; the people are placeholders (tests/materials_rows.py, tests/rows.py)."""

import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db, history, settings, signer
from engine.w2_print import materials_list as ml
from engine.w2_print import materials_review as review
from tests import materials_rows as m
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}
STATIONERY, TLM = "Stationery & art supplies", "Teaching & activity materials (TLM)"


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    with db.connect() as conn:
        settings.put(conn, "educator.timetable_enabled", True)
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield client, conn, m.school(conn)
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _post(client, path, actor, **body):
    return client.post(f"/materials/items/{path}", headers=H, json={"actor": actor, **body})


def _person(conn, role=None):
    """A member of staff who holds no class, with the role given: the email they sign in with."""
    sid, email = rows.a_member_of_staff(conn)
    conn.execute("update staff set role_code = %s where id = %s", (role, sid))
    return email


def _staff_id(conn, email):
    return str(signer.lookup(conn, email))


def _add(client, actor, name, unit="piece", category=STATIONERY):
    return _post(client, "add", actor, name=name, unit=unit, category=category)


def _shown(groups):
    return {i["code"]: (g["category"], i["name"]) for g in groups for i in g["items"]}


def test_search_gives_the_items_by_category_with_needs_a_category_last(engine):
    client, conn, s = engine
    coord = _person(conn, "coordinator")
    glue = _add(client, s["email"], "Glue sticks").json()["code"]
    ball = _add(client, s["email"], "Ball", "piece", TLM).json()["code"]
    sand = ml.propose_item(conn, s["tenant"], "Sand", "bag", s["staff"])
    got = _post(client, "search", s["email"]).json()
    assert set(got) == {"groups", "close"} and got["close"] == []
    assert [g["category"] for g in got["groups"]][-1] is None
    mine = _shown(got["groups"])
    assert (mine[glue][0], mine[ball][0], mine[sand][0]) == (STATIONERY, TLM, None)
    order = [g["category"] for g in got["groups"] if g["category"] in (STATIONERY, TLM)]
    assert order == [STATIONERY, TLM], "the school's own order of categories"
    group = next(g for g in got["groups"] if g["category"] == STATIONERY)
    assert [i for i in group["items"] if i["code"] == glue] == [
        {"code": glue, "name": "Glue sticks", "unit": "piece", "category": STATIONERY, "aliases": []}
    ]
    assert _post(client, "search", coord, q="  ").json()["groups"] == got["groups"], "blank is nothing typed"


def test_search_matches_the_name_and_the_words_a_person_approved_and_says_what_is_close(engine):
    client, conn, s = engine
    pencils = _add(client, s["email"], "Pencils").json()["code"]
    coloured = _add(client, s["email"], "Colour pencils").json()["code"]
    eraser = _add(client, s["email"], "Eraser").json()["code"]
    review.approve_alias(conn, s["tenant"], "rubber", eraser, s["staff"])
    by_pencil = _post(client, "search", s["email"], q="Pencil").json()
    assert set(_shown(by_pencil["groups"])) == {pencils, coloured}, "a plural is read as its singular"
    assert by_pencil["close"] == [{"code": coloured, "name": "Colour pencils"}], (
        "close is never the item itself"
    )
    word = _post(client, "search", s["email"], q="rubb").json()
    assert set(_shown(word["groups"])) == {eraser} and word["close"] == []
    typed = _post(client, "search", s["email"], q="colour crayons").json()
    assert typed["groups"] == [] and [c["code"] for c in typed["close"]] == [coloured]
    exact = _post(client, "search", s["email"], q="PENCIL pencils").json()
    assert set(_shown(exact["groups"])) == {pencils, coloured} and exact["close"] == [
        {"code": coloured, "name": "Colour pencils"}
    ]


def test_a_new_item_needs_name_unit_and_category_is_usable_at_once_and_waits_for_a_person(engine):
    client, conn, s = engine
    made = _add(client, s["email"], "Chart paper", "sheet").json()
    code = made.pop("code")
    assert made == {
        "name": "Chart paper",
        "unit": "sheet",
        "category": STATIONERY,
        "aliases": [],
        "created": True,
        "close": [],
    }
    lid = ml.build(conn, s["class"], "fortnight", m.MON, m.MON + dt.timedelta(days=13))
    assert ml.add(conn, lid, code, 2, m.MON, None, s["staff"])  # on a class list at once
    assert code in [i["code"] for i in ml.waiting_items(conn, s["tenant"])]
    for body, why in (
        ({"name": "  ", "unit": "box", "category": STATIONERY}, "needs a name"),
        ({"name": "Tape", "unit": " ", "category": STATIONERY}, "needs a unit"),
        ({"name": "Tape", "unit": "roll", "category": ""}, "A category is needed"),
        (
            {"name": "Tape", "unit": "roll", "category": "Moonshine"},
            "Moonshine is not one of the school's categories",
        ),
    ):
        no = _post(client, "add", s["email"], **body)
        assert no.status_code == 422 and why in no.json()["detail"], body
    assert _post(client, "add", s["email"], name="Tape", unit="roll").status_code == 422, (
        "all three are required"
    )


def test_the_same_words_are_the_item_it_is_and_a_close_name_is_a_new_one(engine):
    client, conn, s = engine
    pencils = _add(client, s["email"], "pencils").json()["code"]
    for typed in ("PENCIL pencils", "Pencils ", "pencil"):
        again = _add(client, s["email"], typed, "box", TLM).json()
        assert (again["code"], again["created"], again["category"], again["unit"]) == (
            pencils,
            False,
            STATIONERY,
            "piece",
        )
    coloured = _add(client, s["email"], "colour pencils").json()
    assert coloured["created"] and coloured["code"] != pencils
    assert coloured["close"] == [{"code": pencils, "name": "pencils"}]


def test_who_may_add_an_item_and_who_may_change_its_category(engine):
    client, conn, s = engine
    nobody, coord, founder = _person(conn), _person(conn, "coordinator"), _person(conn, "founder")
    no = _add(client, nobody, "Tape")
    assert no.status_code == 403 and "hold a class" in no.json()["detail"]
    settings.put(conn, "educator.timetable_enabled", False)
    assert _add(client, s["email"], "Tape").status_code == 403, "an educator's screens are off"
    tape = _add(client, coord, "Tape").json()["code"]
    settings.put(conn, "educator.timetable_enabled", True)
    for who in (s["email"], nobody):
        no = _post(client, "category", who, material_code=tape, category=TLM)
        assert no.status_code == 403 and "coordinator" in no.json()["detail"], who
    assert _post(client, "category", coord, material_code=tape, category=TLM).json() == {
        "code": tape,
        "category": TLM,
    }
    assert _post(client, "category", founder, material_code=tape, category=STATIONERY).status_code == 200
    kept = [h for h in history.of(conn, "material_item", tape, s["tenant"]) if h["op"] == "category"]
    assert [h["after"] for h in kept] == [{"category": TLM}, {"category": STATIONERY}], "the history is kept"
    no = _post(client, "category", coord, material_code="MAT-NOPE", category=TLM)
    assert no.status_code == 422 and "no item MAT-NOPE" in no.json()["detail"]
    assert _post(client, "category", coord, material_code=tape, category="Moonshine").status_code == 422


def _teach(client, actor, word, category):
    return client.post("/materials/words/set", headers=H, json={"actor": actor, "word": word, "category": category})


def test_a_coordinator_teaches_a_word_and_the_uncategorised_items_ending_in_it_take_the_category(engine):
    client, conn, s = engine
    coord = _person(conn, "coordinator")
    bead = ml.propose_item(conn, s["tenant"], "Wooden beads", "box", s["staff"])
    other = ml.propose_item(conn, s["tenant"], "Bead tray", "piece", s["staff"])  # ends in tray, not bead
    by_hand = _add(client, s["email"], "Glass beads", "box", STATIONERY).json()["code"]
    settings.put(conn, "materials.category_words", {"paper": STATIONERY})  # this test's own words, rolled back with it
    got = _teach(client, coord, "Beads", TLM)
    assert got.status_code == 200 and got.json() == {"word": "bead", "category": TLM, "items_set": 1}
    cat = lambda code: conn.execute("select category from material_item where code = %s", (code,)).fetchone()["category"]  # noqa: E731
    assert (cat(bead), cat(other), cat(by_hand)) == (TLM, None, STATIONERY), "a person's category is not changed"
    assert settings.config(conn, "materials.category_words")["bead"] == TLM, "kept for the next fill"
    again = _add(client, s["email"], "Plastic bead", "box", TLM).json()
    assert again["category"] == TLM
    taught = [h for h in history.of(conn, "material_item", bead, s["tenant"]) if h["op"] == "category"]
    assert [h["after"] for h in taught] == [{"category": TLM}] and str(taught[0]["staff_id"]) == _staff_id(conn, coord)
    assert _teach(client, coord, "beads", TLM).json()["items_set"] == 0, "nothing left to set the second time"


def test_a_word_is_one_word_in_one_of_the_schools_categories_and_only_a_coordinator_teaches_it(engine):
    client, conn, s = engine
    coord, nobody = _person(conn, "coordinator"), _person(conn)
    had = settings.config(conn, "materials.category_words")
    no = _teach(client, s["email"], "bead", TLM)
    assert no.status_code == 403 and "coordinator" in no.json()["detail"]
    assert _teach(client, nobody, "bead", TLM).status_code == 403
    for word, category, why in (
        ("  ", TLM, "A word is needed"),
        ("glue stick", TLM, "one word"),
        ("bead", "Moonshine", "not one of the school's categories"),
        ("bead", "", "A category is needed"),
    ):
        got = _teach(client, coord, word, category)
        assert got.status_code == 422 and why in got.json()["detail"], (word, category)
    assert settings.config(conn, "materials.category_words") == had, "a refused word is not kept"
    assert _teach(client, "nobody@school.invalid", "bead", TLM).status_code == 403


def test_a_word_taught_again_replaces_the_category_it_had_and_the_change_is_kept(engine):
    client, conn, s = engine
    coord = _person(conn, "coordinator")
    settings.put(conn, "materials.category_words", {"stickers": STATIONERY, "paper": STATIONERY})
    assert _teach(client, coord, "sticker", TLM).json()["category"] == TLM
    words = settings.config(conn, "materials.category_words")
    assert words == {"sticker": TLM, "paper": STATIONERY}, "the plural spelling is replaced, not kept beside it"
    kept = [h for h in history.of(conn, "config", "materials.category_words", s["tenant"]) if h["op"] == "set"]
    assert kept and kept[-1]["before"]["words"]["stickers"] == STATIONERY and kept[-1]["after"]["words"]["sticker"] == TLM


def test_every_route_needs_the_key_and_a_sign_in_on_the_staff_list(engine):
    client, conn, s = engine
    assert client.post("/materials/items/search", json={"actor": s["email"]}).status_code == 401
    assert client.post("/materials/words/set", json={"actor": s["email"], "word": "x", "category": TLM}).status_code == 401
    for path, body in (
        ("search", {}),
        ("add", {"name": "Tape", "unit": "roll", "category": TLM}),
        ("category", {"material_code": "x", "category": TLM}),
    ):
        assert _post(client, path, "nobody@school.invalid", **body).status_code == 403, path
