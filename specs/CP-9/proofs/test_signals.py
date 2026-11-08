"""CP-9 item 5: three signals stay distinct: blank, wrong, wrong-with-working.

Scope (design, item 5): written answers (`item_result`). Three answers of one child on one skill: blank, wrong with
`working_shown = 'none'`, wrong with `working_shown = 'partial'`, signed off (`confirm_results`). After the nightly run:
the three `item_result` rows are unchanged; their evidence rows carry marks blank / wrong / wrong, each linked by
`item_result_id` to its own (`status`, `working_shown`) pair, three distinct pairs; and the graph keeps blank apart from
wrong (blank is no answer, `correct` null and not counted as answered; wrong is `correct` false and counted).
"""

from conftest import a_child, a_paper, run_nightly, tenant

THREE = [("blank", "none"), ("wrong", "none"), ("wrong", "partial")]


def test_5_blank_wrong_and_wrong_with_working_stay_three(conn):
    t = tenant(conn)
    child = a_child(conn, t)
    ids = a_paper(conn, t, child, THREE)
    conn.execute("select confirm_results(%s, 'cp9 proof')", (child,))
    conn.commit()
    before = {r["id"]: r["j"] for r in conn.execute(
        "select id, to_jsonb(r) as j from item_result r where id = any(%s)", (ids,))}

    conn.execute("set role app_engine")
    run_nightly(conn)
    conn.commit()
    conn.execute("reset role")

    after = {r["id"]: r["j"] for r in conn.execute(
        "select id, to_jsonb(r) as j from item_result r where id = any(%s)", (ids,))}
    assert after == before, "the nightly run changed a written answer"
    linked = conn.execute(
        "select e.mark, e.correct, r.status, r.working_shown from evidence_event e"
        " join item_result r on r.id = e.item_result_id where r.id = any(%s) and e.confirmed_by is not null"
        " order by r.status, r.working_shown", (ids,)).fetchall()
    assert [(r["mark"], r["status"], r["working_shown"]) for r in linked] == [
        ("blank", "blank", "none"), ("wrong", "wrong", "none"), ("wrong", "wrong", "partial")], linked
    assert len({(r["status"], r["working_shown"]) for r in linked}) == 3
    assert [r["correct"] for r in linked] == [None, False, False], "blank collapsed into wrong, or wrong into blank"
    state = conn.execute("select n_events, n_correct from child_skill_state where child_id = %s"
                         " and skill_code = 'NUM.OPS.02'", (child,)).fetchall()
    assert [(r["n_events"], r["n_correct"]) for r in state] == [(2, 0)], \
        f"the graph should count the two wrong answers as answered and the blank as none: {state}"
