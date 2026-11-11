"""CP-31: a level's sentence changed from the engine (engine/w1_bank/level_words.py, engine/api/routes/levels.py).
One test per Done-when line of specs/CP-31/spec.md, on a skill the seed holds, in a rolled-back transaction."""

import json
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from tests.test_notes_history_and_coordinator import _coordinator
from tests.voice_rows import a_k2_class

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}
NEW = "Says the number before and the number after, up to twenty."


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    with db.connect() as conn:
        k = a_k2_class(conn)
        boss = _coordinator(conn, k)
        conn.execute("update config set value = 'false'::jsonb where key = 'educator.timetable_enabled'")
        skill = conn.execute(
            "select code, (select array_agg(key order by key) from jsonb_object_keys(difficulty) key) as levels"
            " from skill where (select count(*) from jsonb_object_keys(difficulty)) >= 2 order by code limit 1"
        ).fetchone()
        a, b = skill["levels"][:2]
        mark = {"by": "test", "at": "2026-01-01T00:00:00+00"}
        conn.execute(
            "update skill set level_approved = %s::jsonb where code = %s",
            (json.dumps({a: mark, b: mark}), skill["code"]),
        )
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield {
                    "client": client,
                    "conn": conn,
                    "k": k,
                    "boss": boss,
                    "skill": skill["code"],
                    "a": a,
                    "b": b,
                }
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _change(w, actor, words=NEW, level=None, **extra):
    body = {"actor": actor, "skill": w["skill"], "level": level or w["a"], "words": words}
    return w["client"].post("/curriculum/level-words", headers=H, json=body | extra)


def _snapshot(w):
    return (
        w["conn"]
        .execute("select difficulty, level_approved from skill where code = %s", (w["skill"],))
        .fetchone()
    )


def test_1_a_stranger_and_a_person_without_a_review_role_cannot_change_but_the_latter_can_read(world):
    w = world
    before = _snapshot(w)
    assert w["client"].post("/curriculum/level-words", json={}).status_code == 401
    assert _change(w, "nobody@example.org").status_code == 403
    assert _change(w, w["k"]["email"]).status_code == 403  # an educator, switch off
    assert _snapshot(w) == before
    r = w["client"].post(
        "/curriculum/level-words/history",
        headers=H,
        json={"actor": w["boss"], "skill": w["skill"], "level": w["a"]},
    )
    assert r.status_code == 200


def test_2_and_3_only_that_levels_words_change_and_only_its_approval_goes(world):
    w = world
    before = _snapshot(w)
    r = _change(w, w["boss"])
    assert r.status_code == 200, r.text
    after = _snapshot(w)
    assert after["difficulty"][w["a"]]["words"] == NEW
    assert {k: v for k, v in after["difficulty"][w["a"]].items() if k != "words"} == {
        k: v for k, v in before["difficulty"][w["a"]].items() if k != "words"
    }
    assert {k: v for k, v in after["difficulty"].items() if k != w["a"]} == {
        k: v for k, v in before["difficulty"].items() if k != w["a"]
    }
    assert w["a"] not in after["level_approved"] and w["b"] in after["level_approved"]
    assert r.json()["approved"] is False and r.json()["words"] == NEW


def test_4_the_person_and_the_reason_are_kept_and_listed_newest_first(world):
    w = world
    old = _snapshot(w)["difficulty"][w["a"]]["words"]
    _change(w, w["boss"], reason="clearer for the educators")
    got = (
        w["client"]
        .post(
            "/curriculum/level-words/history",
            headers=H,
            json={"actor": w["boss"], "skill": w["skill"], "level": w["a"]},
        )
        .json()
    )
    first = got["history"][0]
    assert (first["was"], first["now"], first["reason"]) == (old, NEW, "clearer for the educators")
    assert first["staff"] is not None and "@" not in json.dumps(got)  # a staff id, no email or name


def test_5_the_same_sentence_again_changes_nothing(world):
    w = world
    _change(w, w["boss"])
    logs = w["conn"].execute("select count(*) as n from change_log").fetchone()["n"]
    w["conn"].execute(
        "update skill set level_approved = level_approved || %s::jsonb where code = %s",
        (json.dumps({w["a"]: {"by": "x"}}), w["skill"]),
    )
    r = _change(w, w["boss"])
    assert r.json()["changed"] is False and r.json()["approved"] is True
    assert w["conn"].execute("select count(*) as n from change_log").fetchone()["n"] == logs


@pytest.mark.parametrize("what", ["empty", "long", "skill", "level"])
def test_6_each_refusal_says_why_and_writes_nothing(world, what):
    w = world
    before = _snapshot(w)
    body = {"actor": w["boss"], "skill": w["skill"], "level": w["a"], "words": NEW}
    body |= {
        "empty": {"words": "  "},
        "long": {"words": "x" * 401},
        "skill": {"skill": "NO.SUCH.99"},
        "level": {"level": "Nope"},
    }[what]
    r = w["client"].post("/curriculum/level-words", headers=H, json=body)
    assert r.status_code in (404, 422) and r.json()["detail"]
    assert _snapshot(w) == before
