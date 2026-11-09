"""CP-9 item 1: a confirmed note changes the child's state by the next morning without anyone running a command.

With a clock (design decision 3, `engine.w3_read.nightly.nightly(conn, now=None)`), on a throwaway database, as the
engine's login (`app_engine`):
- evidence made on day D (its `created_at` set) is absent from the picture until the nightly run of D+1 02:30;
  that run creates the picture row and exactly one `graph_run`, ok, stamped with the run's clock;
- evidence created after a run's clock is not in that run's digest and is in the next run's;
- two calls at once write one `graph_run`: the second returns {"skipped": true};
- `graph_run` and `hand_check` are listed in `access_table` (school-wide and child data);
- the n8n flow `n8n/workflows/f4-nightly-graph.json` is a daily schedule between 00:00 and 05:00 IST with one HTTP node
  to `/graph/nightly`, carrying an Idempotency-Key and the engine key, and no Code node.
"""

import datetime as dt
import json
import threading
import time

from conftest import IST, ROOT, a_k2_class, connect, graph_runs, observed, run_nightly

D = dt.datetime(2026, 6, 1, 10, 0, tzinfo=IST)  # day D, 10:00 in Pune
NEXT_MORNING = dt.datetime(2026, 6, 2, 2, 30, tzinfo=IST)


def _picture(conn, child):
    return conn.execute("select skill_code, state from child_observed_state where child_id = %s",
                        (child,)).fetchall()


def test_1_a_note_confirmed_on_day_d_is_in_the_picture_after_the_next_mornings_run(conn):
    k = a_k2_class(conn)
    child = k["children"]["3"]
    observed(conn, k, child, D, created_at=D)
    conn.commit()
    assert _picture(conn, child) == [], "the picture already holds the note before any run"
    assert conn.execute("select count(*) as n from graph_run").fetchone()["n"] == 0

    conn.execute("set role app_engine")  # the nightly job runs as the engine's login
    run_nightly(conn, now=NEXT_MORNING)
    conn.commit()
    conn.execute("reset role")

    assert {r["skill_code"] for r in _picture(conn, child)} == set(k["skills"]), "the run did not reach the picture"
    runs = graph_runs(conn)
    assert len(runs) == 1, f"one run, one ledger row: {len(runs)}"
    run = runs[0]
    assert run["ok"] is True and run["error"] is None
    assert run["started_at"] == NEXT_MORNING, f"started_at is the run's clock: {run['started_at']}"
    assert NEXT_MORNING <= run["ran_at"] <= NEXT_MORNING + dt.timedelta(minutes=10), run["ran_at"]
    assert run["children"] >= 1 and run["evidence_rows"] >= len(k["skills"])


def test_1_evidence_after_a_runs_clock_is_in_the_next_runs_digest_not_that_runs(conn):
    k = a_k2_class(conn)
    child, late = k["children"]["3"], k["children"]["4"]
    observed(conn, k, child, D, created_at=D)
    # confirmed at 03:00 on D+1, after the 02:30 run's clock: the watermark leaves it out of that run's numbers
    observed(conn, k, late, D, created_at=NEXT_MORNING + dt.timedelta(minutes=30))
    conn.commit()
    conn.execute("set role app_engine")
    run_nightly(conn, now=NEXT_MORNING)
    conn.commit()
    run_nightly(conn, now=NEXT_MORNING + dt.timedelta(minutes=1))  # still before it
    conn.commit()
    run_nightly(conn, now=NEXT_MORNING + dt.timedelta(days=1))  # the next night: after it
    conn.commit()
    conn.execute("reset role")
    first, again, nxt = graph_runs(conn)
    assert first["evidence_digest_before"] == first["evidence_digest_after"]
    assert again["evidence_digest_before"] == first["evidence_digest_after"], \
        "evidence created after the run's clock changed a digest taken before it"
    assert again["evidence_rows"] == first["evidence_rows"]
    assert nxt["evidence_digest_before"] != first["evidence_digest_after"], \
        "evidence created before the next run's clock is missing from its digest"
    assert nxt["evidence_rows"] == first["evidence_rows"] + len(k["skills"])


