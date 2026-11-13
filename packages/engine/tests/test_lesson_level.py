"""CP-49 (backend, Done when 4, 5, 6): the level each child reached in a lesson, through the routes
`POST /lesson/level` and `POST /lesson/level/read`. Placeholder class, educators and children (tests/voice_rows.py),
inside a rolled-back transaction: no school data, no name."""

import json
import os
import uuid

import pytest

from engine.assess import graph
from engine.core import db
from tests.test_voice_class_notes import _session, _today
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def api(conn, monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import deps
    from engine.api.app import app

    monkeypatch.setenv("ENGINE_KEY", "k")
    app.dependency_overrides[deps.get_conn] = lambda: (yield conn)
    try:
        with TestClient(app, headers={"X-Engine-Key": "k"}) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def lesson(conn):
    """A K2 class with an activity naming two skills, and a lesson of it that holds the activity."""
    k = a_k2_class(conn)
    k["session"] = _session(conn, k, _today(conn))
    conn.execute("update session set activity_code = %s where id = %s", (k["activity"], k["session"]))
    return k


def _staff(conn, k, role: str, *, on_class: bool = True) -> str:
    """Another member of staff with an open grant in `role`; returns her email."""
    tag = uuid.uuid4().hex[:6]
    campus = conn.execute("select campus_id from school_class where id = %s", (k["class"],)).fetchone()[
        "campus_id"
    ]
    sid = conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (k["tenant"], campus)
    ).fetchone()["id"]
    email = f"placeholder.{tag}@example.test"
    conn.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder', %s)",
        (k["tenant"], sid, email),
    )
    conn.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)"
        " values (%s, %s, %s, %s, '2026-01-01', 'test')",
        (k["tenant"], sid, role, k["class"] if on_class else None),
    )
    return email


def _put(api, k, marks=(), actor=None, **more):
    return api.post(
        "/lesson/level",
        json={"actor": actor or k["email"], "class_id": k["class"], "session_id": k["session"],
              "marks": list(marks), **more},
    )  # fmt: skip


def _read(api, k, actor=None):
    return api.post(
        "/lesson/level/read",
        json={"actor": actor or k["email"], "class_id": k["class"], "session_id": k["session"]},
    )


def _rows(conn, child):
    return conn.execute(
        "select * from activity_observation where child_id = %s order by stored_at, created_at", (child,)
    ).fetchall()


def _evidence(conn, observation_id):
    return conn.execute(
        "select skill_code, mark from evidence_event where observation_id = %s", (observation_id,)
    ).fetchall()


# --- Done when 4: what is written -------------------------------------------------------------------------------


def test_a_level_is_one_observation_and_one_evidence_row_per_skill_with_the_configured_mark(
    conn, api, lesson
):
    k = lesson
    marks = [{"child_id": k["children"][str(i)], "level": i} for i in (1, 2, 3)]
    r = _put(api, k, marks)
    assert r.status_code == 200, r.text
    assert r.json() | {"confirmation_id": None} == {
        "confirmation_id": None, "written": 3, "evidence_written": 6, "activity_has_no_skills": False,
    }  # fmt: skip
    for level, mark in ((1, "not_yet"), (2, "sometimes"), (3, "yes")):
        (o,) = _rows(conn, k["children"][str(level)])
        assert (o["reached_level"], o["expected_level"], o["outcome"], o["entry_mode"], o["route"]) == (
            level, level, "as_expected", "individual", "form",
        )  # fmt: skip
        assert str(o["session_id"]) == k["session"] and o["supersedes"] is None
        assert sorted((e["skill_code"], e["mark"]) for e in _evidence(conn, o["id"])) == sorted(
            (s, mark) for s in k["skills"]
        )


