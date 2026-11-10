"""CP-12 item 5: a person can accept a clash with a reason; who and when are kept. An acceptance covers only that clash:
if a lesson in it moves again, or its limit changes, the clash is listed as not accepted. Only the coordinator group
accepts a clash (Nimish, 8 Nov, in the spec's decisions)."""

import datetime as dt

from conftest import REASON, START, accept, accepted, block, clashes, limit, move, refused, world

MON, TUE, THU = START, START + dt.timedelta(1), START + dt.timedelta(3)


def _over_by_fortnight(conn, w, most=9):
    limit(conn, w, "math", "fortnight", most=most)


def _blocked(conn, w, d):
    block(conn, w, on_date=d, period="extra")


def test_a_clash_is_accepted_with_a_reason_who_and_when(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _over_by_fortnight(conn, w)
    (clash,) = clashes(conn, w)
    assert clash["accepted"] is False

    code, out = accept(engine, w, clash["clash_key"])
    assert code == 0, out
    (now,) = clashes(conn, w)
    assert now["clash_key"] == clash["clash_key"] and now["accepted"] is True, "the clash is not listed as accepted"
    rows = accepted(conn, clash["clash_key"])
    assert len(rows) == 1
    r = rows[0]
    assert r["by"] == str(w["coordinator"]["id"]) and r["created_at"] is not None and r["reason"] == REASON
    assert r["detail"]["fortnight_id"] == str(w["fortnights"][2]["id"])
    refused(conn, "update approval set reason = 'changed' where id = %s", (r["id"],))
    refused(conn, "delete from approval where id = %s", (r["id"],))


def test_an_acceptance_needs_a_reason_the_coordinator_group_and_a_clash_that_is_listed(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _over_by_fortnight(conn, w)
    (clash,) = clashes(conn, w)
    for why, (key, by, reason) in {
        "a blank reason": (clash["clash_key"], None, "  "),
        "an educator outside the coordinator group": (clash["clash_key"], w["educator"]["email"], REASON),
        "a key that is no current clash": ("not-a-clash-key", None, REASON),
    }.items():
        code, out = accept(engine, w, key, by=by, reason=reason)
        assert code != 0, f"an acceptance with {why} went through:\n{out}"
    assert accepted(conn, clash["clash_key"]) == [], "an acceptance was written"
    assert clashes(conn, w)[0]["accepted"] is False


def test_the_clash_is_open_again_when_its_lesson_moves_again(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _blocked(conn, w, TUE)
    _blocked(conn, w, THU)  # Thursday's fourth period is empty
    code, out = move(engine, w, MON, "s1", TUE, "extra", reason=REASON)
    assert code == 0, out
    mine = [r for r in clashes(conn, w) if r["kind"] == "blocked" and TUE.isoformat() in str(r["places"])]
    assert len(mine) == 1, mine
    code, out = accept(engine, w, mine[0]["clash_key"])
    assert code == 0, out
    assert all(r["accepted"] for r in clashes(conn, w) if r["clash_key"] == mine[0]["clash_key"])

    code, out = move(engine, w, TUE, "extra", THU, "extra", reason=REASON)  # onto another blocked period
    assert code == 0, out
    blocked = [r for r in clashes(conn, w) if r["kind"] == "blocked"]
    assert len(blocked) == 1 and THU.isoformat() in str(blocked[0]["places"]), blocked
    assert blocked[0]["accepted"] is False, "an acceptance carried over to a lesson that moved again"


def test_the_clash_is_open_again_when_its_limit_changes(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    _over_by_fortnight(conn, w)
    (clash,) = clashes(conn, w)
    code, out = accept(engine, w, clash["clash_key"])
    assert code == 0, out
    limit(conn, w, "math", "fortnight", most=8)
    (now,) = clashes(conn, w)
    assert now["accepted"] is False, "an acceptance carried over to a limit that changed"
