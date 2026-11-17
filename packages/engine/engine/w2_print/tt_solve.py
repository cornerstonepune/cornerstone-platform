"""CP-75: "Fill it in for me" (specs/CP-75/spec.md; design E4, F7, F8). `solve` places the lessons a class still needs under the rules and
shows the answer; it writes nothing to the timetable. `use` is the coordinator accepting an answer: one change to the pattern, with its
inverse (the Undo).

Code works out what is needed and what is kept (`tt_solve_model`), the solver only places (`adapters/cpsat.py`), and code has the last
word: every answer goes back through the page's own checker (`tt_check`) before anyone sees it, and one that breaks a Must rule is thrown
away and kept as a failed run. When nothing fits, arithmetic names the rule first; otherwise the solver runs once more with every editable
rule allowed to bend at a high cost, and the fewest rules that had to give are said in words. Every run is one `timetable_run` row per
class (append-only), used or not. No model anywhere."""

import datetime as dt
import hashlib
import json
from typing import Any

from engine.adapters import cpsat
from engine.core import db, settings
from engine.w2_print import tt_check as chk
from engine.w2_print import tt_check_load, tt_pattern
from engine.w2_print import tt_solve_answer as read
from engine.w2_print import tt_solve_model as model
from engine.w2_print.tt_generate import SEED, SOLVE_SECONDS, _setting
from engine.w2_print.tt_rules import Refused

SPECIALISTS = "timetable.specialists"  # the heads a visiting specialist teaches: a list of head codes
NO_SPECIALISTS = (
    "No specialist subjects are listed yet, so every new lesson is placed as the class's own educator's."
)
MISSING = "Fill it in for me is not available on this machine; you can still place lessons by hand."
FAILED = "The answer broke a rule when it was checked, so it was thrown away. Nothing changed; you can try again or place lessons by hand."


def _year_classes(conn: db.Conn, class_ids: list[str]) -> list[str]:
    """The classes whose patterns are read together: the ones being filled and every other class of their year that has a pattern."""
    rows = conn.execute(
        "select c.id::text as id from school_class c where c.academic_year_id in (select academic_year_id from school_class"
        " where id::text = any(%s)) and (c.id::text = any(%s) or exists (select 1 from timetable_rule r where r.school_class_id = c.id"
        " and r.kind = 'frame')) order by c.grade_code, c.section",
        (class_ids, class_ids),
    ).fetchall()
    if not set(class_ids) <= {r["id"] for r in rows}:
        raise Refused("That class is not there.", 404)
    return [r["id"] for r in rows]


def _sources(conn: db.Conn, class_ids: list[str], on: dt.date) -> dict[chk.Place, str]:
    return {
        (k, c["period_id"], c["week"], c["weekday"]): c["source"]
        for k in class_ids
        for c in tt_pattern.read(conn, k, on)["cells"]
        if c["cell"] != "empty"
    }


def _fortnight(conn: db.Conn, class_id: str, on: dt.date) -> Any:
    row = conn.execute(
        "select f.id from fortnight f join school_class c on c.academic_year_id = f.academic_year_id where c.id::text = %s"
        " order by (f.ends_on >= %s) desc, case when f.ends_on >= %s then f.starts_on end, f.starts_on desc limit 1",
        (class_id, on, on),
    ).fetchone()
    if row is None:
        raise Refused("That class's year has no fortnight yet, so there is nothing to fill.")
    return row["id"]


def _mark(w: chk.World, sources: dict[chk.Place, str]) -> str:
    """The patterns as one short mark: an answer is used only on the pattern it was worked out from."""
    cells = sorted((*p, c["cell"], c["subject_code"] or "", sources.get(p) or "") for p, c in w.cells.items())
    return hashlib.sha256(json.dumps(cells).encode()).hexdigest()


def _specialists(conn: db.Conn, tenant: Any) -> set[str]:
    listed = settings.config(conn, SPECIALISTS, None, tenant)
    return {str(x) for x in listed} if isinstance(listed, list) else set()


def _read(conn: db.Conn, class_ids: list[str], on: dt.date):
    seen = _year_classes(conn, class_ids)
    w = tt_check_load.world(conn, seen, on)
    return w, _sources(conn, seen, on), seen


