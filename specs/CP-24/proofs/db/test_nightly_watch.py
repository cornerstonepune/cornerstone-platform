"""CP-24 item 5: the live watch (`watch.problems`, what `engine live watch` prints) says the nightly rebuild has stopped
when the newest ok nightly run (`flow_run`, flow `graph_nightly`) for the configured school is older than `graph.nightly_stale_hours`; it says
nothing of it when one is recent (Audit F1).

Each test inserts its own runs and sets the hours inside a transaction rolled back.
"""

import pytest

from engine.checks import watch

PLENTY = 50 * 10**9  # bytes free: no disk line


def _hours(conn, tenant, n: int) -> None:
    conn.execute(
        "insert into config (tenant_id, key, value, description) values (%s, 'graph.nightly_stale_hours', %s::jsonb,"
        " 'CP-24 proof') on conflict (tenant_id, key) do update set value = excluded.value",
        (tenant, str(n)),
    )


def _run(conn, tenant, hours_ago: int, ok: bool) -> None:
    conn.execute(
        "insert into flow_run (tenant_id, flow, started_at, finished_at, status, error) values"
        " (%s, 'graph_nightly', now() - make_interval(hours => %s), now() - make_interval(hours => %s), %s, %s)",
        (tenant, hours_ago, hours_ago, "ok" if ok else "error", None if ok else "CP-24 proof failure"),
    )


def _newest_ok_hours(conn, tenant) -> float:
    r = conn.execute(
        "select extract(epoch from now() - max(finished_at)) / 3600 as h from flow_run where tenant_id = %s"
        " and flow = 'graph_nightly' and status = 'ok'",
        (tenant,),
    ).fetchone()
    return float(r["h"])


def _nightly(lines) -> list[str]:
    return [ln for ln in lines if "nightly" in ln.lower()]


def test_5_an_ok_run_older_than_the_setting_is_a_problem(conn, tenant):
    _hours(conn, tenant, 4)
    _run(conn, tenant, 6, ok=True)
    if _newest_ok_hours(conn, tenant) < 5:
        pytest.fail("the test database holds a newer ok nightly run someone committed; rebuild it (bin/testdb fresh)")
    assert _nightly(watch.problems(conn, PLENTY)), "the watch says nothing of a nightly run 6 hours old (limit 4)"


def test_5_a_failed_run_since_does_not_count_as_the_nightly_working(conn, tenant):
    _hours(conn, tenant, 4)
    _run(conn, tenant, 6, ok=True)
    _run(conn, tenant, 1, ok=False)
    if _newest_ok_hours(conn, tenant) < 5:
        pytest.fail("the test database holds a newer ok nightly run someone committed; rebuild it (bin/testdb fresh)")
    assert _nightly(watch.problems(conn, PLENTY)), "a failed run hid a stopped nightly rebuild"


def test_5_a_recent_ok_run_is_no_problem(conn, tenant):
    _hours(conn, tenant, 26)
    _run(conn, tenant, 30, ok=True)
    _run(conn, tenant, 2, ok=True)
    assert _nightly(watch.problems(conn, PLENTY)) == []