def test_1_two_calls_at_once_write_one_run(db_url, conn):
    k = a_k2_class(conn)
    observed(conn, k, k["children"]["3"], D, created_at=D)
    conn.commit()

    blocker = connect(db_url)  # holds a table the rebuild needs, so the first call is still running when the second comes
    blocker.execute("lock table child_observed_state in access exclusive mode")
    results, errors = {}, []

    def call(name):
        try:
            with connect(db_url) as c:
                c.execute("set role app_engine")
                results[name] = run_nightly(c, now=NEXT_MORNING)
                c.commit()
        except Exception as e:  # reported below
            errors.append(f"{name}: {type(e).__name__}: {e}")

    first = threading.Thread(target=call, args=("first",))
    first.start()
    waited = time.monotonic()
    while time.monotonic() - waited < 30:  # until the first call waits on the table, inside its run
        if not first.is_alive():
            break
        if conn.execute("select count(*) as n from pg_stat_activity where datname = current_database()"
                        " and wait_event_type = 'Lock'").fetchone()["n"]:
            break
        conn.rollback()
        time.sleep(0.1)
    conn.rollback()
    second = threading.Thread(target=call, args=("second",))
    second.start()
    second.join(30)
    second_alive = second.is_alive()
    blocker.rollback()
    blocker.close()
    first.join(60)
    assert not errors, errors
    assert not second_alive, "the second call waited for the first instead of returning skipped"
    assert results.get("second", {}).get("skipped") is True, results
    assert conn.execute("select count(*) as n from graph_run").fetchone()["n"] == 1


def test_1_graph_run_and_hand_check_are_listed_in_access_table(conn):
    rows = {r["table_name"]: r["data_class"] for r in conn.execute(
        "select table_name, data_class from public.access_table where schema_name = 'public'"
        " and table_name in ('graph_run', 'hand_check')")}
    assert rows == {"graph_run": "school_wide", "hand_check": "child_data"}, rows


FLOW = ROOT / "n8n" / "workflows" / "f4-nightly-graph.json"
CODE_NODES = ("n8n-nodes-base.code", "n8n-nodes-base.function", "n8n-nodes-base.functionItem")


def _hour(trigger: dict) -> list[tuple[int, int]]:
    """(hour, minute) of each daily rule of a schedule trigger; a rule that is not once a day is refused."""
    out = []
    for rule in trigger.get("parameters", {}).get("rule", {}).get("interval", []):
        if rule.get("field") == "cronExpression":
            minute, hour, dom, month, dow = rule["expression"].split()[-5:]
            assert (dom, month, dow) == ("*", "*", "*"), f"not every day: {rule['expression']}"
            out.append((int(hour), int(minute)))
        else:
            assert rule.get("field", "days") == "days" and rule.get("daysInterval", 1) == 1, f"not daily: {rule}"
            out.append((int(rule.get("triggerAtHour", 0)), int(rule.get("triggerAtMinute", 0))))
    return out


def test_1_the_n8n_flow_calls_the_nightly_job_every_morning_and_never_thinks():
    assert FLOW.exists(), f"{FLOW.relative_to(ROOT)} does not exist"
    flow = json.loads(FLOW.read_text())
    assert flow.get("settings", {}).get("timezone") == "Asia/Kolkata", "the schedule is not in IST"
    nodes = flow["nodes"]
    triggers = [n for n in nodes if n["type"] == "n8n-nodes-base.scheduleTrigger"]
    assert len(triggers) == 1, f"one schedule trigger: {len(triggers)}"
    times = _hour(triggers[0])
    assert times and all(0 <= h < 5 for h, _ in times), f"not between 00:00 and 05:00: {times}"
    http = [n for n in nodes if n["type"] == "n8n-nodes-base.httpRequest"]
    assert len(http) == 1, f"one HTTP node: {len(http)}"
    p = http[0]["parameters"]
    assert str(p.get("url", "")).rstrip("/").endswith("/graph/nightly"), p.get("url")
    assert str(p.get("method", "")).upper() == "POST"
    text = json.dumps(http[0])
    assert "Idempotency-Key" in text, "no Idempotency-Key on the call"
    assert p.get("authentication") or "X-Engine-Key" in text, "the call carries no engine key"
    assert not [n for n in nodes if n["type"] in CODE_NODES], "a Code node: n8n never thinks (rule 3)"
