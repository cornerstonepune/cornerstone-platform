"""CP-19: a parent report's lines, each standing on its own; two approvals a line; the send; the coordinator's counts.

A line is {id, words, evidence: [evidence ids]} on `parent_note.lines`. The database holds the rules that must hold on
every route (a line rests only on this child's confirmed evidence within the period; a sent report keeps its lines;
nothing is sent without consent and two approvals of every line: `internal.parent_note_lines_checked`,
`parent_note_sent_when_approved_twice`). This file is who may do what, and what to show:

* an educator of the child's class writes the lines and gives each its FIRST approval; a coordinator gives the SECOND
  (the database refuses the same person twice). A line's stage is how many approvals it has: drafted, educator
  approved, coordinator approved. Changing a line's words or evidence withdraws its approvals.
* a line resting on fewer pieces of evidence than the setting `report.seen_enough` is thin. A row, not a number here.
* the counts are whole numbers: notes confirmed, notes left unconfirmed, lines accepted, changed or removed, lines at
  each stage, reports sent. Never a score, a rate, a rank or an order of people (staff ids, in id order).

Who may ask is `k2_picture_reads`' rule: a grant on the child's class, or a coordinator role on its campus.
"""

import uuid
from typing import Any

import psycopg

from engine.core import db, settings
from engine.w3_read import k2_picture_reads, k2_reads
from engine.w3_read.voice_store import Refused

STAGES = ("drafted", "educator_approved", "coordinator_approved")


def _note(conn: db.Conn, note_id: str, lock: bool = False) -> dict[str, Any]:
    nid = _id(note_id)
    row = conn.execute(
        "select n.*, c.class_id from parent_note n join child_now c on c.id = n.child_id where n.id = %s"
        + (" for update of n" if lock else ""),
        (nid,),
    ).fetchone()
    if row is None:
        raise Refused("Not found.", 404)
    return row


def _id(text: str) -> str:
    try:
        return str(uuid.UUID(str(text)))
    except ValueError:
        raise Refused("Not found.", 404) from None


def _who(conn: db.Conn, email: str, note: dict[str, Any]) -> dict[str, Any]:
    """The asker's standing on the child's class: refused unless a grant on it or a coordinator role."""
    where = k2_picture_reads._allowed(conn, email, str(note["class_id"]))
    return {"staff": str(where["staff"]), "on_class": where["on_class"], "coordinator": where["coordinator"]}


def _target(note_id: Any, line_id: str) -> str:
    return f"{note_id}:{line_id}"


def _approvals(conn: db.Conn, note: dict[str, Any]) -> dict[str, list[str]]:
    """line id → the staff ids that approved it since it was last withdrawn, first to last."""
    rows = conn.execute(
        "select target, decision, \"by\", seq from approval where tenant_id = %s and kind = 'report_line'"
        " and target like %s order by seq",
        (note["tenant_id"], f"{note['id']}:%"),
    ).fetchall()
    out: dict[str, list[str]] = {}
    for r in rows:
        line = r["target"].split(":", 1)[1]
        if r["decision"] == "withdrawn":
            out[line] = []
        elif r["decision"] == "approved":
            out.setdefault(line, []).append(r["by"])
    return out


def _seen_enough(conn: db.Conn) -> int:
    return int(settings.config(conn, "report.seen_enough", 2))


def stages(conn: db.Conn, email: str, note_id: str) -> dict[str, Any]:
    """The report's lines with each one's stage, whether it is thin, and who approved it (staff ids), plus when the
    report was sent."""
    note = _note(conn, note_id)
    _who(conn, email, note)
    given = _approvals(conn, note)
    enough = _seen_enough(conn)
    lines = []
    for line in note["lines"]:
        by = given.get(line["id"], [])
        lines.append({
            "id": line["id"], "words": line["words"], "evidence": line["evidence"],
            "stage": STAGES[min(len(by), 2)], "thin": len(line["evidence"]) < enough,
            "educator_approved_by": by[0] if len(by) > 0 else None,
            "coordinator_approved_by": by[1] if len(by) > 1 else None,
        })  # fmt: skip
    return {
        "note_id": str(note["id"]),
        "sent_at": None if note["sent_at"] is None else note["sent_at"].isoformat(),
        "lines": lines,
    }


def set_lines(conn: db.Conn, email: str, note_id: str, lines: list[dict[str, Any]]) -> dict[str, Any]:
    """The report's lines, as the educator of the class wrote them. A line whose words or evidence changed, or that
    went, loses its approvals. The database refuses any evidence that is not this child's, confirmed and in period."""
    note = _note(conn, note_id, lock=True)
    me = _who(conn, email, note)
    if not me["on_class"]:
        raise Refused("Only an educator of the child's class writes its report lines.", 403)
    if note["sent_at"] is not None:
        raise Refused("This report was sent; its lines no longer change.", 409)
    old = {line["id"]: line for line in note["lines"]}
    given = _approvals(conn, note)
    new = [
        {"id": str(x.get("id") or uuid.uuid4()), "words": str(x.get("words", "")).strip(),
         "evidence": [str(e) for e in x.get("evidence", [])]}
        for x in lines
    ]  # fmt: skip
    kept = {line["id"] for line in new}
    for line_id, line in old.items():
        changed = line_id not in kept or any(line != n for n in new if n["id"] == line_id)
        if changed and given.get(line_id):
            conn.execute(
                'insert into approval (tenant_id, kind, target, decision, "by", reason)'
                " values (%s, 'report_line', %s, 'withdrawn', %s, 'the line changed')",
                (note["tenant_id"], _target(note["id"], line_id), me["staff"]),
            )
    try:
        with conn.transaction():  # only this statement is undone when the database refuses it
            conn.execute("update parent_note set lines = %s::jsonb where id = %s", (_json(new), note["id"]))
    except psycopg.errors.CheckViolation as e:  # the database's own words say why a line is refused
        raise Refused(str(e).splitlines()[0], 422) from None
    return stages(conn, email, str(note["id"]))


