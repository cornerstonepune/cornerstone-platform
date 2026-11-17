"""CP-70 (specs/CP-70/spec.md): a coordinator edits an objective or an activity in place, and an objective or an activity sits in more
than one grade. One test per Done-when line of the engine part; rolled back, placeholder rows only (no school data, no names)."""

import os
import uuid

import pytest

from engine.core import db
from engine.w1_bank import apply_seed
from engine.w1_bank import curriculum_edit as ce
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def world():
    with db.connect() as c:
        t = db.one(c, "select id from tenant limit 1")["id"]
        campus = db.one(c, "select id from campus where tenant_id = %s limit 1", (t,))["id"]
        k = a_k2_class(c)  # an educator who holds one class, with a placeholder email
        boss = db.one(
            c, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus)
        )["id"]
        c.execute("insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder', %s)",
                  (t, boss, f"coordinator-{uuid.uuid4().hex[:8]}@example.org"))  # fmt: skip
        c.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)"
            " values (%s, %s, 'coordinator', '2026-01-01', 'test')",
            (t, boss),
        )
        staff = {"coordinator": boss, "educator": k["staff"]}
        subjects = [
            r["code"]
            for r in c.execute("select code from subject where tenant_id = %s order by code limit 2", (t,))
        ]
        tag = uuid.uuid4().hex[:6]
        lo = f"LO-G2-T{tag}"
        c.execute(
            "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)"
            " values (%s, %s, 'G2', 'Old subject', 'Old unit', 'Old title', 'Foundational', 'machine', %s)",
            (t, lo, subjects[0]),
        )
        act = f"ACT-G2-T{tag}"
        c.execute(
            "insert into activity (tenant_id, code, band, strand, name, steps, materials, level_0, level_1, level_2, level_3)"
            " values (%s, %s, 'G2', 'Maths', 'Old name', 'Old steps', 'Old materials', 'a', 'b', 'c', 'd')",
            (t, act),
        )
        skill = db.one(c, "select code from registry_skill where tenant_id = %s order by code limit 1", (t,))[
            "code"
        ]
        yield {"c": c, "t": t, "staff": staff, "subjects": subjects, "lo": lo, "act": act, "skill": skill}
        c.rollback()


def _lo(w) -> dict:
    return db.one(
        w["c"], "select * from learning_objective where tenant_id = %s and code = %s", (w["t"], w["lo"])
    )


def _act(w) -> dict:
    return db.one(w["c"], "select * from activity where tenant_id = %s and code = %s", (w["t"], w["act"]))


def _boss(w):
    return w["staff"]["coordinator"]


def test_1_an_objective_edit_changes_title_subject_unit_reads_as_a_persons_and_a_reload_leaves_it(world):
    w = world
    out = ce.edit_objective(
        w["c"],
        w["t"],
        _boss(w),
        w["lo"],
        {"title": "New title", "unit": "New unit", "subject_code": w["subjects"][1]},
    )
    row = _lo(w)
    label = db.one(
        w["c"],
        "select coalesce(label, name) as n from subject where tenant_id = %s and code = %s",
        (w["t"], w["subjects"][1]),
    )["n"]
    assert (row["title"], row["unit"], row["subject_code"], row["subject"], row["source"]) == (
        "New title", "New unit", w["subjects"][1], label, "person")  # fmt: skip
    assert out["title"] == "New title" and out["grades"] == ["G2"]
    # the loader meets the same objective again, with other words: the person's stand
    lo = {
        "code": w["lo"],
        "band": "G2",
        "subject_code": w["subjects"][0],
        "title": "The seed's title",
        "unit": "Seed unit",
    }
    apply_seed._new_lo(w["c"], w["t"], lo, apply_seed.Report())
    assert (_lo(w)["title"], _lo(w)["unit"]) == ("New title", "New unit")


