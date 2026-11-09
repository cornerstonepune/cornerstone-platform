"""CP-13 item 6: the graph is rebuilt from confirmed evidence only and gives the same result when rebuilt twice (D5).

- Unconfirmed evidence (no `confirmed_by`), however much of it, changes no `child_skill_state` row; a child with only
  unconfirmed evidence has none. An answer read but not signed off writes no evidence and changes nothing either.
- Two consecutive `rebuild_child_skill_state` calls give identical rows, apart from ids and clock columns.
"""

from conftest import child, paper, rebuild, school, skill_rows, written


def test_unconfirmed_evidence_changes_no_state(conn):
    t = school(conn)
    kid, only_unconfirmed = child(conn, t), child(conn, t)
    written(conn, t, kid, 0, "R R R R R")
    written(conn, t, kid, 3, "R R R R R")
    confirmed_only = rebuild(conn, kid)
    assert confirmed_only and confirmed_only[0]["n_events"] == 10, confirmed_only

    written(conn, t, kid, 5, "W:M_ALIGN_LEFT W:M_ALIGN_LEFT W W W W W W W W", confirmed=False)
    assert rebuild(conn, kid) == confirmed_only

    written(conn, t, only_unconfirmed, 0, "R R R R R W:M_ALIGN_LEFT W:M_ALIGN_LEFT", confirmed=False)
    assert rebuild(conn, only_unconfirmed) == []


def test_an_answer_not_signed_off_changes_nothing(conn):
    t = school(conn)
    kid = child(conn, t)
    paper(conn, t, kid, 0, "correct correct correct correct")
    signed = skill_rows(conn, kid)
    assert signed and signed[0]["n_events"] == 4, signed
    waiting = paper(conn, t, kid, 2, "wrong:M_ALIGN_LEFT wrong:M_ALIGN_LEFT wrong wrong", signed_off=False)
    assert conn.execute("select count(*) from evidence_event where item_result_id = any(%s)",
                        (waiting,)).fetchone()[0] == 0
    assert rebuild(conn, kid) == signed


def test_rebuilt_twice_the_same(conn):
    t = school(conn)
    kid = child(conn, t)
    written(conn, t, kid, 0, "R W:M_ALIGN_LEFT R B R")
    written(conn, t, kid, 4, "W:M_ALIGN_LEFT R R W R")
    written(conn, t, kid, 20, "R R R B R R")
    paper(conn, t, kid, 21, "correct blank wrong wrong:M_ALIGN_LEFT")
    first = rebuild(conn, kid)
    assert first, "nothing was built"
    second = rebuild(conn, kid)
    assert second == first
    graph = "select * from public.graph_skill_states(%s) order by skill_code, rung_code"
    assert conn.execute(graph, (kid,)).fetchall() == conn.execute(graph, (kid,)).fetchall()
