"""CP-52: no planner line left empty. A line the matching run answered "none" (`plan_match`, a `plan_link` proposal
naming no activity) is settled one of two ways.

Routine (prayer, a guest, a revision, an event): a recorded verdict and nothing else, with no activity and no skill, so
nothing can become evidence of a skill no child was taught. Code decides it where the config row `plan.routine` names the
line's plan subject or one of its words; a model (prompt row `plan_line_kind`) is asked only for the rest, from a
closed list, and a word off the list is refused.

Teaching: a new activity of the machine's. Code makes the row: the line's words as its name, the first strand of
the plan subject (`plan.key_strands`), the next code `ACT-<band>-M####`, and `source_file` naming the machine
(`MADE_BY`). It links the line with rule `model` in this run, so `plan_link_undo` undoes it whole. The new activity is
then a gap like any other: the existing runs draft its page (`curriculum draft`), propose its objective and skills
(`curriculum propose`) and its materials (`curriculum materials`), each part and link the machine's, so it reads "To
approve" until a person approves it and writes no evidence before that (CP-51).

A lesson with no planner line is not settled here: its activity can only be set as a person's choice
(`session.activity_code`), so the machine never sets it (it stays on Curriculum's Lessons to confirm).
"""

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from psycopg.types.json import Jsonb

from engine.core import db, settings

PURPOSE = "plan_line_kind"
KINDS = ("teaching", "routine")
MADE_BY = "machine:plan_author"  # activity.source_file of an activity the machine made for a planner line
Ask = Callable[[dict[str, object], str], dict[str, object]]  # (variables, the line) → the model's reply


@dataclass(frozen=True)
class Gap:
    key: str  # the plan subject
    text: str
    ids: tuple[str, ...]  # every plan entry of the band with these words, unlinked


@dataclass
class Verdict:
    kind: str | None  # teaching or routine; None when the reply was refused
    by: str  # code, or the prompt and its version
    reason: str = ""
    problems: list[str] = field(default_factory=list)


def gaps(conn: db.Conn, tenant: db.Id, band: str) -> list[Gap]:
    """The band's distinct unlinked lines the matching run answered none, and not yet settled here (a settling a person
    later moved on, a newer row `about` it, no longer counts)."""
    rows = conn.execute(
        "select pe.plan_key, pe.text, array_agg(pe.id::text order by pe.id) as ids from plan_entry pe"
        " join school_class sc on sc.id = pe.school_class_id and sc.grade_code = %s"
        " where pe.tenant_id = %s and pe.activity_id is null and btrim(pe.text) <> ''"
        " and exists (select 1 from curriculum_proposal p where p.tenant_id = pe.tenant_id and p.kind = 'plan_link'"
        "  and p.status = 'auto_passed' and p.proposal ->> 'activity' is null and p.proposal -> 'plan_entries' ? pe.id::text)"
        " and not exists (select 1 from curriculum_proposal p where p.tenant_id = pe.tenant_id and p.kind = 'plan_link'"
        "  and p.proposal ? 'kind' and p.proposal -> 'plan_entries' ? pe.id::text and p.status <> 'rejected'"
        "  and not exists (select 1 from curriculum_proposal x where x.about = p.id))"
        " group by 1, 2 order by 1, 2",
        (band, tenant),
    ).fetchall()
    return [Gap(r["plan_key"], r["text"], tuple(r["ids"])) for r in rows]


def routine(conn: db.Conn, gap: Gap) -> bool:
    """Whether the config row `plan.routine` calls the line routine: its plan subject, or one of its words."""
    rule = settings.config(conn, "plan.routine", {}) or {}
    said = " ".join(re.findall(r"[a-z0-9]+", gap.text.lower()))
    return gap.key in (rule.get("keys") or []) or any(
        re.search(rf"\b{re.escape(w.lower())}\b", said) for w in rule.get("words") or []
    )


def classify(conn: db.Conn, gap: Gap, ask: Ask, version: int = 1) -> Verdict:
    """Routine by code where the config row says so; else the model's word from the closed list, a word off it refused."""
    if routine(conn, gap):
        return Verdict("routine", "code", "its plan subject or one of its words is routine (plan.routine)")
    reply = ask({"subject": gap.key, "line": gap.text, "kinds": ", ".join(KINDS)}, gap.text)
    kind, by = str(reply.get("kind") or "").strip(), f"{PURPOSE} v{version}"
    if kind not in KINDS:
        return Verdict(None, by, str(reply.get("reason") or ""), [f"{kind} is not one of {', '.join(KINDS)}"])
    return Verdict(kind, by, str(reply.get("reason") or ""))


def next_code(conn: db.Conn, tenant: db.Id, band: str) -> str:
    """The next machine activity code of the band: `ACT-<band>-M` and four digits, never one used before."""
    prefix = f"ACT-{band}-M"
    row = db.one(
        conn,
        "select max(substring(code from %s)::int) as n from activity where tenant_id = %s and code ~ %s",
        (f"^{re.escape(prefix)}([0-9]+)$", tenant, f"^{re.escape(prefix)}[0-9]+$"),
    )
    return f"{prefix}{(row['n'] or 0) + 1:04d}"


def _new_activity(conn: db.Conn, tenant: db.Id, band: str, gap: Gap, strand: str) -> tuple[str, str]:
    code = next_code(conn, tenant, band)
    row = db.one(
        conn,
        "insert into activity (tenant_id, code, band, strand, name, source_file, source_tab)"
        " values (%s, %s, %s, %s, %s, %s, %s) returning id::text",
        (tenant, code, band, strand, gap.text.strip()[:200], MADE_BY, gap.key),
    )
    return row["id"], code


def settle(
    conn: db.Conn,
    tenant: db.Id,
    run: uuid.UUID,
    gap: Gap,
    v: Verdict,
    staff: db.Id | None,
    by: str,
    band: str,
) -> str | None:
    """The line settled and recorded as a proposal of the one list: routine, nothing made; teaching, a new activity
    linked by model in `run`. → the new activity's code, if one was made."""
    problems, code, act = list(v.problems), None, None
    if v.kind == "teaching":
        strands = (settings.config(conn, "plan.key_strands", {}) or {}).get(gap.key) or []
        if not strands:
            problems.append(
                f"no strand is set for the plan subject {gap.key} (plan.key_strands): no activity made"
            )
        else:
            act, code = _new_activity(conn, tenant, band, gap, strands[0])
            conn.execute(
                "update plan_entry set activity_id = %s, link_rule = 'model', link_run = %s, linked_at = now(),"
                " linked_by = %s where id = any(%s::uuid[]) and activity_id is null",
                (act, run, by, list(gap.ids)),
            )
    conn.execute(
        "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, proposer, problems, status,"
        " reason, staff_id, machine) values (%s,%s,'plan_link',%s,%s,%s,%s,%s,%s,%s,%s)",
        (tenant, run, f"{gap.key}: {gap.text}"[:500],
         Jsonb({"plan_key": gap.key, "text": gap.text, "kind": v.kind, "routine": v.kind == "routine", "activity": code,
                "plan_entries": list(gap.ids)}),
         v.by, problems, "rejected" if problems else "auto_passed", v.reason, staff,
         "code:plan_author" if v.by == "code" else f"proposer:{v.by}"),
    )  # fmt: skip
    return None if problems else code
