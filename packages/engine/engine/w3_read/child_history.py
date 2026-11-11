"""A child's history, newest first, for the peek on the educator's pages (frontend gap after issue 565): what was
observed, what evidence stands, and the papers the child was given, each with when and who. Only reading.

Codes and ids only, never free text: a note's own sentence is private to its author and the coordinator
(`k2_picture_reads.PRIVATE`), so a note shows here as its id, and its sentence stays with the child's page. `who` is
a staff id or nothing: older rows keep an email or a name in their "who" text, and none of it leaves here.
`by_name` is the display name of that staff id (nothing when `who` is nothing), the only field that names a person.

A child's state is worked out again from this evidence (`engine graph`) and keeps no history of its own, so no "state
changed" entry exists to list; the evidence is what moved it. Evidence an observation made is shown as that
observation, once, and an observation a correction replaced is shown as its correction.

Who may ask, and how a child is named, are `k2_picture_reads`' rules: a staff member with a current grant on the
class or a coordinator role on its campus, and the child by Sr. No. in that class."""

import datetime as dt
import re
from typing import Any

from engine.core import db
from engine.w3_read import k2_picture_reads
from engine.w3_read.voice_store import Refused

MAX = 200
STAFF_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

HISTORY_SQL = """
select kind, at, who, what from (
  select 'observation' as kind, o.observed_at as at, o.confirmed_by::text as who,
         jsonb_build_object('activity', o.activity_code, 'outcome', o.outcome, 'note_id', o.note_id::text,
                            'session_id', o.session_id::text) as what
    from activity_observation o
   where o.child_id = %(child)s
     and not exists (select 1 from activity_observation s where s.supersedes = o.id)
  union all
  select 'evidence', e.observed_at, e.confirmed_by,
         jsonb_build_object('skill', e.skill_code, 'mark', e.mark, 'source', e.channel, 'kind', e.kind)
    from evidence_event e
   where e.child_id = %(child)s and e.observation_id is null
  union all
  select 'paper', coalesce(p.approved_at, p.created_at), p.approved_by,
         jsonb_build_object('kind', p.kind, 'week', p.week::text, 'status', p.print_status, 'qr', p.qr_code)
    from sheet_instance p
   where p.child_id = %(child)s
) h
where %(before)s::timestamptz is null or at < %(before)s::timestamptz
order by at desc, kind
limit %(limit)s
"""


def history(
    conn: db.Conn, email: str, class_id: str, roll_no: str, limit: int = 50, before: str | None = None
) -> dict[str, Any]:
    """The child's newest `limit` entries (at most MAX) older than `before` (the `at` of the last one seen)."""
    where = k2_picture_reads._allowed(conn, email, class_id)
    today = k2_picture_reads._today(where)
    here = conn.execute(
        "select child_id from enrolment where class_id = %s and roll_no = %s and from_date <= %s"
        " and (to_date is null or to_date >= %s)",
        (where["class"], roll_no, today, today),
    ).fetchone()
    if here is None:
        raise Refused("There is no such Sr. No. in this class.", 404)
    if before is not None:
        try:
            dt.datetime.fromisoformat(before)
        except ValueError:
            raise Refused("Not a moment.", 422) from None
    rows = conn.execute(
        HISTORY_SQL, {"child": here["child_id"], "before": before, "limit": max(1, min(int(limit), MAX))}
    ).fetchall()
    who = [r["who"] if r["who"] and STAFF_ID.match(r["who"]) else None for r in rows]
    names = _names(conn, {w for w in who if w})
    return {
        "class": f"{where['grade_code']} {where['section']}",
        "roll_no": roll_no,
        "entries": [
            {
                "kind": r["kind"],
                "at": r["at"].isoformat(),
                "what": r["what"],
                "who": w,
                "by_name": names.get(w) if w else None,
            }
            for r, w in zip(rows, who, strict=True)
        ],
    }


def _names(conn: db.Conn, staff_ids: set[str]) -> dict[str, str]:
    """Display name of each staff id, nothing else of the person (no email, no totals): the one field that names."""
    if not staff_ids:
        return {}
    got = conn.execute(
        "select staff_id::text as id, name from pii.staff where staff_id = any(%s::uuid[])",
        (sorted(staff_ids),),
    ).fetchall()
    return {r["id"]: r["name"] for r in got}