def test_level_0_is_evidence_only_because_the_config_row_has_a_mark_for_it(conn, api, lesson):
    k = lesson
    child = k["children"]["1"]
    assert _put(api, k, [{"child_id": child, "level": 0}]).json()["evidence_written"] == 2
    assert {e["mark"] for e in _evidence(conn, _rows(conn, child)[0]["id"])} == {"not_yet"}
    # the school's row drops level 0: no evidence, and no code changed
    marks = json.dumps({"1": "not_yet", "2": "sometimes", "3": "yes"})
    conn.execute("update config set value = %s::jsonb where key = 'voice.level_mark'", (marks,))
    other = k["children"]["2"]
    r = _put(api, k, [{"child_id": other, "level": 0}]).json()
    assert (r["written"], r["evidence_written"]) == (1, 0)
    assert len(_rows(conn, other)) == 1 and not _evidence(conn, _rows(conn, other)[0]["id"])


def test_absent_and_not_willing_write_the_observation_only(conn, api, lesson):
    k = lesson
    a, b = k["children"]["1"], k["children"]["2"]
    r = _put(api, k, [{"child_id": a, "status": "absent"}, {"child_id": b, "status": "not_willing"}])
    assert r.json() | {"confirmation_id": None} == {
        "confirmation_id": None, "written": 2, "evidence_written": 0, "activity_has_no_skills": False,
    }  # fmt: skip
    for child, status in ((a, "absent"), (b, "not_willing")):
        (o,) = _rows(conn, child)
        assert o["outcome"] == status and o["reached_level"] is None and not _evidence(conn, o["id"])
    shown = {m["child_id"]: (m["level"], m["status"]) for m in _read(api, k).json()["marks"]}
    assert shown == {a: (None, "absent"), b: (None, "not_willing")}


def test_an_activity_naming_no_skill_writes_the_observation_and_says_so(conn, api, lesson):
    k = lesson
    conn.execute("delete from activity_skill where activity_code = %s", (k["activity"],))
    r = _put(api, k, [{"child_id": k["children"]["1"], "level": 3}])
    assert r.json() | {"confirmation_id": None} == {
        "confirmation_id": None, "written": 1, "evidence_written": 0, "activity_has_no_skills": True,
    }  # fmt: skip
    assert len(_rows(conn, k["children"]["1"])) == 1


def test_the_rest_gets_the_level_but_a_child_already_marked_keeps_hers(conn, api, lesson):
    k = lesson
    c = k["children"]
    assert (
        _put(api, k, [{"child_id": c["1"], "level": 3}, {"child_id": c["2"], "status": "absent"}]).status_code
        == 200
    )
    r = _put(api, k, [{"child_id": c["3"], "level": 1}], rest_level=2)
    assert (r.json()["written"], r.json()["evidence_written"]) == (
        3,
        6,
    )  # 3 explicit + rest = children 4 and 5
    shown = {m["child_id"]: (m["level"], m["status"]) for m in _read(api, k).json()["marks"]}
    assert shown == {
        c["1"]: (3, None), c["2"]: (None, "absent"), c["3"]: (1, None), c["4"]: (2, None), c["5"]: (2, None),
    }  # fmt: skip
    assert all(len(_rows(conn, ch)) == 1 for ch in c.values())  # nothing superseded by the rest


def test_the_rest_is_only_children_enrolled_that_day(conn, api, lesson):
    k = lesson
    conn.execute(
        "update enrolment set to_date = %s - 1 where child_id = %s", (_today(conn), k["children"]["5"])
    )
    assert _put(api, k, rest_level=1).json()["written"] == 4
    assert not _rows(conn, k["children"]["5"])


# --- Done when 5: a change supersedes, nothing is updated or deleted ---------------------------------------------


