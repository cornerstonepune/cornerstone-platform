"""The one subject list (CP-54 A1): every in-scope objective and activity reaches a `subject` row, or is knowingly not one.

The school's own spellings (an objective's `subject`, an activity's `strand`) stay as the source. The config row
`curriculum.subjects` maps each to a subject code, or says it is a routine, a character area, or one nobody has ruled on
(`placement`, left for the placement skill, never guessed). A spelling in none of the four fails the load, so a new
label is a decision, not a silent gap. Runs on every deploy (`engine load --settings`) and at the end of a K2 upload.
"""

from typing import Any, LiteralString

from engine.core import db, settings

KEY = "curriculum.subjects"
SPELLED: tuple[tuple[LiteralString, LiteralString], ...] = (
    ("learning_objective", "subject"),
    ("activity", "strand"),
)


class UnknownSubject(Exception):
    """A spelling the map does not know: add it to `curriculum.subjects` (a subject, a routine, a character area or placement)."""


def load_subjects(conn: db.Conn, t: db.Id) -> None:
    """The school's subject rows from supabase/seed/subjects.json."""
    for s in settings.seed("subjects.json", "subjects"):
        conn.execute(
            "insert into subject (tenant_id, code, name, label, verifier, mark_mode) values (%s,%s,%s,%s,%s,%s)"
            " on conflict (tenant_id, code) do update set name=excluded.name, label=excluded.label,"
            " verifier=excluded.verifier, mark_mode=excluded.mark_mode, updated_at=now()",
            (t, s["code"], s["name"], s.get("label"), s.get("verifier"), s.get("mark_mode", "lookup")),
        )


def _rules(conn: db.Conn, t: db.Id) -> dict[str, Any]:
    rules = settings.config(conn, KEY, None, t)
    if not rules:
        raise settings.MissingSetting(f"config {KEY} is not loaded")
    return rules


def _unknown(conn: db.Conn, t: db.Id, rules: dict[str, Any]) -> list[str]:
    known = {*rules["spellings"], *rules["routines"], *rules["character"], *rules["placement"]}
    rows = conn.execute(
        "select 'objective of ' || band as what, coalesce(subject, '') as spelling from learning_objective"
        " where tenant_id = %(t)s and band = any(%(b)s) union"
        " select 'activity of ' || band, coalesce(strand, '') from activity where tenant_id = %(t)s and band = any(%(b)s)",
        {"t": t, "b": rules["bands"]},
    ).fetchall()
    return sorted({f"{r['spelling']!r} ({r['what']})" for r in rows if r["spelling"] not in known})


def _by_unit(conn: db.Conn, t: db.Id, bands: list[str], rule: dict[str, Any], default: str) -> int:
    """A spelling whose objectives name more than one subject in their unit text (G3–G4 "Visual Arts" holds geography and
    history units): each goes to the rule's subject when its unit has one of the rule's words, else to the default."""
    moved = 0
    words = [w.lower() for w in rule["unit_has"]]
    rows = conn.execute(
        "select code, unit, subject_code from learning_objective where tenant_id = %s and band = any(%s) and subject = %s",
        (t, bands, rule["spelling"]),
    ).fetchall()
    for r in rows:
        unit = (r["unit"] or "").lower()
        want = rule["code"] if any(w in unit for w in words) else default
        if r["subject_code"] != want:
            conn.execute(
                "update learning_objective set subject_code = %s, updated_at = now() where tenant_id = %s and code = %s",
                (want, t, r["code"]),
            )
            moved += 1
    return moved


def apply(conn: db.Conn, t: db.Id) -> dict[str, int]:
    """Set `subject_code` (and `kind` for a routine or a character area) on the grades in scope. A subject the map names
    is a pure function of the spelling, so a corrected map corrects the rows; a routine, character or placement
    spelling leaves `subject_code` empty. Raises UnknownSubject for a spelling the map does not know."""
    rules = _rules(conn, t)
    bad = _unknown(conn, t, rules)
    if bad:
        raise UnknownSubject(f"not in config {KEY}: {', '.join(bad)}")
    bands = rules["bands"]
    for code in {*rules["spellings"].values(), *(o["code"] for o in rules.get("by_unit", []))}:
        if not conn.execute("select 1 from subject where tenant_id = %s and code = %s", (t, code)).fetchone():
            raise UnknownSubject(f"config {KEY} names subject {code}, which has no row")
    done = {"objectives": 0, "activities": 0}
    by_unit = {o["spelling"]: o for o in rules.get("by_unit", [])}
    for spelling, code in rules["spellings"].items():
        if spelling in by_unit:
            done["objectives"] += _by_unit(conn, t, bands, by_unit[spelling], code)
        else:
            done["objectives"] += conn.execute(
                "update learning_objective set subject_code = %s, updated_at = now() where tenant_id = %s"
                " and band = any(%s) and subject = %s and subject_code is distinct from %s",
                (code, t, bands, spelling, code),
            ).rowcount
        done["activities"] += conn.execute(
            "update activity set subject_code = %s, updated_at = now() where tenant_id = %s"
            " and band = any(%s) and strand = %s and subject_code is distinct from %s",
            (code, t, bands, spelling, code),
        ).rowcount
    for kind, key in (("routine", "routines"), ("character", "character")):
        done[kind] = conn.execute(
            "update learning_objective set kind = %s, updated_at = now() where tenant_id = %s and band = any(%s)"
            " and subject = any(%s) and kind <> %s",
            (kind, t, bands, rules[key], kind),
        ).rowcount
    return done


def _count(
    conn: db.Conn,
    table: LiteralString,
    col: LiteralString,
    bands: list[str],
    t: db.Id,
    spellings: list[str],
    *,
    inside: bool,
) -> int:
    row = conn.execute(
        f"select count(*) as n from {table} where tenant_id = %s and band = any(%s) and subject_code is null"  # noqa: S608
        f" and coalesce({col}, '') {'= any' if inside else '<> all'}(%s)",
        (t, bands, spellings),
    ).fetchone()
    return int(row["n"]) if row else 0


def unplaced(conn: db.Conn, t: db.Id) -> dict[str, int]:
    """What is left with no subject, by reason: the live goalpost. `stray` (no subject and not named a routine, a
    character area or placement) must be 0."""
    rules = _rules(conn, t)
    named = [*rules["routines"], *rules["character"], *rules["placement"]]
    out: dict[str, int] = {}
    for table, col in SPELLED:
        out[f"{table}_stray"] = _count(conn, table, col, rules["bands"], t, named, inside=False)
        out[f"{table}_placement"] = _count(
            conn, table, col, rules["bands"], t, rules["placement"], inside=True
        )
    return out
