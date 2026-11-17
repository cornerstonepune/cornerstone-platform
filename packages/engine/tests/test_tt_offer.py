"""CP-74, Done when 1, 2 and 3 (specs/CP-74/spec.md): what a lesson is offered next, through the pure `tt_offer.offers`. No database: the
objectives, the class's lessons and the activity counts are plain rows, as the loader will hand them over. A made-up Grade 2 Maths: two units
in order, a field visit (a one-off) and a retired row."""

import datetime as dt

from engine.w2_print import tt_offer

TODAY = dt.date(2033, 12, 8)


def lo(code, unit, ord_, **more):
    return {
        "code": code,
        "unit": unit,
        "title": f"Objective {code}",
        "ord": ord_,
        "retired": False,
        "one_off": False,
        **more,
    }


OBJECTIVES = [
    lo("F1", "Fractions", 10),
    lo("F2", "Fractions", 11),
    lo("F3", "Fractions", 12),
    lo("F4", "Fractions", 13),
    lo("S1", "Shapes", 20),
    lo("S2", "Shapes", 21),
    lo("V1", "Field visit to a bank", 5, one_off=True),
    lo("OLD", "Fractions", 14, retired=True),
]


def lesson(day, code, state="planned"):
    return {"on_date": dt.date(2033, 12, day), "lo_code": code, "state": state}


def codes(rows):
    return [r["code"] for r in rows]


def tier(out, name):
    return next(t for t in out["tiers"] if t["tier"] == name)


def test_next_up_is_the_objective_after_the_last_one_taught_and_the_rest_of_its_unit_follows_in_order():
    """Done when 1."""
    past = [lesson(1, "F1", "done"), lesson(3, "F2"), lesson(4, "F3", "not_done"), lesson(9, "F4")]
    out = tt_offer.offers(OBJECTIVES, past, {}, TODAY)
    # Thursday's F3 did not happen and the 9th is still to come, so the last one taught is F2 (nobody marked it: not confirmed)
    assert out["pointer"] == {"code": "F2", "on_date": dt.date(2033, 12, 3), "confirmed": False}
    assert out["next_up"]["code"] == "F3" and out["next_up"]["new_unit"] is False
    rest = tier(out, "rest_of_unit")
    assert rest["unit"] == "Fractions" and (rest["done"], rest["of"]) == (2, 4)
    assert codes(rest["rows"]) == [
        "F4",
        "F1",
        "F2",
    ]  # what is left, in order; then what was taught, greyed with its day
    assert rest["rows"][1]["taught_on"] == dt.date(2033, 12, 1)
    # one more lesson and the unit is done: the first of the next unit is next up, and says so
    done = tt_offer.offers(
        OBJECTIVES, [lesson(d, c, "done") for d, c in ((1, "F1"), (2, "F2"), (3, "F3"), (4, "F4"))], {}, TODAY
    )
    assert (done["next_up"]["code"], done["next_up"]["new_unit"]) == ("S1", True)


def test_with_nothing_taught_yet_the_whole_subject_is_offered_units_in_order_one_offs_last_nothing_retired():
    """Done when 2. The same is offered for a subject whose order nobody has checked, whatever was taught."""
    for out in (
        tt_offer.offers(OBJECTIVES, [], {}, TODAY),
        tt_offer.offers(OBJECTIVES, [lesson(1, "F1", "done")], {}, TODAY, ordered=False),
    ):
        assert out["next_up"] is None and [t["tier"] for t in out["tiers"]] == ["all"]
        units = tier(out, "all")["units"]
        assert [(u["unit"], u["other"]) for u in units] == [
            ("Fractions", False),
            ("Shapes", False),
            ("Field visit to a bank", True),
        ]
        assert "OLD" not in [c for u in units for c in codes(u["rows"])]
    assert codes(units[0]["rows"]) == [
        "F2",
        "F3",
        "F4",
        "F1",
    ]  # the unchecked subject: what was taught still sinks, greyed
    assert codes(tier(tt_offer.offers(OBJECTIVES, [], {}, TODAY), "all")["units"][0]["rows"]) == [
        "F1",
        "F2",
        "F3",
        "F4",
    ]


def test_in_a_tier_not_taught_with_an_activity_comes_before_not_taught_without_before_taught():
    """Done when 3. The row carries the number of activities, never a score."""
    out = tt_offer.offers(
        OBJECTIVES, [lesson(1, "F1", "done"), lesson(2, "F2", "done")], {"F4": 2, "F2": 1}, TODAY
    )
    assert out["next_up"]["code"] == "F3"  # next up follows the order alone
    rows = tier(out, "rest_of_unit")["rows"]
    assert codes(rows) == ["F4", "F2", "F1"]
    assert [r["activities"] for r in rows] == [2, 1, 0]
    assert codes(tier(out, "all")["units"][0]["rows"]) == ["F4", "F3", "F2", "F1"]
    # two or fewer left in the unit: the next unit is offered too
    assert tier(out, "next_unit")["unit"] == "Shapes" and codes(tier(out, "next_unit")["rows"]) == [
        "S1",
        "S2",
    ]
    # an objective passed over stays in view: F3 was skipped, so next up opens Shapes and Fractions is still the unit shown
    skipped = tt_offer.offers(OBJECTIVES, [lesson(1, "F2", "done"), lesson(2, "F4", "done")], {}, TODAY)
    assert (skipped["next_up"]["code"], skipped["next_up"]["new_unit"]) == ("S1", True)
    assert codes(tier(skipped, "rest_of_unit")["rows"]) == ["F1", "F3", "F2", "F4"]
    assert codes(tier(skipped, "next_unit")["rows"]) == ["S2"]