def test_changing_a_level_writes_a_new_row_superseding_the_old_which_stays_with_its_evidence(
    conn, api, lesson
):
    k = lesson
    child = k["children"]["1"]
    _put(api, k, [{"child_id": child, "level": 3}])
    (first,) = _rows(conn, child)
    before = dict(first)
    again = _put(api, k, [{"child_id": child, "level": 3}])  # the same mark again changes nothing
    assert again.json()["written"] == 0 and len(_rows(conn, child)) == 1
    second = _put(api, k, [{"child_id": child, "level": 1}])
    assert second.json()["written"] == 1 and second.json()["evidence_written"] == 2
    old, new = _rows(conn, child)
    assert dict(old) == before | {"updated_at": old["updated_at"]} and old["reached_level"] == 3
    assert new["supersedes"] == old["id"] and new["reached_level"] == 1 and new["reason"]
    assert {e["mark"] for e in _evidence(conn, old["id"])} == {"yes"} and len(_evidence(conn, old["id"])) == 2
    assert {e["mark"] for e in _evidence(conn, new["id"])} == {"not_yet"}
    (current,) = _read(api, k).json()["marks"]
    assert (current["level"], current["confirmation_id"]) == (1, str(new["confirmation_id"]))
    third = _put(
        api, k, [{"child_id": child, "status": "absent"}]
    )  # and a status replaces a level the same way
    assert third.json()["evidence_written"] == 0 and len(_rows(conn, child)) == 3
    assert [(m["level"], m["status"]) for m in _read(api, k).json()["marks"]] == [(None, "absent")]


# --- Done when 6: the graph sees the new level ------------------------------------------------------------------


def _observed(conn, child):
    graph.rebuild(conn, child)
    return sorted(
        (r["skill_code"], r["state"])
        for r in conn.execute(
            "select skill_code, state from child_skill_state where kind = 'observed' and child_id = %s",
            (child,),
        ).fetchall()
    )


def test_after_the_graph_is_rebuilt_a_child_stands_on_her_new_level_and_not_the_old(conn, api, lesson):
    k = lesson
    changed, steady_low = k["children"]["1"], k["children"]["2"]
    _put(api, k, [{"child_id": changed, "level": 3}, {"child_id": steady_low, "level": 0}])
    high, low = _observed(conn, changed), _observed(conn, steady_low)
    assert high and low and high != low  # level 3 and level 0 are told apart by the graph
    _put(api, k, [{"child_id": changed, "level": 0}])
    assert _observed(conn, changed) == low  # now as a child who was only ever seen at level 0
    _put(api, k, [{"child_id": changed, "level": 3}])
    assert _observed(conn, changed) == high  # and back


# --- who may, which lesson, which children ------------------------------------------------------------------------


def test_a_member_of_staff_who_does_not_record_for_the_class_and_is_no_coordinator_is_refused(
    conn, api, lesson
):
    k = lesson
    child = k["children"]["1"]
    stranger = _staff(conn, k, "ops", on_class=False)
    other_class = a_k2_class(conn)["email"]  # a recording role, but on another class
    for who in (stranger, other_class, "nobody@example.test"):
        assert _put(api, k, [{"child_id": child, "level": 1}], actor=who).status_code == 403
        assert _read(api, k, actor=who).status_code == 403
    assert not _rows(conn, child)


def test_a_coordinator_who_reads_the_class_may_mark_and_the_marks_say_another(conn, api, lesson):
    k = lesson
    coordinator = _staff(conn, k, "coordinator", on_class=False)
    child = k["children"]["1"]
    assert _put(api, k, [{"child_id": child, "level": 2}], actor=coordinator).status_code == 200
    (m,) = _read(api, k).json()["marks"]  # the class teacher reads it
    assert m["by"] == "another" and m["level"] == 2
    (m,) = _read(api, k, actor=coordinator).json()["marks"]
    assert m["by"] == "you"
    _put(api, k, [{"child_id": child, "level": 3}])  # the class teacher changes it: hers now
    assert _read(api, k, actor=coordinator).json()["marks"][0]["by"] == "another"
    assert _read(api, k).json()["marks"][0]["by"] == "you"


