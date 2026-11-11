"""CP-30: a screenshot for a Report a problem note (engine/w3_read/feedback_shot.py, engine/api/routes/feedback.py).
One test per Done-when line of specs/CP-30/spec.md. Placeholder notes in a rolled-back transaction; the files go to a
temporary folder, never the real `data/`."""

import os
import time

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db
from engine.w3_read import feedback_shot, voice_store

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture
def engine(monkeypatch, tmp_path):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    monkeypatch.setattr(voice_store, "ROOT", tmp_path)
    with db.connect() as conn:
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield client, conn, tmp_path
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _note(conn, minutes_old=0):
    return str(
        conn.execute(
            "insert into staff_note (tenant_id, kind, doing, happened, route, role, reporter, created_at)"
            " select id, 'question', 'Written on /x', 'it broke', '/x', 'educator', 'placeholder',"
            " now() - make_interval(mins => %s) from tenant limit 1 returning id",
            (minutes_old,),
        ).fetchone()["id"]
    )


def _send(client, note_id, data=PNG, name="shot.png"):
    return client.post(
        "/feedback/screenshot", headers=H, data={"note_id": note_id}, files={"file": (name, data)}
    )


def test_1_a_picture_is_kept_for_a_note_and_each_wrong_one_is_refused(engine):
    client, conn, _ = engine
    assert client.post("/feedback/screenshot", data={}).status_code == 401
    note = _note(conn)
    assert _send(client, note, b"not an image at all", "a.png").status_code == 415
    assert _send(client, note, PNG, "a.gif").status_code == 415
    assert _send(client, "00000000-0000-0000-0000-000000000000").status_code == 404
    assert _send(client, _note(conn, minutes_old=90)).status_code == 409
    assert _send(client, note).status_code == 200
    assert _send(client, note).status_code == 409  # one per note


def test_2_the_database_holds_nothing_about_the_file(engine):
    client, conn, folder = engine
    note = _note(conn)
    before = conn.execute("select row(n.*)::text as r from staff_note n where id = %s", (note,)).fetchone()[
        "r"
    ]
    logs = conn.execute("select count(*) as n from change_log").fetchone()["n"]
    assert _send(client, note).status_code == 200
    assert (
        conn.execute("select row(n.*)::text as r from staff_note n where id = %s", (note,)).fetchone()["r"]
        == before
    )
    assert conn.execute("select count(*) as n from change_log").fetchone()["n"] == logs
    (kept,) = list(folder.glob("feedback/*/*"))
    assert kept.name == f"{note}.png"


def test_3_the_picture_can_be_read_back_and_a_note_without_one_says_so(engine):
    client, conn, _ = engine
    note = _note(conn)
    assert client.post("/feedback/screenshot/get", headers=H, json={"note_id": note}).status_code == 404
    _send(client, note)
    r = client.post("/feedback/screenshot/get", headers=H, json={"note_id": note})
    assert r.status_code == 200 and r.content == PNG and r.headers["content-type"] == "image/png"


def test_4_an_old_picture_is_deleted_and_a_new_one_kept(engine):
    client, conn, folder = engine
    old, new = _note(conn), _note(conn)
    _send(client, old)
    _send(client, new)
    (path,) = list(folder.glob(f"feedback/*/{old}.png"))
    long_ago = time.time() - 31 * 86400
    os.utime(path, (long_ago, long_ago))
    assert feedback_shot.expire(conn) == 1
    assert not path.exists() and list(folder.glob(f"feedback/*/{new}.png"))


def test_5_a_refusal_carries_no_name_or_path(engine):
    client, conn, folder = engine
    r = _send(client, _note(conn), b"x", "secret-name.png")
    assert "secret-name" not in r.text and str(folder) not in r.text
