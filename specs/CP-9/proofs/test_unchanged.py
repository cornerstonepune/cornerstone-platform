"""CP-9 item 6 (the part a throwaway database proves): the nightly rebuild leaves the existing evidence records and
child states unchanged.

A database with evidence of both kinds and both kinds of state already built (as live has 1,838 evidence records and
283 child states). Two nightly runs: every evidence row byte-identical and the states exactly as they were; each run's
`graph_run` row says so itself (`evidence_digest_before = _after`, `states_digest_before = _after`, state counts before
= after); and the states equal a fresh rebuild from nothing. The live half is `live_unchanged.py`, box only.
"""

import datetime as dt

from conftest import IST, a_k2_class, a_paper, graph_runs, observed, run_nightly, states

D = dt.datetime(2026, 6, 1, 10, 0, tzinfo=IST)


def _evidence(conn):
    return conn.execute("select count(*) as n, md5(coalesce(string_agg(to_jsonb(e)::text, '' order by id), ''))"
                        " as digest from evidence_event e").fetchone()


def _all_states(conn):
    return states(conn, "child_skill_state"), states(conn, "child_observed_state")


def test_6_two_nightly_runs_change_no_evidence_and_no_state(conn):
    from engine.assess import graph

    k = a_k2_class(conn)
    for roll, day in (("1", 0), ("1", 14), ("2", 0), ("3", 3)):
        observed(conn, k, k["children"][roll], D + dt.timedelta(days=day), created_at=D + dt.timedelta(days=day))
    a_paper(conn, k["tenant"], k["children"]["1"], [("correct", "none"), ("wrong", "partial"), ("blank", "none"),
                                                   ("correct", "full")])
    conn.execute("select confirm_results(%s, 'cp9 proof')", (k["children"]["1"],))
    graph.rebuild(conn)  # the states as they stand before the job exists
    conn.commit()
    evidence, (skill, seen) = _evidence(conn), _all_states(conn)
    assert evidence["n"] > 0 and skill and seen, "the database needs evidence and both kinds of state first"

    conn.execute("set role app_engine")
    run_nightly(conn)
    conn.commit()
    run_nightly(conn)
    conn.commit()
    conn.execute("reset role")

    assert _evidence(conn) == evidence, "an evidence record changed"
    assert _all_states(conn) == (skill, seen), "a child state changed"
    runs = graph_runs(conn)
    assert len(runs) == 2 and all(r["ok"] for r in runs), runs
    for r in runs:
        assert r["evidence_digest_before"] == r["evidence_digest_after"]
        assert r["states_digest_before"] == r["states_digest_after"]
        assert (r["skill_states_before"], r["observed_states_before"]) == (len(skill), len(seen))
        assert (r["skill_states_after"], r["observed_states_after"]) == (len(skill), len(seen))
    assert runs[0]["evidence_rows"] == runs[1]["evidence_rows"] == evidence["n"]

    with conn.transaction(force_rollback=True):  # from nothing: what a full rebuild makes is what the job left
        conn.execute("delete from child_skill_state; delete from child_observed_state")
        graph.rebuild(conn)
        assert _all_states(conn) == (skill, seen), "the states the job left are not what a fresh rebuild makes"
