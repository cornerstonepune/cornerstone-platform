"""A child's picture rolled up the chain (CP-54 A3, Done when 11 and 12): evidence → learning objective → progression
step, topic, subject → capability → the three words.

Ring B, a pure function of ring A: nothing here is stored, so a rebuild is a second call and gives the same answer. Two
kinds of evidence land on an objective:
  * a confirmed written answer, through the engine skill of its question (`item.skill_set_code` → `skill.lo_code`);
  * an observation of an activity (not one a correction replaced), through the objectives the activity names
    (`activity_objective`), which is also how a character objective is reached.
Blank, wrong and wrong-with-working are three counts, never one "incorrect" (CLAUDE.md rule 5); an observation is met
(as expected or above), below, or not shown (absent or not willing). Every link carries its origin; `machine` counts the
evidence resting on at least one link the machine made and nobody has checked, so the picture can say how much of itself
that is (CP-54 point 8). An objective is evidence for the words it is linked to; a piece of evidence counts in full for
each of them, so the words' counts are not a partition of the objective's.
"""

from collections import defaultdict
from typing import Any

from engine.core import db, frameworks

COUNTS = ("right", "blank", "wrong", "wrong_with_working", "met", "below", "not_shown")
LEVELS = ("lo", "step", "topic", "subject", "capability", "word")
NONE = "(none)"

_WRITTEN = (
    "select s.lo_code, s.lo_source as source, ir.status, ir.working_shown, ev.correct"
    " from evidence_event ev left join item_result ir on ir.id = ev.item_result_id"
    " left join item i on i.id = ir.item_id"
    " left join skill s on s.tenant_id = ev.tenant_id and s.code = i.skill_set_code"
    " where ev.child_id = %s and ev.confirmed_by is not null and ev.kind = 'written'"
)
_SEEN = (
    "select ao.lo_code, ao.source, o.outcome from activity_observation o"
    " join activity_objective ao on ao.tenant_id = o.tenant_id and ao.activity_code = o.activity_code"
    " where o.child_id = %s and not exists (select 1 from activity_observation n where n.supersedes = o.id)"
)
_LOS = (
    "select lo.code, lo.subject_code, lo.topic_code, lo.kind,"
    " (select statement_code from objective_statement os where os.tenant_id = lo.tenant_id and os.lo_code = lo.code"
    "   and os.framework_code = %(prog)s and os.relation = 'on_step') as step,"
    " (select source from objective_statement os where os.tenant_id = lo.tenant_id and os.lo_code = lo.code"
    "   and os.framework_code = %(prog)s and os.relation = 'on_step') as step_source,"
    " (select statement_code from objective_statement os where os.tenant_id = lo.tenant_id and os.lo_code = lo.code"
    "   and os.framework_code = %(prof)s and os.relation = 'counts_toward') as capability,"
    " (select source from objective_statement os where os.tenant_id = lo.tenant_id and os.lo_code = lo.code"
    "   and os.framework_code = %(prof)s and os.relation = 'counts_toward') as capability_source,"
    " coalesce((select jsonb_object_agg(statement_code, source) from objective_statement os"
    "   where os.tenant_id = lo.tenant_id and os.lo_code = lo.code and os.framework_code = %(prof)s"
    "   and os.relation = 'evidence_for'), '{}'::jsonb) as words"
    " from learning_objective lo where lo.code = any(%(codes)s)"
)


def _written_signal(r: dict[str, Any]) -> str | None:
    """The one count a written answer adds to, or None for an answer nobody could read or judge."""
    if r["status"] is None:  # a teacher's override: no reading behind it
        return {True: "right", False: "wrong"}.get(r["correct"])
    if r["status"] == "correct":
        return "right"
    if r["status"] == "blank":
        return "blank"
    if r["status"] == "wrong":
        return "wrong_with_working" if r["working_shown"] in ("partial", "full") else "wrong"
    return None  # unreadable, needs a teacher


_SEEN_COUNT = {
    "as_expected": "met",
    "above": "met",
    "below": "below",
    "absent": "not_shown",
    "not_willing": "not_shown",
}


def _node() -> dict[str, Any]:
    return {"counts": dict.fromkeys(COUNTS, 0), "n": 0, "machine": 0}


def _add(node: dict[str, Any], signal: str, machine: bool) -> None:
    node["counts"][signal] += 1
    node["n"] += 1
    node["machine"] += machine


def picture(conn: db.Conn, child_id: str) -> dict[str, Any]:
    """The child's picture at every level of the chain, keys in sorted order. `unplaced` counts the written answers whose
    question has no engine skill, or whose skill names no objective yet (they reach no level)."""
    events: list[tuple[str, str, str]] = []  # (lo, signal, origin of the link that put it on the objective)
    unplaced = 0
    for r in conn.execute(_WRITTEN, (child_id,)).fetchall():
        signal = _written_signal(r)
        if signal is None:
            continue
        if r["lo_code"] is None:
            unplaced += 1
        else:
            events.append((r["lo_code"], signal, r["source"]))
    for r in conn.execute(_SEEN, (child_id,)).fetchall():
        events.append((r["lo_code"], _SEEN_COUNT[r["outcome"]], r["source"]))
    codes = sorted({e[0] for e in events})
    los = {
        r["code"]: r
        for r in conn.execute(
            _LOS, {"prog": frameworks.PROGRESSIONS, "prof": frameworks.PROFILE, "codes": codes}
        ).fetchall()
    }
    out: dict[str, Any] = {level: defaultdict(_node) for level in LEVELS}
    kinds: dict[str, int] = defaultdict(int)
    for lo, signal, origin in events:
        a = los[lo]
        kinds[a["kind"]] += 1
        _add(out["lo"][lo], signal, origin == "machine")
        placed = (
            ("step", a["step"], a["step_source"]),
            ("topic", a["topic_code"], None),
            ("subject", a["subject_code"], None),
            ("capability", a["capability"], a["capability_source"]),
        )
        for level, key, via in placed:
            _add(out[level][key or NONE], signal, origin == "machine" or via == "machine")
        for word, via in sorted(a["words"].items()):
            _add(out["word"][word], signal, origin == "machine" or via == "machine")
    total = sum(n["n"] for n in out["lo"].values())
    machine = sum(n["machine"] for n in out["lo"].values())
    return {
        **{level: {k: out[level][k] for k in sorted(out[level])} for level in LEVELS},
        "kinds": dict(sorted(kinds.items())),
        "unplaced": unplaced,
        "evidence": total,
        "machine_share": round(machine / total, 4) if total else 0.0,
    }


def lines(p: dict[str, Any]) -> list[str]:
    """The picture as text, one line per node: what `engine graph --child X --picture` prints."""
    out = [
        f"  {p['evidence']} pieces of evidence · {p['machine_share']:.0%} rest on a link the machine made · {p['unplaced']} reach no objective"
    ]
    for level in LEVELS:
        out.append(f"  {level}")
        for key, n in p[level].items():
            c = n["counts"]
            shown = " ".join(f"{k}={v}" for k, v in c.items() if v)
            out.append(f"    {key:<44} {n['n']:>3}  {shown}  (machine {n['machine']})")
    return out


def command(child_id: str) -> None:
    """`engine graph --child X --picture`."""
    import typer

    with db.connect() as conn:
        for line in lines(picture(conn, child_id)):
            typer.echo(line)
