"""The chain's own links, counted for K2 and G1–G4 (CP-54 A3, Done when 14): every learning objective and activity,
n of n, from the school's wording up to the capability and the words. Read only; counts, never a name.

`engine audit` lists a layer below n of n as a violation. It is expected to stay red until the machine's placement runs
(subject, topic, engine skill → objective, capability, words) have filled the links; the audit says so rather than hiding
the gap. A routine and a character area are not subjects, so the subject and topic layers count academic objectives
only, and an activity whose strand is a routine is not counted for a subject.
"""

from typing import LiteralString

from engine.checks.chain import Link
from engine.core import db, frameworks, settings, subject_map

BANDS = ("K2", "G1", "G2", "G3", "G4")

_LO: LiteralString = "from learning_objective l where l.tenant_id = %(t)s and l.band = %(b)s"
_ACADEMIC: LiteralString = f"{_LO} and l.kind = 'academic'"
_STATEMENT: LiteralString = (
    "exists (select 1 from objective_statement x where x.tenant_id = l.tenant_id and x.lo_code = l.code"
    " and x.framework_code = %({fw})s and x.relation = '{relation}')"
)
_ACT: LiteralString = (
    "from activity a where a.tenant_id = %(t)s and a.band = %(b)s and a.strand <> all(%(routines)s)"
)

# (name, sql giving `have` and `n`) — each over one grade's rows
LAYERS: list[tuple[str, LiteralString]] = [
    ("objective → subject", f"select count(l.subject_code) as have, count(*) as n {_ACADEMIC}"),
    ("objective → topic", f"select count(l.topic_code) as have, count(*) as n {_ACADEMIC}"),
    (
        "objective → registry skill",
        "select count(*) filter (where exists (select 1 from learning_objective_skill x where"
        f" x.tenant_id = l.tenant_id and x.lo_code = l.code)) as have, count(*) as n {_ACADEMIC}",
    ),
    (
        "objective → progression step",
        "select count(*) filter (where "
        + _STATEMENT.format(fw="prog", relation="on_step")
        + f") as have, count(*) as n {_ACADEMIC}",
    ),
    (
        "objective → capability",
        "select count(*) filter (where "
        + _STATEMENT.format(fw="prof", relation="counts_toward")
        + f") as have, count(*) as n {_LO}",
    ),
    (
        "objective → word",
        "select count(*) filter (where "
        + _STATEMENT.format(fw="prof", relation="evidence_for")
        + f") as have, count(*) as n {_LO}",
    ),
    ("activity → subject", f"select count(a.subject_code) as have, count(*) as n {_ACT}"),
    (
        "activity → objective",
        "select count(*) filter (where exists (select 1 from activity_objective x where"
        f" x.tenant_id = a.tenant_id and x.activity_code = a.code)) as have, count(*) as n {_ACT}",
    ),
    (
        "engine skill → objective",
        "select count(s.lo_code) as have, count(*) as n from skill s where s.tenant_id = %(t)s and s.grade = %(b)s",
    ),
]


def layers(conn: db.Conn, tenant: db.Id, band: str) -> list[Link]:
    rules = settings.config(conn, subject_map.KEY, None, tenant)
    params = {"t": tenant, "b": band, "prog": frameworks.PROGRESSIONS, "prof": frameworks.PROFILE,
              "routines": list(rules["routines"]) if rules else []}  # fmt: skip
    out = []
    for name, sql in LAYERS:
        r = db.one(conn, sql, params)
        out.append(Link(f"{band} {name}", int(r["have"]), int(r["n"])))
    return out


def below_n_of_n(conn: db.Conn) -> list[str]:
    """One line per layer of a grade that reads under n of n (a layer with nothing to join is not a gap)."""
    tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
    return [
        f"{x.name}: {x.have} of {x.of}"
        for band in BANDS
        for x in layers(conn, tenant, band)
        if x.of and x.have < x.of
    ]
