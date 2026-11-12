"""CP-39 (`w2_print/tt_heads.py`): one list of heads for the timetable and the activities; a lesson holds its activity and
is offered only activities of its head; the lesson view returns that activity; a moved lesson keeps it. Each test works in
a transaction that is rolled back, on the made-up 2033 class of tests/tt_hand_world.py (placeholder activities, no child,
no real name)."""

import datetime as dt
import os
import uuid

import pytest

from engine.core import db
from engine.w2_print import fortnight_cycle as fc
from engine.w2_print import k2_day, tt_edit, tt_heads, tt_move
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

MON, THU = tw.START, tw.START + dt.timedelta(3)
# What the school's lessons and K2 activities use today (checked on live, 12 Nov 2026): the list must name all of them.
LESSON_HEADS = {
    "math", "reading", "english", "story", "me_time", "art", "pe", "general_awareness", "phonics", "rhymes", "hindi",
    "practical_life", "rhymes_dance", "routine", "clay", "memory_drawing", "cleanup", "music", "projects", "fine_motor",
    "music_guest",
}  # fmt: skip
K2_GROUPS = {
    "Story Telling", "Rhymes & Songs", "Maths", "Science & Geo", "Arts & Crafts", "Circle Time", "BOB", "English", "PLS",
    "Block Room", "FMS", "Music", "GMS", "Clay", "Dance", "Hindi", "VE", "Assembly",
}  # fmt: skip


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        yield c, w
        c.rollback()


def _activity(c, w, group, name=None):
    code = f"ACT-K2-T{uuid.uuid4().hex[:6]}"
    c.execute(
        "insert into activity (tenant_id, code, band, strand, name) values (%s, %s, 'K2', %s, %s)",
        (w["tenant"], code, group, name or f"Placeholder {group}"),
    )
    return code


def _lesson(c, w, at=(MON, "p1")):
    return tw.session_at(c, w, *at)


def _edit(c, w, at=(MON, "p1"), **change):
    return tt_edit.edit(c, str(_lesson(c, w, at)["id"]), who=w["staff"]["coordinator"]["id"], **change)


# ---- the list ---------------------------------------------------------------------------------------------------------


def test_the_list_names_every_head_a_lesson_uses_and_every_group_k2_has(world):
    c, _ = world
    heads = tt_heads.heads(c)
    assert LESSON_HEADS <= {h["code"] for h in heads}, "a lesson head the list does not name"
    assert K2_GROUPS <= {g for h in heads for g in h["groups"]}, "an activity group no head takes"
    assert len({h["code"] for h in heads}) == len(heads), "one entry per head"


def test_every_lesson_head_and_every_activity_group_on_this_database_is_in_the_list(world):
    c, _ = world
    heads = tt_heads.heads(c)
    codes, groups = {h["code"] for h in heads}, {g for h in heads for g in h["groups"]}
    used = {
        r["subject_code"]
        for r in c.execute("select distinct subject_code from session where subject_code is not null")
    }
    strands = {
        r["strand"]
        for r in c.execute("select distinct strand from activity where band = 'K2' and btrim(strand) <> ''")
    }
    assert used <= codes, f"a lesson head not in the list: {sorted(used - codes)}"
    assert strands <= groups, f"an activity group no head takes: {sorted(strands - groups)}"


def test_the_head_of_a_lesson_is_its_subject_code_or_a_fixed_lessons_words(world):
    c, _ = world
    heads = tt_heads.heads(c)
    assert tt_heads.head_of(heads, "math", "subject", "Maths") == "math"
    assert tt_heads.head_of(heads, None, "fixed", "Circle Time No Screen Day") == "circle_time"
    assert tt_heads.head_of(heads, None, "fixed", "Boarding the bus") is None
    assert tt_heads.groups_of(heads, "rhymes_dance") == ["Rhymes & Songs", "Dance"]
    assert tt_heads.groups_of(heads, "routine") == []


# ---- a lesson holds its activity -----------------------------------------------------------------------------------------


def test_a_coordinator_sets_and_clears_a_lessons_activity_with_one_history_row_each(world):
    c, w = world
    act = _activity(c, w, "Maths")
    done = _edit(c, w, activity_code=act)
    assert done["activity_code"] == act and _lesson(c, w)["activity_code"] == act
    assert _lesson(c, w)["text"] == "Maths", "the lesson's words are untouched by choosing its activity"
    _edit(c, w, activity_code="")
    assert _lesson(c, w)["activity_code"] is None
    rows = c.execute(
        "select before, after from change_log where table_name = 'session' and op = 'edit' order by at"
    ).fetchall()
    assert [(r["before"]["activity_code"], r["after"]["activity_code"]) for r in rows] == [
        (None, act),
        (act, None),
    ]


