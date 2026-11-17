"""CP-54 B4: the three runs that make the chain's missing links with the skills' machines, under the cp-54 campaign cap.

capability   each live objective with no capability group -> one group of the profile (skill `capability-link`, CHOOSE).
             Code shortlists: the groups of the capabilities the spine reaches from the objective's registry skills
             (`chain_draft.capability`), else every group; a refused or off-list answer falls back to the subject's default
             group (config `lo.capability_default`), marked low, so nothing is left empty.
skill_lo     each engine skill with no objective -> the one objective of its grade it tests (skill `skill-link` run the
             other way, CHOOSE). Code shortlists the objectives of its grade it is linked to through its registry skills,
             then the same subject's, closest words first.
topic        each subject and unit with an objective that has no topic -> a topic (skill `topic`, WRITE: it reuses a topic of
             the subject or names a new one). Code folds the exact unit-name matches itself, with no call.

`plan` builds every input from the rows, with no call; `estimate` prices them; `run` asks and returns rows in the form of
the seed files, which `apply_seed.apply_rows` applies as the machine's.
"""

import re
from typing import Any

from engine.core import db, settings, skill_spec
from engine.skills import machines, pool
from engine.w1_bank import chain_draft, lo_match

KINDS = ("capability", "skill_lo", "topic")
Job = dict[str, Any]  # {"skill", "about", "inputs", "options", "fallback"}


def _groups(conn: db.Conn, t: db.Id) -> list[dict[str, str]]:
    return [
        {"code": r["code"], "name": r["area"], "what": r["text"], "cap": r["parent_code"]}
        for r in conn.execute(
            "select code, area, text, parent_code from framework_statement where tenant_id = %s and framework_code = %s"
            " and kind = 'group' and level_code is null order by code",
            (t, chain_draft.PROFILE_CODE),
        ).fetchall()  # fmt: skip
    ]


def capability_jobs(conn: db.Conn, t: db.Id) -> list[Job]:
    groups, spine = _groups(conn, t), chain_draft.capability(conn, t)
    default = settings.config(conn, "lo.capability_default") or {}
    rows = conn.execute(
        "select l.code, l.band, l.subject, l.subject_code, l.unit, l.title, l.kind from learning_objective l"
        " where l.tenant_id = %s and not l.retired and btrim(l.title) <> '' and not exists (select 1 from objective_statement o"
        " join framework_statement g on g.tenant_id = o.tenant_id and g.framework_code = o.framework_code and g.code = o.statement_code"
        " and g.kind = 'group' where o.tenant_id = l.tenant_id and o.lo_code = l.code and o.framework_code = %s) order by l.code",
        (t, chain_draft.PROFILE_CODE),
    ).fetchall()
    out = []
    for r in rows:
        mine = [g for g in groups if g["cap"] in spine.get(r["code"], [])] or groups
        fallback = default.get(r["subject_code"]) or default.get("_")
        out.append({
            "skill": "capability-link", "about": r["code"], "fallback": fallback,
            "inputs": {"grade": r["band"], "subject": r["subject"], "unit": r["unit"], "objective": r["title"],
                       "kind": r["kind"] if r["kind"] in ("academic", "character") else "academic", "domain_default": fallback},
            "options": [{k: g[k] for k in ("code", "name", "what")} for g in mine],
        })  # fmt: skip
    return out


def skill_lo_jobs(conn: db.Conn, t: db.Id) -> list[Job]:
    """Stay in the subject (skill-link standard 4): the shortlist is the objectives of the skill's own subject (its topic's),
    and its subject is the skill's, not the nearest objective's (17 Nov: a maths skill was asked as "Science" because the
    top of its list was a science objective). A skill whose subject has no objective in its grade keeps the whole grade."""
    size = int(settings.config(conn, "lo.shortlist_size", 12))
    out = []
    for s in conn.execute(
        "select s.code, s.name, s.grade, s.learning_objective, s.registry_codes, tp.subject_code from skill s"
        " left join topic tp on tp.tenant_id = s.tenant_id and tp.code = s.topic_code"
        " where s.tenant_id = %s and s.lo_code is null order by s.code", (t,)).fetchall():  # fmt: skip
        said = lo_match.words(f"{s['name']} {s['learning_objective']}")
        near = conn.execute(
            "select l.code, l.title, l.subject, l.subject_code, l.unit, (x.lo_code is not null) as linked from learning_objective l"
            " left join learning_objective_skill x on x.tenant_id = l.tenant_id and x.lo_code = l.code and x.skill_code = any(%s)"
            " where l.tenant_id = %s and l.band = %s and not l.retired and btrim(l.title) <> ''",
            (s["registry_codes"] or [], t, s["grade"]),
        ).fetchall()
        near = [r for r in near if r["subject_code"] == s["subject_code"]] or near
        ranked = sorted(
            near, key=lambda r: (not r["linked"], -len(said & lo_match.words(r["title"])), r["code"])
        )[:size]
        if ranked:
            mine = {"subject_code": s["subject_code"]} if s["subject_code"] else {}
            out.append({
                "skill": "skill-link", "about": s["code"], "fallback": ranked[0]["code"],
                "inputs": {"grade": s["grade"], "subject": ranked[0]["subject"], "unit": ranked[0]["unit"],
                           "objective": f"{s['name']}: {s['learning_objective']}", **mine},
                "options": [{"code": r["code"], "name": r["title"], "what": r["unit"],
                             **({"subject_code": r["subject_code"]} if r["subject_code"] else {})} for r in ranked],
            })  # fmt: skip
    return out


