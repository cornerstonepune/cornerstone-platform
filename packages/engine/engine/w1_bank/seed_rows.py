"""CP-54: the curriculum data files in `supabase/seed/curriculum/`, read and checked by code before anything is applied.

A file is made by a Claude session or by the engine's skills; it is never trusted. Every row is checked here by the same
code rules the skills run (`skills/rules`: the learning-objective skill for an objective's wording), and a row that breaks
a rule is rejected with its reason and never applied. A row is rejected only for breaking a rule: a low `confidence` is
information for the coordinators (who look at it first), not a fault. Files:

  lo_rewrites/<BAND>.json        rows {lo_code, action keep|rewrite|fold_into_unit, new_title, signal, sources, confidence}
  activities/<GRADE>.json        rows {ref, name, subject_code, unit, format, steps, materials, lo_codes, levels | look_fors,
                                 basis, source, confidence}, and `new_los` {ref, title, subject_code, unit, signal, sources,
                                 confidence}, which a row names in `lo_codes` by its ref (or "new:<ref>"); `new_los` may
                                 also sit in lo_rewrites/<BAND>.json
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
BASES = ("educator_plan", "syllabus", "inferred")  # what an activity was made from
Row = dict[str, Any]


@dataclass
class Checked:
    """What a file's rows came to: those that may be applied, each refused with why, and what only deserves a look."""

    accepted: list[Row] = field(default_factory=list)
    rejected: list[tuple[Row, list[str]]] = field(default_factory=list)
    warnings: list[tuple[Row, str]] = field(default_factory=list)

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


TWO = "two actions:"  # the rule's message for "reads and writes": the reviewer's rule e warns on it, it does not refuse


def two_actions(text: str, verbs: list[str]) -> bool:
    """A statement that joins two of the school's seen verbs with "and" (reads and writes): two objectives, not one."""
    v = "|".join(re.escape(x) for x in verbs)
    return bool(re.search(rf"(?<![a-z])(?:{v}) and (?:{v})(?![a-z])", text.lower()))


def lo_rewrites(conn: db.Conn, tenant: db.Id) -> Checked:
    done, los, stmts, skill = Checked(), known_codes(conn, tenant), statements(conn, tenant), lo_skill()
    seen: set[str] = set()
    for path in files("lo_rewrites"):
        for row in read(path).get("rows", []):
            code, faults = row.get("lo_code"), []
            if row.get("action") not in ACTIONS:
                faults.append(f"rule 0: action {row.get('action')!r} is not one of {ACTIONS}")
            elif row.get("confidence", "medium") not in CONFIDENCE:
                faults.append(f"rule 0: confidence {row.get('confidence')!r} is not one of {CONFIDENCE}")
            elif code in seen:
                faults.append("rule 0: the objective is in the files twice")
            elif code not in los:
                faults.append(f"rule 0: {code} is not an objective of the school")
            elif row["action"] == "keep" and not (los[code]["title"] or "").strip().startswith("The child "):
                faults.append(
                    'rule d: a keep whose wording does not start "The child" is not a keep: rewrite it or fold it'
                )
            elif row["action"] == "rewrite":
                faults = rewrite_faults(row, los.get(code), los, stmts, skill)
                two = any(f.startswith(TWO) for f in faults)
                if two or (not faults and two_actions(row["new_title"], skill["lists"]["verbs"])):
                    done.warnings.append(
                        (row, "rule e: two actions joined by 'and': split into two objectives")
                    )
                faults = [f for f in faults if not f.startswith(TWO)]
            seen.add(code)
            done.take(row, faults)
    return done


def new_los(conn: db.Conn, tenant: db.Id) -> tuple[dict[str, dict[str, str]], list[Row], Checked]:
    """Every objective the files create, from lo_rewrites and activities alike: ({grade: {ref: code}}, the accepted ones with
    their codes, what was refused). A band's codes run on in file order, lo_rewrites first: LO-<band>-N001, N002…; a ref
    in both files is one objective."""
    done, accepted, refs = Checked(), [], {}
    subjects = {r["code"] for r in conn.execute("select code from subject where tenant_id = %s", (tenant,))}
    skill = lo_skill()
    for grade in sorted({p.stem for k in ("lo_rewrites", "activities") for p in files(k)}):
        mine: dict[str, str] = {}
        for kind in ("lo_rewrites", "activities"):
            for lo in read(ROOT / kind / f"{grade}.json").get("new_los", []):
                if lo["ref"] in mine:
                    continue
                code = f"LO-{grade}-N{len(mine) + 1:03d}"
                mine[lo["ref"]] = code
                faults = rules.check(
                    skill,
                    {"grade": grade, "subject": lo.get("subject_code", ""), "topic": lo.get("unit", ""), "text": lo["title"], "rewrite": False,
                     "siblings": [], "sibling_codes": [], "statements": []},
                    {"text": lo["title"], "signal": lo.get("signal", "Foundational"), "source": "school-syllabus", "source_text": ""},
                ) + words_faults(lo["title"])  # fmt: skip
                if lo.get("subject_code") not in subjects:
                    faults.append(
                        f"rule 0: subject_code {lo.get('subject_code')!r} is not a subject of the school"
                    )
                if faults:
                    done.rejected.append(({**lo, "grade": grade}, faults))
                else:
                    accepted.append({**lo, "code": code, "band": grade})
        refs[grade] = mine
    return refs, accepted, done


def opening(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split()[:6])


