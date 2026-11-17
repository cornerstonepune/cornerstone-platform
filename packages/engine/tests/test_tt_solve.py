"""CP-75, Done when 1 to 3 (specs/CP-75/spec.md): `tt_solve.solve` on the made-up school of `tt_solve_world`, through the real solver
(`adapters/cpsat.py`). Each test works in a transaction that is rolled back. Nightly: not in the core."""

import datetime as dt
import os
from collections import Counter

import pytest

from engine.adapters import cpsat
from engine.core import db
from engine.w2_print import tt_check_load, tt_pattern, tt_solve
from tests import tt_hand_world as tw
from tests import tt_pattern_world as pw
from tests import tt_solve_world as sw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
FROM = tw.START + dt.timedelta(days=14)
TODAY = tw.START - dt.timedelta(days=7)


@pytest.fixture
def world():
    with db.connect() as c:
        yield c, sw.school(c, FROM)
        c.rollback()


def solve(c, w, **kw):
    return tt_solve.solve(c, pw.coordinator(w), w["fill"], FROM, today=TODAY, **kw)


def runs(c, got):
    return c.execute(
        "select outcome, needed, placed, report, draft, fet_version from timetable_run where id::text = any(%s)",
        (got["run_ids"],),
    ).fetchall()


def test_solve_places_every_needed_lesson_with_no_must_problem_keeps_every_person_made_cell_and_is_the_same_twice(
    world,
):  # Done when 1
    c, w = world
    before = sw.pattern(c, w, FROM)
    first, second = solve(c, w), solve(c, w)
    assert first["outcome"] == "placed", first
    assert [k["edits"] for k in first["classes"]] == [
        k["edits"] for k in second["classes"]
    ]  # same seed, same answer
    assert sw.pattern(c, w, FROM) == before  # solving shows an answer; it writes no timetable
    assert all(r["outcome"] == "placed" and r["needed"] == r["placed"] == 40 for r in runs(c, first))
    assert not first["specialists_listed"] and any(
        "No specialist subjects are listed" in n for n in first["notes"]
    )

    used = tt_solve.use(c, pw.coordinator(w), first["run_ids"], today=TODAY)
    for g in (w["g2"], w["g3"]):
        cells = [x for x in tt_pattern.read(c, g["class"], FROM)["cells"] if x["cell"] == "subject"]
        for week in "AB":
            have = Counter(x["subject_code"] for x in cells if x["week"] == week)
            assert have == sw.WEEKLY, (week, have)
    g2 = {
        (x["period_id"], x["week"], x["weekday"]): x
        for x in tt_pattern.read(c, w["g2"]["class"], FROM)["cells"]
    }
    for p, wk, wd, subject, _ in sw.PERSON:  # a person's cell is where it was, and still theirs
        here = g2[(w["g2"]["period"][p], wk, wd)]
        assert (here["subject_code"], here["source"]) == (subject, "person")
    p, wk, wd, subject, _ = sw.MACHINE  # nothing forced the machine-made cell to move, so it did not
    assert g2[(w["g2"]["period"][p], wk, wd)]["subject_code"] == subject
    checked = tt_check_load.check(c, [str(w["class"]), *w["fill"]], FROM)
    assert checked["counts"]["must"] == 0, [x["sentence"] for x in checked["problems"]]
    assert checked["counts"]["try"] == 0  # Maths once a day is a Try to, and there was room to keep it

    for k in used["classes"]:  # accepting is one change: its inverse puts the pattern back
        tt_pattern.change(c, pw.coordinator(w), k["class_id"], k["inverse"], FROM, today=TODAY)
    assert sw.pattern(c, w, FROM) == before


def test_a_school_that_cannot_be_met_is_unmeetable_names_a_rule_in_words_and_writes_nothing(
    world,
):  # Done when 2
    c, w = world
    for wd in (
        1,
        2,
        4,
    ):  # the Hindi educator is now in school on Wednesdays of week A only, and Hindi needs 3 every week
        sw.cw.away(c, w, w["hindi"], wd)
    sw.cw.away(c, w, w["hindi"], 3, "B")
    before = sw.pattern(c, w, FROM)
    got = solve(c, w)
    assert got["outcome"] == "unmeetable" and got["rules"], got
    said = " ".join(r["sentence"] for r in got["rules"])
    assert "Hindi" in said and "It fits if" in said, said
    assert all(not k["edits"] for k in got["classes"])
    assert sw.pattern(c, w, FROM) == before
    assert {r["outcome"] for r in runs(c, got)} == {"unmeetable"}
    with pytest.raises(tt_solve.Refused):
        tt_solve.use(c, pw.coordinator(w), got["run_ids"], today=TODAY)

    sw.limit(c, w, w["g3"]["class"], "MAR", "week", fewest=31)  # arithmetic names this one before any solve
    counted = solve(c, w)
    assert counted["outcome"] == "unmeetable" and counted["seconds"] == 0
    assert any(
        "needs 31 in week A and there are 30 free places" in r["sentence"] for r in counted["rules"]
    ), counted["rules"]
    assert sw.pattern(c, w, FROM) == before


