"""CP-71: the pattern read says which fortnight it would be published as (the Build page's Publish button names it). Nightly: the
routes file it shares its world with is in the core as a whole, and the core is at its ceiling."""

import datetime as dt
import os

import pytest

from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw
from tests.test_tt_pattern_routes import (  # noqa: F401  (the fixture: the school and the app wired to it)
    FROM,
    web,
)

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


def test_reading_a_pattern_says_which_fortnight_it_would_be_published_as(web):  # noqa: F811
    """The Build page's Publish button names the fortnight: the first of the class's year with no lessons for the class yet."""
    client, c, w = web
    boss = w["staff"]["coordinator"]["email"]

    def nxt(k):
        r = client.post(
            "/timetable/pattern/read", json={"actor": boss, "class_id": str(k), "from_date": FROM}
        )
        assert r.status_code == 200, r.text
        return r.json()["next_fortnight"]

    assert nxt(w["class"]) is None  # the world's one fortnight already has this class's lessons
    fresh = nxt(pw.empty_class(c, w))
    assert fresh == {
        "number": w["number"],
        "starts_on": tw.START.isoformat(),
        "ends_on": (tw.START + dt.timedelta(days=13)).isoformat(),
    }