def solve(
    conn: db.Conn,
    staff: Any,
    class_ids: list[str],
    on: dt.date,
    *,
    today: dt.date,
    seconds: int | None = None,
    place=cpsat.solve,
) -> dict:
    """Place the lessons `class_ids` still need, dated from `on`. Returns the outcome (`placed`, `unmeetable`, `not_found_in_time` or
    `failed`), the answer as cell changes per class, what could not be met in words, and the kept runs' ids. Changes no timetable."""
    if not class_ids:
        raise Refused("Say which class to fill.")
    fill = sorted(set(class_ids))
    tenant = tt_pattern._class(conn, fill[0])["tenant_id"]
    tt_pattern.guard(conn, staff, tenant, today)
    ceiling, seed = _setting(conn, SOLVE_SECONDS), _setting(conn, SEED)
    limit = max(1, min(seconds or ceiling, ceiling))
    w, sources, seen = _read(conn, fill, on)
    specialists = _specialists(conn, tenant)
    built = model.build(w, set(fill), sources, specialists)
    notes = ([] if specialists else [NO_SPECIALISTS]) + chk.unnamed(w)
    out: dict = {
        "outcome": "unmeetable", "from_date": on.isoformat(), "seconds": 0.0, "limit_seconds": limit, "seed": seed, "notes": notes,
        "specialists_listed": bool(specialists), "rules": built.refusals, "classes": [], "problems": [], "proven": False,
    }  # fmt: skip
    kept = {
        "solver": "cpsat",
        "from_date": on.isoformat(),
        "fill": fill,
        "seen": seen,
        "pattern": _mark(w, sources),
        "by": str(staff),
    }
    answer, changes = None, {k: [] for k in fill}
    if not built.refusals:
        try:
            answer = place(built.problem, limit, seed)
        except cpsat.CpsatMissing as gone:
            raise Refused(MISSING, 503) from gone
        out["seconds"], out["proven"] = answer.seconds, answer.proven
    if answer and answer.status == cpsat.PLACED:
        changes = read.edits(w, built, answer, w.labels)
        then = read.after(w, changes)
        wrong = read.faults(w, built, answer, then)
        if wrong:
            out |= {"outcome": "failed", "sentence": FAILED}
            kept |= {"failure": "the answer did not pass the checker", "faults": wrong}
            changes = {k: [] for k in fill}
        else:
            out["outcome"] = "placed"
            out["problems"] = [p for p in chk.check(then) if p["level"] == chk.TRY]
    elif answer and answer.status == cpsat.OUT_OF_TIME:
        out |= {
            "outcome": "not_found_in_time",
            "sentence": f"No timetable was found in {limit} seconds. Try again with longer.",
        }
    elif answer:  # nothing fits: which rules would have to give
        loose = model.build(w, set(fill), sources, specialists, bend=True)
        gave = place(loose.problem, limit, seed)
        out["seconds"] = round(out["seconds"] + gave.seconds, 3)
        out["rules"] = read.bent(w, loose, gave) if gave.status == cpsat.PLACED else []
        if not out["rules"]:
            out["rules"] = [
                {
                    "kind": "rules",
                    "rule": None,
                    "sentence": "The rules cannot all hold together, and no single rule a coordinator can edit explains it.",
                }
            ]
    kept |= {"rules": out["rules"], "notes": notes, "seconds": out["seconds"], "proven": out["proven"]}
    text = cpsat.text(built.problem)
    reply = json.dumps(answer.placed if answer else {}, sort_keys=True)
    for k in fill:
        needed = sum(m["count"] for m in built.groups.values() if m["class"] == k)
        placed = sum(
            len(s)
            for g, s in (answer.placed if answer and out["outcome"] == "placed" else {}).items()
            if built.groups[g]["class"] == k
        )
        run_id = _keep(
            conn,
            w,
            k,
            on,
            out["outcome"],
            needed,
            placed,
            text,
            reply,
            answer.version if answer else None,
            seed,
            limit,
            kept,
            changes[k],
        )
        new = sum(e["op"] == "set" for e in changes[k])
        out["classes"].append(
            {
                "class_id": k,
                "class": w.classes[k],
                "run_id": run_id,
                "needed": needed,
                "placed": placed,
                "edits": changes[k],
                "set": new,
                "cleared": len(changes[k]) - new,
            }
        )
    out["run_ids"] = [c["run_id"] for c in out["classes"]]
    return out


def _keep(conn: db.Conn, w: chk.World, class_id: str, on: dt.date, outcome: str, needed: int, placed: int, text: str, reply: str,
          version: str | None, seed: int, seconds: int, report: dict, draft: list[dict]) -> str:  # fmt: skip
    """One run, kept as it stands (append-only). The table's three outcomes are CP-11's: an answer thrown away by the checker is kept as
    `not_found_in_time` (no usable timetable was found) with `failure` in its report saying why."""
    stored = "not_found_in_time" if outcome == "failed" else outcome
    tenant = tt_pattern._class(conn, class_id)["tenant_id"]
    return str(
        db.one(
            conn,
            "insert into timetable_run (tenant_id, school_class_id, fortnight_id, outcome, needed, placed, input_text, output_text,"
            " fet_version, seed, solve_seconds, report, draft) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            (tenant, class_id, _fortnight(conn, class_id, on), stored, needed, placed, text, reply, version, seed, seconds,
             json.dumps(report), json.dumps(draft)),
        )["id"]
    )  # fmt: skip


def use(conn: db.Conn, staff: Any, run_ids: list[str], *, today: dt.date, reason: str | None = None) -> dict:
    """Accept an answer: its cells are written to the pattern as machine-made, in one transaction, and the inverse comes back (one Undo).
    Refused when the run placed nothing usable, or the timetable or its rules changed since it was worked out."""
    rows = conn.execute(
        "select id::text as id, school_class_id::text as k, outcome, report, draft from timetable_run where id::text = any(%s)",
        (run_ids,),
    ).fetchall()
    if not rows or len(rows) != len(set(run_ids)):
        raise Refused("That answer is not there.", 404)
    first = rows[0]["report"]
    if any(
        r["outcome"] != "placed"
        or r["report"].get("solver") != "cpsat"
        or r["report"].get("pattern") != first.get("pattern")
        for r in rows
    ):
        raise Refused("That answer cannot be used: it did not place every lesson, or it is not one answer.")
    on = dt.date.fromisoformat(first["from_date"])
    w, sources, _ = _read(conn, first["fill"], on)
    changes = {r["k"]: r["draft"] for r in rows}
    stood = {p["key"] for p in chk.blocking(chk.check(w))}
    if _mark(w, sources) != first["pattern"] or any(
        p["key"] not in stood for p in chk.blocking(chk.check(read.after(w, changes)))
    ):
        raise Refused(
            "The timetable or its rules changed since this was worked out. Press Fill it in for me again.",
            409,
        )
    out = []
    with conn.transaction():
        for r in rows:
            inverse = tt_pattern.apply(conn, staff, r["k"], r["draft"], on, today=today, reason=reason)
            out.append({"class_id": r["k"], "run_id": r["id"], "inverse": inverse})
    for c in out:
        c["pattern"] = tt_pattern.read(conn, c["class_id"], on)
    return {"from_date": on.isoformat(), "classes": out}
