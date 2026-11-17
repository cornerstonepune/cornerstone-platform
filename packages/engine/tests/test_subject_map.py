"""CP-54 A1: one subject list. Every in-scope objective and activity reaches a `subject` row, or is knowingly not one
(a routine, a character area, or a spelling left for placement); a spelling the map does not know fails the load.
Each test runs on the local copy and rolls back what it writes."""

import os

import pytest

from engine.core import db, settings, subject_map

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs the local copy (bin/testdb)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def t(conn):
    return conn.execute("select id from tenant order by created_at limit 1").fetchone()["id"]


def _lo(conn, t, code, band, subject):
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source)"
        " values (%s,%s,%s,%s,'u','The child …','','school')",
        (t, code, band, subject),
    )


def _act(conn, t, code, band, strand):
    conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, objective) values (%s,%s,%s,%s,'a','o')",
        (t, code, band, strand),
    )


def _code(conn, table, code):
    kind = "kind" if table == "learning_objective" else "null::text as kind"
    return conn.execute(f"select subject_code, {kind} from {table} where code = %s", (code,)).fetchone()  # noqa: S608


def test_the_schools_subjects_are_rows_and_every_code_the_map_names_has_one(conn, t):
    subject_map.load_subjects(conn, t)
    have = {r["code"] for r in conn.execute("select code from subject where tenant_id = %s", (t,))}
    rules = settings.config(conn, subject_map.KEY, None, t)
    assert set(rules["spellings"].values()) <= have
    assert {"NUM", "ENG", "HIN", "MAR", "SCI", "GP", "HSC", "COM", "ART", "MUS", "FMS", "GMS"} <= have


def test_g1_to_g4_spellings_reach_their_subject_and_routines_are_not_a_subject(conn, t):
    subject_map.load_subjects(conn, t)
    for i, (spelling, _) in enumerate(
        [
            ("Numeracy", "NUM"),
            ("Phonics", "ENG"),
            ("Literacy - Hindi", "HIN"),
            ("Literacy - Marathi", "MAR"),
            ("Routines", None),
        ]
    ):
        _lo(conn, t, f"T-LO-{i}", "G1", spelling)
    subject_map.apply(conn, t)
    got = {
        r["code"]: (r["subject_code"], r["kind"])
        for r in conn.execute(
            "select code, subject_code, kind from learning_objective where code like 'T-LO-%'"
        )
    }
    assert got["T-LO-0"] == ("NUM", "academic")
    assert got["T-LO-1"] == ("ENG", "academic")
    assert got["T-LO-2"] == ("HIN", "academic")
    assert got["T-LO-3"] == ("MAR", "academic")
    assert got["T-LO-4"] == (None, "routine")


def test_k2_labels_follow_nimishs_rules_and_unclear_ones_stay_unplaced(conn, t):
    subject_map.load_subjects(conn, t)
    cases = {
        "Rhymes & Songs": ("ENG", "academic"),
        "Story Telling": ("ENG", "academic"),
        "Science & Geo": ("SCI", "academic"),
        "Clay": ("ART", "academic"),
        "Arts & Crafts": ("ART", "academic"),
        "FMS": ("FMS", "academic"),
        "Circle Time": (None, "routine"),
        "Assembly": (None, "routine"),
        "Curiosity": (None, "character"),
        "Empathy & Happiness": (None, "character"),
        "BOB": ("SCI", "academic"),
        "I & D": (None, "character"),
        "VE": (None, "character"),
        "PLS": (None, "character"),
        "Block Room": ("NUM", "academic"),
        "Dance": ("MUS", "academic"),
    }
    for i, spelling in enumerate(cases):
        _lo(conn, t, f"T-K2-{i}", "K2", spelling)
        _act(conn, t, f"T-ACT-{i}", "K2", spelling)
    subject_map.apply(conn, t)
    for i, (spelling, want) in enumerate(cases.items()):
        lo = _code(conn, "learning_objective", f"T-K2-{i}")
        assert (lo["subject_code"], lo["kind"]) == want, spelling
        act = _code(conn, "activity", f"T-ACT-{i}")
        assert act["subject_code"] == (want[0] if want[1] == "academic" else None), spelling
    left = subject_map.unplaced(conn, t)
    assert left["learning_objective_stray"] == 0 and left["activity_stray"] == 0
    assert left["learning_objective_placement"] == 0  # nothing waits for a person: every label is placed


def test_a_spelling_the_map_does_not_know_fails_the_load_and_names_it(conn, t):
    subject_map.load_subjects(conn, t)
    _lo(conn, t, "T-BAD-1", "G2", "Astrology")
    _act(conn, t, "T-BAD-2", "K2", "Pottery")
    with pytest.raises(subject_map.UnknownSubject) as e:
        subject_map.apply(conn, t)
    assert "Astrology" in str(e.value) and "Pottery" in str(e.value)


def test_a_second_apply_moves_nothing(conn, t):
    subject_map.load_subjects(conn, t)
    _lo(conn, t, "T-TWICE", "G3", "Science")
    subject_map.apply(conn, t)
    assert subject_map.apply(conn, t) == {"objectives": 0, "activities": 0, "routine": 0, "character": 0}


def test_other_grades_are_left_alone(conn, t):
    subject_map.load_subjects(conn, t)
    _lo(conn, t, "T-N", "N", "Anything at all")
    subject_map.apply(conn, t)
    assert _code(conn, "learning_objective", "T-N")["subject_code"] is None