def test_2_adding_a_grade_puts_the_objective_in_that_grade_and_removing_it_takes_it_out_and_nothing_is_deleted(
    world,
):
    w = world
    assert ce.add_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G3") == ["G2", "G3"]
    ce.add_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G1")
    in_grade = "select count(*) as n from learning_objective where tenant_id = %s and code = %s and (band = %s or %s = any (also_bands))"
    for g in ("G1", "G2", "G3"):
        assert db.one(w["c"], in_grade, (w["t"], w["lo"], g, g))["n"] == 1
    assert ce.remove_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G3") == ["G2", "G1"]
    assert db.one(w["c"], in_grade, (w["t"], w["lo"], "G3", "G3"))["n"] == 0
    assert _lo(w)["retired"] is False and _lo(w)["title"] == "Old title"
    assert ce.add_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G1") == [
        "G2",
        "G1",
    ]  # again: no change, no error


def test_3_the_last_grade_stays_the_home_grade_is_handed_on_and_an_unknown_grade_is_refused(world):
    w = world
    with pytest.raises(ce.Refused, match="at least one grade"):
        ce.remove_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G2")
    ce.add_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G3")
    assert ce.remove_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G2") == ["G3"]
    assert (_lo(w)["band"], _lo(w)["also_bands"]) == ("G3", [])
    with pytest.raises(ce.Refused, match="not a grade"):
        ce.add_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G99")
    with pytest.raises(ce.Refused, match="not in"):
        ce.remove_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G1")


def test_4_an_activity_edit_changes_its_words_links_and_grades_and_a_reload_leaves_it(world):
    w = world
    ce.edit_activity(
        w["c"],
        w["t"],
        _boss(w),
        w["act"],
        {"name": "New name", "steps": "New steps", "materials": "Chalk", "level_2": "Does it"},
    )
    a = _act(w)
    assert (a["name"], a["steps"], a["materials"], a["level_2"], a["level_0"]) == (
        "New name",
        "New steps",
        "Chalk",
        "Does it",
        "a",
    )
    ce.link(w["c"], w["t"], _boss(w), "activity_skill", w["act"], w["skill"])
    ce.link(w["c"], w["t"], _boss(w), "activity_objective", w["act"], w["lo"])
    ce.add_grade(w["c"], w["t"], _boss(w), "activity", w["act"], "G3")
    got = lambda sql: db.one(w["c"], sql, (w["t"], w["act"]))["n"]  # noqa: E731
    assert (
        got(
            "select count(*) as n from activity_skill where tenant_id = %s and activity_code = %s and source = 'person'"
        )
        == 1
    )
    assert (
        got(
            "select count(*) as n from activity_objective where tenant_id = %s and activity_code = %s and source = 'person'"
        )
        == 1
    )
    assert _act(w)["also_bands"] == ["G3"]
    ce.unlink(w["c"], w["t"], _boss(w), "activity_skill", w["act"], w["skill"])
    assert got("select count(*) as n from activity_skill where tenant_id = %s and activity_code = %s") == 0
    with pytest.raises(ce.Refused, match="Name"):
        ce.edit_activity(w["c"], w["t"], _boss(w), w["act"], {"name": "  "})
    from engine.w1_bank.seed_activity import by_a_person

    assert by_a_person(
        w["c"], w["t"], "activity", w["act"]
    )  # what the loader reads before it refreshes an activity


def test_5_every_edit_is_a_history_row_with_who_when_before_and_after_and_the_history_can_be_read(world):
    w = world
    ce.edit_objective(w["c"], w["t"], _boss(w), w["lo"], {"title": "One"}, reason="a clearer word")
    ce.add_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G3")
    rows = ce.history(w["c"], w["t"], "objective", w["lo"])
    assert [r["what"] for r in rows] == ["also_bands", "title"]  # newest first
    title = rows[1]
    assert (title["before"], title["after"], title["staff_id"], title["reason"]) == (
        "Old title",
        "One",
        _boss(w),
        "a clearer word",
    )
    assert title["at"] is not None and rows[0]["after"] == ["G3"]


