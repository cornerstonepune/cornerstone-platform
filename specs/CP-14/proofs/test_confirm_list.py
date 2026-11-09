"""CP-14 item 1: a person confirms a reviewed list in one step, by skill pairs. Every link in the file is then confirmed
and names that person; if any pair in the file is wrong, nothing is confirmed and the line is named.

Through the commands a person runs (design §1): `engine skill-links load <csv> --by <email>` and
`engine skill-links confirm --file <csv> --by <email>`, the same file that was loaded. The commands are a second process,
so this one fake school is committed to the throwaway database (its DATABASE_URL, never the live one) and deleted again
afterwards.
"""

import os
import subprocess

import psycopg
from psycopg.rows import dict_row

from conftest import ROOT, csv_of, person, school

GOOD = [("A", "C"), ("B", "E"), ("A", "F")]


def _engine(server, slug, *args):
    env = {**os.environ, "DATABASE_URL": server, "TENANT_SLUG": slug}  # the throwaway database and the fake school
    return subprocess.run([str(ROOT / "bin" / "engine"), "skill-links", *map(str, args)], capture_output=True,
                          text=True, env=env, cwd=ROOT, timeout=90)


def _links(server, t):
    with psycopg.connect(server, row_factory=dict_row) as c:
        return {(r["before_code"][-1], r["skill_code"][-1]): r for r in c.execute(
            "select l.before_code, l.skill_code, l.status, l.confirmed_by, st.confirmed as counts from skill_link l"
            " join link_status st on st.tenant_id = l.tenant_id and st.code = l.status where l.tenant_id = %s",
            (t,)).fetchall()}


def test_a_reviewed_list_is_confirmed_in_one_step_or_not_at_all(server, tmp_path):
    with psycopg.connect(server, row_factory=dict_row) as c:
        s = school(c)
        _, loader = person(c, s, "educator")
        checker_id, checker = person(c, s, "coordinator")
        c.commit()
    sk = s["sk"]
    try:
        good = csv_of(tmp_path, *[(sk[a], sk[b]) for a, b in GOOD])
        out = _engine(server, s["slug"], "load", good, "--by", loader)
        assert out.returncode == 0, f"load --by: {(out.stdout + out.stderr)[-600:]}"
        assert {k: r["counts"] for k, r in _links(server, s["tenant"]).items()} == {p: False for p in GOOD}

        # a wrong pair on line 3, after a right one on line 2: an unloaded pair, then a skill that does not exist
        for wrong in ((sk["X"], sk["V"]), ("NOT.A.SKILL", sk["C"])):
            bad = csv_of(tmp_path, (sk["A"], sk["C"]), wrong, (sk["B"], sk["E"]))
            out = _engine(server, s["slug"], "confirm", "--file", bad, "--by", checker)
            said = out.stdout + out.stderr
            assert out.returncode == 1, f"confirm --file with a wrong pair: exit {out.returncode}: {said[-600:]}"
            assert "line 3" in said, f"the wrong line is not named: {said[-600:]}"
            assert not any(r["counts"] for r in _links(server, s["tenant"]).values()), \
                "a list with a wrong pair confirmed something"

        out = _engine(server, s["slug"], "confirm", "--file", good, "--by", checker)
        assert out.returncode == 0, f"confirm --file: {(out.stdout + out.stderr)[-600:]}"
        rows = _links(server, s["tenant"])
        assert set(rows) == set(GOOD)
        for pair, r in rows.items():
            assert r["counts"] and r["status"] == "confirmed", (pair, r["status"])
            assert r["confirmed_by"] == checker_id, f"{pair} does not name the person who confirmed the list"
    finally:
        with psycopg.connect(server) as c:
            c.execute("set session_replication_role = replica")  # history is append-only by trigger
            for schema, table in c.execute(
                    "select table_schema, table_name from information_schema.columns c where column_name = 'tenant_id'"
                    " and table_schema in ('public', 'pii') and (select table_type from information_schema.tables x"
                    " where x.table_schema = c.table_schema and x.table_name = c.table_name) = 'BASE TABLE'"
            ).fetchall():
                c.execute(f'delete from {schema}."{table}" where tenant_id = %s', (s["tenant"],))
            c.execute("delete from tenant where id = %s", (s["tenant"],))
            c.commit()
