"""CP-54: `engine curriculum revert-seed <run>`: puts back what one run of `apply-seed` replaced, for each row nobody has
changed since. One small function per kind of change, found by the kind the run recorded."""

import uuid
from typing import Any

from psycopg.types.json import Jsonb

from engine.core import db
from engine.w1_bank.seed_activity import ACTIVITY_FIELDS

FLOW = "curriculum.apply-seed"
PROFILE = "CS-PROFILE"
Args = tuple[db.Conn, db.Id, dict[str, Any]]


def _lo_back(conn: db.Conn, t: db.Id, c: dict[str, Any]) -> None:
    b = c["before"]
    conn.execute(
        "update learning_objective set title = %s, source_text = %s, signal = %s, source = %s, retired = %s,"
        " confidence = coalesce(%s, confidence) where tenant_id = %s and code = %s and source = 'machine'",
        (b["title"], b["source_text"], b["signal"], b["source"], b["retired"], b.get("confidence"), t, c["code"]))  # fmt: skip


def _lo_new(conn: db.Conn, t: db.Id, c: dict[str, Any]) -> None:
    conn.execute(
        "delete from learning_objective where tenant_id = %s and code = %s and source = 'machine'",
        (t, c["code"]),
    )


def _activity_new(conn: db.Conn, t: db.Id, c: dict[str, Any]) -> None:
    conn.execute(
        "delete from activity where tenant_id = %s and code = %s and source_file like 'machine seed%%'",
        (t, c["code"]),
    )


def _activity_back(conn: db.Conn, t: db.Id, c: dict[str, Any]) -> None:
    b, sets = c["before"], ", ".join(f"{f} = %s" for f in ACTIVITY_FIELDS)
    values = [
        Jsonb(b[f]) if f in ("steps_list", "thinking_doc") and b[f] is not None else b[f]
        for f in ACTIVITY_FIELDS
    ]
    conn.execute(
        f"update activity set {sets} where tenant_id = %s and code = %s and source_file like 'machine seed%%'",  # noqa: S608
        (*values, t, c["code"]),
    )
    conn.execute(
        "delete from activity_objective where tenant_id = %s and activity_code = %s and source = 'machine'",
        (t, c["code"]),
    )
    for i, lo in enumerate(c.get("links", []), 1):
        conn.execute(
            "insert into activity_objective (tenant_id, activity_code, lo_code, ord, source)"
            " values (%s,%s,%s,%s,'machine') on conflict do nothing", (t, c["code"], lo, i))  # fmt: skip


def _capability(conn: db.Conn, t: db.Id, c: dict[str, Any]) -> None:
    conn.execute(
        "delete from objective_statement where tenant_id = %s and lo_code = %s and framework_code = %s"
        " and source = 'machine' and relation = 'counts_toward'", (t, c["lo"], PROFILE))  # fmt: skip
    for code in c["before"]:
        conn.execute(
            "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
            " values (%s,%s,%s,%s,'counts_toward','machine') on conflict do nothing", (t, c["lo"], PROFILE, code))  # fmt: skip


def _skill_lo(conn: db.Conn, t: db.Id, c: dict[str, Any]) -> None:
    conn.execute(
        "update skill set lo_code = null where tenant_id = %s and code = %s and lo_code = %s",
        (t, c["skill"], c["after"]),
    )


def _topic(conn: db.Conn, t: db.Id, c: dict[str, Any]) -> None:
    conn.execute(
        "update learning_objective set topic_code = null where tenant_id = %s and code = %s and topic_code = %s",
        (t, c["lo"], c["after"]),
    )


BACK = {
    "lo_title": _lo_back, "lo_retired": _lo_back, "lo_new": _lo_new, "activity": _activity_new,
    "activity_updated": _activity_back, "capability": _capability, "skill_lo": _skill_lo, "topic": _topic,
}  # fmt: skip


def revert(conn: db.Conn, t: db.Id, run: uuid.UUID) -> dict[str, int]:
    """Put back what a run replaced, for each row nobody has changed since; counts what went back."""
    got = conn.execute(
        "select result from flow_run where id = %s and tenant_id = %s and flow = %s", (run, t, FLOW)
    ).fetchone()
    if not got:
        raise ValueError(f"{run} is not a run of {FLOW}")
    n: dict[str, int] = {}
    for c in got["result"]["changes"]:
        BACK[c["kind"]](conn, t, c)
        n[c["kind"]] = n.get(c["kind"], 0) + 1
    return n