def _slug(name: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-")[:24]


def topic_jobs(conn: db.Conn, t: db.Id) -> tuple[list[Job], list[dict[str, Any]]]:
    """(the units to ask about, the rows code folds itself: a unit whose name is a topic's)."""
    folded = {(r["subject_code"], r["unit"].lower().strip()): r["code"] for r in conn.execute(
        "select code, subject_code, name as unit from topic where tenant_id = %s", (t,))}  # fmt: skip
    topics: dict[str, list[dict[str, str]]] = {}
    for r in conn.execute(
        "select code, name, subject_code from topic where tenant_id = %s order by ord", (t,)
    ):
        topics.setdefault(r["subject_code"], []).append({"code": r["code"], "name": r["name"]})
    jobs, rows = [], []
    for u in conn.execute(
        "select subject_code, unit, array_agg(distinct band) as bands, (array_agg(title order by code))[1:15] as titles"
        " from learning_objective where tenant_id = %s and not retired and topic_code is null and kind = 'academic'"
        " and subject_code is not null and btrim(unit) <> '' group by subject_code, unit order by subject_code, unit", (t,)).fetchall():  # fmt: skip
        sub, unit = u["subject_code"], u["unit"]
        if (sub, unit.lower().strip()) in folded:
            rows.append(
                {
                    "subject_code": sub,
                    "unit": unit,
                    "topic_code": folded[(sub, unit.lower().strip())],
                    "confidence": "high",
                }
            )
            continue
        jobs.append({
            "skill": "topic", "about": f"{sub}:{unit}", "fallback": None,
            "inputs": {"subject": sub, "grade": ", ".join(sorted(u["bands"])), "lo_texts": [unit, *u["titles"]],
                       "existing_topics": topics.get(sub, [])},
            "options": [], "subject_code": sub, "unit": unit,
        })  # fmt: skip
    return jobs, rows


def plan(conn: db.Conn, t: db.Id, kind: str) -> tuple[list[Job], list[dict[str, Any]]]:
    if kind == "capability":
        return capability_jobs(conn, t), []
    if kind == "skill_lo":
        return skill_lo_jobs(conn, t), []
    return topic_jobs(conn, t)


def _answer(kind: str, j: Job, ask: machines.Ask) -> dict[str, Any]:
    """One job's row in the seed files' form. A refused answer is the job's code fallback, marked low: never empty."""
    skill = skill_spec.read(settings.SEED / "skills" / j["skill"])
    if skill["mode"] == "choose":
        got = machines.choose(skill, j["inputs"], j["options"], ask, about=j["about"])
        ok = got.output is not None and not got.faults and got.output["choice"]
        pick = got.output["choice"][0] if ok and got.output else j["fallback"]
        why = (
            (got.output or {}).get("reason", "")
            if ok
            else f"the answer was refused ({'; '.join(got.faults)}): the default"
        )
        conf = (got.output or {}).get("confidence", "low") if ok else "low"
        if kind == "capability":
            return {"lo_code": j["about"], "group": pick, "confidence": conf, "reason": why}
        return {"skill_code": j["about"], "lo_code": pick, "confidence": conf, "reason": why}
    got = machines.write(skill, j["inputs"], ask, about=j["about"])
    o = got.output or {}
    if got.status == "ok" and got.output is not None:
        row = {"subject_code": j["subject_code"], "unit": j["unit"], "confidence": o["confidence"]}
        known = {x["code"] for x in j["inputs"]["existing_topics"]}
        if o.get("reuse") in known:
            row["topic_code"] = o["reuse"]
        else:
            row["new_topic"] = {
                "code": f"{j['subject_code']}.{_slug(o['topic'])}",
                "name": o["topic"].strip(),
            }
        return row
    name = j["unit"].strip()  # a topic the machine would not make: the unit's own name, low confidence
    return {"subject_code": j["subject_code"], "unit": j["unit"], "confidence": "low",
            "new_topic": {"code": f"{j['subject_code']}.{_slug(name)}", "name": name}}  # fmt: skip


def run(conn: db.Conn, t: db.Id, kind: str, jobs: list[Job], ask: machines.Ask) -> list[dict[str, Any]]:
    """The rows in the seed files' form, one a job, in the jobs' order. The jobs' calls go out together (skills/pool.py)."""
    return pool.values(pool.settle(lambda j: _answer(kind, j, ask), jobs, pool.workers(conn)))


def disagreements(kind: str, jobs: list[Job], answers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Where the machine's answer is the one a person should look at first (the coordinators' weekly check starts here): the
    skill said it was unsure, its answer was refused and code's default stands, or it proposed a new topic where the
    subject already has topics. `answers` are the rows `run` returned, one a job in order."""
    out: list[dict[str, Any]] = []
    for j, a in zip(jobs, answers, strict=True):
        why: list[str] = []
        if a.get("confidence") == "low":
            why.append("the skill was unsure")
        if str(a.get("reason", "")).startswith("the answer was refused"):
            why.append("the answer was refused: code's default stands")
        if kind == "topic" and a.get("new_topic") and j["inputs"]["existing_topics"]:
            why.append(f"a new topic where the subject has {len(j['inputs']['existing_topics'])}")
        if why:
            out.append(
                {
                    "about": j["about"],
                    "answer": a.get("group") or a.get("lo_code") or a.get("new_topic") or a.get("topic_code"),
                    "why": why,
                }
            )
    return out
