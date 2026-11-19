"""The money rules in plain words (CP-80): given a change to the rules, the sentence a person reads in the history, and given a rule set that
cannot work, the words it is refused in. No database."""

import copy
import json

import pytest

from engine.core import db
from engine.core import money_rules as mr
from engine.core import money_rules_words as words

# the starting rules, as the seed holds them
STARTING = next(
    c["value"]
    for c in json.loads((db.REPO_ROOT / "supabase/seed/config.json").read_text())["config"]
    if c["key"] == "money.rules"
)


def _changed(edit):
    after = copy.deepcopy(STARTING)
    edit(after)
    return words.describe(STARTING, after)


@pytest.mark.parametrize(
    ("edit", "said"),
    [
        (
            lambda r: r["limits"].update(screenshot_limit=700),
            "raised the payment-screenshot limit from ₹500 to ₹700",
        ),
        (
            lambda r: r["limits"].update(bill_missing_hours=24),
            "lowered the time allowed for a missing bill from 48 hours to 24 hours",
        ),
        (
            lambda r: r["limits"].update(capex_floor=1234567),
            "raised the price above which a purchase counts as equipment from ₹5,000 to ₹12,34,567",
        ),
        (
            lambda r: r["limits"].update(unpaid_after_approval_days=1),
            "lowered the days allowed to pay an approved claim from 7 days to 1 day",
        ),
        (
            lambda r: r["limits"].update(report_day=22),
            "raised the day of the month the report is made from 3rd to 22nd",
        ),
        (
            lambda r: r["kinds"]["capex"].update(approve="ops"),
            "changed who approves equipment from a founder to the operations lead",
        ),
        (
            lambda r: r["can"].update(approve="coordinator"),
            "changed who may approve a claim from the operations lead to a coordinator",
        ),
        (
            lambda r: r.update(ladder=["educator", "coordinator", "ops", "founder"]),
            "changed the order of the roles, lowest first, from educator, operations lead, coordinator, founder to educator, coordinator, operations lead, founder",
        ),
        (
            lambda r: r["kinds"]["expense"]["pay"][0].update(up_to=15000),
            "changed who pays an expense: now a founder up to ₹15,000, then a founder (before: a founder up to ₹10,000, then a founder)",
        ),
    ],
)
def test_a_change_to_the_rules_is_said_in_a_plain_sentence(edit, said):
    assert _changed(edit) == [said]


def test_several_changes_are_several_sentences_and_no_change_is_none():
    def edit(r):
        r["limits"].update(screenshot_limit=700, repeat_item_days=30)

    assert len(_changed(edit)) == 2
    assert words.describe(STARTING, STARTING) == []


def test_no_sentence_shows_a_code():
    def edit(r):
        r["limits"]["a_limit_not_known_yet"] = 5
        r["kinds"]["float_topup"]["approve"] = "founder"

    for line in _changed(edit):
        assert "_" not in line


def test_categories_added_removed_and_reordered_are_said():
    assert words.describe_categories(["Tea", "Water"], ["Tea", "Water", "Transport"]) == [
        "added the category “Transport”"
    ]
    assert words.describe_categories(["Tea", "Water"], ["Tea"]) == ["removed the category “Water”"]
    assert words.describe_categories(["Tea", "Water"], ["Water", "Tea"]) == [
        "changed the order of the categories"
    ]
    assert words.describe_categories(["Tea"], ["Tea"]) == []


def test_a_rule_set_that_cannot_work_is_refused_in_the_school_s_words_not_its_codes():
    broken = copy.deepcopy(STARTING)
    broken["kinds"]["float_topup"]["approve"] = "educator"
    broken["kinds"]["event_budget"]["pay"] = [{"up_to": 500, "by": "educator"}]
    broken["limits"]["screenshot_limit"] = -5
    said = "; ".join(mr.problems(broken))
    assert "a float top-up is approved by an educator, who may not approve claims" in said
    assert "no one is set to pay an event budget above the last limit" in said
    assert "the payment-screenshot limit must be a number from 0 to 10 crore" in said
    assert "float_topup" not in said and "event_budget" not in said and "screenshot_limit" not in said


def test_a_limit_that_is_not_a_number_or_a_report_day_off_the_calendar_is_refused():
    for edit, said in (
        (lambda r: r["limits"].update(bill_missing_hours="soon"), "must be a number"),
        (lambda r: r["limits"].update(bill_missing_hours=True), "must be a number"),
        (lambda r: r["limits"].update(stock_line=10**12), "must be a number"),
        (lambda r: r["limits"].update(report_day=31), "from the 1st to the 28th"),
    ):
        bad = copy.deepcopy(STARTING)
        edit(bad)
        assert any(said in p for p in mr.problems(bad)), said
    assert mr.problems(STARTING) == []
