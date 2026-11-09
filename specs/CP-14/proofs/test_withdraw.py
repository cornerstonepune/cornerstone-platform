"""CP-14 item 2: a person can withdraw a link, proposed or confirmed, with a reason. It stops counting for "ready next"
at once; a blank reason is refused.

Through `skill_links.withdraw(conn, before, after, by, reason)` (what `engine skill-links withdraw --before --after --by
--reason` runs) and the database function it calls, `withdraw_skill_link(p_tenant, p_before, p_after, p_staff,
p_reason)` (design §2). "Stops counting" is read where it counts: the child page's `ready_next` and `ready_activities`,
in the same transaction, straight after.
"""

import pytest

from conftest import activity, child, csv_of, page, person, school, state, status_of


def _setup(conn, monkeypatch, tmp_path):
    from engine.w3_read import skill_links

    s = school(conn, monkeypatch)
    _, loader = person(conn, s, "educator")
    checker_id, checker = person(conn, s, "coordinator")
    withdrawer_id, withdrawer = person(conn, s, "class_teacher")
    sk = s["sk"]
    f = csv_of(tmp_path, (sk["A"], sk["C"]), (sk["B"], sk["E"]))
    skill_links.load(conn, f, loader)
    skill_links.confirm(conn, str(status_of(conn, s, "A", "C")["id"]), checker)  # A before C confirmed; B before E not
    return s, skill_links, withdrawer_id, withdrawer, checker


def test_a_confirmed_link_withdrawn_with_a_reason_stops_counting_at_once(conn, monkeypatch, tmp_path):
    s, skill_links, withdrawer_id, withdrawer, checker = _setup(conn, monkeypatch, tmp_path)
    sk = s["sk"]
    act = activity(conn, s, 1, "C")
    kid = child(conn, s, s["class"], "1")
    state(conn, s, kid, "A", "secure")
    before = page(conn, checker, s["class"], "1")
    assert [r["skill"]["code"] for r in before["ready_next"]] == [sk["C"]], "C is ready on the confirmed link"
    assert [r["activity"]["code"] for r in before.get("ready_activities", [])] == [act], \
        "the child page has no ready_activities for C's activity"

    skill_links.withdraw(conn, sk["A"], sk["C"], withdrawer, "A proof reason: C does not need A")
    row = status_of(conn, s, "A", "C")
    assert row["status"] == "withdrawn" and not row["counts"]
    assert (row["withdrawn_by"], row["withdrawn_reason"]) == (withdrawer_id, "A proof reason: C does not need A")
    assert row["confirmed_by"] is None and row["confirmed_at"] is None
    after = page(conn, checker, s["class"], "1")
    assert after["ready_next"] == [] and after["ready_activities"] == [], "a withdrawn link still counts"


def test_a_proposed_link_can_be_withdrawn_without_being_confirmed_first(conn, monkeypatch, tmp_path):
    s, skill_links, withdrawer_id, withdrawer, _ = _setup(conn, monkeypatch, tmp_path)
    assert status_of(conn, s, "B", "E")["status"] == "proposed"
    skill_links.withdraw(conn, s["sk"]["B"], s["sk"]["E"], withdrawer, "Not how K2 teaches it")
    row = status_of(conn, s, "B", "E")
    assert (row["status"], row["withdrawn_by"], row["withdrawn_reason"], row["confirmed_by"]) == \
        ("withdrawn", withdrawer_id, "Not how K2 teaches it", None)


@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
def test_a_blank_reason_is_refused_and_the_link_is_left_as_it_was(conn, monkeypatch, tmp_path, blank):
    s, skill_links, withdrawer_id, withdrawer, _ = _setup(conn, monkeypatch, tmp_path)
    sk = s["sk"]
    with pytest.raises(skill_links.Refused):
        with conn.transaction():
            skill_links.withdraw(conn, sk["A"], sk["C"], withdrawer, blank)
    assert status_of(conn, s, "A", "C")["status"] == "confirmed"
    word = conn.execute("select public.withdraw_skill_link(%s, %s, %s, %s, %s) as w",
                        (s["tenant"], sk["B"], sk["E"], withdrawer_id, blank)).fetchone()["w"]
    assert word == "blank reason", word
    assert status_of(conn, s, "B", "E")["status"] == "proposed"