def test_a_lesson_of_another_class_or_no_lesson_is_404(conn, api, lesson):
    k = lesson
    mine = {"actor": k["email"], "class_id": k["class"]}
    for bad in (str(uuid.uuid4()), "not-an-id"):
        for path in ("/lesson/level", "/lesson/level/read"):
            assert api.post(path, json=mine | {"session_id": bad, "marks": []}).status_code == 404
    other = a_k2_class(conn)
    foreign = _session(conn, other, _today(conn))
    assert api.post("/lesson/level", json=mine | {"session_id": foreign, "marks": []}).status_code == 404


def test_a_lesson_with_no_activity_is_409_and_the_plan_entry_activity_is_the_fallback(conn, api, lesson):
    k = lesson
    child = k["children"]["1"]
    conn.execute("update session set activity_code = null where id = %s", (k["session"],))
    assert _put(api, k, [{"child_id": child, "level": 1}]).status_code == 409
    assert _read(api, k).json()["activity_code"] is None
    entry = _plan_entry_with_activity(conn, k)
    conn.execute("update session set plan_entry_id = %s where id = %s", (entry, k["session"]))
    assert _put(api, k, [{"child_id": child, "level": 1}]).status_code == 200
    assert _rows(conn, child)[0]["activity_code"] == k["activity"]
    assert _read(api, k).json()["activity_code"] == k["activity"]


def _plan_entry_with_activity(conn, k) -> str:
    """A planner line of the class, linked to the activity by its exact name."""
    year = conn.execute("select academic_year_id from school_class where id = %s", (k["class"],)).fetchone()
    fortnight = conn.execute(
        "insert into fortnight (tenant_id, academic_year_id, kind, starts_on, ends_on)"
        " values (%s, %s, 'buffer', '2031-01-01', '2031-01-14') returning id",
        (k["tenant"], year["academic_year_id"]),
    ).fetchone()["id"]
    return str(
        conn.execute(
            "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, activity_id,"
            " link_rule, source) select %s, %s, %s, 'k', 1, 'x', id, 'exact_name', 'test' from activity"
            " where tenant_id = %s and code = %s returning id",
            (k["tenant"], k["class"], fortnight, k["tenant"], k["activity"]),
        ).fetchone()["id"]
    )


def test_a_child_not_enrolled_that_day_or_a_bad_level_is_422_and_nothing_is_written(conn, api, lesson):
    k = lesson
    good = k["children"]["1"]
    stranger = a_k2_class(conn)["children"]["1"]
    for marks in (
        [{"child_id": good, "level": 1}, {"child_id": stranger, "level": 1}],
        [{"child_id": good, "level": 4}],
        [{"child_id": good, "level": -1}],
        [{"child_id": good, "level": 1, "status": "absent"}],
        [{"child_id": good}],
        [{"child_id": good, "status": "sick"}],
        [{"child_id": good, "level": 1}, {"child_id": good, "level": 2}],
        [{"child_id": "not-an-id", "level": 1}],
    ):
        assert _put(api, k, marks).status_code == 422, marks
    assert _put(api, k, rest_level=7).status_code == 422
    assert (
        _put(api, k, [{"child_id": good, "level": 1}], day="2020-01-01").status_code == 422
    )  # before enrolment
    assert not _rows(conn, good)


# --- the read ---------------------------------------------------------------------------------------------------


def test_the_read_has_the_contract_shape_and_no_name(conn, api, lesson):
    k = lesson
    assert _read(api, k).json() == {"activity_code": k["activity"], "marks": []}
    _put(api, k, [{"child_id": k["children"]["1"], "level": 2}])
    body = _read(api, k).json()
    (m,) = body["marks"]
    assert set(body) == {"activity_code", "marks"}
    assert set(m) == {"child_id", "level", "status", "confirmation_id", "by", "marked_at"}
    assert (m["child_id"], m["level"], m["status"], m["by"]) == (k["children"]["1"], 2, None, "you")
    assert m["marked_at"]
