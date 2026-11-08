"""CP-19 item 1: each line of a parent report is stored on its own (`report_line`) and lists the confirmed, dated
evidence it rests on (`evidence_ids`); a line citing another child's evidence, unconfirmed evidence, or evidence dated
after the report's period (`parent_note.period_to`) is refused by the database.

Needs CP-4 (its `access_table`, where the one new table is listed as child data): fails until CP-4 has merged.
"""

from conftest import AFTER, INSIDE, PERIOD, child, evidence, line, need, note, refused_insert_guard, school, klass


def _setup(c):
    need(c, "report_line")
    s = school(c)
    cls = klass(c, s)
    kid, other = child(c, s, cls), child(c, s, cls)
    return s, kid, other, note(c, s, kid, *PERIOD)


def test_1_a_line_is_stored_with_the_evidence_it_rests_on(conn):
    s, kid, _, n = _setup(conn)
    ev = [evidence(conn, s, kid, INSIDE), evidence(conn, s, kid, INSIDE.replace(day=12))]
    got = line(conn, s, kid, n, ev)
    row = conn.execute("select child_id, parent_note_id, evidence_ids from report_line where id = %s", (got,)).fetchone()
    assert row[0] == kid and row[1] == n
    assert sorted(map(str, row[2])) == sorted(map(str, ev)), "the line does not list the evidence it rests on"
    second = line(conn, s, kid, n, ev[:1], section="nearly")
    assert conn.execute("select count(*) from report_line where parent_note_id = %s", (n,)).fetchone()[0] == 2, \
        "each line of the report is not its own row"
    assert second != got


def test_1_another_childs_evidence_is_refused(conn):
    s, kid, other, n = _setup(conn)
    refused_insert_guard(conn, lambda: line(conn, s, kid, n, [evidence(conn, s, kid, INSIDE),
                                                               evidence(conn, s, other, INSIDE)]))


def test_1_unconfirmed_evidence_is_refused(conn):
    s, kid, _, n = _setup(conn)
    refused_insert_guard(conn, lambda: line(conn, s, kid, n, [evidence(conn, s, kid, INSIDE, confirmed=False)]))


def test_1_evidence_dated_after_the_period_is_refused(conn):
    s, kid, _, n = _setup(conn)
    refused_insert_guard(conn, lambda: line(conn, s, kid, n, [evidence(conn, s, kid, INSIDE),
                                                               evidence(conn, s, kid, AFTER)]))


def test_1_report_line_is_listed_as_child_data(conn):
    """CP-4's table list: the one new table is listed, and as child data."""
    assert conn.execute("select to_regclass('public.access_table') is not null").fetchone()[0], \
        "access_table does not exist: CP-4 has not merged yet, and CP-19 must list report_line in it"
    need(conn, "report_line")
    rows = [r[0] for r in conn.execute("select to_jsonb(a)::text from access_table a").fetchall()
            if '"report_line"' in r[0] or '"public.report_line"' in r[0]]
    assert rows, "report_line is not listed in access_table"
    assert any("child" in r for r in rows), f"report_line is listed but not as child data: {rows}"
