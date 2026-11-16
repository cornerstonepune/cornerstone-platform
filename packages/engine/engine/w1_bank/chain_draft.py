"""CP-54 B4, the parts that need no model: what code can decide about the chain from the LO to the child (rule: code where
correctness is needed, a model only for judgment). Each function reads rows and the files research built, writes nothing,
and returns what it would link; the applying step records them as the machine's (origin 'machine', never over a person's).

triage      which LOs read as something a child does, and for the rest why not: empty, a heading, a list of syllabus
            texts, a purpose ("Encourages…", "Will help…") or a topic name only. The patterns are a config row
            (`lo.triage`), shared with the SQL that counts them on live (`triage_sql`).
capability  the capability an LO reaches through the spine (LO -> registry skill -> unit -> competency or goal ->
            capability) where that path gives one answer; the LOs it gives several for are the model's shortlist.
tests       each engine skill with registry codes -> the LOs linked to those registry skills at the skill's grade.
topics      an LO whose unit is a topic's name, exactly.
"""

import json
import re
from collections import Counter, defaultdict
from typing import Any

from engine.core import db, frameworks, settings

KINDS = ("empty", "heading", "list", "purpose", "observable", "topic")  # the order the patterns are tried in
PROFILE_SEED = db.REPO_ROOT / "supabase" / "seed" / "profile.json"
Rows = dict[str, list[str]]


def classify(title: str | None, rules: dict[str, str]) -> str:
    """One LO's wording as one of KINDS. A title nothing else catches is a topic name."""
    text = (title or "").strip()
    if not text:
        return "empty"
    for kind in KINDS[1:5]:
        if re.search(rules[kind], text, re.I):
            return kind
    return "topic"


def rules(conn: db.Conn) -> dict[str, str]:
    got = settings.config(conn, "lo.triage")
    if not got:
        raise settings.MissingSetting("no lo.triage setting: run `engine load --settings`")
    return got


def triage(conn: db.Conn, tenant: db.Id, bands: list[str]) -> dict[str, Counter[str]]:
    """{band: how many LOs of each kind}."""
    pat = rules(conn)
    out: dict[str, Counter[str]] = defaultdict(Counter)
    for r in conn.execute(
        "select band, title from learning_objective where tenant_id = %s and band = any(%s)", (tenant, bands)
    ).fetchall():
        out[r["band"]][classify(r["title"], pat)] += 1
    return dict(out)


def triage_sql(pat: dict[str, str]) -> str:
    """The same classification as one SELECT, for counting on a database the engine does not connect to (live,
    read-only). Postgres reads these patterns as it does Python: no `\\b`, no look-around (checked by a test)."""
    lit = lambda s: "'" + s.replace("'", "''") + "'"  # noqa: E731
    cases = " ".join(f"when title ~* {lit(pat[k])} then '{k}'" for k in KINDS[1:5])
    return (
        "select band, case when btrim(coalesce(title, '')) = '' then 'empty' "
        f"{cases} else 'topic' end as kind, count(*) as n from learning_objective group by 1, 2 order by 1, 2"
    )


def _capability_of_skill() -> dict[str, set[str]]:
    """{registry skill code: the capabilities the spine reaches from it}, by the three paths the spine holds."""
    spine = json.loads(frameworks.SPINE.read_text())
    layer = {n["id"]: n["layer"] for n in spine["nodes"]}
    out: dict[str, dict[str, set[str]]] = {k: defaultdict(set) for k in ("feeds", "evidences", "builds", "toward")}
    for e in spine["edges"]:
        k = e["kind"]
        key = {"feeds": "feeds", "evidences": "evidences", "builds": "builds", "builds_toward": "toward"}.get(k)
        if key:
            out[key][e["from"]].add(e["to"])
    caps = lambda node: {c for c in out["feeds"][node] if layer[c] == "capability"}  # noqa: E731
    reach: dict[str, set[str]] = defaultdict(set)
    for node, tos in out["evidences"].items():  # skill evidences goal or competency, which feeds a capability
        if node.startswith("skill."):
            for t in tos:
                reach[node.removeprefix("skill.")] |= caps(t)
    for unit, skills in out["builds"].items():  # a unit builds the skill and builds toward competencies and goals
        ends = set().union(*(caps(t) for t in out["toward"][unit])) if out["toward"][unit] else set()
        for s in skills:
            reach[s.removeprefix("skill.")] |= ends
    return {k: {c.removeprefix("cap.") for c in v} for k, v in reach.items() if v}


