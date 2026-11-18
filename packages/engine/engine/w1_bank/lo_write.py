"""CP-54: the learning-objective skill rewrites a grade's lines that are not yet objectives (a purpose, a topic, a list),
on the server, as the machine's work (ADR 0102).

jobs      every live row of the grade whose title does not begin "The child", that no person has edited: one write job a
          row, or one a part where code splits a list-type line (`lo_source.part_inputs`). The inputs are those the
          seed's reviewed rewrites were checked with (`seed_rows.rewrite_faults`): grade, subject, unit as topic, the
          line, rewrite, the unit's siblings.
forecast  what the run costs, by code, before any call: each job a writer call and a validator call at the prices the
          spend ceiling uses (`spend.price`), plus the tokens the `nearest` list adds to the validator's input, and a
          retry one job in five; the worst case is every job retried.
run       the jobs in order, one at a time: each reply's checkers are shown the grade's objectives nearest to it, and
          each objective written joins that list before the next job, so two new objectives cannot repeat each other
          unseen. A job whose last refusal names a repeat ends as "a repeat of <code>", with no row.
apply     the written ones as the machine's: the first part rewrites the row in place (the school's line kept in
          `source_text`), each further part is a new objective of the same unit. One `flow_run` row of
          `curriculum.apply-seed` holds what was replaced, so `engine curriculum revert-seed <run>` undoes the run whole.
"""

import re
from dataclasses import dataclass, field
from typing import Any

from psycopg.types.json import Jsonb

from engine.core import db, history, settings
from engine.skills import lo_source, machines, spend
from engine.w1_bank import apply_seed, new_lo_ledger, seed_rows
from engine.w1_bank.seed_activity import by_a_person

OBJECTIVE = "The child"  # what every objective begins with (standard 1); a line that does not is not one yet
RETRY_SHARE = 0.2  # the share of jobs forecast to need their one retry, as `cli_chain._cost` forecasts
Job = dict[str, Any]


def rows(conn: db.Conn, t: db.Id, grade: str) -> list[dict[str, Any]]:
    """The grade's live rows that are not yet objectives and that no person has made or edited, in code order."""
    got = conn.execute(
        "select code, band, subject, subject_code, unit, title, signal, kind, confidence from learning_objective"
        " where tenant_id = %s and band = %s and not retired and source <> 'person' and btrim(title) <> ''"
        " and title not like %s order by code",
        (t, grade, OBJECTIVE + "%"),
    ).fetchall()
    return [r for r in got if not by_a_person(conn, t, "learning_objective", r["code"])]


def grades(conn: db.Conn, t: db.Id) -> list[str]:
    """The grades that have a live row not yet an objective, in the school's order."""
    return [
        r["band"]
        for r in conn.execute(
            "select l.band from learning_objective l join grade g on g.tenant_id = l.tenant_id and g.code = l.band"
            " where l.tenant_id = %s and not l.retired and l.source <> 'person' and btrim(l.title) <> ''"
            " and l.title not like %s group by l.band, g.ord order by g.ord",
            (t, OBJECTIVE + "%"),
        ).fetchall()
    ]


def pool(conn: db.Conn, t: db.Id, grade: str) -> list[dict[str, str]]:
    """The grade's objectives ({code, text}): what a new one is compared with."""
    return [
        {"code": r["code"], "text": r["title"]}
        for r in conn.execute(
            "select code, title from learning_objective where tenant_id = %s and band = %s and not retired"
            " and title like %s order by code",
            (t, grade, OBJECTIVE + "%"),
        ).fetchall()
    ]


def _inputs(r: dict[str, Any], siblings: list[str]) -> dict[str, Any]:
    out = {"grade": r["band"], "subject": r["subject"], "topic": r["unit"], "text": r["title"], "rewrite": True,
           "siblings": siblings}  # fmt: skip
    if r["kind"] in ("academic", "character"):  # the contract's two; a routine line is written without one
        out["kind"] = r["kind"]
    return out


