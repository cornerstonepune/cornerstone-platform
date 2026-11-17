"""CP-54: an outside statement held against the school's learning objectives, of any grade (Nimish, 17 Nov).

The school's objectives are the atom; each outside statement (a curriculum document's outcome, objective or competency)
is held against the few objectives it may be about. Code does the lookup and the checking; a model does only the
judgement (CLAUDE.md, ADR 0005), as in `lo_match.py`:

- code shortlists the live objectives of the statement's subject (a framework's own subject, or its area's head by the
  rows `stmt.scope` and `stmt.area_subject`; an area not listed is held against every subject), of any grade K2 to G4,
  the top `stmt.shortlist_size` by words shared with the statement;
- a statement sharing fewer than `stmt.min_shared` words with every objective goes to no model: code writes it as
  "no match" itself;
- the model (prompt row `statement_match`) names up to `stmt.max_matches` objectives from the list, each as meets,
  partly_meets or extends; code refuses a code off the list and a relation off the three;
- a match is one `objective_statement` row, source `machine`, live until a person checks it; the grade of a match is
  the objective's own band (no column). `proposal_id` holds the run's id, so one run is undone as a whole (`revert`).
  A link a person or the school made is never overwritten; a statement already linked is not asked again.

A reply is a proposal; nothing here reads a child's name. The statements are the documents' as printed, read at run
time from `framework_statement`, never copied into the repository.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from engine.core import db, settings
from engine.skills import rules

PURPOSE = "statement_match"
RELATIONS = ("meets", "partly_meets", "extends")
Ask = Callable[
    [dict[str, object], str], dict[str, object]
]  # (variables, the statement's code) → the model's reply


@dataclass(frozen=True)
class Statement:
    framework: str
    code: str
    text: str
    subject: str | None  # the objectives' subject it is held against; None is every subject


@dataclass(frozen=True)
class Objective:
    code: str
    band: str
    subject: str | None
    unit: str
    title: str
    stems: frozenset[str]


@dataclass
class Match:
    code: str
    relation: str
    confidence: float
    reason: str


@dataclass
class Answer:
    statement: Statement
    shortlist: list[tuple[Objective, int]] = field(
        default_factory=list
    )  # (objective, words shared), closest first
    matches: list[Match] = field(default_factory=list)
    asked: bool = False  # a model was called
    reason: str = ""
    problems: list[str] = field(default_factory=list)


def size(conn: db.Conn, key: str, default: int) -> int:
    return int(settings.config(conn, key, default))


def stems_of(conn: db.Conn, text: str) -> frozenset[str]:
    return frozenset(rules.stems(text, settings.config(conn, "stmt.plain_words", [])))


def subject_of(conn: db.Conn, framework: str, area: str | None) -> str | None:
    """The subject a statement is held against: its framework's own, else its area's head, else every subject."""
    own = (settings.config(conn, "stmt.scope", {}).get(framework) or {}).get("subject")
    if own:
        return str(own)
    head = (area or "").split(" · ")[0].strip().lower()
    return settings.config(conn, "stmt.area_subject", {}).get(head)


def statements(conn: db.Conn, tenant: db.Id, framework: str = "", reference: bool = False) -> list[Statement]:
    """The statements in scope (`stmt.scope`) with no link of the three relations yet; with `reference`, those the
    earlier machine links already hold, to score the matcher against."""
    out: list[Statement] = []
    for fw, rule in sorted(settings.config(conn, "stmt.scope", {}).items()):
        if framework and fw != framework:
            continue
        rows = conn.execute(
            "select s.code, s.text, s.area from framework_statement s where s.tenant_id = %s and s.framework_code = %s"
            " and s.kind = any(%s) and s.level_code = any(%s) and s.text is not null and"
            + (" exists" if reference else " not exists")
            + " (select 1 from objective_statement o where o.tenant_id = s.tenant_id and o.framework_code = s.framework_code"
            " and o.statement_code = s.code and o.relation = any(%s)"
            + (" and o.source = 'machine'" if reference else "")
            + ") order by s.ord nulls last, s.code",
            (tenant, fw, rule["kinds"], rule["levels"], list(RELATIONS)),
        ).fetchall()
        out += [Statement(fw, r["code"], r["text"], subject_of(conn, fw, r["area"])) for r in rows]
    return out


def objectives(conn: db.Conn, tenant: db.Id) -> list[Objective]:
    """Every live objective of the school, with the words it can be found by."""
    rows = conn.execute(
        "select code, band, subject_code, coalesce(unit, '') as unit, title from learning_objective"
        " where tenant_id = %s and not retired and btrim(coalesce(title, '')) <> '' order by code",
        (tenant,),
    ).fetchall()
    return [
        Objective(r["code"], r["band"], r["subject_code"], r["unit"], r["title"], stems_of(conn, f"{r['unit']} {r['title']}"))
        for r in rows
    ]  # fmt: skip


def shortlist(conn: db.Conn, st: Statement, los: list[Objective]) -> list[tuple[Objective, int]]:
    """The objectives of the statement's subject (any grade) sharing most words with it, at most `stmt.shortlist_size`."""
    said = stems_of(conn, st.text)
    near = [(o, len(said & o.stems)) for o in los if st.subject is None or o.subject == st.subject]
    ranked = sorted((x for x in near if x[1] > 0), key=lambda x: (-x[1], x[0].code))
    return ranked[: size(conn, "stmt.shortlist_size", 8)]