def test_6_undo_takes_back_one_edit_as_a_new_row_and_is_refused_when_a_later_edit_touched_the_same_field(
    world,
):
    w = world
    ce.edit_objective(w["c"], w["t"], _boss(w), w["lo"], {"title": "One"})
    ce.edit_objective(w["c"], w["t"], _boss(w), w["lo"], {"unit": "Other unit"})
    ce.edit_objective(w["c"], w["t"], _boss(w), w["lo"], {"title": "Two"})
    first, unit, second = (r["id"] for r in reversed(ce.history(w["c"], w["t"], "objective", w["lo"])))
    with pytest.raises(ce.Refused, match="later change"):
        ce.undo(w["c"], w["t"], _boss(w), first)
    ce.undo(w["c"], w["t"], _boss(w), unit)  # nothing after it touched the unit
    assert _lo(w)["unit"] == "Old unit" and _lo(w)["title"] == "Two"
    ce.undo(w["c"], w["t"], _boss(w), second)
    assert _lo(w)["title"] == "One"
    assert (
        len(ce.history(w["c"], w["t"], "objective", w["lo"])) == 5
    )  # the three edits and two undos: nothing was erased
    ce.add_grade(w["c"], w["t"], _boss(w), "objective", w["lo"], "G3")
    link_edit = ce.link(w["c"], w["t"], _boss(w), "activity_skill", w["act"], w["skill"])
    assert link_edit == "added"
    added = ce.history(w["c"], w["t"], "activity", w["act"])[0]
    ce.undo(w["c"], w["t"], _boss(w), added["id"])  # a link added is taken back by removing it
    assert (
        db.one(
            w["c"],
            "select count(*) as n from activity_skill where tenant_id = %s and activity_code = %s",
            (w["t"], w["act"]),
        )["n"]
        == 0
    )


def test_7_only_a_coordinator_writes_and_nothing_is_written_for_anyone_else(world):
    w = world
    with pytest.raises(ce.Refused) as no:
        ce.edit_objective(w["c"], w["t"], w["staff"]["educator"], w["lo"], {"title": "Nope"})
    assert no.value.status == 403 and _lo(w)["title"] == "Old title"
    for call in (
        lambda: ce.add_grade(w["c"], w["t"], w["staff"]["educator"], "objective", w["lo"], "G3"),
        lambda: ce.edit_activity(w["c"], w["t"], w["staff"]["educator"], w["act"], {"name": "Nope"}),
        lambda: ce.link(w["c"], w["t"], w["staff"]["educator"], "activity_skill", w["act"], w["skill"]),
        lambda: ce.undo(w["c"], w["t"], w["staff"]["educator"], str(uuid.uuid4())),
    ):
        with pytest.raises(ce.Refused) as refused:
            call()
        assert refused.value.status == 403
    assert _lo(w)["also_bands"] == [] and _act(w)["name"] == "Old name"
    assert (
        ce.history(w["c"], w["t"], "objective", w["lo"]) == []
    )  # a person may read it; the history shows nothing was written


def test_7_the_door_refuses_a_stranger_and_an_educator_and_lets_a_coordinator_through(world, monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import deps
    from engine.api.app import app

    w = world
    email = lambda sid: db.one(w["c"], "select email from pii.staff where staff_id = %s", (sid,))["email"]  # noqa: E731
    monkeypatch.setenv("ENGINE_KEY", "k")
    app.dependency_overrides[deps.get_conn] = lambda: (yield w["c"])
    try:
        with TestClient(app, headers={"X-Engine-Key": "k"}) as client:
            ask = lambda who: client.post(  # noqa: E731
                "/curriculum/edit/objective",
                json={"actor": who, "code": w["lo"], "changes": {"title": "Door"}},
            )
            assert ask("nobody@example.test").status_code == 403
            assert ask(email(w["staff"]["educator"])).status_code == 403 and _lo(w)["title"] == "Old title"
            assert ask(email(_boss(w))).status_code == 200 and _lo(w)["title"] == "Door"
    finally:
        app.dependency_overrides.clear()
