"""CP-51: a person approves what the machine linked. The machine's links sit in the curriculum's own structure from the
start (`source = 'machine'`: "To approve" on the site) and an approval makes them a person's (`source = 'person'`;
"Approved"); the proposal that made each link stays named on it (`proposal_id`), so where it came from is never lost.
Approval gates one thing: a mark on an activity is evidence only on the skills the school or a person linked
(`w3_read/voice_confirm.CHOSEN_SKILLS`). An activity's approval covers its skill and objective links; an objective's,
the objective itself (when the machine wrote it) and its skill links. Each change is in the edit history as this
person's (`curriculum_edit`)."""

from engine.core import db
from engine.w1_bank.map_ledger import changed_by

# kind → (table, the column that names the thing approved) of each link it covers
LINKS = {
    "activity": (("activity_skill", "activity_code"), ("activity_objective", "activity_code")),
    "objective": (("learning_objective", "code"), ("learning_objective_skill", "lo_code")),
}


def approve(conn: db.Conn, tenant: db.Id, kind: str, code: str, staff: db.Id) -> int:
    """How many of the machine's rows on this activity or objective became a person's (0 when none was left)."""
    if kind not in LINKS:
        raise ValueError(f"{kind} is not an activity or an objective")
    changed_by(conn, f"approve staff:{staff}")
    return sum(
        conn.execute(
            f"update {table} set source = 'person' where tenant_id = %s and {col} = %s and source = 'machine'",  # noqa: S608
            (tenant, code),
        ).rowcount
        for table, col in LINKS[kind]
    )


def approve_proposal(conn: db.Conn, tenant: db.Id, proposal: db.Id, staff: db.Id) -> int:
    """The links one proposal made, a person's: a yes to a machine's offer is that person's approval."""
    changed_by(conn, f"approve staff:{staff}")
    return sum(
        conn.execute(
            f"update {table} set source = 'person' where tenant_id = %s and proposal_id = %s and source = 'machine'",  # noqa: S608
            (tenant, proposal),
        ).rowcount
        for table in ("activity_skill", "activity_objective", "learning_objective_skill")
    )
