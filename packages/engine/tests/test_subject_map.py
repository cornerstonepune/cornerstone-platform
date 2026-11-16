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
        "BOB": (None, "academic"),
        "I & D": (None, "academic"),
        "VE": (None, "academic"),
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
    assert left["learning_objective_placement"] >= 3


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
