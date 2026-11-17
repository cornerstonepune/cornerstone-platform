"""CP-74 through the engine's door, on a database (specs/CP-74/spec.md): the picker's read (`tt_offer_load.offers`), a choice (`tt_edit.edit`),
many lessons at once (`tt_fill_write.fill`), the suggestion job (`tt_fill_write.suggest`), and Done when 7's last part: a lesson a person set
keeps its objective when the fortnight is published again or its lesson is moved. The made-up 2033 K2 class has Maths every day in its first
period; its objectives here are a made-up unit placed before every real one. Each test works in a transaction that is rolled back."""

import datetime as dt
import os

import pytest

from engine.core import db
from engine.w2_print import tt_edit, tt_fill_write, tt_move, tt_offer_load, tt_publish
from engine.w2_print.tt_live_plan import Refused
from tests import tt_hand_world as tw

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
MON, TUE, WED, THU, FRI = (tw.START + dt.timedelta(days=n) for n in range(5))
NEXT_MON = tw.START + dt.timedelta(days=7)
UNIT = "Test unit: halves"


@pytest.fixture
def world():
    with db.connect() as c:
        w = tw.school(c)
        for n, code in enumerate(("LO-T-1", "LO-T-2", "LO-T-3", "LO-T-4")):
            c.execute(
                "insert into learning_objective (tenant_id, code, band, subject, subject_code, unit, title, signal, ord)"
                " values (%s, %s, 'K2', 'Numeracy', 'NUM', %s, %s, 'Conceptual', %s)",
                (w["tenant"], code, UNIT, f"Halves, step {n + 1}", -100 + n),
            )
        c.execute(
            "insert into activity (tenant_id, code, band, strand, name) values (%s, 'ACT-T-FOLD', 'K2', 'Story Telling', 'Paper folding')",
            (w["tenant"],),
        )
        c.execute(
            "insert into activity_objective (tenant_id, activity_code, lo_code, ord) values (%s, 'ACT-T-FOLD', 'LO-T-2', 1)",
            (w["tenant"],),
        )
        w["me"], w["her"] = w["staff"]["coordinator"]["id"], w["staff"]["educator"]["id"]
        yield c, w
        c.rollback()


def maths(c, w, day):
    return tw.session_at(c, w, day, "p1")


def taught(c, w, day, code, state="done"):
    """A lesson already given: the scene of a test, set as no screen does (a day gone by is not edited)."""
    c.execute(
        "update session set lo_code = %s, state = %s where id = %s", (code, state, maths(c, w, day)["id"])
    )


def test_the_picker_offers_what_comes_next_only_once_a_coordinator_has_checked_the_order(world):
    c, w = world
    taught(c, w, MON, "LO-T-1")
    lesson = str(maths(c, w, WED)["id"])
    before = tt_offer_load.offers(c, lesson, who=w["her"], today=WED)
    assert (
        before["ordered"] is False and before["next_up"] is None
    )  # nobody has looked at the order: the whole subject
    assert before["tiers"][0]["units"][0]["unit"] == UNIT
    with pytest.raises(Refused, match="not in it"):  # the order is the coordinators' word, not an educator's
        tt_offer_load.check_order(c, w["her"], "K2", "NUM")
    tt_offer_load.check_order(c, w["me"], "K2", "NUM")
    out = tt_offer_load.offers(c, lesson, who=w["her"], today=WED)
    assert out["pointer"]["code"] == "LO-T-1" and out["next_up"]["code"] == "LO-T-2"
    assert [a["code"] for a in out["activities"]] == [
        "ACT-T-FOLD"
    ]  # the activities linked to what is next up
    stranger = db.one(
        c, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (w["tenant"], w["campus"])
    )["id"]
    with pytest.raises(Refused, match="not in it"):
        tt_offer_load.offers(c, lesson, who=stranger, today=WED)


