"""`engine curriculum gate-check`: who the curriculum screens' gate lets through, by role, in counts
(goals/m1-12s-curriculum-404.yaml).

A signed-in person who is refused sees a 404, whatever the reason. The gate looks in the people tables, not in the
sign-in list: a member of staff found by email, and a dated grant of a role. This asks the gate itself (the same
functions the routes use) about each entry of the sign-in list and counts, for each role on it, how many are in the
people tables, how many hold today a grant of the role they sign in with, how many the gate lets through and how many
may review; and says whether the config rows the gate reads are loaded. No email and no name is printed: the log is
public. Each lookup by email leaves the audit row such a lookup always leaves.
"""

from collections import defaultdict

import typer
from fastapi import HTTPException

from engine.api.deps import curriculum_reviews, curriculum_staff
from engine.core import db, settings, staff
from engine.w1_bank.k2_upload import curriculum_app
from engine.w2_print import educator_gate


def _granted(conn: db.Conn, sid: object, today: object) -> set[str]:
    return {
        r["role_code"]
        for r in conn.execute(
            "select role_code from staff_role_grant where staff_id = %s and valid_from <= %s"
            " and (valid_to is null or valid_to >= %s)",
            (sid, today, today),
        ).fetchall()
    }


def report(conn: db.Conn) -> dict:
    today = educator_gate.school_today(conn)
    counts: dict[str, dict[str, int]] = defaultdict(
        lambda: dict.fromkeys(
            ("entries", "in_staff_tables", "grant_in_same_role_today", "gate_open", "may_review"), 0
        )
    )
    for entry in staff.staff(conn):
        email, role = str(entry.get("email", "")), str(entry.get("role", ""))
        row = counts[role]
        row["entries"] += 1
        sid = db.one(conn, "select public.staff_of_email(%s) as id", (email,))["id"]
        if sid is None:
            continue
        row["in_staff_tables"] += 1
        row["grant_in_same_role_today"] += role in _granted(conn, sid, today)
        row["may_review"] += curriculum_reviews(conn, sid)
        try:
            curriculum_staff(conn, email)
            row["gate_open"] += 1
        except HTTPException:
            pass
    return {
        "config": {
            "review_roles": settings.config(conn, "curriculum.review_roles"),
            "preview_roles": settings.config(conn, "educator.preview_roles"),
            "educator_switch_on": educator_gate.switched_on(conn),
            "screens_grade": settings.config(conn, "curriculum.screens_grade"),
        },
        "sign_in_list": dict(counts),
    }


@curriculum_app.command("gate-check")
def gate_check() -> None:
    """Who the curriculum screens let through, by role, in counts (no email, no name)."""
    import json

    with db.connect() as conn:
        out = report(conn)
        conn.commit()  # the audit rows the lookups by email leave
    typer.echo(json.dumps(out))