@pytest.mark.parametrize(
    "case, why",
    [
        ("other-head", "does not take"),
        ("no-such", "no activity"),
        ("routine-head", "takes no activity"),
        ("fixed-no-head", "takes no activity"),
        ("other-grade", "no activity"),
    ],
)
def test_an_activity_that_does_not_belong_is_refused_and_nothing_is_written(world, case, why):
    c, w = world
    act = {"other-head": lambda: _activity(c, w, "Story Telling"), "no-such": lambda: "ACT-NONE"}.get(
        case, lambda: _activity(c, w, "Maths")
    )()
    at = (MON, "p1")
    if case == "routine-head":
        c.execute("update session set subject_code = 'routine' where id = %s", (_lesson(c, w)["id"],))
    if case == "fixed-no-head":
        at = (MON, "circle")  # the world's fixed lesson is called "Circle": not the words a head names
    if case == "other-grade":
        act = f"ACT-K1-T{uuid.uuid4().hex[:6]}"
        c.execute(
            "insert into activity (tenant_id, code, band, strand, name) values (%s, %s, 'K1', 'Maths', 'Placeholder')",
            (w["tenant"], act),
        )
    was = c.execute("select * from session where school_class_id = %s order by id", (w["class"],)).fetchall()
    with pytest.raises(tt_edit.Refused, match=why):
        _edit(c, w, at, activity_code=act)
    assert (
        c.execute("select * from session where school_class_id = %s order by id", (w["class"],)).fetchall()
        == was
    )


def test_a_fixed_lesson_of_a_head_that_takes_activities_holds_one_but_its_words_stay_unedited(world):
    c, w = world
    circle = _lesson(c, w, (MON, "circle"))
    c.execute("update session set text = 'Circle Time No Screen Day' where id = %s", (circle["id"],))
    act = _activity(c, w, "Circle Time")
    _edit(c, w, (MON, "circle"), activity_code=act)
    assert _lesson(c, w, (MON, "circle"))["activity_code"] == act
    with pytest.raises(tt_edit.Refused, match="fixed"):
        _edit(c, w, (MON, "circle"), text="Changed words")


def test_a_frozen_fortnight_needs_a_reason_to_change_an_activity(world):
    c, w = world
    fc.move(c, w["fortnight"], "frozen", str(w["staff"]["coordinator"]["id"]))
    act = _activity(c, w, "Maths")
    with pytest.raises(fc.CycleError, match="reason"):
        _edit(c, w, activity_code=act)
    _edit(c, w, activity_code=act, reason="Test reason: the school agreed")
    assert _lesson(c, w)["activity_code"] == act


def test_the_offers_are_the_activities_of_the_lessons_head_only_with_their_counts(world):
    c, w = world
    maths, story = _activity(c, w, "Maths", "Placeholder counting"), _activity(c, w, "Story Telling")
    block = _activity(c, w, "Block Room", "Placeholder blocks")
    skill = c.execute(
        "select code from registry_skill where tenant_id = %s order by code limit 1", (w["tenant"],)
    ).fetchone()["code"]
    c.execute(
        "insert into activity_skill (tenant_id, activity_code, skill_code) values (%s, %s, %s)",
        (w["tenant"], maths, skill),
    )
    got = tt_heads.offers(c, str(_lesson(c, w)["id"]), who=w["staff"]["coordinator"]["id"])
    assert got["head"] == "math" and got["groups"] == ["Maths", "Block Room"]
    codes = {o["code"]: o for o in got["activities"]}
    assert maths in codes and block in codes and story not in codes
    assert codes[maths]["skills"] == 1 and codes[block]["skills"] == 0
    with pytest.raises(tt_edit.Refused, match="not in it"):
        tt_heads.offers(c, str(_lesson(c, w)["id"]), who=w["staff"]["educator"]["id"])


# ---- what the teacher sees, and a move --------------------------------------------------------------------------------------