def look_for_faults(look: Any, lists: dict[str, Any]) -> list[str]:
    if (
        not isinstance(look, list)
        or len(look) != 3
        or not all(isinstance(x, str) and x.strip() for x in look)
    ):
        return ["rule 0: look_fors are exactly three short sentences"]
    text = " ".join(look)
    out = [
        f"rule 0: a look-for says a feeling ({w!r}): say what is seen or heard"
        for w in rules.banned(text, lists["feelings"])
    ]
    out += [f"rule 0: a look-for has {p!r}" for p in lists["phrases"] if p in text.lower()]
    names = [
        w
        for item in look
        for w in re.findall(r"(?<=[a-z,;] )[A-Z][a-z]+", item)
        if w not in lists["allowed_caps"]
    ]
    return out + [f"rule 0: a look-for has {n!r}: no child's name" for n in names]


def level_faults(row: Row, lists: dict[str, Any]) -> list[str]:
    """The four levels (each said, four different, none starting "The child"), or, for a character activity, three look-fors."""
    lv, look = row.get("levels"), row.get("look_fors")
    if lv is None or lv == {}:
        return look_for_faults(look, lists)  # three things to look for and no levels (ADR 0037)
    if look:
        return ["rule 0: an activity has levels or look_fors, not both"]
    if set(lv) != set(LEVELS) or any(not str(lv[k]).strip() for k in LEVELS):
        return ["rule 0: four levels, 0 to 3, each said"]
    out = (
        []
        if len({lv[k].strip().lower() for k in LEVELS}) == 4
        else ["rule 0: four levels, four different descriptions"]
    )
    return out + [
        f"rule a: level {k} starts 'The child': say what is seen in the work"
        for k in LEVELS
        if lv[k].strip().startswith("The child")
    ]


def source_faults(src: Row) -> list[str]:
    """The activity cites where it came from: the sheet or document and tab, and the cell, section or bullet that names it."""
    if not ((src.get("sheet") or src.get("doc")) and src.get("tab")):
        return ["rule 0: an activity cites its sheet or document and its tab"]
    if not (src.get("cell") or src.get("section") or src.get("bullet")):
        return ["rule f: an activity cites the cell, or the section or bullet, that names it"]
    return []


def activity_faults(
    row: Row, subjects: set[str], formats: list[str], known: set[str], lists: dict[str, Any]
) -> list[str]:
    out: list[str] = []
    if not (row.get("name") or "").strip():
        out.append("rule 0: an activity has a name")
    if row.get("subject_code") not in subjects:
        out.append(f"rule 0: subject_code {row.get('subject_code')!r} is not a subject of the school")
    if row.get("format") not in formats:
        out.append(f"rule 0: format {row.get('format')!r} is not one of {formats}")
    if len(row.get("steps") or []) < 3:
        out.append("rule c: an activity has at least three steps an educator could run tomorrow")
    if row.get("basis") not in (None, *BASES):
        out.append(f"rule 0: basis {row.get('basis')!r} is not one of {BASES}")
    links = row.get("lo_codes") or []
    if not links or len(links) > 3:
        out.append("rule 0: an activity names one to three learning objectives")
    out += [f"rule 0: names {c}, which is not an objective" for c in links if c not in known]
    said = [
        row.get("name", ""),
        " ".join(row.get("steps", [])),
        json.dumps(row.get("levels"), ensure_ascii=False),
        " ".join(row.get("look_fors") or []),
    ]
    return out + level_faults(row, lists) + source_faults(row.get("source") or {}) + words_faults(*said)


def crowded(rows: list[Row], most: int = 3) -> dict[str, list[str]]:
    """{ref: faults} for the activities of one band whose level opens, in its first six words, as more than `most` earlier
    activities' did (a template: the reviewer's rule b)."""
    seen: dict[tuple[str, str], int] = {}
    out: dict[str, list[str]] = {}
    for r in rows:
        for k, text in sorted((r.get("levels") or {}).items()):
            key = (k, opening(str(text)))
            seen[key] = seen.get(key, 0) + 1
            if seen[key] > most:
                out.setdefault(r["ref"], []).append(
                    f"rule b: level {k} opens '{key[1]}' as {most} earlier activities' did"
                )
    return out


def activities(conn: db.Conn, tenant: db.Id, formats: list[str]) -> tuple[Checked, list[Row], Checked]:
    """(the checked activity rows with their new objectives resolved, the new objectives the files add, those objectives'
    own check)."""
    refs, made, new_done = new_los(conn, tenant)
    done, los = Checked(), known_codes(conn, tenant)
    subjects = {r["code"] for r in conn.execute("select code from subject where tenant_id = %s", (tenant,))}
    lists = settings.config(conn, "curriculum.look_fors") or {
        "feelings": [],
        "phrases": [],
        "allowed_caps": [],
    }
    ok_new = {n["code"] for n in made}
    known = set(los) | ok_new
    for path in files("activities"):
        data = read(path)
        grade = data.get("grade", path.stem)
        mine = refs.get(grade, {})
        rows = []
        for row in data.get("rows", []):
            codes = [mine.get(c[4:] if c.startswith("new:") else c, c) for c in row.get("lo_codes", [])]
            rows.append(
                {
                    **row,
                    "lo_codes": codes,
                    "grade": grade,
                    "code": f"ACT-{grade}-{re.sub(r'^.*-', '', row['ref'])}",
                }
            )
        template = crowded(rows)
        for row in rows:
            done.take(
                row, activity_faults(row, subjects, formats, known, lists) + template.get(row["ref"], [])
            )
    return done, made, new_done
