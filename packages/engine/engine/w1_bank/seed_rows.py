"""CP-54: the curriculum data files in `supabase/seed/curriculum/`, read and checked by code before anything is applied.

A file is made by a Claude session or by the engine's skills; it is never trusted. Every row is checked here by the same
code rules the skills run (`skills/rules`: the learning-objective skill for an objective's wording), and a row that breaks
a rule is rejected with its reason and never applied. A row is rejected only for breaking a rule: a low `confidence` is
information for the coordinators (who look at it first), not a fault. Files:

  lo_rewrites/<BAND>.json        rows {lo_code, action keep|rewrite|fold_into_unit, new_title, signal, sources, confidence}
  activities/<GRADE>.json        rows {ref, name, subject_code, unit, format, steps, materials, lo_codes, levels, source,
                                 confidence}, and `new_los` {ref, title, subject_code, unit, signal, sources, confidence}
                                 that the rows name in `lo_codes` as "new:<ref>"
  capability_choices.json        rows {lo_code, group, confidence, reason}      group: a profile group's code
  engine_skill_lo.json           rows {skill_code, lo_code, confidence, reason}
  unit_topics.json               rows {subject_code, unit, topic_code | new_topic {code, name}, confidence}
  k2_label_placement.json        rows {label, decision, target, reason, evidence, confidence}  (read by a person)
  reviews/<BAND>.json            rows {lo_code, verdict ok|fix, better_title, note}  a second reader's verdicts
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from engine.core import db, school_words, settings, skill_spec
from engine.skills import rules

ROOT = settings.SEED / "curriculum"
ACTIONS = ("keep", "rewrite", "fold_into_unit")
CONFIDENCE = ("high", "medium", "low")
LEVELS = ("0", "1", "2", "3")
Row = dict[str, Any]


@dataclass
class Checked:
    """What a file's rows came to: those that may be applied, and each refused with why."""

    accepted: list[Row] = field(default_factory=list)
    rejected: list[tuple[Row, list[str]]] = field(default_factory=list)

    def take(self, row: Row, faults: list[str]) -> None:
        if faults:
            self.rejected.append((row, faults))
        else:
            self.accepted.append(row)


def read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text()) if path.exists() else {}


def files(kind: str) -> list[Path]:
    """The files of one folder of the seed (`lo_rewrites`), in name order."""
    return sorted((ROOT / kind).glob("*.json")) if (ROOT / kind).exists() else []


def words_faults(*texts: str) -> list[str]:
    return [f"uses {w!r}, a word the school does not use" for t in texts for w in school_words.found(t)]


def lo_skill() -> dict[str, Any]:
    return skill_spec.read(settings.SEED / "skills" / "learning-objective")


def known_codes(conn: db.Conn, tenant: db.Id) -> dict[str, Row]:
    return {
        r["code"]: r
        for r in conn.execute(
            "select code, band, subject, unit, title, signal, source, source_text, retired, kind, subject_code"
            " from learning_objective where tenant_id = %s",
            (tenant,),
        ).fetchall()
    }


def statements(conn: db.Conn, tenant: db.Id) -> set[tuple[str, str]]:
    return {
        (r["framework_code"], r["code"])
        for r in conn.execute(
            "select framework_code, code from framework_statement where tenant_id = %s", (tenant,)
        )
    }


def rewrite_faults(
    row: Row, lo: Row | None, los: dict[str, Row], stmts: set[tuple[str, str]], skill: dict[str, Any]
) -> list[str]:
    """Why a `rewrite` row may not be applied: the learning-objective skill's code rules over it, its sources, its fields."""
    if lo is None:
        return [f"{row.get('lo_code')} is not an objective of the school"]
    new = (row.get("new_title") or "").strip()
    if not new:
        return ["a rewrite has no new_title"]
    original = lo["source_text"] or lo["title"]
    cited = [s for s in row.get("sources", []) if s != f"lo:{row['lo_code']}"]
    bad = [
        s for s in cited if (s[3:] not in los if s.startswith("lo:") else tuple(s.split(":", 1)) not in stmts)
    ]
    if bad:
        return [f"cites {', '.join(bad)}, which does not exist"]
    fw = [tuple(s.split(":", 1)) for s in cited if not s.startswith("lo:")]
    sibs = [s[3:] for s in cited if s.startswith("lo:")]
    inputs = {
        "grade": lo["band"], "subject": lo["subject"], "topic": lo["unit"], "text": original, "rewrite": True,
        "siblings": [x["title"] for c, x in los.items() if x["unit"] == lo["unit"] and x["band"] == lo["band"] and c != lo["code"]],
        "sibling_codes": sibs, "statements": [{"code": c, "framework": f, "text": ""} for f, c in fw],
    }  # fmt: skip
    source = fw[0][1] if fw else (f"sibling:{sibs[0]}" if sibs else "school-syllabus")
    out = {
        "text": new,
        "signal": row.get("signal") or lo["signal"],
        "source": source,
        "source_text": original,
    }
    return rules.check(skill, inputs, out) + words_faults(new)


