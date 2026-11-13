"""CP-48: a plan line linked to the activity it names, where the loader's exact-name rule found none (CP-8).

Code does the lookup and the checking; a model does only the judgement (CLAUDE.md, ADR 0005). For each distinct line
(its plan subject and its words) code shortlists the school's activities of the class's grade whose strand the plan
subject may be (`plan.key_strands`), closest wording first (`plan.shortlist_size`). A model (prompt row
`plan_line_match`) names one of them or says none. Code refuses a code not on the shortlist. A subject with no strand
has nothing to match: none, with no call. Every answer is a proposal (`curriculum_proposal`, kind `plan_link`); a
written run sets the lines' activity with link rule `model` and the run's id in `link_run`, so `plan_link_undo` undoes
the run whole, and a person's later edit makes the line theirs (the database's own trigger). Nothing reads a name.
"""

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from psycopg.types.json import Jsonb

from engine.core import db, settings

PURPOSE = "plan_line_match"
WORD = re.compile(r"[a-z0-9]+")
Ask = Callable[
    [dict[str, object], str], dict[str, object]
]  # (variables, the line asked about) → the model's reply


@dataclass(frozen=True)
class Line:
    key: str  # the plan subject (plan_entry.plan_key)
    text: str
    ids: tuple[str, ...]  # every unlinked plan_entry of the band with this subject and these words


@dataclass
class Answer:
    line: Line
    shortlist: list[dict] = field(default_factory=list)
    activity: str | None = None  # the activity code chosen; None is none
    activity_id: str | None = None
    confidence: float = 0.0
    reason: str = ""
    problems: list[str] = field(default_factory=list)


def words(text: str) -> set[str]:
    return set(WORD.findall((text or "").lower()))


def lines(conn: db.Conn, tenant: db.Id, band: str, gold: bool = False) -> list[Line]:
    """The band's distinct plan lines not yet linked and not yet answered "none" (a run asks only what is still open);
    with `gold`, those the school linked by exact name (to score)."""
    rows = conn.execute(
        "select pe.plan_key, pe.text, array_agg(pe.id::text order by pe.id) as ids from plan_entry pe"
        " join school_class sc on sc.id = pe.school_class_id and sc.grade_code = %s where pe.tenant_id = %s and"
        + (
            " pe.link_rule = 'exact_name'"
            if gold
            else " pe.activity_id is null and not exists (select 1 from"
            " curriculum_proposal p where p.tenant_id = pe.tenant_id and p.kind = 'plan_link' and p.status = 'auto_passed'"
            " and p.proposal ->> 'activity' is null and p.proposal -> 'plan_entries' ? pe.id::text)"
        )
        + " and btrim(pe.text) <> '' group by 1, 2 order by 1, 2",
        (band, tenant),
    ).fetchall()
    return [Line(r["plan_key"], r["text"], tuple(r["ids"])) for r in rows]


def shortlist(conn: db.Conn, tenant: db.Id, band: str, line: Line) -> list[dict]:
    """The activities the line may be: the band's, of the plan subject's strands, most words shared first."""
    strands = (settings.config(conn, "plan.key_strands", {}) or {}).get(line.key) or []
    if not strands:
        return []
    acts = conn.execute(
        "select id::text, code, name, objective from activity where tenant_id = %s and band = %s"
        " and strand = any(%s) order by code",
        (tenant, band, strands),
    ).fetchall()
    said = words(line.text)
    ranked = sorted(acts, key=lambda a: (-len(said & words(f"{a['name']} {a['objective']}")), a["code"]))
    return ranked[: int(settings.config(conn, "plan.shortlist_size", 12))]


def _candidates(short: list[dict]) -> str:
    return "\n".join(f"{a['code']} | {a['name']} | {(a['objective'] or '').strip()[:240]}" for a in short)


def answer(conn: db.Conn, tenant: db.Id, band: str, line: Line, ask: Ask) -> Answer:
    """One line's answer, checked: a code not on the shortlist is refused and kept as a problem, never linked."""
    out = Answer(line, shortlist(conn, tenant, band, line))
    if not out.shortlist:
        out.reason = (
            f"no strand of the activity list is set for the plan subject {line.key} (plan.key_strands)"
        )
        return out
    reply = ask({"subject": line.key, "line": line.text, "candidates": _candidates(out.shortlist)}, line.text)
    code = str(reply.get("activity_code") or "").strip()
    out.confidence = float(reply.get("confidence") or 0.0)  # type: ignore[arg-type]
    out.reason = str(reply.get("reason") or "")
    by_code = {a["code"]: a for a in out.shortlist}
    if code and code not in by_code:
        out.problems.append(f"{code} is not on the shortlist this line was given")
    elif code:
        out.activity, out.activity_id = code, by_code[code]["id"]
    return out


def record(conn: db.Conn, tenant: db.Id, run: uuid.UUID, a: Answer, staff: db.Id, prompt: str) -> None:
    """The answer as a proposal of the one list: a refused code is rejected; a choice or a none passes (a none links
    nothing, so there is nothing for a person to check)."""
    conn.execute(
        "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, confidence, proposer,"
        " problems, status, reason, staff_id, machine) values (%s,%s,'plan_link',%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (tenant, run, f"{a.line.key}: {a.line.text}"[:500],
         Jsonb({"plan_key": a.line.key, "text": a.line.text, "activity": a.activity,
                "shortlist": [s["code"] for s in a.shortlist], "plan_entries": list(a.line.ids)}),
         a.confidence, prompt if a.shortlist else "code", a.problems, "rejected" if a.problems else "auto_passed",
         a.reason, staff, f"proposer:{prompt}" if a.shortlist else "code:plan_link"),
    )  # fmt: skip


def link(conn: db.Conn, run: uuid.UUID, a: Answer, by: str) -> int:
    """The line's still-unlinked plan entries given its activity, as the model's, in this run (undone by its id)."""
    if a.activity_id is None or a.problems:
        return 0
    return conn.execute(
        "update plan_entry set activity_id = %s, link_rule = 'model', link_run = %s, linked_at = now(),"
        " linked_by = %s where id = any(%s::uuid[]) and activity_id is null",
        (a.activity_id, run, by, list(a.line.ids)),
    ).rowcount


def score(answers: list[Answer], gold: dict[str, str]) -> dict[str, float]:
    """Against the school's own exact links: how often the right activity is on the shortlist, and is chosen."""
    n = len(answers) or 1
    listed = sum(gold[a.line.text] in [s["id"] for s in a.shortlist] for a in answers)
    right = sum(a.activity_id == gold[a.line.text] for a in answers)
    return {"lines": len(answers), "shortlist_recall": listed / n, "right": right / n}


def gold_links(conn: db.Conn, tenant: db.Id, band: str) -> dict[str, str]:
    """{line words: activity id} of the school's exact-name links in the band."""
    rows = conn.execute(
        "select distinct pe.text, pe.activity_id::text as a from plan_entry pe join school_class sc"
        " on sc.id = pe.school_class_id and sc.grade_code = %s where pe.tenant_id = %s and pe.link_rule = 'exact_name'",
        (band, tenant),
    ).fetchall()
    return {r["text"]: r["a"] for r in rows}