def _candidates(short: list[tuple[Objective, int]]) -> str:
    return "\n".join(f"{o.code} | {o.band} | {o.unit} | {o.title}" for o, _ in short)


def answer(conn: db.Conn, st: Statement, los: list[Objective], ask: Ask) -> Answer:
    """One statement's answer, checked. Below `stmt.min_shared` words with every objective: code writes 'no match' with
    no call. A code off the shortlist, a relation off the three, or a repeat is refused and kept as a problem."""
    out = Answer(st, shortlist(conn, st, los))
    if not out.shortlist or out.shortlist[0][1] < size(conn, "stmt.min_shared", 2):
        out.reason = "no objective shares enough words with it: no match (written by code, no model asked)"
        return out
    reply = ask(
        {"subject": st.subject or "any subject", "statement": st.text, "candidates": _candidates(out.shortlist),
         "most": size(conn, "stmt.max_matches", 3)},
        st.code,
    )  # fmt: skip
    out.asked = True
    listed = {o.code for o, _ in out.shortlist}
    raw = reply.get("matches")
    for m in raw if isinstance(raw, list) else []:
        code, rel = str(m.get("objective_code") or "").strip(), str(m.get("relation") or "")
        if code not in listed:
            out.problems.append(f"{code} is not on the shortlist this statement was given")
        elif rel not in RELATIONS:
            out.problems.append(f"{rel!r} is not one of {list(RELATIONS)}")
        elif any(x.code == code for x in out.matches):
            out.problems.append(f"{code} is named twice")
        elif len(out.matches) >= size(conn, "stmt.max_matches", 3):
            out.problems.append(f"more than {size(conn, 'stmt.max_matches', 3)} objectives named")
        else:
            out.matches.append(
                Match(code, rel, float(m.get("confidence") or 0.0), str(m.get("reason") or ""))
            )
    out.reason = "; ".join(m.reason for m in out.matches) or "the model named no objective"
    return out


def record(conn: db.Conn, tenant: db.Id, run: uuid.UUID, a: Answer) -> int:
    """The answer's matches as machine links of the one list; never over a link already there. How many were made."""
    made = 0
    for m in a.matches:
        made += conn.execute(
            "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source, proposal_id)"
            " values (%s,%s,%s,%s,%s,'machine',%s) on conflict do nothing",
            (tenant, m.code, a.statement.framework, a.statement.code, m.relation, run),
        ).rowcount
    return made


def revert(conn: db.Conn, tenant: db.Id, run: uuid.UUID) -> int:
    """Every link a run made, and only those (a person's edit changes `source`, so it is never undone here)."""
    return conn.execute(
        "delete from objective_statement where tenant_id = %s and proposal_id = %s and source = 'machine'"
        " and relation = any(%s)",
        (tenant, run, list(RELATIONS)),
    ).rowcount


def score(answers: list[Answer], held: dict[tuple[str, str], set[str]]) -> dict[str, float]:
    """Against the earlier machine links (a reference, not a gold): how often one of the objectives each statement is
    already held by is on the shortlist, how often the model names one, and how often an answer is refused."""
    n = len(answers) or 1
    key = lambda a: (a.statement.framework, a.statement.code)  # noqa: E731
    listed = sum(bool(held[key(a)] & {o.code for o, _ in a.shortlist}) for a in answers)
    agree = sum(bool(held[key(a)] & {m.code for m in a.matches}) for a in answers)
    refused = sum(bool(a.problems) for a in answers)
    return {
        "statements": len(answers),
        "shortlist_recall": listed / n,
        "agree": agree / n,
        "refused": refused / n,
    }


def held_by(conn: db.Conn, tenant: db.Id) -> dict[tuple[str, str], set[str]]:
    """{(framework, statement): the objectives the earlier machine links hold it by}."""
    out: dict[tuple[str, str], set[str]] = {}
    for r in conn.execute(
        "select framework_code, statement_code, lo_code from objective_statement where tenant_id = %s"
        " and source = 'machine' and relation = any(%s)",
        (tenant, list(RELATIONS)),
    ):
        out.setdefault((r["framework_code"], r["statement_code"]), set()).add(r["lo_code"])
    return out