def test_an_objective_folded_into_another_is_marked_retired_not_deleted(conn, t):
    _lo(conn, t, "T-RETIRE", "G2", "Science")
    assert (
        conn.execute("select retired from learning_objective where code = 'T-RETIRE'").fetchone()["retired"]
        is False
    )
    conn.execute("update learning_objective set retired = true where code = 'T-RETIRE'")
    assert (
        conn.execute("select count(*) as n from learning_objective where code = 'T-RETIRE'").fetchone()["n"]
        == 1
    )


def test_visual_arts_objectives_that_are_geography_or_history_go_to_global_perspectives_and_real_art_stays_art(
    conn, t
):
    subject_map.load_subjects(conn, t)
    cases = {
        "T-VA-1": ("Geography", "GP"),
        "T-VA-2": ("History", "GP"),
        "T-VA-3": ("• Title: Early Humans / • Focus: Understand how early humans lived", "GP"),
        "T-VA-4": ("• Title: Continents and Oceans / • Focus: Recognize Earth is divided", "GP"),
        "T-VA-5": ("Drawing and colour mixing", "ART"),
    }
    for code, (unit, _) in cases.items():
        _lo(conn, t, code, "G3", "Visual Arts")
        conn.execute("update learning_objective set unit = %s where code = %s", (unit, code))
    subject_map.apply(conn, t)
    got = {c: _code(conn, "learning_objective", c)["subject_code"] for c in cases}
    assert got == {c: want for c, (_, want) in cases.items()}
    assert subject_map.apply(conn, t)["objectives"] == 0  # a second apply moves nothing


def test_global_perspectives_art_units_go_to_art_and_geography_history_and_civics_stay(conn, t):
    subject_map.load_subjects(conn, t)
    cases = {
        "Title: Aboriginal Dot Visual arts / • Focus: Create": "ART",  # G4's own spelling of the word
        "Title: Clay and Dough Work / • Focus: Explore basic sculpting": "ART",
        "Title: Warm and Cool Colours / • Focus: Use colour": "ART",
        "Visual Arts": "ART",
        "Visual arts": "ART",
        "Title: Land Use / • Focus: Understand how land is used": "GP",
        "Title: Maps and Directions / • Focus: Understand basic map": "GP",
        "Title: World Heroes & Role Models / • Focus: Learn about": "GP",
        "Geography": "GP",
        "History": "GP",
        "Title: Exploring Texture / • Focus: Identify and feel": "ART",
        "Title: Exploring Texture – Natural & Created / • Focus: Identify and represent": "ART",
    }
    for i, unit in enumerate(cases):
        _lo(conn, t, f"T-GP-{i}", "G2", "Global perspectives")
        conn.execute("update learning_objective set unit = %s where code = %s", (f"• {unit}", f"T-GP-{i}"))
    subject_map.apply(conn, t)
    got = {u: _code(conn, "learning_objective", f"T-GP-{i}")["subject_code"] for i, u in enumerate(cases)}
    assert got == cases
    assert subject_map.apply(conn, t)["objectives"] == 0


def test_a_data_codes_alias_spelling_and_routine_resolve_and_an_unknown_one_is_none(conn, t):
    subject_map.load_subjects(conn, t)
    assert subject_map.resolve_code(conn, t, "CMP") == ("COM", "academic")
    assert subject_map.resolve_code(conn, t, "HIS") == ("GP", "academic")
    assert subject_map.resolve_code(conn, t, "MUSIC") == ("MUS", "academic")
    assert subject_map.resolve_code(conn, t, "PE") == ("PE", "academic")
    assert subject_map.resolve_code(conn, t, "RTN") == (None, "routine")
    assert subject_map.resolve_code(conn, t, "BOB") == ("SCI", "academic")  # the school's own spelling
    assert subject_map.resolve_code(conn, t, "VE") == (None, "character")
    assert subject_map.resolve_code(conn, t, "Circle Time") == (None, "routine")
    assert (
        subject_map.resolve_code(conn, t, "XYZ") is None
    )  # means nothing the school has: the loader rejects it


def test_the_value_and_character_topics_batch_two_loaded_are_left_for_placement_not_a_failed_load(conn, t):
    """The server's settings load stopped on these nine spellings (16 Nov): they are unruled labels, so the placement skill
    places them; the load goes on and names none of them."""
    labels = (
        "Bullying", "Conflict resolution", "Honesty", "Kindness and inclusion", "Peace", "Quiz", "Self-regulation",
        "Value Education", "Value education",
    )  # fmt: skip
    for i, label in enumerate(labels):
        _act(conn, t, f"T-VAL-{i}", "G1", label)
    subject_map.apply(conn, t)
    assert all(_code(conn, "activity", f"T-VAL-{i}")["subject_code"] is None for i in range(len(labels)))


def test_a_subjects_own_name_is_always_one_of_its_spellings(conn, t):
    """The deploy's settings load stopped on 'Fine motor skills', the list's own name for FMS (16 Nov): a subject's name,
    label and code need no line in the config to be known."""
    _lo(conn, t, "T-OWN-1", "K2", "Fine motor skills")
    _lo(conn, t, "T-OWN-2", "K2", "Gross motor skills")
    subject_map.apply(conn, t)
    assert _code(conn, "learning_objective", "T-OWN-1")["subject_code"] == "FMS"
    assert _code(conn, "learning_objective", "T-OWN-2")["subject_code"] == "GMS"
