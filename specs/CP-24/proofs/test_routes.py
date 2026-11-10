"""CP-24 item 3: each Core action a screen will call has one keyed engine route, and the route is in the website's
generated list `apps/web/lib/engine-routes.ts` (written by `bin/engine contract`) (Audit F6).

The engine answers the path: without the key, or with a wrong one, it is refused 401 (the route exists and is keyed);
a path the engine does not serve is 404. No database is touched: the connection dependency is replaced by nothing, and
the app's start-up is not run.
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages" / "engine"))

from fastapi.testclient import TestClient  # noqa: E402

from engine.api import deps  # noqa: E402
from engine.api.app import app  # noqa: E402

KEY = "cp24-proof-key"
ROUTES = {
    "fortnight_state": ("/fortnight/state", {"actor": "proof@example.test", "fortnight_id": "x"}),
    "fortnight_move": ("/fortnight/move", {"actor": "proof@example.test", "fortnight_id": "x", "to_state": "frozen"}),
    "timetable_generate": (
        "/timetable/generate",
        {"actor": "proof@example.test", "grade": "K2", "section": "A", "year": "2031-32", "fortnight": 1},
    ),
    "timetable_link": ("/timetable/link", {"actor": "proof@example.test", "apply": False}),
    "timetable_unmatched": ("/timetable/unmatched", {"actor": "proof@example.test"}),
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ENGINE_KEY", KEY)

    def no_conn():
        yield None

    app.dependency_overrides[deps.get_conn] = no_conn
    yield TestClient(app)  # not entered: the start-up that looks for orphaned runs needs a database
    app.dependency_overrides.clear()


def test_3_an_unknown_path_is_404(client):
    assert client.post("/cp24/no-such-route", json={}).status_code == 404


@pytest.mark.parametrize("name", ROUTES)
def test_3_route_is_keyed_and_in_the_website_list(client, name):
    path, body = ROUTES[name]
    listed = (ROOT / "apps/web/lib/engine-routes.ts").read_text()
    assert f'"POST {path}"' in listed, f"POST {path} is not in apps/web/lib/engine-routes.ts"
    without = client.post(path, json=body)
    assert without.status_code == 401, f"POST {path} without the key answered {without.status_code}"
    wrong = client.post(path, json=body, headers={"X-Engine-Key": "not-the-key"})
    assert wrong.status_code == 401, f"POST {path} with a wrong key answered {wrong.status_code}"
