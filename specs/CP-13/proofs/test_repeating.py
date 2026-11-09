"""CP-13 item 1: a mistake absent from a child's recent answers stops marking that child as "repeating" (D3).

Through `rebuild_child_skill_state` on a fake child: a mistake in 2 of a level's recent answers is `patterned_error`
and named in `repeating_misconception`; after enough later answers without it, a rebuild names no mistake and the
state is no longer `patterned_error`.
"""

from conftest import child, one_state, school, written


def test_a_mistake_pushed_out_of_the_recent_answers_stops_repeating(conn):
    """The later answers are wrong with no mistake named, so no right answer clears it: only its absence from the
    recent answers does (the window is state.window_answers, 10 by default)."""
    t = school(conn)
    kid = child(conn, t)
    written(conn, t, kid, 0, "W:M_ALIGN_LEFT W:M_ALIGN_LEFT R R")
    row = one_state(conn, kid)
    assert (row["state"], row["repeating_misconception"]) == ("patterned_error", "M_ALIGN_LEFT")

    written(conn, t, kid, 7, "W W W W W")
    written(conn, t, kid, 14, "W W W W W W")  # 11 later answers: neither showing of the mistake is recent
    row = one_state(conn, kid)
    assert row["repeating_misconception"] is None, row
    assert row["state"] != "patterned_error", row


def test_a_mistake_followed_by_right_answers_stops_repeating(conn):
    t = school(conn)
    kid = child(conn, t)
    written(conn, t, kid, 0, "W:M_ALIGN_LEFT W:M_ALIGN_LEFT R")
    row = one_state(conn, kid)
    assert (row["state"], row["repeating_misconception"]) == ("patterned_error", "M_ALIGN_LEFT")

    written(conn, t, kid, 7, "R R R R R R R R R R R")
    row = one_state(conn, kid)
    assert row["repeating_misconception"] is None, row
    assert row["state"] != "patterned_error", row


def test_a_mistake_still_in_the_recent_answers_still_repeats(conn):
    """The other side, so the two above cannot pass by never naming a mistake at all."""
    t = school(conn)
    kid = child(conn, t)
    written(conn, t, kid, 0, "R R R")
    written(conn, t, kid, 7, "W W:M_ALIGN_LEFT W W:M_ALIGN_LEFT")
    row = one_state(conn, kid)
    assert (row["state"], row["repeating_misconception"]) == ("patterned_error", "M_ALIGN_LEFT")
