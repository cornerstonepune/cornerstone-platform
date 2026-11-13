"""`engine chain --band K2`: is a grade's curriculum joined up, link by link, from a lesson to a child's graph (CP-48
Done when 8)? Each link is counted on the rows as they stand, "n of m", and the command fails when any link that has
something to join reads zero. Read only; counts and codes, never a name.

A plan line the matching run answered "none" (a `plan_link` proposal naming no activity) is resolved, not missing: it
is counted apart, so "n of m" never hides a line nobody asked about.
"""

from dataclasses import dataclass
from typing import LiteralString

import typer

from engine.core import db


@dataclass(frozen=True)
class Link:
    name: str
    have: int
    of: int
    note: str = ""

    @property
    def broken(self) -> bool:
        return self.of > 0 and self.have == 0


_ACT: LiteralString = "from activity a where a.tenant_id = %(t)s and a.band = %(b)s"
_LINE: LiteralString = (
    "from plan_entry pe join school_class sc on sc.id = pe.school_class_id and sc.grade_code = %(b)s"
    " where pe.tenant_id = %(t)s and btrim(pe.text) <> ''"
)
_LESSON: LiteralString = (
    "from session s join school_class sc on sc.id = s.school_class_id and sc.grade_code = %(b)s"
    " left join plan_entry pe on pe.id = s.plan_entry_id where s.tenant_id = %(t)s and s.kind <> 'fixed'"
)
_EXISTS: LiteralString = (
    "exists (select 1 from {table} x where x.tenant_id = a.tenant_id and x.activity_code = a.code)"
)
_FILLED: LiteralString = (
    "btrim(coalesce(a.level_0, '')) <> '' and btrim(coalesce(a.level_1, '')) <> ''"
    " and btrim(coalesce(a.level_2, '')) <> '' and btrim(coalesce(a.level_3, '')) <> ''"
)
_OBS: LiteralString = (
    "from activity_observation o join school_class sc on sc.id = o.class_id and sc.grade_code = %(b)s"
    " where o.tenant_id = %(t)s and o.reached_level is not null"
)

# (name, count of joined, count of all, note) — each a count over the grade's rows
QUERIES: list[tuple[str, LiteralString, str]] = [
    ("lesson → activity", f"select count(*) filter (where coalesce(s.activity_code, (select a.code from activity a"
     f" where a.id = pe.activity_id)) is not null) as have, count(*) as n {_LESSON}", "teaching lessons (not fixed)"),
    ("lesson → planner line", f"select count(s.plan_entry_id) as have, count(*) as n {_LESSON}", ""),
    ("planner line → activity", f"select count(pe.activity_id) as have, count(*) as n {_LINE}", ""),
    ("unlinked line → answered none", "select count(*) filter (where exists (select 1 from curriculum_proposal p"
     " where p.tenant_id = pe.tenant_id and p.kind = 'plan_link' and p.status = 'auto_passed'"
     " and p.proposal ->> 'activity' is null and p.proposal -> 'plan_entries' ? pe.id::text)) as have,"
     f" count(*) as n {_LINE} and pe.activity_id is null", "resolved: the line names no activity"),
    ("activity → objective", f"select count(*) filter (where {_EXISTS.format(table='activity_objective')}) as have,"
     f" count(*) as n {_ACT}", ""),
    ("activity → skill", f"select count(*) filter (where {_EXISTS.format(table='activity_skill')}) as have,"
     f" count(*) as n {_ACT}", ""),
    ("activity → L0–L3 filled", f"select count(*) filter (where {_FILLED}) as have, count(*) as n {_ACT}", ""),
    ("activity → steps", f"select count(*) filter (where btrim(coalesce(a.steps, '')) <> '') as have, count(*) as n"
     f" {_ACT}", ""),
    ("objective → skill", "select count(*) filter (where exists (select 1 from learning_objective_skill x where"
     " x.tenant_id = l.tenant_id and x.lo_code = l.code)) as have, count(*) as n from learning_objective l"
     " where l.tenant_id = %(t)s and l.band = %(b)s", ""),
    ("rubric mark → evidence", f"select count(*) filter (where exists (select 1 from evidence_event e where"
     f" e.observation_id = o.id)) as have, count(*) as n {_OBS}", "marks of a level 0–3"),
    ("evidence → child's graph", "select count(distinct (e.child_id, e.skill_code)) filter (where exists (select 1"
     " from child_skill_state c where c.child_id = e.child_id and c.skill_code = e.skill_code"
     " and c.kind = 'observed')) as have,"
     " count(distinct (e.child_id, e.skill_code)) as n from evidence_event e join activity_observation o"
     " on o.id = e.observation_id join school_class sc on sc.id = o.class_id and sc.grade_code = %(b)s"
     " where e.tenant_id = %(t)s", "child and skill pairs"),
    ("attendance → child", "select count(distinct e.child_id) filter (where exists (select 1 from attendance at"
     " where at.child_id = e.child_id)) as have, count(distinct e.child_id) as n from enrolment e join school_class sc"
     " on sc.id = e.class_id and sc.grade_code = %(b)s where e.tenant_id = %(t)s and e.to_date is null",
     "children enrolled now"),
]  # fmt: skip


def chain(conn: db.Conn, tenant: db.Id, band: str) -> list[Link]:
    out = []
    for name, sql, note in QUERIES:
        r = db.one(conn, sql, {"t": tenant, "b": band})
        out.append(Link(name, int(r["have"]), int(r["n"]), note))
    return out


def command(
    band: str = typer.Option("K2", "--band", help="the grade, as school_class.grade_code holds it"),
) -> None:
    """Each link of a grade's chain, n of m; exits 1 when a link with something to join reads zero."""
    with db.connect() as conn:
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        links = chain(conn, tenant, band)
    for x in links:
        flag = "ZERO" if x.broken else ("--  " if x.of == 0 else "ok  " if x.have == x.of else "    ")
        note = f"  ({x.note})" if x.note else ""
        typer.echo(f"  {flag} {x.name:<32} {x.have:>5} of {x.of:<5}{note}")
    if any(x.broken for x in links):
        raise typer.Exit(1)