def new_capability() -> dict[str, str]:
    """{the first eight's code: the capability that replaces it} (profile.json: each new one supersedes one)."""
    return {c["supersedes"]: c["code"] for c in json.loads(PROFILE_SEED.read_text())["capabilities"]}


def capability(conn: db.Conn, tenant: db.Id) -> dict[str, list[str]]:
    """{LO code: the capabilities its registry skills reach through the spine} for every LO with a registry skill. One
    capability is code's answer; several go to the model's shortlist; an LO with none is not in the result."""
    by_skill, swap = _capability_of_skill(), new_capability()
    got: dict[str, set[str]] = defaultdict(set)
    for r in conn.execute(
        "select lo_code, skill_code from learning_objective_skill where tenant_id = %s", (tenant,)
    ).fetchall():
        got[r["lo_code"]] |= {swap.get(c, c) for c in by_skill.get(r["skill_code"], set())}
    return {lo: sorted(c) for lo, c in got.items() if c}


def tests(conn: db.Conn, tenant: db.Id) -> dict[str, list[str]]:
    """{engine skill: the LOs of its own grade linked to a registry skill it tests}. One LO is a link; several are the
    finer slices of one LO's range or the model's to choose from; none waits for a machine-made LO."""
    rows = conn.execute(
        "select s.code as skill, array_agg(distinct l.code order by l.code) filter (where l.code is not null) as los"
        " from skill s left join learning_objective_skill x on x.tenant_id = s.tenant_id"
        "  and x.skill_code = any(s.registry_codes) left join learning_objective l on l.tenant_id = s.tenant_id"
        "  and l.code = x.lo_code and l.band = s.grade"
        " where s.tenant_id = %s and cardinality(s.registry_codes) > 0 group by s.code order by s.code",
        (tenant,),
    ).fetchall()
    return {r["skill"]: r["los"] or [] for r in rows}


def topics(conn: db.Conn, tenant: db.Id) -> dict[str, str]:
    """{LO code: topic code} where the LO's unit is a topic's name, whatever its case or spacing."""
    rows = conn.execute(
        "select l.code as lo, min(t.code) as topic from learning_objective l join topic t on t.tenant_id = l.tenant_id"
        " and lower(btrim(t.name)) = lower(btrim(l.unit)) where l.tenant_id = %s group by l.code",
        (tenant,),
    ).fetchall()
    return {r["lo"]: r["topic"] for r in rows}


def counts(conn: db.Conn, tenant: db.Id) -> dict[str, Any]:
    """Everything above as numbers, for `engine curriculum chain-draft` and the orchestrator's report."""
    cap, link, fold = capability(conn, tenant), tests(conn, tenant), topics(conn, tenant)
    return {
        "rewrite": {b: dict(c) for b, c in triage(conn, tenant, ["K2", "G1", "G2", "G3", "G4"]).items()},
        "capability": {"one": sum(len(v) == 1 for v in cap.values()), "several": sum(len(v) > 1 for v in cap.values())},
        "tests": {"one": sum(len(v) == 1 for v in link.values()), "several": sum(len(v) > 1 for v in link.values()),
                  "none": sum(not v for v in link.values())},  # fmt: skip
        "topics": len(fold),
        "shortlist": {lo: c for lo, c in cap.items() if len(c) > 1},
    }
