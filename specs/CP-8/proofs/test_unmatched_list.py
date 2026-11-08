"""CP-8 item 2 (test part): every K2 plan line is either linked or on the named list `plan_unmatched` with a reason
(no_match / several_matches / ready_to_link); none is silently unlinked, also after an undo and after a new line is
added. Placeholder rows, one rolled-back transaction (see conftest.py)."""

from conftest import add_line, apply_run, undo_run, unmatched
from engine.core import db

REASONS = {"no_match", "several_matches", "ready_to_link"}


def test_each_unlinked_line_is_listed_with_its_reason_and_a_linked_line_is_not(conn, k2):
    got = unmatched(conn, k2)
    lines = k2["lines"]
    assert lines["loader"] not in got, "a linked line is on the unmatched list"
    assert got.get(lines["none"]) == ("no_match", 0), got.get(lines["none"])
    assert got.get(lines["tie"]) == ("several_matches", 2), got.get(lines["tie"])
    assert got.get(lines["ready"]) == ("ready_to_link", 1), got.get(lines["ready"])
    assert got.get(lines["ready2"]) == ("ready_to_link", 1), got.get(lines["ready2"])
    for b in k2["lines_b"]:
        assert got.get(b) == ("no_match", 0), got.get(b)


def test_no_plan_line_anywhere_is_unlinked_and_unlisted(conn, k2):
    unlinked = {
        r["id"] for r in conn.execute("select id from plan_entry where activity_id is null").fetchall()
    }
    listed = conn.execute("select plan_entry_id, reason from plan_unmatched").fetchall()
    ids = [r["plan_entry_id"] for r in listed]
    assert len(ids) == len(set(ids)), "a line is on the unmatched list twice"
    assert set(ids) == unlinked, (
        f"{len(unlinked - set(ids))} unlinked lines are not listed; {len(set(ids) - unlinked)} listed lines are linked"
    )
    assert {r["reason"] for r in listed} <= REASONS, {r["reason"] for r in listed} - REASONS


def test_after_a_run_the_linked_lines_leave_the_list_and_after_its_undo_they_are_back(conn, k2):
    lines = k2["lines"]
    run = apply_run(conn, k2)
    after = unmatched(conn, k2)
    assert lines["ready"] not in after and lines["ready2"] not in after, (
        "a line the run linked is still listed"
    )
    assert after.get(lines["tie"]) == ("several_matches", 2) and after.get(lines["none"]) == ("no_match", 0)
    undo_run(conn, run)
    back = unmatched(conn, k2)
    assert back.get(lines["ready"]) == ("ready_to_link", 1), (
        "after the undo the line is unlinked but not listed"
    )
    assert back.get(lines["ready2"]) == ("ready_to_link", 1), (
        "after the undo the line is unlinked but not listed"
    )


def test_a_line_added_later_or_unlinked_by_hand_is_listed_at_once(conn, k2):
    fresh = add_line(conn, k2, f"Placeholder brand new {k2['tag']}", 50)
    matching = add_line(conn, k2, k2["names"]["other"], 51)
    conn.execute("update plan_entry set activity_id = null where id = %s", (k2["lines"]["loader"],))
    got = unmatched(conn, k2)
    assert got.get(fresh) == ("no_match", 0), got.get(fresh)
    assert got.get(matching) == ("ready_to_link", 1), got.get(matching)
    assert got.get(k2["lines"]["loader"]) == ("ready_to_link", 1), "a line unlinked by hand is not listed"


def test_the_list_names_each_line(conn, k2):
    """The list carries what a person needs to find the line: its class, fortnight, heading and text."""
    r = db.one(
        conn,
        "select tenant_id, school_class_id, fortnight_id, plan_key, text, reason, candidates from plan_unmatched"
        " where plan_entry_id = %s",
        (k2["lines"]["none"],),
    )
    assert (r["tenant_id"], r["school_class_id"], r["plan_key"], r["text"]) == (
        k2["tenant"],
        k2["class"],
        "math",
        k2["names"]["none"],
    )
    assert (
        r["fortnight_id"]
        == db.one(conn, "select fortnight_id from plan_entry where id = %s", (k2["lines"]["none"],))[
            "fortnight_id"
        ]
    )
