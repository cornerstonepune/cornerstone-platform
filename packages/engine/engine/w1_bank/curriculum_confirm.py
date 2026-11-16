"""CP-64: a coordinator confirms a batch of what the machine made in the curriculum (Nimish, 16 Nov 2026: the coordinators check the
machine-made rows weekly; a skill that makes content is switched on only with a person looking at what it made).

A batch is one grade and one subject. Everything of it whose `source` is `machine` becomes `person`: its objectives' links to activities
(`activity_objective`), to skills (`learning_objective_skill`) and to framework statements (`objective_statement`, a capability among them).
One `approval` row (kind `curriculum_link`, target `<grade>~<subject>~<batch id>`, decision approved, who, the counts as detail) keeps the yes, and the
change is one transaction. A batch with nothing left of the machine's changes nothing and writes no approval: a second confirm is a no-op.
Who may is the door's to say (the route asks `educator_gate.sees_all` first): a workflow reaches no other. Code decides everything; no model, no name."""

import uuid
from typing import Any, LiteralString

from psycopg.types.json import Jsonb

from engine.core import db


class Refused(Exception):
    def __init__(self, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.status = status


_UPDATES: tuple[tuple[str, LiteralString], ...] = (
    (
        "links",
        """update activity_objective x set source = 'person', updated_at = now()
        where x.source = 'machine' and exists (select 1 from learning_objective lo where lo.tenant_id = x.tenant_id
          and lo.code = x.lo_code and not lo.retired and lo.band = %(g)s and lo.subject_code is not distinct from %(s)s)""",
    ),
    (
        "skills",
        """update learning_objective_skill x set source = 'person', updated_at = now()
        where x.source = 'machine' and exists (select 1 from learning_objective lo where lo.tenant_id = x.tenant_id
          and lo.code = x.lo_code and not lo.retired and lo.band = %(g)s and lo.subject_code is not distinct from %(s)s)""",
    ),
    (
        "statements",
        """update objective_statement x set source = 'person', updated_at = now()
        where x.source = 'machine' and exists (select 1 from learning_objective lo where lo.tenant_id = x.tenant_id
          and lo.code = x.lo_code and not lo.retired and lo.band = %(g)s and lo.subject_code is not distinct from %(s)s)""",
    ),
)


def confirm(conn: db.Conn, staff: Any, email: str, grade: str, subject: str | None) -> dict:
    """Confirm the machine-made rows of one grade and subject (`subject` None or '' for objectives with no subject yet)."""
    if not (grade or "").strip():
        raise Refused("Name the grade to confirm.", 422)
    q = {"g": grade, "s": (subject or "").strip() or None}
    counts: dict[str, int] = {}
    with conn.transaction():
        for key, sql in _UPDATES:
            counts[key] = conn.execute(sql, q).rowcount
        total = sum(counts.values())
        if total:
            conn.execute(
                "insert into approval (tenant_id, kind, target, decision, by, detail)"
                " select tenant_id, 'curriculum_link', %s, 'approved', %s, %s from staff where id = %s",
                (f"{grade}~{q['s'] or ''}~{uuid.uuid4().hex[:8]}", email, Jsonb(counts), staff),
            )
    return {"changed": total, **counts}
