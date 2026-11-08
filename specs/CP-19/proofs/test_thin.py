"""CP-19 item 2: a line resting on fewer pieces of evidence than the school's "seen enough" setting (the `threshold`
row state.min_events) shows as thin in `report_line_now`; changing the row changes which lines are thin, with no code
change. A `next` line is a suggestion: it cites nothing and is never thin.
"""

import datetime as dt

from conftest import INSIDE, PERIOD, child, evidence, klass, line, min_events, need, note, school


def test_2_thin_follows_the_seen_enough_setting(conn):
    c = conn
    need(c, "report_line", "report_line_now")
    s = school(c)
    kid = child(c, s, klass(c, s))
    n = note(c, s, kid, *PERIOD)
    ev = [evidence(c, s, kid, INSIDE + dt.timedelta(minutes=i)) for i in range(3)]
    one, two, three = (line(c, s, kid, n, ev[:k], section=sec) for k, sec in ((1, "can_do"), (2, "nearly"),
                                                                              (3, "improving")))
    nxt = line(c, s, kid, n, [], section="next")

    def thin():
        rows = dict(c.execute("select id, thin from report_line_now where parent_note_id = %s", (n,)).fetchall())
        assert set(rows) == {one, two, three, nxt}, "report_line_now does not show every line of the report"
        return {k for k, v in rows.items() if v}

    min_events(c, s["tenant"], 2)
    assert thin() == {one}
    min_events(c, s["tenant"], 3)
    assert thin() == {one, two}
    min_events(c, s["tenant"], 4)
    assert thin() == {one, two, three}
    min_events(c, s["tenant"], 1)
    assert thin() == set()
