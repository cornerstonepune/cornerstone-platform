"""CP-51: an objective no activity ties to one skill, linked by a model to the closest skill code shortlists.

`map_eval.lo_skill_pairs` links an objective to a skill only where an activity leaves no doubt; the objectives left are
asked here. Code does the lookup and the checking; a model does only the judgement (CLAUDE.md, ADR 0005). For each
objective of the band with no skill, code shortlists the skills its neighbours already hold: those of the activities
that teach it, then those of the other objectives of its unit, then of its subject, closest wording first within each
(`lo.shortlist_size`). An objective's own links never reach its shortlist, so the gold (`gold_links`, the school's objectives
with one skill) is scored on what an open objective would see. A model (prompt row `lo_skill_match`) names one skill or
none only when nothing on the list is about its subject matter (Nimish, 14 Nov: no blank where a nearest skill
exists; a person approves every link). Code refuses a skill not on the shortlist; an objective with an empty shortlist
waits for a person, labelled why.

Every answer is a proposal of the one list (`curriculum_proposal`, kind `lo_skill`): a choice passes and the ledger's
own apply (`engine curriculum apply --kind lo_skill`) writes it as the machine's link, naming the proposal, so
`engine curriculum revert` undoes it; a none, or an objective with nothing near it, waits for a person; a refusal is
rejected. An objective answered once is not asked again. Nothing reads a name.
"""

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from psycopg.types.json import Jsonb

from engine.core import db, settings

PURPOSE = "lo_skill_match"
WORD = re.compile(r"[a-z0-9]+")
Ask = Callable[
    [dict[str, object], str], dict[str, object]
]  # (variables, the objective's code) → the model's reply


@dataclass(frozen=True)
class Objective:
    code: str
    subject: str
    unit: str
    title: str


@dataclass
class Answer:
    objective: Objective
    shortlist: list[dict] = field(default_factory=list)
    skill: str | None = None  # the skill code chosen; None is none
    confidence: float = 0.0
    reason: str = ""
    problems: list[str] = field(default_factory=list)


def words(text: str) -> set[str]:
    return set(WORD.findall((text or "").lower()))


_ASKED = (
    " and not exists (select 1 from curriculum_proposal p where p.tenant_id = l.tenant_id and p.kind = 'lo_skill'"
    " and p.subject_code = l.code and p.proposer like %s)"
)


def objectives(conn: db.Conn, tenant: db.Id, band: str, gold: bool = False) -> list[Objective]:
    """The band's objectives with no skill and not yet answered by this purpose; with `gold`, those the school linked
    to exactly one skill (to score)."""
    if gold:
        where = " and l.code = any(%s)"
        args: tuple = (tenant, band, list(gold_links(conn, tenant, band)))
    else:
        where = (
            " and not exists (select 1 from learning_objective_skill x where x.tenant_id = l.tenant_id"
            " and x.lo_code = l.code)" + _ASKED
        )
        args = (tenant, band, f"{PURPOSE}%")
    rows = conn.execute(
        "select l.code, l.subject, l.unit, l.title from learning_objective l where l.tenant_id = %s and l.band = %s"
        + where
        + " order by l.code",
        args,
    ).fetchall()
    return [Objective(r["code"], r["subject"], r["unit"], r["title"]) for r in rows]


def _gold(conn: db.Conn, tenant: db.Id, band: str) -> dict[str, str]:
    rows = conn.execute(
        "select x.lo_code, min(x.skill_code) as skill from learning_objective_skill x join learning_objective l"
        " on l.tenant_id = x.tenant_id and l.code = x.lo_code where x.tenant_id = %s and l.band = %s"
        " group by x.lo_code having count(*) = 1 and bool_and(x.source in ('school', 'person') or exists"
        " (select 1 from curriculum_proposal p where p.id = x.proposal_id and p.proposer = 'code')) order by x.lo_code",
        (tenant, band),
    ).fetchall()
    return {r["lo_code"]: r["skill"] for r in rows}


def gold_links(conn: db.Conn, tenant: db.Id, band: str) -> dict[str, str]:
    """{objective: its one skill} of the band's single links a model did not choose, at most `lo.gold_size`, spread by
    a fixed hash so every run scores the same objectives: the school's, a person's, or one code made where an activity
    left no doubt (K2 began with no objective linked to a skill, so its single links are code's; 14 Nov)."""
    every = _gold(conn, tenant, band)
    n = int(settings.config(conn, "lo.gold_size", 40))
    return dict(sorted(every.items(), key=lambda kv: (uuid.uuid5(uuid.NAMESPACE_OID, kv[0]).hex, kv[0]))[:n])


