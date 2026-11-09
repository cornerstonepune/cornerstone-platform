"""CP-13 item 5: the three signals stay distinct: blank, wrong, wrong-with-working (D4).

One fake paper read and signed off the school's way (`confirm_results`, which writes evidence through
`answer_evidence`): one right answer, one blank, one wrong with no mistake named and one wrong with its working read
as a named mistake. Read back through `graph_answer`: blank is `correct` null, wrong is `correct` false with no codes,
wrong-with-working is `correct` false with its code; three distinct shapes, none collapsed into another. Only the
non-blank answers count toward a level's window (`n_events`), and the blank is still an answer given, not a wrong one.
"""

from conftest import child, paper, rebuild, school


def test_blank_wrong_and_wrong_with_working_are_three_stored_signals(conn):
    t = school(conn)
    kid = child(conn, t)
    right, blank, wrong, working = paper(conn, t, kid, 0, "correct blank wrong wrong:M_ALIGN_LEFT")
    shapes = {}
    for result, correct, codes in conn.execute(
            "select r.id, g.correct, g.misconception_codes from graph_answer g"
            " join item_result r on r.id = g.answer where g.child_id = %s", (kid,)).fetchall():
        shapes.setdefault(result, set()).add((correct, tuple(codes)))
    assert shapes == {
        right: {(True, ())},
        blank: {(None, ())},
        wrong: {(False, ())},
        working: {(False, ("M_ALIGN_LEFT",))},
    }, shapes
    signals = [shapes[blank], shapes[wrong], shapes[working]]
    assert len({frozenset(s) for s in signals}) == 3  # none collapsed into "incorrect"


def test_only_right_and_wrong_answers_fill_the_window(conn):
    t = school(conn)
    kid = child(conn, t)
    paper(conn, t, kid, 0, "correct blank wrong wrong:M_ALIGN_LEFT")
    [(n_events, n_correct)] = conn.execute(
        "select n_events, n_correct from public.graph_level_window(%s) where scope = 'skill'", (kid,)).fetchall()
    assert (n_events, n_correct) == (3, 1)  # the blank is not counted wrong, and not counted at all
    [row] = rebuild(conn, kid)
    assert (row["n_events"], row["n_correct"]) == (3, 1)
