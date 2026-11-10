"""N10, every night: rebuild the picture of every child from confirmed evidence and log the run (CP-9, specs/CP-9).

Ring B is a pure function of ring A, so the job only rebuilds it (`assess.graph.rebuild`) and writes one row of the one
run list, `flow_run` (flow `graph_nightly`; CP-27 group 6: once the table `graph_run`); it never touches evidence. The
row's `result` carries digests of the evidence and the states before and after, so each run says by itself that it
changed nothing it should not have. A full rebuild is cheap and
cannot drift from the rule the way an incremental one can.

`now` is the run's clock only: it sets `started_at`/`finished_at` and so the watermark that bounds the evidence the digests
cover. Production passes nothing.
"""

import datetime as dt
import json
import time

from engine.assess import graph
from engine.core import db, settings

LOCK = ("graph_nightly", "run")  # one run at a time, over every connection
FLOW = "graph_nightly"  # its rows in `flow_run`


def _numbers(conn: db.Conn, before: dt.datetime) -> dict:
    return db.one(conn, "select * from graph_numbers(%s)", (before,))


def _tenant(conn: db.Conn) -> str:
    return db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]


def nightly(conn: db.Conn, now: dt.datetime | None = None) -> dict:
    """Rebuild every child's picture in the caller's transaction and log it. A second call while one runs returns
    {"skipped": True} and writes nothing. On error the rebuild is rolled back and the error re-raised; the caller then
    calls `failed` and commits, because only the caller knows whether it may commit."""
    if not db.one(conn, "select pg_try_advisory_xact_lock(hashtext(%s), hashtext(%s)) as got", LOCK)["got"]:
        return {"skipped": True}
    started = now or dt.datetime.now(dt.timezone.utc)
    t0 = time.monotonic()
    with conn.transaction():  # a savepoint: a failed rebuild leaves no half of itself
        before = _numbers(conn, started)
        graph.rebuild(conn)
        after = _numbers(conn, started)
        ran_at = started + dt.timedelta(seconds=time.monotonic() - t0)
        result = {
            "children": after["children"],
            "evidence_rows": after["evidence_rows"],
            "evidence_digest_before": before["evidence_digest"],
            "evidence_digest_after": after["evidence_digest"],
            "skill_states_before": before["skill_states"],
            "skill_states_after": after["skill_states"],
            "observed_states_before": before["observed_states"],
            "observed_states_after": after["observed_states"],
            "states_digest_before": before["states_digest"],
            "states_digest_after": after["states_digest"],
        }
        conn.execute(
            "insert into flow_run (tenant_id, flow, trigger, started_at, finished_at, status, result)"
            " values (%s, %s, 'nightly', %s, %s, 'ok', %s)",
            (_tenant(conn), FLOW, started, ran_at, json.dumps(result)),
        )
    return {
        "skipped": False,
        "children": after["children"],
        "evidence_rows": after["evidence_rows"],
        "skill_states": after["skill_states"],
        "observed_states": after["observed_states"],
        "evidence_unchanged": before["evidence_digest"] == after["evidence_digest"],
        "states_unchanged": before["states_digest"] == after["states_digest"],
    }


def failed(conn: db.Conn, error: Exception, now: dt.datetime | None = None) -> None:
    """The failure, on the ledger: the exception's class and a short message, never a row or a name. The caller
    commits. Call it on a connection that is not in a failed transaction."""
    started = now or dt.datetime.now(dt.timezone.utc)
    conn.execute(
        "insert into flow_run (tenant_id, flow, trigger, started_at, finished_at, status, error)"
        " values (%s, %s, 'nightly', %s, %s, 'error', %s)",
        (_tenant(conn), FLOW, started, started, f"{type(error).__name__}: {str(error)[:200]}"),
    )


def hand_check(
    conn: db.Conn, child_id: str, skill: str, grade: str, expected: str, by: str, on: dt.date | None = None
) -> dict:
    """One hand calculation against the system's state at this moment, stored with whether they matched so a later
    change of the system cannot make an honest old row wrong (CP-9 item 7): a case of the one eval set that the database
    never lets change or go (CP-27). The caller commits. With no `on`, it is dated by the school's clock (CP-24), never
    the server's: the database has no day of its own to give it."""
    row = conn.execute(
        "select state from child_skill_state where kind = 'observed' and child_id = %s and skill_code = %s"
        " and grade_code = %s",
        (child_id, skill, grade),
    ).fetchone()
    system = row["state"] if row else None
    conn.execute(
        "insert into eval_case (tenant_id, kind, child_id, skill_code, verdict, confirmed_by, checked_on, detail)"
        " values (%s, 'hand_check', %s, %s, %s, %s, %s, jsonb_build_object('grade', %s::text, 'system_state',"
        " %s::text, 'matches', %s::boolean))",
        (
            _tenant(conn),
            child_id,
            skill,
            expected,
            by,
            on or settings.school_today(conn),
            grade,
            system,
            system == expected,
        ),
    )
    return {"system_state": system, "matches": system == expected}


def hand_checks(conn: db.Conn, child_id: str) -> list[dict]:
    """A child's hand calculations as they were written, oldest first."""
    return conn.execute(
        "select skill_code, detail ->> 'grade' as grade, verdict as expected_state,"
        " detail ->> 'system_state' as system_state, (detail ->> 'matches')::boolean as matches,"
        " confirmed_by as checked_by, checked_on, created_at from eval_case"
        " where kind = 'hand_check' and child_id = %s order by created_at, id",
        (child_id,),
    ).fetchall()