def jobs(conn: db.Conn, t: db.Id, grade: str, lists: dict[str, Any]) -> list[Job]:
    """One job a row, or one a part of a list-type row. `key` is the job's own name in the pool (the row's code, and
    `<code>#<n>` for its further parts), so a job is never its own neighbour."""
    todo = rows(conn, t, grade)
    by_unit: dict[str, list[str]] = {}
    for r in conn.execute(
        "select unit, title from learning_objective where tenant_id = %s and band = %s and not retired order by code",
        (t, grade),
    ).fetchall():
        by_unit.setdefault(r["unit"], []).append(r["title"])
    out: list[Job] = []
    for r in todo:
        sibs = [s for s in by_unit.get(r["unit"], []) if s != r["title"]]
        for n, inputs in enumerate(lo_source.part_inputs(_inputs(r, sibs), lists)):
            out.append(
                {"row": r, "part": n, "key": r["code"] if n == 0 else f"{r['code']}#{n}", "inputs": inputs}
            )
    return out


@dataclass
class Forecast:
    jobs: int
    rows: int
    calls: float
    inr: float
    worst_inr: float
    nearest_inr: float  # what the `nearest` lists add, inside `inr`


def forecast(
    conn: db.Conn, skill: dict[str, Any], todo: list[Job], pools: dict[str, list[dict[str, str]]]
) -> Forecast:
    """The run's cost by code, no call. A writer and a validator call a job at `spend.price` (the measured rupees a call
    where the setting has them, else a count of tokens), the validator's input longer by the `nearest` list code would
    show it for the school's line (the list for the reply is the same size), and one job in five retried."""
    lists = skill["lists"]
    p = (settings.config(conn, "llm.prices") or {}).get(skill["validator_model"], {"in": 0, "out": 0})
    write, check = spend.price(conn, skill, False), spend.price(conn, skill, True)
    near = 0.0
    for j in todo:
        shown = lo_source.nearest(
            j["inputs"].get("part") or j["inputs"]["text"], pools.get(j["row"]["band"], []), lists
        )
        near += len(str(shown)) / 3.5 * p["in"] / 1_000_000 if shown else 0.0
    once = len(todo) * (write + check) + near
    return Forecast(
        jobs=len(todo),
        rows=len({j["row"]["code"] for j in todo}),
        calls=len(todo) * 2 * (1 + RETRY_SHARE),
        inr=once * (1 + RETRY_SHARE),
        worst_inr=once * 2,
        nearest_inr=near * (1 + RETRY_SHARE),
    )


REPEAT = re.compile(r"\brepeat", re.I)
CODE = re.compile(r"\bLO-[A-Z0-9]+-[A-Z0-9]+")


def repeat_of(faults: list[str]) -> str | None:
    """The code a refusal names as repeated: code's own rule ("a repeat of LO-…") or the validator's (standard 6)."""
    for f in faults:
        if REPEAT.search(f) and (m := CODE.search(f)):
            return m.group(0)
    return None


def cause(faults: list[str]) -> str:
    """What a refusal was for, in a word a report can group by: the validator's rule, or code's first words."""
    head = faults[0].split(":", 1)[0].strip() if faults else "none"
    return head if len(head) <= 24 else head[:24]


@dataclass
class Done:
    written: list[tuple[Job, dict[str, Any]]] = field(default_factory=list)
    repeats: list[tuple[Job, str]] = field(default_factory=list)
    refused: list[tuple[Job, list[str]]] = field(default_factory=list)
    stopped: str = ""  # why the run stopped early (the spend ceiling), else empty


def run(skill: dict[str, Any], todo: list[Job], pools: dict[str, list[dict[str, str]]], ask: machines.Ask,
        after: Any = None) -> Done:  # fmt: skip
    """The jobs in order. Each written objective joins its grade's pool (a copy) before the next job. `after(job)` runs
    after each job (the command commits what it spent)."""
    lists, done = skill["lists"], Done()
    near = {g: list(p) for g, p in pools.items()}
    for j in todo:

        def seen(reply: dict[str, Any], j: Job = j) -> dict[str, Any]:
            return lo_source.shown(j["inputs"], reply["text"], lists, j["key"], near[j["row"]["band"]])

        try:
            got = machines.write(skill, j["inputs"], ask, about=j["key"], seen=seen)
        except spend.SpendStop as e:
            done.stopped = str(e)
            break
        if got.status == "ok" and got.output:
            done.written.append((j, got.output))
            near[j["row"]["band"]].append({"code": j["key"], "text": got.output["text"]})
        elif (code := repeat_of(got.faults)) is not None:
            done.repeats.append((j, code))
        else:
            done.refused.append((j, got.faults))
        if after:
            after(j)
    return done


