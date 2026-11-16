"""The frameworks a learning objective is held against, loaded into rows (CP-54, migration 20270129090000).

Reads the files research built and the product never read: the crosswalk (docs/crosswalk/tables, ADR 0041: the six
outside frameworks word for word, their levels with ages, the school's progressions with their steps, and the
objectives placed on them) and the spine (docs/spine/spine.json, ADR 0037: the graduate profile's capabilities and the
three words). Cambridge's words may not be republished, so its statements keep their place and a fingerprint
of their words (research/crosswalk_build.py, `public`), as the files do. They are read where research writes them, so there is one copy; supabase/seed holds no second one.

Two of the frameworks are the school's own: its progressions (PROGRESSIONS: a strand per subject, a step per year of
age) and its graduate profile (PROFILE: capabilities and words). A different set of capabilities is a change of rows,
never of code.

An objective's links came from code and from a prompt, and nobody has checked them, so each is the machine's (CP-54:
live, marked, checked as the week comes). A link a person has made or changed is never overwritten. Only an objective's
primary capability is loaded: an objective counts toward one (CP-54); the crosswalk's eight secondary ones are dropped.
"""

import json
from typing import Any

from engine.core import db

TABLES = db.REPO_ROOT / "docs" / "crosswalk" / "tables"
SPINE = db.REPO_ROOT / "docs" / "spine" / "spine.json"
PROGRESSIONS = "CS-PROGRESSION"
PROFILE = "CS-PROFILE"
SCHOOL = "Cornerstone School"
OWN = (
    {"code": PROGRESSIONS, "name": "Cornerstone progressions: a strand per subject, a step per year of age",
     "publisher": SCHOOL, "kind": "school", "edition": "the crosswalk, 28 Sep 2026 (ADR 0041)"},
    {"code": PROFILE, "name": "Cornerstone graduate profile: capabilities and the three words",
     "publisher": SCHOOL, "kind": "school", "edition": "the graduate profile and the spine, 26 Sep 2026 (ADR 0037)"},
)  # fmt: skip
# Cambridge's words are in the database only (core/cambridge_words.py); the files carry text NULL and a fingerprint. A load
# with the same fingerprint therefore keeps the words it finds, instead of blanking them.
WORDS = "case when excluded.text is null and excluded.text_sha256 = framework_statement.text_sha256"
TEXT = f"({WORDS} then framework_statement.text else excluded.text end)"
ITEMS = f"({WORDS} then framework_statement.items else excluded.items end)"
STATEMENT = (
    "insert into framework_statement (tenant_id, framework_code, code, printed_code, parent_code, kind, level_code,"
    " area, text, text_sha256, items, ord, age_from, age_to, pdf_page, note) values"
    " (%(t)s, %(framework_code)s, %(code)s, %(printed_code)s, %(parent_code)s, %(kind)s, %(level_code)s, %(area)s,"
    " %(text)s, %(text_sha256)s, %(items)s, %(ord)s, %(age_from)s, %(age_to)s, %(pdf_page)s, %(note)s)"
    " on conflict (tenant_id, framework_code, code) do update set printed_code = excluded.printed_code,"
    f" parent_code = excluded.parent_code, kind = excluded.kind, level_code = excluded.level_code, area = excluded.area,"
    f" text = {TEXT}, text_sha256 = excluded.text_sha256, items = {ITEMS}, ord = excluded.ord,"
    " age_from = excluded.age_from, age_to = excluded.age_to, pdf_page = excluded.pdf_page, note = excluded.note,"
    " updated_at = now()"
    " where (framework_statement.printed_code, framework_statement.parent_code, framework_statement.kind,"
    " framework_statement.level_code, framework_statement.area, framework_statement.text, framework_statement.text_sha256,"
    " framework_statement.items, framework_statement.ord, framework_statement.age_from, framework_statement.age_to,"
    " framework_statement.pdf_page, framework_statement.note) is distinct from (excluded.printed_code,"
    f" excluded.parent_code, excluded.kind, excluded.level_code, excluded.area, {TEXT}, excluded.text_sha256, {ITEMS},"
    " excluded.ord, excluded.age_from, excluded.age_to, excluded.pdf_page, excluded.note)"
)
BLANK = dict.fromkeys(
    (
        "printed_code",
        "parent_code",
        "level_code",
        "area",
        "ord",
        "age_from",
        "age_to",
        "pdf_page",
        "note",
        "text_sha256",
    )
)


def _rows(name: str) -> list[dict[str, Any]]:
    return json.loads((TABLES / f"{name}.json").read_text())


