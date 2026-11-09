"""CP-13 item 3: the minimum number of adults is a row per grade, 2 by default and 1 for K2, and changing the row
changes the result with no code change (D1, D6).

- `grade.min_adults`: an int, not null, default 2, above 0. A new school gets 1 for K2 and 2 for every other grade; a
  grade added later gets 2.
- K2 observed path: one adult naming a child on two days is `secure_to_recheck` with K2's 1; `update grade set
  min_adults = 2` for K2, rebuild, and it is not; a second adult and it is again.
- Written graph (the child's own grade, `child.band`): one adult is practising under Grade 2's default 2; set Grade 2's
  row to 1, rebuild, and it is secure, to re-check.
- One home: no `observed_rule.min_adults`, no `state.min_adults` threshold in the seed or read by a graph function.
- Static: no Python or TypeScript under packages/engine/engine or apps/web carries a min_adults number or the
  `state.min_adults` key.
"""

import json
import re

from conftest import ROOT, child, k2_class, observed, one_state, school, seen, staff, written

ONE = "11111111-1111-4111-8111-111111111111"


def test_min_adults_is_a_column_of_grade_two_by_default_one_for_k2(conn):
    col = conn.execute(
        "select data_type, is_nullable, column_default from information_schema.columns"
        " where table_schema = 'public' and table_name = 'grade' and column_name = 'min_adults'").fetchone()
    assert col is not None, "grade.min_adults does not exist"
    assert col[0] == "integer" and col[1] == "NO" and col[2] == "2", col
    t = school(conn)
    rows = dict(conn.execute("select code, min_adults from grade where tenant_id = %s", (t,)).fetchall())
    assert rows.pop("K2") == 1
    assert rows and set(rows.values()) == {2}, rows
    conn.execute("insert into grade (tenant_id, code, name, ord) values (%s, 'GX', 'Proof grade', 99)", (t,))
    assert conn.execute("select min_adults from grade where tenant_id = %s and code = 'GX'", (t,)).fetchone()[0] == 2
    conn.execute("savepoint s")
    try:
        conn.execute("update grade set min_adults = 0 where tenant_id = %s and code = 'GX'", (t,))
        raised = False
    except Exception:
        raised = True
    conn.execute("rollback to savepoint s")
    assert raised, "min_adults 0 was accepted"


def test_editing_k2s_row_moves_the_observed_result(conn):
    t = school(conn)
    k = k2_class(conn, t)
    kid = child(conn, t, band="K2")
    a = staff(conn, k)
    seen(conn, k, kid, 0, a)
    seen(conn, k, kid, 1, a)
    [(_, _, state, _)] = observed(conn, kid)
    assert state == "secure_to_recheck"  # K2's row: one adult is enough

    conn.execute("update grade set min_adults = 2 where tenant_id = %s and code = 'K2'", (t,))
    [(_, _, state, _)] = observed(conn, kid)
    assert state not in ("secure_to_recheck", "secure"), state

    seen(conn, k, kid, 2, staff(conn, k))  # a second adult
    [(_, _, state, _)] = observed(conn, kid)
    assert state == "secure_to_recheck"


def test_editing_a_written_grades_row_moves_the_written_result(conn):
    t = school(conn)
    kid = child(conn, t, band="G2")
    written(conn, t, kid, 0, "R R R R R", seen_by=ONE)
    written(conn, t, kid, 3, "R R R R R", seen_by=ONE)
    assert one_state(conn, kid)["state"] == "practising"  # Grade 2's default: 2 adults

    conn.execute("update grade set min_adults = 1 where tenant_id = %s and code = 'G2'", (t,))
    assert one_state(conn, kid)["state"] == "secure_to_recheck"

    conn.execute("update child set band = 'G3' where id = %s", (kid,))  # the child's grade now, read live
    assert one_state(conn, kid)["state"] == "practising"


def test_the_minimum_has_one_home(conn):
    assert conn.execute(
        "select 1 from information_schema.columns where table_schema = 'public' and table_name = 'observed_rule'"
        " and column_name = 'min_adults'").fetchone() is None, "observed_rule.min_adults still exists"
    seed = json.loads((ROOT / "supabase" / "seed" / "thresholds.json").read_text())
    assert "state.min_adults" not in json.dumps(seed), "supabase/seed/thresholds.json still has state.min_adults"
    readers = [r[0] for r in conn.execute(
        "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
        " where n.nspname in ('public', 'internal') and p.prosrc like '%state.min_adults%'")]
    assert readers == [], f"functions still read the threshold state.min_adults: {readers}"


SKIP = {"node_modules", ".next", ".venv", "__pycache__", "test-results", "playwright-report"}
LITERAL = re.compile(r"state\.min_adults|min_?adults\s*(?::\s*\w+\s*)?[=:]\s*\d", re.IGNORECASE)


def test_no_code_carries_the_minimum():
    hits = []
    for base in (ROOT / "packages" / "engine" / "engine", ROOT / "apps" / "web"):
        for path in base.rglob("*"):
            if path.suffix not in (".py", ".ts", ".tsx") or SKIP & set(path.parts):
                continue
            for n, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
                if LITERAL.search(line):
                    hits.append(f"{path.relative_to(ROOT)}:{n}")
    assert hits == [], hits