def _json(value: Any) -> str:
    import json

    return json.dumps(value)


def approve_line(conn: db.Conn, email: str, note_id: str, line_id: str) -> dict[str, Any]:
    """The first approval of a line is an educator of the child's class; the second is a coordinator, someone else."""
    note = _note(conn, note_id, lock=True)
    me = _who(conn, email, note)
    if note["sent_at"] is not None:
        raise Refused("This report was sent.", 409)
    if line_id not in {x["id"] for x in note["lines"]}:
        raise Refused("There is no such line.", 404)
    by = _approvals(conn, note).get(line_id, [])
    if len(by) >= 2:
        raise Refused("This line already has both approvals.", 409)
    if not by and not me["on_class"]:
        raise Refused("The first approval of a line is an educator of the child's class.", 403)
    if by and not me["coordinator"]:
        raise Refused("The second approval of a line is a coordinator's.", 403)
    if by and by[0] == me["staff"]:
        raise Refused("The second approval is someone else's.", 409)
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, \"by\") values (%s, 'report_line', %s, 'approved', %s)",
        (note["tenant_id"], _target(note["id"], line_id), me["staff"]),
    )
    return stages(conn, email, str(note["id"]))


def send(conn: db.Conn, email: str, note_id: str) -> dict[str, Any]:
    """Mark the report sent. Only a coordinator; the database refuses without consent or any line's two approvals.
    Nothing is delivered here: no message leaves the system."""
    note = _note(conn, note_id, lock=True)
    me = _who(conn, email, note)
    if not me["coordinator"]:
        raise Refused("Only a coordinator marks a report as sent.", 403)
    if note["sent_at"] is not None:
        raise Refused("This report was already sent.", 409)
    if not note["lines"]:
        raise Refused("A report with no lines is not sent.", 409)
    try:
        with conn.transaction():
            conn.execute(
                "update parent_note set sent_at = now() where id = %s and sent_at is null", (note["id"],)
            )
    except psycopg.errors.CheckViolation as e:  # consent or an approval missing, in the database's words
        raise Refused(str(e).splitlines()[0], 409) from None
    return stages(conn, email, str(note["id"]))


def counts(conn: db.Conn, email: str) -> dict[str, Any]:
    """The coordinator's counts: per class, and per educator (staff id), whole numbers only. Coordinators only."""
    _, campus = k2_reads.require_coordinator(conn, email)
    classes = conn.execute(
        "select c.id, c.grade_code, c.section,"
        " count(*) filter (where n.status = 'confirmed') as notes_confirmed,"
        " count(*) filter (where n.status = 'left_unconfirmed') as notes_late"
        " from school_class c left join pii.educator_note n on n.class_id = c.id"
        " where c.campus_id = %s group by c.id, c.grade_code, c.section order by c.grade_code, c.section, c.id",
        (campus,),
    ).fetchall()
    reports = conn.execute(
        "select n.*, cn.class_id from parent_note n join child_now cn on cn.id = n.child_id"
        " join school_class c on c.id = cn.class_id where c.campus_id = %s",
        (campus,),
    ).fetchall()
    per_class: dict[Any, dict[str, int]] = {}
    for r in reports:
        given = _approvals(conn, r)
        slot = per_class.setdefault(
            r["class_id"],
            {"lines_drafted": 0, "lines_educator_approved": 0, "lines_approved": 0, "reports_sent": 0},
        )
        for line in r["lines"]:
            slot[
                ("lines_drafted", "lines_educator_approved", "lines_approved")[
                    min(len(given.get(line["id"], [])), 2)
                ]
            ] += 1
        slot["reports_sent"] += 1 if r["sent_at"] is not None else 0
    educators = conn.execute(
        "select n.staff_id::text as staff,"
        " count(*) filter (where n.status = 'confirmed') as notes_confirmed,"
        " count(*) filter (where n.status = 'left_unconfirmed') as notes_late"
        " from pii.educator_note n join school_class c on c.id = n.class_id where c.campus_id = %s"
        " group by n.staff_id order by n.staff_id::text",
        (campus,),
    ).fetchall()
    claims = {
        r["staff"]: r
        for r in conn.execute(
            "select cl.decided_by::text as staff,"
            " count(*) filter (where cl.decision = 'accepted') as lines_accepted,"
            " count(*) filter (where cl.decision = 'changed') as lines_changed,"
            " count(*) filter (where cl.decision = 'removed') as lines_removed"
            " from pii.note_claim cl join pii.educator_note n on n.id = cl.note_id"
            " join school_class c on c.id = n.class_id where c.campus_id = %s group by cl.decided_by",
            (campus,),
        ).fetchall()
    }
    none = {"lines_accepted": 0, "lines_changed": 0, "lines_removed": 0}
    return {
        "classes": [
            {
                "class_id": str(c["id"]), "class": f"{c['grade_code']} {c['section']}",
                "notes_confirmed": c["notes_confirmed"], "notes_late": c["notes_late"],
                **per_class.get(c["id"], {"lines_drafted": 0, "lines_educator_approved": 0, "lines_approved": 0, "reports_sent": 0}),
            }
            for c in classes
        ],
        "educators": [
            {"staff": e["staff"], "notes_confirmed": e["notes_confirmed"], "notes_late": e["notes_late"],
             **{k: claims.get(e["staff"], none)[k] for k in none}}
            for e in educators
        ],
    }  # fmt: skip