def test_the_lesson_view_returns_the_lessons_own_activity_first_then_the_plan_lines(world):
    c, w = world
    own, from_plan = _activity(c, w, "Maths", "Placeholder own"), _activity(c, w, "Maths", "Placeholder plan")
    entry = c.execute(
        "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, activity_id, source)"
        " values (%s, %s, %s, 'math', 1, 'a plan line', (select id from activity where code = %s), 'test') returning id",
        (w["tenant"], w["class"], w["fortnight"], from_plan),
    ).fetchone()["id"]
    c.execute("update session set plan_entry_id = %s where id = %s", (entry, _lesson(c, w)["id"]))
    klass = {
        "id": str(w["class"]),
        "academic_year_id": w["year"],
        "campus_id": w["campus"],
        "grade": "K2",
        "section": w["section"],
    }
    cell = tw.cell(c, w, MON, "p1")
    assert cell["activity"]["code"] == from_plan and cell["head"] == "math"
    _edit(c, w, activity_code=own)
    cell = tw.cell(c, w, MON, "p1")
    assert cell["activity"]["code"] == own and cell["activity"]["chosen"] is True
    c.execute("update session set activity_code = null where id = %s", (_lesson(c, w)["id"],))
    c.execute("update session set plan_entry_id = null where id = %s", (_lesson(c, w)["id"],))
    assert tw.cell(c, w, MON, "p1")["activity"] is None and tw.cell(c, w, MON, "p1")["head"] == "math", (
        "a lesson with a head and no activity says so"
    )
    assert klass["grade"] == "K2"


def test_the_activity_page_of_a_lesson_names_its_objectives_skills_materials_and_levels(world):
    c, w = world
    act = _activity(c, w, "Maths", "Placeholder counting")
    c.execute(
        "update activity set level_0 = 'L zero', level_1 = 'L one', level_2 = 'L two', level_3 = 'L three', materials = 'Placeholder beads' where code = %s",
        (act,),
    )
    _edit(c, w, activity_code=act)
    klass = {
        "id": str(w["class"]),
        "academic_year_id": w["year"],
        "campus_id": w["campus"],
        "grade": "K2",
        "section": w["section"],
    }
    one = k2_day.period_activity(c, klass, MON, str(w["period"]["p1"]))
    assert one["chosen"] is True and one["head"] == "math"
    detail = one["activity"]
    assert detail["code"] == act and detail["levels"] == ["L zero", "L one", "L two", "L three"]
    assert (
        detail["materials_text"] == "Placeholder beads"
        and detail["objectives"] == []
        and detail["skills"] == []
    )


def test_a_lesson_moved_or_swapped_keeps_its_activity(world):
    c, w = world
    maths_act, english_act = _activity(c, w, "Maths"), _activity(c, w, "English")
    maths_lesson, english_lesson = _lesson(c, w, (MON, "p1")), _lesson(c, w, (THU, "p2"))
    c.execute("update session set activity_code = %s where id = %s", (maths_act, maths_lesson["id"]))
    c.execute("update session set activity_code = %s where id = %s", (english_act, english_lesson["id"]))
    tt_move.move(
        c, "K2", w["section"], "2033-34", MON, tw.ORD["p1"], THU, tw.ORD["p2"], who=w["staff"]["coordinator"]["id"],
        reason="Test reason: swap",
    )  # fmt: skip
    after = {
        str(r["id"]): r["activity_code"]
        for r in c.execute("select id, activity_code from session where school_class_id = %s", (w["class"],))
    }
    assert after[str(maths_lesson["id"])] == maths_act and after[str(english_lesson["id"])] == english_act


# ---- the observation on the lesson's activity (the flow no row on live has run yet) ------------------------------------------


def test_a_note_on_a_lesson_that_holds_an_activity_becomes_evidence_on_its_skills_and_shows_in_the_childs_history():
    from engine.w3_read import child_history as ch
    from engine.w3_read import voice_confirm as vc
    from tests.test_voice_class_notes import _session, _today
    from tests.voice_rows import a_k2_class, a_note

    with db.connect() as c:
        k = a_k2_class(c)
        lesson = _session(c, k, _today(c))
        c.execute("update session set activity_code = %s where id = %s", (k["activity"], lesson))
        note = a_note(c, k, "Above 3.")  # a note that names no activity: the lesson's own is the one
        c.execute("update pii.educator_note set session_id = %s where id = %s", (lesson, note["id"]))
        done = vc.confirm_note(c, str(note["id"]), k["email"], vc.Confirmed("", 2, {"above": ["3"]}))
        obs = c.execute("select * from activity_observation where confirmation_id = %s", (done,)).fetchone()
        assert str(obs["session_id"]) == lesson and obs["activity_code"] == k["activity"]
        marks = c.execute(
            "select skill_code from evidence_event where observation_id = %s order by skill_code",
            (obs["id"],),
        ).fetchall()
        assert [r["skill_code"] for r in marks] == sorted(k["skills"]) and k["skills"], (
            "evidence on the activity's skills"
        )
        seen = [
            e for e in ch.history(c, k["email"], k["class"], "3")["entries"] if e["kind"] == "observation"
        ]
        assert (
            seen and seen[0]["what"]["activity"] == k["activity"] and seen[0]["what"]["session_id"] == lesson
        )
        c.rollback()