def test_the_educator_who_holds_the_class_chooses_what_her_lesson_teaches_and_nothing_else(world):
    c, w = world
    lesson = str(maths(c, w, WED)["id"])
    # the linked activity is in another group than a Maths lesson takes: it is offered because it is linked to the objective
    got = tt_edit.edit(c, lesson, who=w["her"], lo_code="LO-T-2", activity_code="ACT-T-FOLD")
    assert (got["lo_code"], got["activity_code"]) == ("LO-T-2", "ACT-T-FOLD")
    assert maths(c, w, WED)["source"] == "person"
    with pytest.raises(Refused, match="not in it"):
        tt_edit.edit(c, lesson, who=w["her"], text="Something else")
    with pytest.raises(Refused, match="no objective"):
        tt_edit.edit(c, lesson, who=w["her"], lo_code="LO-NOT-ONE")
    assert maths(c, w, WED)["lo_code"] == "LO-T-2"


def test_a_unit_is_spread_over_the_fortnight_and_last_week_is_repeated(world):
    c, w = world
    lesson = str(maths(c, w, MON)["id"])
    plan = tt_fill_write.fill(c, lesson, who=w["her"], mode="spread", unit=UNIT, dry=True, today=MON)
    # nine Maths lessons (the second Tuesday is a holiday) and four objectives: 9 // 4 = 2 each, the first gets one more
    assert [p["lo_code"] for p in plan["lessons"]] == ["LO-T-1"] * 3 + ["LO-T-2"] * 2 + ["LO-T-3"] * 2 + [
        "LO-T-4"
    ] * 2
    assert plan["written"] == 0 and maths(c, w, MON)["lo_code"] is None
    saved = tt_fill_write.fill(
        c,
        lesson,
        who=w["her"],
        mode="list",
        items=[{"id": p["id"], "lo_code": p["lo_code"]} for p in plan["lessons"][:5]],
        today=MON,
    )
    assert (
        saved["written"] == 5
        and maths(c, w, FRI)["lo_code"] == "LO-T-2"
        and maths(c, w, FRI)["source"] == "person"
    )
    again = tt_fill_write.fill(
        c, str(maths(c, w, NEXT_MON)["id"]), who=w["her"], mode="same_as_last_week", today=MON
    )
    assert again["written"] == 1 and maths(c, w, NEXT_MON)["lo_code"] == "LO-T-1"
    with pytest.raises(Refused, match="no Maths lesson"):
        tt_fill_write.fill(c, lesson, who=w["her"], mode="same_as_last_week", today=MON)


def test_the_suggestion_job_writes_machine_made_rows_once_and_never_a_persons_lesson(world):
    """Done when 6 and 7, on rows: the job, then a second run; her lesson through the job, a publish again and a move."""
    c, w = world
    tt_offer_load.check_order(c, w["me"], "K2", "NUM")
    taught(c, w, MON, "LO-T-1")
    tt_edit.edit(c, str(maths(c, w, THU)["id"]), who=w["her"], lo_code="LO-T-4")
    first = tt_fill_write.suggest(c, today=TUE)
    assert first["written"] >= 2
    assert [maths(c, w, d)["lo_code"] for d in (TUE, WED, THU)] == ["LO-T-2", "LO-T-3", "LO-T-4"]
    assert [maths(c, w, d)["source"] for d in (TUE, WED, THU)] == ["machine", "machine", "person"]
    assert tt_fill_write.suggest(c, today=TUE)["written"] == 0
    # published again: refused, because the fortnight has lessons; hers is as she left it
    with pytest.raises(tt_publish.Refused, match="already has"):
        tt_publish.publish(c, w["me"], str(w["class"]), w["number"], today=tw.START - dt.timedelta(days=7))
    # moved (a swap takes both lessons out and puts them back): the objective and whose it is go with the lesson
    tt_move.move(c, "K2", w["section"], "2033-34", THU, tw.ORD["p1"], THU, tw.ORD["p2"], who=w["me"])
    moved = tw.session_at(c, w, THU, "p2")
    assert (moved["subject_code"], moved["lo_code"], moved["source"]) == ("math", "LO-T-4", "person")