def test_an_answer_that_breaks_a_must_rule_is_thrown_away_and_kept_as_a_failed_run(world):  # Done when 3
    c, w = world
    before = sw.pattern(c, w, FROM)

    def clashing(problem, seconds, seed):
        """The real answer, then one Grade 3 Maths lesson forced onto 04:40 on Monday: the Maths educator is in K2 then."""
        answer = cpsat.solve(problem, seconds, seed)
        maths = next(
            g for g in problem.groups if g.id.startswith(f"{w['g3']['class']}|NUM|") and g.id.endswith("|A")
        )
        clash = next(
            s for s in maths.slots if s not in answer.placed[maths.id] and _is(c, w, problem, maths, s)
        )
        for gid, slots in answer.placed.items():
            answer.placed[gid] = [s for s in slots if s != clash]
        answer.placed[maths.id] = [*answer.placed[maths.id][1:], clash]
        return answer

    got = solve(c, w, place=clashing)
    assert got["outcome"] == "failed" and "thrown away" in got["sentence"], got
    assert all(not k["edits"] for k in got["classes"])
    kept = runs(c, got)
    assert all(r["report"]["failure"] and r["placed"] == 0 and r["draft"] == [] for r in kept)
    assert any("One educator is down for" in f for f in kept[0]["report"]["faults"]), kept[0]["report"][
        "faults"
    ]
    assert sw.pattern(c, w, FROM) == before
    with pytest.raises(tt_solve.Refused):
        tt_solve.use(c, pw.coordinator(w), got["run_ids"], today=TODAY)


def _is(c, w, problem, group, slot) -> bool:
    """Whether `slot` is Grade 3's 04:40 period on Monday of week A (slots are numbered over the sorted places of every class)."""
    world = tt_check_load.world(c, tt_solve._year_classes(c, w["fill"]), FROM)
    from engine.w2_print import tt_solve_model

    places = sorted(p for k in world.classes for p in tt_solve_model.free(world, k))
    return places[slot] == (w["g3"]["class"], w["g3"]["period"]["p1"], "A", 1)


def test_only_a_coordinator_may_ask_for_an_answer_or_use_one(world):
    c, w = world
    with pytest.raises(tt_solve.Refused) as no:
        tt_solve.solve(c, w["staff"]["educator"]["id"], w["fill"], FROM, today=TODAY)
    assert no.value.status == 403
    got = solve(c, w)
    with pytest.raises(tt_solve.Refused) as no:
        tt_solve.use(c, w["staff"]["educator"]["id"], got["run_ids"], today=TODAY)
    assert no.value.status == 403


def test_the_two_doors_let_a_coordinator_through_and_refuse_everyone_else(world, monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import deps
    from engine.api.app import app

    c, w = world
    monkeypatch.setenv("ENGINE_KEY", "k")
    app.dependency_overrides[deps.get_conn] = lambda: (yield c)
    try:
        with TestClient(app, headers={"X-Engine-Key": "k"}) as client:
            ask = {"class_ids": [w["g2"]["class"]], "from_date": FROM.isoformat(), "seconds": 10}
            assert (
                client.post(
                    "/timetable/solve", json={**ask, "actor": w["staff"]["educator"]["email"]}
                ).status_code
                == 403
            )
            assert (
                client.post("/timetable/solve", json={**ask, "actor": "nobody@example.test"}).status_code
                == 403
            )
            got = client.post("/timetable/solve", json={**ask, "actor": w["staff"]["coordinator"]["email"]})
            assert got.status_code == 200 and got.json()["outcome"] == "placed", got.text
            assert (
                got.json()["limit_seconds"] == 10 and len(got.json()["classes"]) == 1
            )  # one class filled; the others only read
            use = {"run_ids": got.json()["run_ids"]}
            assert (
                client.post(
                    "/timetable/solve/use", json={**use, "actor": w["staff"]["educator"]["email"]}
                ).status_code
                == 403
            )
            done = client.post(
                "/timetable/solve/use", json={**use, "actor": w["staff"]["coordinator"]["email"]}
            )
            assert done.status_code == 200 and done.json()["classes"][0]["inverse"], done.text
            again = client.post(
                "/timetable/solve/use", json={**use, "actor": w["staff"]["coordinator"]["email"]}
            )
            assert again.status_code == 409  # the timetable has changed since: the answer is not used twice
    finally:
        app.dependency_overrides.clear()
