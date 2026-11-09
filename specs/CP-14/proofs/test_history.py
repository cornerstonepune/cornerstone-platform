"""CP-14 item 3: every confirmation and withdrawal is kept in the edit history with who and when; a later decision never
erases an earlier one.

The edit history is `curriculum_edit` (design §2): one row per changed field of a `skill_link`, record `skill_link`,
code `<before_code>><skill_code>`, `changed_by` the deciding person's staff id, `created_at` the moment. One link goes
through confirm (person C), withdraw (person W, with a reason), confirm again (person R): each decision's rows are
there, in order, naming its person, and every row written by an earlier decision is still there, unchanged, after the
later ones. The history refuses an edit.
"""

import psycopg
import pytest

from conftest import csv_of, person, school


def _history(conn, s, code):
    return conn.execute("select id, field, before, after, changed_by, created_at from curriculum_edit"
                        " where tenant_id = %s and record = 'skill_link' and code = %s order by created_at, id",
                        (s["tenant"], code)).fetchall()


def test_each_decision_is_kept_with_who_and_when_and_none_is_erased(conn, monkeypatch, tmp_path):
    from engine.w3_read import skill_links

    s = school(conn, monkeypatch)
    sk = s["sk"]
    _, loader = person(conn, s, "educator")
    c_id, c = person(conn, s, "coordinator")
    w_id, w = person(conn, s, "class_teacher")
    r_id, r = person(conn, s, "deputy_coordinator")
    f = csv_of(tmp_path, (sk["A"], sk["C"]))
    code = f"{sk['A']}>{sk['C']}"
    skill_links.load(conn, f, loader)

    skill_links.confirm_file(conn, f, c)
    first = _history(conn, s, code)
    skill_links.withdraw(conn, sk["A"], sk["C"], w, "A proof reason to say no")
    second = _history(conn, s, code)
    skill_links.confirm_file(conn, f, r)
    third = _history(conn, s, code)

    assert first, "confirming wrote no edit history for the link"
    assert first == second[:len(first)] and second == third[:len(second)], \
        "a later decision changed or removed an earlier history row"

    status = [(h["before"], h["after"], h["changed_by"]) for h in third if h["field"] == "status" and h["before"]]
    assert status == [("proposed", "confirmed", str(c_id)), ("confirmed", "withdrawn", str(w_id)),
                      ("withdrawn", "confirmed", str(r_id))], status
    by = [(h["after"], h["changed_by"]) for h in third if h["field"] == "confirmed_by"]
    assert (str(c_id), str(c_id)) in by and (str(r_id), str(r_id)) in by, by
    assert ("A proof reason to say no", str(w_id)) in \
        [(h["after"], h["changed_by"]) for h in third if h["field"] == "withdrawn_reason"]
    assert any(before == str(c_id) and who == str(w_id) for before, who in
               [(h["before"], h["changed_by"]) for h in third if h["field"] == "confirmed_by"]), \
        "the withdrawal clearing who confirmed is not kept"
    stamps = [h["created_at"] for h in third]
    assert all(stamps) and stamps == sorted(stamps), "each row carries when, in the order it happened"

    with pytest.raises(psycopg.Error):
        with conn.transaction():
            conn.execute("update curriculum_edit set after = 'erased' where id = %s", (first[0]["id"],))
    with pytest.raises(psycopg.Error):
        with conn.transaction():
            conn.execute("delete from curriculum_edit where id = %s", (first[0]["id"],))