def lo_rewrites(conn: db.Conn, tenant: db.Id) -> Checked:
    done, los, stmts, skill = Checked(), known_codes(conn, tenant), statements(conn, tenant), lo_skill()
    seen: set[str] = set()
    for path in files("lo_rewrites"):
        for row in read(path).get("rows", []):
            code, faults = row.get("lo_code"), []
            if row.get("action") not in ACTIONS:
                faults.append(f"action {row.get('action')!r} is not one of {ACTIONS}")
            elif row.get("confidence", "medium") not in CONFIDENCE:
                faults.append(f"confidence {row.get('confidence')!r} is not one of {CONFIDENCE}")
            elif code in seen:
                faults.append("the objective is in the files twice")
            elif row["action"] == "rewrite":
                faults = rewrite_faults(row, los.get(code), los, stmts, skill)
            elif code not in los:
                faults.append(f"{code} is not an objective of the school")
            seen.add(code)
            done.take(row, faults)
    return done


def activity_faults(
    row: Row, own: set[str], subjects: set[str], formats: list[str], known: set[str]
) -> list[str]:
    out: list[str] = []
    if not (row.get("name") or "").strip():
        out.append("an activity has a name")
    if row.get("subject_code") not in subjects:
        out.append(f"subject_code {row.get('subject_code')!r} is not a subject of the school")
    if row.get("format") not in formats:
        out.append(f"format {row.get('format')!r} is not one of {formats}")
    if not row.get("steps"):
        out.append("an activity has its steps")
    lv = row.get("levels") or {}
    if set(lv) != set(LEVELS) or any(not str(lv[k]).strip() for k in LEVELS):
        out.append("four levels, 0 to 3, each said")
    elif len({lv[k].strip().lower() for k in LEVELS}) < 4:
        out.append("four levels, four different descriptions")
    links = row.get("lo_codes") or []
    if not links or len(links) > 3:
        out.append("an activity names one to three learning objectives")
    out += [f"names {c}, which is not an objective" for c in links if c not in known and c not in own]
    src = row.get("source") or {}
    if not (src.get("sheet") and src.get("tab") and src.get("cell")):
        out.append("an activity cites its sheet, tab and cell")
    return out + words_faults(
        row.get("name", ""), " ".join(row.get("steps", [])), json.dumps(lv, ensure_ascii=False)
    )


def activities(conn: db.Conn, tenant: db.Id, formats: list[str]) -> tuple[Checked, list[Row]]:
    """(each activity row with its `new_los` resolved, the new objectives the files add); both checked."""
    done, new_los, los = Checked(), [], known_codes(conn, tenant)
    subjects = {r["code"] for r in conn.execute("select code from subject where tenant_id = %s", (tenant,))}
    skill = lo_skill()
    for path in files("activities"):
        data = read(path)
        grade = data.get("grade", path.stem)
        refs: dict[str, str] = {}
        for n, lo in enumerate(data.get("new_los", []), 1):
            refs[lo["ref"]] = f"LO-{grade}-N{n:03d}"
            faults = rules.check(
                skill,
                {"grade": grade, "subject": lo["subject_code"], "topic": lo.get("unit", ""), "text": lo["title"], "rewrite": False,
                 "siblings": [], "sibling_codes": [], "statements": []},
                {"text": lo["title"], "signal": lo.get("signal", "Foundational"), "source": "school-syllabus", "source_text": ""},
            ) + words_faults(lo["title"])  # fmt: skip
            if lo.get("subject_code") not in subjects:
                faults.append(f"subject_code {lo.get('subject_code')!r} is not a subject of the school")
            if not faults:
                new_los.append({**lo, "code": refs[lo["ref"]], "band": grade})
            else:
                done.rejected.append((lo, faults))
                refs.pop(lo["ref"])
        for row in data.get("rows", []):
            codes = [refs.get(c[4:], c) if c.startswith("new:") else c for c in row.get("lo_codes", [])]
            row = {
                **row,
                "lo_codes": codes,
                "grade": grade,
                "code": f"ACT-{grade}-{re.sub(r'^.*-', '', row['ref'])}",
            }
            done.take(row, activity_faults(row, set(refs.values()), subjects, formats, set(los)))
    return done, new_los