def _frameworks(conn: db.Conn, t: db.Id) -> int:
    docs: dict[str, list[dict[str, Any]]] = {}
    for d in _rows("framework_document"):
        docs.setdefault(d["framework_code"], []).append({k: v for k, v in d.items() if k != "framework_code"})
    rows = [*_rows("framework"), *OWN]
    for f in rows:
        conn.execute(
            "insert into framework (tenant_id, code, name, publisher, kind, edition, documents)"
            " values (%s, %s, %s, %s, %s, %s, %s) on conflict (tenant_id, code) do update set name = excluded.name,"
            " publisher = excluded.publisher, kind = excluded.kind, edition = excluded.edition,"
            " documents = excluded.documents, updated_at = now()"
            " where (framework.name, framework.publisher, framework.kind, framework.edition, framework.documents)"
            " is distinct from (excluded.name, excluded.publisher, excluded.kind, excluded.edition, excluded.documents)",
            (t, f["code"], f["name"], f["publisher"], f["kind"], f.get("edition"),
             json.dumps(docs.get(f["code"], []))),
        )  # fmt: skip
    return len(rows)


def _statements() -> list[dict[str, Any]]:
    """Every statement, outside and the school's own, in the shape of a framework_statement row."""
    out: list[dict[str, Any]] = []
    for lv in _rows("framework_level"):
        note = f"{lv['age_basis']} {lv['quote']}".strip() if lv.get("quote") else lv["age_basis"]
        out.append({**BLANK, "framework_code": lv["framework_code"], "code": lv["code"], "kind": "level",
                    "text": lv["code"], "ord": lv["ord"], "age_from": lv["age_from"], "age_to": lv["age_to"],
                    "pdf_page": lv.get("pdf_page"), "note": note, "items": []})  # fmt: skip
    for s in _rows("framework_statement"):
        out.append({**BLANK, **{k: s.get(k) for k in BLANK if k in s}, "framework_code": s["framework_code"],
                    "code": s["code"], "kind": s["kind"], "text": s["text"],
                    "items": s["items"] if isinstance(s.get("items"), list) else []})  # fmt: skip
    for p in _rows("progression"):
        out.append({**BLANK, "framework_code": PROGRESSIONS, "code": p["code"], "kind": "progression",
                    "area": p["subject"], "text": f"{p['subject']} · {p['strand']}",
                    "items": p.get("cambridge_strands") or []})  # fmt: skip
    for st in _rows("progression_step"):
        out.append({**BLANK, "framework_code": PROGRESSIONS, "code": st["code"], "kind": "step",
                    "parent_code": st["progression_code"], "text": st["code"], "ord": st["ord"],
                    "age_from": st["age_from"], "age_to": st["age_to"], "items": []})  # fmt: skip
    nodes = json.loads(SPINE.read_text())["nodes"]
    for n in nodes:
        if n["layer"] in ("capability", "word"):
            out.append({**BLANK, "framework_code": PROFILE, "code": n["id"].split(".", 1)[1], "kind": n["layer"],
                        "text": n["label"], "note": n["text"], "items": []})  # fmt: skip
    return out


def _links(have: set[str]) -> tuple[list[tuple[str, str, str, str]], int]:
    """(objective, framework, statement, relation) for every link whose objective the school has; and how many
    named an objective it does not (the crosswalk was built from a sheet that can hold codes since removed)."""
    wanted = [
        *((r["lo_code"], PROGRESSIONS, r["step_code"], "on_step") for r in _rows("objective_step")),
        *((r["lo_code"], r["framework_code"], r["statement_code"], r["relation"]) for r in _rows("alignment")),
        *((r["lo_code"], PROFILE, r["capability_code"], "counts_toward")
          for r in _rows("lo_capability") if r["weight"] == "primary"),
    ]  # fmt: skip
    kept = [w for w in wanted if w[0] in have]
    return kept, len(wanted) - len(kept)


def load(conn: db.Conn, t: db.Id) -> dict[str, int]:
    """Puts every framework, statement and objective link in; a second load changes nothing. Counts what it holds."""
    n_frameworks = _frameworks(conn, t)
    statements = _statements()
    for s in statements:
        conn.execute(STATEMENT, {**s, "t": t, "items": json.dumps(s["items"])})
    have = {r["code"] for r in conn.execute("select code from learning_objective where tenant_id = %s", (t,))}
    links, skipped = _links(have)
    for lo, framework, statement, relation in links:
        conn.execute(
            "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
            " values (%s, %s, %s, %s, %s, 'machine')"
            " on conflict (tenant_id, lo_code, framework_code, statement_code) do nothing",
            (t, lo, framework, statement, relation),
        )
    return {
        "frameworks": n_frameworks,
        "statements": len(statements),
        "links": len(links),
        "links_skipped": skipped,
    }