def shortlist(conn: db.Conn, tenant: db.Id, band: str, lo: Objective) -> list[dict]:
    """The skills the objective may be: its activities', then its unit's, then its subject's; closest words first."""
    rows = conn.execute(
        "with near as ("
        "  select k.skill_code, 1 as tier from activity_objective ao join activity_skill k on k.tenant_id = ao.tenant_id"
        "   and k.activity_code = ao.activity_code where ao.tenant_id = %(t)s and ao.lo_code = %(lo)s"
        "  union all select x.skill_code, case when l.unit = %(unit)s then 2 else 3 end from learning_objective l"
        "   join learning_objective_skill x on x.tenant_id = l.tenant_id and x.lo_code = l.code"
        "   where l.tenant_id = %(t)s and l.band = %(b)s and l.subject = %(subject)s and l.code <> %(lo)s)"
        " select s.code, s.name, s.description, min(n.tier) as tier from near n join registry_skill s"
        "  on s.tenant_id = %(t)s and s.code = n.skill_code group by s.code, s.name, s.description",
        {"t": tenant, "lo": lo.code, "unit": lo.unit, "b": band, "subject": lo.subject},
    ).fetchall()
    said = words(lo.title)
    ranked = sorted(
        rows, key=lambda s: (s["tier"], -len(said & words(f"{s['name']} {s['description']}")), s["code"])
    )
    return ranked[: int(settings.config(conn, "lo.shortlist_size", 12))]


def _candidates(short: list[dict]) -> str:
    return "\n".join(f"{s['code']} | {s['name']} | {(s['description'] or '').strip()[:240]}" for s in short)


def answer(conn: db.Conn, tenant: db.Id, band: str, lo: Objective, ask: Ask) -> Answer:
    """One objective's answer, checked: a skill not on the shortlist is refused and kept as a problem, never linked."""
    out = Answer(lo, shortlist(conn, tenant, band, lo))
    if not out.shortlist:
        out.reason = "no skill is linked to its activities, its unit or its subject yet: a person chooses"
        return out
    reply = ask(
        {
            "subject": lo.subject,
            "unit": lo.unit,
            "objective": lo.title,
            "candidates": _candidates(out.shortlist),
        },
        lo.code,
    )
    code = str(reply.get("skill_code") or "").strip()
    out.confidence = float(reply.get("confidence") or 0.0)  # type: ignore[arg-type]
    out.reason = str(reply.get("reason") or "")
    if code and code not in {s["code"] for s in out.shortlist}:
        out.problems.append(f"{code} is not on the shortlist this objective was given")
    elif code:
        out.skill = code
    return out


def record(conn: db.Conn, tenant: db.Id, run: uuid.UUID, a: Answer, staff: db.Id, prompt: str) -> None:
    """The answer as a proposal of the one list: a choice passes (the ledger's apply links it as the machine's), a
    refusal is rejected, a none or an objective with nothing near it waits for a person."""
    status = "rejected" if a.problems else "auto_passed" if a.skill else "needs_person"
    asked = bool(a.shortlist)
    conn.execute(
        "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, confidence, proposer,"
        " problems, status, reason, staff_id, machine) values (%s,%s,'lo_skill',%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (tenant, run, a.objective.code,
         Jsonb({"skills": [a.skill] if a.skill else [], "shortlist": [s["code"] for s in a.shortlist]}),
         a.confidence, prompt if asked else f"{PURPOSE} code", a.problems, status, a.reason, staff,
         f"proposer:{prompt}" if asked else f"code:{PURPOSE}"),
    )  # fmt: skip


def score(answers: list[Answer], gold: dict[str, str]) -> dict[str, float]:
    """Against the school's own single links: how often the right skill is on the shortlist, and is chosen."""
    n = len(answers) or 1
    listed = sum(gold[a.objective.code] in [s["code"] for s in a.shortlist] for a in answers)
    right = sum(a.skill == gold[a.objective.code] for a in answers)
    return {"objectives": len(answers), "shortlist_recall": listed / n, "right": right / n}
