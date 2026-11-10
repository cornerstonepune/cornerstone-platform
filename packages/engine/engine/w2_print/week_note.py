"""N4 — the week's declaration (goals/n4-week-declaration.yaml; workflow v1: "LLM structures, teacher confirms").

An educator says in their own words what the class did this week. The engine proposes which of that grade's skill sets
it covered: one yes/no per skill set, asked of Jev in one call (ADR 0036), each with its probability; those at or
above `week.skill_yes_above` come ticked. The educator confirms or changes the ticks, and what they confirm is kept
(a row of the one approval list, kind `week`, target `<section> <week>`: the latest stands) — the week's papers are
made from it.
If Jev cannot be reached, nothing is ticked and the educator ticks the skill sets themselves.

Measured 2026-09-28 on 24 gold notes (`supabase/seed/week_note_gold.json`): at 0.5, precision 0.94, recall 0.97, the
exact set on 21 of 24, about 0.3 s a note. Jev is shown the note and the skill sets' own words, never a child.
"""

import json

from engine.adapters import jev
from engine.core import db, roster, settings

PURPOSE = "week_skills"
GOLD = db.REPO_ROOT / "supabase" / "seed" / "week_note_gold.json"
BAR = ("week.skill_yes_above", 0.5)


def _bar(conn):
    return settings.threshold(conn, *BAR)


def options(conn, band):
    """{code: its name and what the child can do} for the skill sets a class in `band` works on: those with a level of
    its grade — the skill's own, or the one a level was moved to (`skill_level.grade`). A grade is its row in
    `grade`: reasoning's "G2+" is Grade 2 (ADR 0085)."""
    out = {}
    for r in conn.execute(
        "select s.code, s.name, s.learning_objective from skill s"
        " where exists (select 1 from skill_level l where l.tenant_id = s.tenant_id and l.skill_code = s.code"
        " and l.grade = %s)"
        " order by s.code",
        (band,),
    ):
        out[r["code"]] = f"{r['name']} — {r['learning_objective']}"
    return out


def propose(conn, band, note, ask=None):
    """→ {"skill_sets": [{code, about, yes, ticked}] most likely first, "why": "" or why nothing is proposed}."""
    ask = ask or jev.decide_yes_no
    about = options(conn, band)
    if not note.strip():
        return {"skill_sets": [_row(c, a, None, False) for c, a in about.items()], "why": "no note written"}
    try:
        yes = ask(conn, PURPOSE, {"educator_note": note.strip()}, about)["yes"]
    except jev.JevError as e:
        return {"skill_sets": [_row(c, a, None, False) for c, a in about.items()], "why": str(e)}
    bar = _bar(conn)
    rows = [_row(c, about[c], p, p >= bar) for c, p in yes.items()]
    return {"skill_sets": sorted(rows, key=lambda r: -r["yes"]), "why": ""}


def _row(code, about, yes, ticked):
    return {"code": code, "about": about, "yes": yes, "ticked": ticked}


def confirm(conn, section, week, note, skill_sets, by, proposed=()):
    """What the educator confirms for their section's week, kept as said. Refuses a skill set that is not the grade's."""
    band = roster.class_band(conn, section)
    if not band:
        raise ValueError(f"no class {section!r}")
    allowed = options(conn, band)
    unknown = sorted(set(skill_sets) - set(allowed))
    if unknown:
        raise ValueError(f"not skill sets of {band}: {', '.join(unknown)}")
    if not by:
        raise ValueError("a declaration names the educator making it")
    row = conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, detail)"
        " select id, 'week', %s, 'confirmed', %s, jsonb_build_object('section', %s::text, 'week', %s::text, 'note', %s::text,"
        " 'skill_sets', %s::jsonb, 'proposed', %s::jsonb) from tenant where slug = %s returning id, created_at, seq",
        (f"{section} {week}", by, section, week, note, json.dumps(sorted(skill_sets)), json.dumps(list(proposed)),
         db.tenant_slug()),
    ).fetchone()  # fmt: skip
    return {"id": row["id"], "created_at": row["created_at"]}


def current(conn, section, week):
    """The week's declaration that stands — the latest — or None."""
    row = conn.execute(
        "select detail, by, created_at from approval where kind = 'week' and target = %s order by seq desc limit 1",
        (f"{section} {week}",),
    ).fetchone()
    if row is None:
        return None
    d = row["detail"]
    return {"section": d["section"], "week": d["week"], "note": d["note"], "skill_sets": d["skill_sets"],
            "proposed": d["proposed"], "by": row["by"], "created_at": row["created_at"]}  # fmt: skip


def evaluate(conn, ask=None, gold=None):
    """Jev against the gold notes: precision and recall of the ticked skill sets, and how many notes it got exactly."""
    gold = gold if gold is not None else json.loads(GOLD.read_text(encoding="utf-8"))["notes"]
    tp = fp = fn = exact = 0
    misses, failed = [], []
    asking = jev.counting(ask or jev.decide_yes_no, failed)
    for g in gold:
        before = len(failed)
        proposed = propose(conn, g["band"], g["note"], asking)
        if len(failed) > before:  # not asked is not "nothing ticked"
            continue
        got = {r["code"] for r in proposed["skill_sets"] if r["ticked"]}
        want = set(g["skill_sets"])
        tp, fp, fn = tp + len(got & want), fp + len(got - want), fn + len(want - got)
        exact += got == want
        if got != want:
            misses.append({"note": g["note"], "want": sorted(want), "got": sorted(got)})
    return {
        "n": len(gold),
        "exact": exact,
        "precision": round(tp / max(1, tp + fp), 3),
        "recall": round(tp / max(1, tp + fn), 3),
        "misses": misses,
        "unanswered": len(failed),
        "error": failed[0] if failed else "",
    }
