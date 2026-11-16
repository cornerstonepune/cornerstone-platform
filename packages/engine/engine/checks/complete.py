"""CP-54 (Nimish, 16 Nov: "Nothing needs nothing… I don't want anything empty"): in every band the machine has worked on, every
live objective has its words, its subject, its topic and exactly one capability group, and every activity has an objective
and four levels. A band the machine has not touched is out of scope, so a school that has not run the data passes. Each
violation is a count and a few codes, never a name; `engine audit` fails on any."""

from typing import LiteralString

from engine.core import db

PROFILE: LiteralString = "CS-PROFILE"
# what an objective of a band in scope must have, each as the SQL that finds the objectives that do not
OBJECTIVE: dict[str, LiteralString] = {
    "no words": "btrim(coalesce(l.title, '')) = ''",
    "no subject": "l.subject_code is null and l.kind = 'academic'",
    "no topic": "l.topic_code is null and l.kind = 'academic'",
    "no capability group": (
        "not exists (select 1 from objective_statement o join framework_statement g on g.tenant_id = o.tenant_id"
        " and g.framework_code = o.framework_code and g.code = o.statement_code and g.kind = 'group'"
        f" where o.tenant_id = l.tenant_id and o.lo_code = l.code and o.framework_code = '{PROFILE}')"
    ),
    "more than one capability group": (
        "(select count(*) from objective_statement o join framework_statement g on g.tenant_id = o.tenant_id"
        " and g.framework_code = o.framework_code and g.code = o.statement_code and g.kind = 'group'"
        f" where o.tenant_id = l.tenant_id and o.lo_code = l.code and o.framework_code = '{PROFILE}') > 1"
    ),
}
IN_SCOPE: LiteralString = (
    "l.band in (select band from learning_objective where source = 'machine' and tenant_id = l.tenant_id)"
    " and not l.retired"
)


def every_objective_and_activity_in_scope_is_complete(conn: db.Conn) -> list[str]:
    out: list[str] = []
    for why, cond in OBJECTIVE.items():
        rows = conn.execute(
            f"select l.code from learning_objective l where {IN_SCOPE} and ({cond}) order by l.code limit 4"  # noqa: S608
        ).fetchall()
        if rows:
            counted = conn.execute(
                f"select count(*) as n from learning_objective l where {IN_SCOPE} and ({cond})"
            ).fetchone()  # noqa: S608
            n = counted["n"] if counted else 0
            out.append(f"{n} objectives with {why}, e.g. {', '.join(r['code'] for r in rows)}")
    acts = conn.execute(
        "select a.code, (select count(*) from activity_objective x where x.tenant_id = a.tenant_id and x.activity_code = a.code) as links,"
        " (a.level_0 <> '' and a.level_1 <> '' and a.level_2 <> '' and a.level_3 <> '') as levels from activity a"
        " where a.source_file like 'machine seed%' order by a.code"
    ).fetchall()
    out += [f"activity {a['code']} has no objective" for a in acts if not a["links"]][:4]
    out += [f"activity {a['code']} is missing a level" for a in acts if not a["levels"]][:4]
    return out
