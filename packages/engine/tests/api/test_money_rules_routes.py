"""The Rules screen's routes (engine/api/routes/money_rules.py, CP-80): anyone on the staff list reads the rules with their history in words;
only someone who may set them saves a change; a rule set that cannot work is refused in words and nothing changes. The website's calls run
on the test's own transaction, rolled back; the people are placeholders (tests/rows.py)."""

import copy
import os

import pytest
from fastapi.testclient import TestClient

from engine.api import deps
from engine.api.app import app
from engine.core import db, settings
from engine.core.staff_write import grant
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
KEY = "test-engine-key"
H = {"X-Engine-Key": KEY}


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.setenv("ENGINE_KEY", KEY)
    with db.connect() as conn:
        app.dependency_overrides[deps.get_conn] = lambda: conn
        try:
            with TestClient(app) as client:
                yield client, conn
        finally:
            app.dependency_overrides.clear()
            conn.rollback()


def _person(conn, name, founder=False):
    sid, email = rows.a_member_of_staff(conn)
    conn.execute("update pii.staff set name = %s where staff_id = %s", (name, sid))
    if founder:
        grant(conn, rows.tenant(conn), sid, "founder", settings.school_today(conn), "test")
    return email


def _get(client, email):
    return client.post("/money/rules/get", headers=H, json={"actor": email})


def _save(client, email, rules, categories, reason=None):
    return client.post(
        "/money/rules/set",
        headers=H,
        json={"actor": email, "rules": rules, "categories": categories, "reason": reason},
    )


def test_anyone_on_the_staff_list_reads_the_rules_but_only_a_founder_may_change_them(engine):
    client, conn = engine
    founder, other = _person(conn, "Pia Placeholder", founder=True), _person(conn, "Omar Placeholder")
    mine, theirs = _get(client, founder).json(), _get(client, other).json()
    assert (mine["can_set"], theirs["can_set"]) == (True, False)
    assert theirs["rules"]["limits"]["screenshot_limit"] == 500 and theirs["version"] == mine["version"]
    assert "Staff welfare & hospitality" in theirs["categories"] and theirs["history"] == mine["history"]
    # the Setup card asks only whether the person may change them: no history, so no name is read
    brief = client.post("/money/rules/get", headers=H, json={"actor": founder, "history": False}).json()
    assert brief["can_set"] is True and brief["history"] == []


def test_a_sign_in_not_on_the_staff_list_and_a_call_without_the_key_are_refused(engine):
    client, _ = engine
    assert _get(client, "nobody@school.invalid").status_code == 403
    assert client.post("/money/rules/get", json={"actor": "x"}).status_code in (401, 500)


def test_a_founder_changes_a_limit_and_the_categories_and_the_history_says_so_in_words(engine):
    client, conn = engine
    founder = _person(conn, "Pia Placeholder", founder=True)
    now = _get(client, founder).json()
    rules = copy.deepcopy(now["rules"])
    rules["limits"]["screenshot_limit"] = 700
    saved = _save(client, founder, rules, [*now["categories"], "Transport"], "the old limit was too tight")
    assert saved.status_code == 200 and saved.json() == {"version": now["version"] + 1}
    after = _get(client, founder).json()
    assert (
        after["rules"]["limits"]["screenshot_limit"] == 700
        and after["categories"][-1] == "Transport"
        and after["version"] == now["version"] + 1
        and len(after["history"]) == len(now["history"]) + 2
    )
    [categories, limit] = after["history"][:2]  # newest first
    assert limit["changes"] == ["raised the payment-screenshot limit from ₹500 to ₹700"]
    assert categories["changes"] == ["added the category “Transport”"]
    for entry in (limit, categories):
        assert (entry["by"], entry["reason"], entry["on"]) == (
            "Pia",
            "the old limit was too tight",
            str(settings.school_today(conn)),
        )
    assert (limit["version"], categories["version"]) == (after["version"], after["version"])


def test_someone_who_may_not_set_the_rules_is_refused_and_nothing_changes(engine):
    client, conn = engine
    founder, other = _person(conn, "Pia Placeholder", founder=True), _person(conn, "Omar Placeholder")
    now = _get(client, founder).json()
    rules = copy.deepcopy(now["rules"])
    rules["limits"]["screenshot_limit"] = 9000
    refused = _save(client, other, rules, [*now["categories"], "Transport"])
    assert refused.status_code == 403 and "co-founders" in refused.json()["detail"]
    assert _get(client, founder).json() == now


def test_rules_that_cannot_work_are_refused_in_words_and_nothing_changes(engine):
    client, conn = engine
    founder = _person(conn, "Pia Placeholder", founder=True)
    now = _get(client, founder).json()
    rules = copy.deepcopy(now["rules"])
    rules["kinds"]["expense"]["approve"] = "educator"
    rules["limits"]["bill_missing_hours"] = -1
    refused = _save(client, founder, rules, now["categories"])
    assert refused.status_code == 422
    said = refused.json()["detail"]
    assert "an expense is approved by an educator, who may not approve claims" in said
    assert "the time allowed for a missing bill must be a number" in said
    assert "expense" not in said.replace("an expense", "") and "_" not in said
    assert _get(client, founder).json() == now


def test_a_list_of_categories_that_will_not_do_is_refused(engine):
    client, conn = engine
    founder = _person(conn, "Pia Placeholder", founder=True)
    now = _get(client, founder).json()
    rules = now["rules"]
    for names, said in (
        ([], "at least one category"),
        (["Tea", "tea "], "listed twice"),
        (["Tea", "  "], "needs a name"),
        (["Tea", "x" * 61], "at most 60 letters"),
    ):
        refused = _save(client, founder, rules, names)
        assert refused.status_code == 422 and said in refused.json()["detail"], names
    assert _get(client, founder).json() == now


def test_saving_without_a_change_adds_nothing_to_the_history_and_a_category_change_keeps_the_version(engine):
    client, conn = engine
    founder = _person(conn, "Pia Placeholder", founder=True)
    now = _get(client, founder).json()
    assert _save(client, founder, now["rules"], now["categories"]).json() == {"version": now["version"]}
    assert _get(client, founder).json()["history"] == now["history"]
    reordered = [*reversed(now["categories"])]
    assert _save(client, founder, now["rules"], reordered).json() == {"version": now["version"]}
    after = _get(client, founder).json()["history"]
    assert len(after) == len(now["history"]) + 1
    assert after[0]["changes"] == ["changed the order of the categories"] and after[0]["reason"] is None


def test_a_second_change_comes_first_and_the_rules_keep_their_version_history(engine):
    client, conn = engine
    founder = _person(conn, "Pia Placeholder", founder=True)
    now = _get(client, founder).json()
    rules, categories = now["rules"], now["categories"]
    for limit in (700, 900):
        rules = copy.deepcopy(rules)
        rules["limits"]["screenshot_limit"] = limit
        _save(client, founder, rules, categories)
    first, second = _get(client, founder).json()["history"][:2]
    assert [first["version"], second["version"]] == [now["version"] + 2, now["version"] + 1]
    assert first["changes"] == ["raised the payment-screenshot limit from ₹700 to ₹900"]
