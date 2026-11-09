"""CP-13 item 4: every child state that would change is listed, counts only, and nothing is applied (D7).

`public.graph_state_changes(p_child uuid default null) returns table (grade_code text, old_state text, new_state text,
skills int, children int)`, stable: one row per grade and transition where the stored `child_skill_state.state`
(the literal 'none' when there is no stored row) differs from what `graph_skill_states` now gives. `engine graph
--changes` prints those rows and exits 0.

Applying is a separate step Nimish approves, so these proofs check only that the list exists and is counts only, and
that running it (the function and the CLI flag) leaves every `child_skill_state` row identical, ids and clocks
included, i.e. the rebuild was never invoked. They never check that the list was applied.
"""

import os
import re
import subprocess

import psycopg

from conftest import ROOT, child, rebuild, school, written

SIG = [("grade_code", "text"), ("old_state", "text"), ("new_state", "text"), ("skills", "integer"),
       ("children", "integer")]


def _fn(conn):
    return conn.execute(
        "select p.oid, p.provolatile, pg_get_function_arguments(p.oid), p.prosrc from pg_proc p"
        " join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'graph_state_changes'"
    ).fetchall()


def test_the_list_function_is_stable_counts_only_and_takes_one_optional_child(conn):
    found = _fn(conn)
    assert len(found) == 1, "public.graph_state_changes does not exist (or is overloaded)"
    oid, volatile, args, src = found[0]
    assert volatile == "s", f"provolatile is {volatile!r}, not stable"
    assert args == "p_child uuid DEFAULT NULL::uuid", args
    out = conn.execute(
        "select a.name, format_type(a.typ, null) from pg_proc p,"
        " unnest(p.proallargtypes, p.proargmodes, p.proargnames) with ordinality as a(typ, mode, name, i)"
        " where p.oid = %s and a.mode = 't' order by a.i", (oid,)).fetchall()
    assert out == SIG, out  # counts only: no uuid, no free text beyond grade and state codes
    assert "rebuild_child" not in src and not re.search(r"\b(insert\s+into|delete\s+from|truncate)\b", src, re.I)


def _snapshot(conn):
    """Every child_skill_state row, every column: a rebuild deletes and re-inserts, so ids and clocks would move."""
    return sorted(tuple(str(v) for v in r) for r in conn.execute("select * from child_skill_state").fetchall())


def _fixture(conn):
    """A fake school: one Grade 2 child stored practising, now with answers that make it secure, to re-check; two
    Grade 2 children with answers and no stored row; one Grade 3 child stored and unchanged."""
    t = school(conn)
    moved, new1, new2, same = child(conn, t), child(conn, t), child(conn, t), child(conn, t, band="G3")
    written(conn, t, moved, 0, "R R R R R")
    rebuild(conn, moved)
    written(conn, t, moved, 3, "R R R R R")
    for kid in (new1, new2):
        written(conn, t, kid, 0, "R W R")
    written(conn, t, same, 0, "R R R R R")
    rebuild(conn, same)
    return t, moved, new1, new2, same


def _expected(conn, t, kid=None):
    """Worked from the stored rows and graph_skill_states, the way the list is defined."""
    return sorted(conn.execute(
        "select c.band, coalesce(s.state, 'none'), g.state, count(*)::int, count(distinct g.child_id)::int"
        " from public.graph_skill_states(%s) g join child c on c.id = g.child_id"
        " left join child_skill_state s on s.child_id = g.child_id and s.skill_code = g.skill_code"
        "  and s.rung_code is not distinct from g.rung_code"
        " where c.tenant_id = %s and coalesce(s.state, 'none') is distinct from g.state group by 1, 2, 3",
        (kid, t)).fetchall())


def _listed(conn, t, kid=None):
    return sorted(conn.execute(
        "select l.grade_code, l.old_state, l.new_state, l.skills, l.children"
        " from public.graph_state_changes(%s) l where l.grade_code in (select code from grade where tenant_id = %s)",
        (kid, t)).fetchall())


def test_the_list_counts_each_grade_and_transition_and_changes_nothing(conn):
    assert len(_fn(conn)) == 1, "public.graph_state_changes does not exist"
    t, moved, new1, _, same = _fixture(conn)
    before = _snapshot(conn)
    every = conn.execute("select * from public.graph_state_changes()").fetchall()
    rows = _listed(conn, t)
    assert ("G2", "practising", "secure_to_recheck", 1, 1) in rows, rows
    assert any(r[0] == "G2" and r[1] == "none" and r[3] == 2 and r[4] == 2 for r in rows), rows
    assert all(r[1] != r[2] for r in every), "a row lists a state that does not change"
    assert not any(r[0] == "G3" for r in rows), "an unchanged child is listed"
    assert rows == _expected(conn, t)
    one = conn.execute("select * from public.graph_state_changes(%s)", (new1,)).fetchall()
    assert [tuple(r)[1:] for r in one] == [("none", _expected(conn, t, new1)[0][2], 1, 1)], one
    assert conn.execute("select count(*) from public.graph_state_changes(%s)", (same,)).fetchone()[0] == 0
    assert _snapshot(conn) == before, "listing changed child_skill_state"


def test_engine_graph_changes_prints_the_list_and_never_rebuilds(server):
    """The CLI is a second process, so this one fake school is committed, and deleted again afterwards."""
    with psycopg.connect(server) as conn:
        t, *_ = _fixture(conn)
        conn.commit()
    try:
        with psycopg.connect(server) as conn:
            before = _snapshot(conn)
            want = _listed(conn, t) if _fn(conn) else []
        env = {**os.environ, "DATABASE_URL": server}  # the throwaway database, never the live one
        out = subprocess.run([str(ROOT / "bin" / "engine"), "graph", "--changes"], capture_output=True, text=True,
                             env=env, cwd=ROOT, timeout=90)
        assert out.returncode == 0, out.stderr[-800:]
        assert "secure_to_recheck" in out.stdout and "none" in out.stdout, out.stdout[-800:]
        assert want, "nothing to list"
        with psycopg.connect(server) as conn:
            assert _snapshot(conn) == before, "engine graph --changes changed child_skill_state"
    finally:
        with psycopg.connect(server) as conn:
            conn.execute("set session_replication_role = replica")  # evidence is append-only by trigger
            for schema, table in conn.execute(
                    "select table_schema, table_name from information_schema.columns c where column_name = 'tenant_id'"
                    " and table_schema in ('public', 'pii') and (select table_type from information_schema.tables x"
                    " where x.table_schema = c.table_schema and x.table_name = c.table_name) = 'BASE TABLE'"
            ).fetchall():
                conn.execute(f'delete from {schema}."{table}" where tenant_id = %s', (t,))
            conn.execute("delete from tenant where id = %s", (t,))
            conn.commit()
