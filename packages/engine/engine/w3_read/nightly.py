"""N10, every night: rebuild the picture of every child from confirmed evidence and log the run (CP-9, specs/CP-9).

Ring B is a pure function of ring A, so the job only rebuilds it (`assess.graph.rebuild`) and writes one row to the
append-only ledger `graph_run`; it never touches evidence. The ledger carries digests of the evidence and the states
before and after, so each run says by itself that it changed nothing it should not have. A full rebuild is cheap and
cannot drift from the rule the way an incremental one can.

`now` is the run's clock only: it sets `started_at`/`ran_at` and so the watermark that bounds the evidence the digests
cover. Production passes nothing.
"""

import datetime as dt
import time

from engine.assess import graph
from engine.core import db

LOCK = ("graph_nightly", "run")  # one run at a time, over every connection


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
        conn.execute(
            "insert into graph_run (tenant_id, started_at, ran_at, ok, children, evidence_rows, evidence_digest_before,"
            " evidence_digest_after, skill_states_before, skill_states_after, observed_states_before,"
            " observed_states_after, states_digest_before, states_digest_after)"
            " values (%s, %s, %s, true, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (_tenant(conn), started, ran_at, after["children"], after["evidence_rows"], before["evidence_digest"],
             after["evidence_digest"], before["skill_states"], after["skill_states"], before["observed_states"],
             after["observed_states"], before["states_digest"], after["states_digest"]),
        )
    return {"skipped": False, "children": after["children"], "evidence_rows": after["evidence_rows"],
            "skill_states": after["skill_states"], "observed_states": after["observed_states"],
            "evidence_unchanged": before["evidence_digest"] == after["evidence_digest"],
            "states_unchanged": before["states_digest"] == after["states_digest"]}


def failed(conn: db.Conn, error: Exception, now: dt.datetime | None = None) -> None:
    """The failure, on the ledger: the exception's class and a short message, never a row or a name. The caller
    commits. Call it on a connection that is not in a failed transaction."""
    started = now or dt.datetime.now(dt.timezone.utc)
    conn.execute(
        "insert into graph_run (tenant_id, started_at, ran_at, ok, error) values (%s, %s, %s, false, %s)",
        (_tenant(conn), started, started, f"{type(error).__name__}: {str(error)[:200]}"),
    )


def hand_check(conn: db.Conn, child_id: str, skill: str, grade: str, expected: str, by: str,
               on: dt.date | None = None) -> dict:
    """One hand calculation against the system's state at this moment, stored with whether they matched so a later
    change of the system cannot make an honest old row wrong (CP-9 item 7). Append-only; the caller commits."""
    row = conn.execute(
        "select state from child_observed_state where child_id = %s and skill_code = %s and grade_code = %s",
        (child_id, skill, grade),
    ).fetchone()
    system = row["state"] if row else None
    conn.execute(
        "insert into hand_check (tenant_id, child_id, skill_code, grade_code, expected_state, system_state, matches,"
        " checked_by, checked_on) values (%s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, current_date))",
        (_tenant(conn), child_id, skill, grade, expected, system, system == expected, by, on),
    )
    return {"system_state": system, "matches": system == expected}