def _next_code(conn: db.Conn, t: db.Id, grade: str, taken: int) -> str:
    """A new objective's code, `LO-<grade>-N###`, past every number the ledger or the database has used."""
    ledger = new_lo_ledger.load(seed_rows.ROOT)
    high = int(ledger.get("highest", {}).get(grade, 0))
    row = conn.execute(
        "select max((regexp_match(code, '^LO-[^-]+-N([0-9]+)$'))[1]::int) as n from learning_objective"
        " where tenant_id = %s and band = %s",
        (t, grade),
    ).fetchone()
    return f"LO-{grade}-N{max(high, int((row or {}).get('n') or 0)) + 1 + taken:03d}"


def apply(conn: db.Conn, t: db.Id, done: Done, by: str) -> tuple[apply_seed.Report, Any]:
    """The written objectives as the machine's, one run `revert-seed` undoes whole. A row a person edited since the jobs
    were built is skipped (`apply_seed._rewrite`)."""
    history.by(conn, f"engine:lo-write {by}")
    rep, new = apply_seed.Report(), 0
    for j, out in done.written:
        r = j["row"]
        if j["part"] == 0:
            lo = conn.execute(
                "select code, title, source_text, signal, source, retired from learning_objective"
                " where tenant_id = %s and code = %s",
                (t, r["code"]),
            ).fetchone()
            if lo is None:  # gone since the jobs were built
                rep.skip("an objective no longer there")
                continue
            before = len(rep.changes)
            apply_seed.rewrite_lo(
                conn, t, {"action": "rewrite", "new_title": out["text"], "signal": out["signal"]}, lo, rep
            )
            if len(rep.changes) > before:
                rep.changes[-1]["before"]["confidence"] = r["confidence"]
                conn.execute(
                    "update learning_objective set confidence = %s where tenant_id = %s and code = %s",
                    (out["confidence"], t, r["code"]),
                )
            continue
        code = _next_code(conn, t, r["band"], new)
        new += 1
        apply_seed.new_lo(conn, t, {"code": code, "band": r["band"], "subject_code": r["subject_code"],
                                     "subject_given": r["subject"], "unit": r["unit"], "title": out["text"],
                                     "signal": out["signal"], "kind": r["kind"]}, rep)  # fmt: skip
        conn.execute(
            "update learning_objective set confidence = %s, source_text = %s where tenant_id = %s and code = %s",
            (out["confidence"], r["title"], t, code),
        )
    run_id = None
    if rep.changes:
        made = conn.execute(
            "insert into flow_run (tenant_id, flow, trigger, status, finished_at, request, result)"
            " values (%s, %s, 'engine', 'ok', now(), %s, %s) returning id",
            (t, apply_seed.FLOW, Jsonb({"counts": rep.counts(), "kind": "lo_write", "by": by}),
             Jsonb({"changes": rep.changes, "outcomes": outcomes(done)})),
        ).fetchone()  # fmt: skip
        run_id = made["id"] if made else None
    return rep, run_id


def outcomes(done: Done) -> list[dict[str, Any]]:
    """Every job's end, kept on the run's row for a person (the objective, its confidence and assumption; or why not)."""
    out: list[dict[str, Any]] = [
        {"key": j["key"], "ok": True, "text": o["text"], "confidence": o["confidence"], "assumption": o.get("assumption", "")}
        for j, o in done.written
    ]  # fmt: skip
    out += [{"key": j["key"], "ok": False, "repeat_of": c} for j, c in done.repeats]
    out += [{"key": j["key"], "ok": False, "faults": f} for j, f in done.refused]
    return out
