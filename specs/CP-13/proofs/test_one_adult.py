"""CP-13 item 2: two notes by the same adult count as one adult (D2).

- K2 observed path: two confirmed observed notes by one staff id, on different days, on one skill give `adults` = 1 in
  `child_observed_state`; a second, different staff id gives 2.
- Written graph: answers naming one adult on two days count 1 adult in `graph_level_window`, so under the minimum of 2
  (the default for a Grade 2 child) the level is never past practising; a second adult on the same answers lifts it.
"""

from conftest import child, k2_class, observed, one_state, school, seen, staff, written


def test_one_adult_noting_twice_is_one_adult_on_the_observed_path(conn):
    t = school(conn)
    k = k2_class(conn, t)
    kid = child(conn, t, band="K2")
    a, b = staff(conn, k), staff(conn, k)
    seen(conn, k, kid, 0, a)
    seen(conn, k, kid, 1, a)
    [(_, grade, _, adults)] = observed(conn, kid)
    assert (grade, adults) == ("K2", 1)
    seen(conn, k, kid, 2, b)
    [(_, _, _, adults)] = observed(conn, kid)
    assert adults == 2


def _secure_ledger(conn, t, kid, first, second):
    """Everything secure needs on a written level (enough answers, two days, all right) bar the adults; the two days'
    answers name `first` and `second`."""
    written(conn, t, kid, 0, "R R R R R", seen_by=first)
    written(conn, t, kid, 3, "R R R R R", seen_by=second)


def _adults(conn, kid):
    return [r[0] for r in conn.execute(
        "select adults from public.graph_level_window(%s) where scope = 'skill'", (kid,))]


def test_one_adult_naming_two_days_is_one_adult_on_the_written_graph(conn):
    t = school(conn)
    same, two = child(conn, t), child(conn, t)
    _secure_ledger(conn, t, same, "11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111")
    _secure_ledger(conn, t, two, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")
    assert _adults(conn, same) == [1]
    assert _adults(conn, two) == [2]
    assert one_state(conn, same)["state"] == "practising"  # one adult, the grade's minimum is 2
    assert one_state(conn, two)["state"] not in ("practising", "emerging", "patterned_error", "not_enough_yet")
