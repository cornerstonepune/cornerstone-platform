"""ADR 0113: the K1 pilot's activity choices are offered, and a K1 mark is evidence that reaches the observed picture.

The settings reach the database the way a release puts them there: live holds `timetable.heads` and `observed.weights` as
first loaded (seed_once), and K1 with no observed rule, so the test puts that state back, runs the migration over the loaded
test database (a fresh database runs migrations before `engine load`) and checks it lands exactly the seed file's values.
Rolls back."""

import json
import os
from pathlib import Path

import psycopg
import pytest

from engine.core import db, subject_map
from engine.w1_bank import apply_seed
from engine.w2_print import tt_heads
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "20270218090000_k1_pilot_offers.sql"
SEED = {
    c["key"]: c["value"]
    for c in json.loads((ROOT / "supabase" / "seed" / "config.json").read_text())["config"]
}

# live's timetable.heads before the release: the seed's, less what ADR 0113 adds
ADDED = {
    "art": ["Art & Craft"], "rhymes": ["Rhymes"], "music": ["Rhymes"],
    "general_awareness": ["Sci & Geo"], "memory_drawing": ["Sci & Geo"],
}  # fmt: skip
# the signed-off K1 choices offered without a head coming to teach a new subject (ADR 0113): lesson head, text, activity
CHOICES = [
    ("music", "Music (Guest) Rhymes. P2 The Sun And The Moon", "ACT-K1-F001"),
    ("rhymes", "Rhymes. P1 The Sun And The Moon", "ACT-K1-F001"),
    ("art", "Extracurricular Art Painting Branch", "ACT-K1-1202"),
    (
        "memory_drawing",
        "Extracurricular Memory Drawing Academic 1 General Awareness Wild/Domestic",
        "ACT-K1-0630",
    ),
]
SKILLS = {
    "ACT-K1-F001": "LIT.SPK.05", "ACT-K1-F002": "MOT.PRW.05", "ACT-K1-F003": "MOT.PRW.04",
    "ACT-K1-F004": "HIN.VOC.01", "ACT-K1-F005": "HIN.VARN.01", "ACT-K1-F006": "ART.VIS.03",
}  # fmt: skip


def _before() -> list[dict]:
    return [
        {**h, "groups": [g for g in h["groups"] if g not in ADDED.get(h["code"], [])]}
        for h in SEED["timetable.heads"]
    ]


@pytest.fixture
def conn():
    with db.connect() as c:
        t = tenant(c)
        apply_seed.apply(
            c, t, True, part="activities"
        )  # the six F.N 10 activities, as live has them (ADR 0111)
        for key, value in (
            ("timetable.heads", _before()),
            ("observed.weights", {"K2": SEED["observed.weights"]["K2"]}),
        ):
            c.execute(
                "update config set value = %s where tenant_id = %s and key = %s", (json.dumps(value), t, key)
            )
        c.execute(
            "update grade set secure_level = null, secure_days = null, recheck_days = null, min_adults = 2"
            " where tenant_id = %s and code = 'K1'",
            (t,),
        )
        c.execute(
            "delete from activity_skill where tenant_id = %s and activity_code = any(%s)", (t, list(SKILLS))
        )
        c.execute(MIGRATION.read_text())
        yield c
        c.rollback()


def _value(conn, key):
    return conn.execute(
        "select value from config where tenant_id = %s and key = %s", (tenant(conn), key)
    ).fetchone()["value"]


def test_the_migration_lands_the_seed_files_settings_and_keeps_every_earlier_group(conn):
    got = {h["code"]: h for h in _value(conn, "timetable.heads")}
    assert got == {h["code"]: h for h in SEED["timetable.heads"]}
    for h in _before():  # nothing a K2 or Grade 1 to 4 lesson was offered is taken away
        assert set(h["groups"]) <= set(got[h["code"]]["groups"]), h["code"]
    assert _value(conn, "observed.weights") == SEED["observed.weights"]
    k1 = conn.execute(
        "select min_adults from grade where tenant_id = %s and code = 'K1'", (tenant(conn),)
    ).fetchone()
    assert k1["min_adults"] == 1  # Nimish, 26 Nov (ADR 0113)
    conn.execute(MIGRATION.read_text())  # a second run changes nothing
    assert {h["code"]: h for h in _value(conn, "timetable.heads")} == got


def test_no_head_comes_to_teach_a_new_subject(conn):
    """A head's groups also say which subject it teaches (offer sequence, objectives, who may edit): ADR 0113 changes none."""
    spell = subject_map.spellings(conn, tenant(conn))
    after = _value(conn, "timetable.heads")
    for subject in sorted(set(spell.values())):
        assert tt_heads.heads_in(after, spell, [subject]) == tt_heads.heads_in(_before(), spell, [subject]), (
            subject
        )


@pytest.mark.parametrize(("head", "text", "activity"), CHOICES)
def test_each_signed_off_k1_choice_is_offered(conn, head, text, activity):
    lesson = {
        "tenant_id": tenant(conn),
        "subject_code": head,
        "kind": "subject",
        "text": text,
        "grade_code": "K1",
    }
    tt_heads.ensure_offered(conn, lesson, activity)  # refuses (raises) when not offered


def test_the_six_new_k1_activities_reach_their_chosen_skill_as_the_schools(conn):
    got = conn.execute(
        "select activity_code, skill_code, source from activity_skill where tenant_id = %s and activity_code = any(%s)",
        (tenant(conn), list(SKILLS)),
    ).fetchall()
    assert {(r["activity_code"], r["skill_code"], r["source"]) for r in got} == {
        (a, s, "school") for a, s in SKILLS.items()
    }


def test_the_migration_refuses_to_leave_a_new_k1_activity_without_a_school_skill(conn):
    conn.execute(
        "delete from activity_skill where tenant_id = %s and activity_code = 'ACT-K1-F001'", (tenant(conn),)
    )
    with pytest.raises(psycopg.errors.RaiseException, match="ACT-K1-F001"):
        conn.execute(MIGRATION.read_text().replace("'LIT.SPK.05'", "'NO.SUCH.01'"))


def test_a_k1_lesson_mark_is_evidence_and_builds_the_childs_observed_state(conn):
    from engine.w3_read import lesson_level
    from tests.test_voice_confirm import _lesson
    from tests.voice_rows import a_k2_class

    k = a_k2_class(conn)
    conn.execute("update school_class set grade_code = 'K1' where id = %s", (k["class"],))
    k["activity"] = "ACT-K1-F001"
    child = k["children"]["1"]
    r = lesson_level.mark(conn, k["email"], k["class"], _lesson(conn, k, None), [lesson_level.Mark(child, 3)])
    assert not r["activity_has_no_skills"] and r["evidence_written"] == 5  # five children, one skill each
    assert [e["skill_code"] for e in conn.execute(
        "select skill_code from evidence_event where child_id = %s", (child,)
    ).fetchall()] == ["LIT.SPK.05"]  # fmt: skip
    state = conn.execute(
        "select grade_code, skill_code, state from graph_observed_states(%s)", (child,)
    ).fetchall()
    assert [(s["grade_code"], s["skill_code"]) for s in state] == [("K1", "LIT.SPK.05")]
