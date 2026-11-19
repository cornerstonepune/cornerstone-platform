"""The materials catalogue as one list (CP-84): one thing, one item; every item under a category; one search that serves every picker.

Every place that makes an item (an educator adding one, the catalogue fill, a person writing an activity's materials) goes through `make`,
which returns the item that already has those words, as its name or as a word a person approved for it (`catalogue_key`), and makes a
second never. Names that only share a word ("colour pencils" and "pencils") are `close`: offered, never merged. Merging two items that
already exist is not done here."""

from dataclasses import dataclass
from typing import Any

from engine.core import catalogue_category as category_of
from engine.core import catalogue_key as k
from engine.core import db

_FILLER = {
    "a",
    "an",
    "and",
    "for",
    "in",
    "of",
    "or",
    "the",
    "to",
    "with",
}  # words that make two names close on their own mean nothing
_CLOSE_MOST = 8


@dataclass(frozen=True)
class Made:
    code: str
    created: bool  # False: the words were an item already, and this is it


def _items(conn: db.Conn, tenant: db.Id) -> list[dict[str, Any]]:
    return conn.execute(
        "select code, name, unit, category, aliases from material_item where tenant_id = %s order by lower(name), code",
        (tenant,),
    ).fetchall()


def _same(items: list[dict[str, Any]], wanted: str) -> str | None:
    """The item whose name has the key, else the one a person approved a word with that key for."""
    for r in items:
        if k.key(r["name"]) == wanted:
            return r["code"]
    for r in items:
        if any(k.key(a) == wanted for a in r["aliases"]):
            return r["code"]
    return None


def find(conn: db.Conn, tenant: db.Id, name: str) -> str | None:
    """The code of the item these words are, in any case, spacing, plural or order, as its name or an approved word; None when it is new."""
    wanted = k.key(name)
    return _same(_items(conn, tenant), wanted) if wanted else None


def _close(items: list[dict[str, Any]], name: str) -> list[dict[str, str]]:
    typed, same = set(k.words(name)) - _FILLER, _same(items, k.key(name))
    ranked: list[tuple[float, str, dict[str, str]]] = []
    for r in items:
        theirs = set(k.words(r["name"])) | {w for a in r["aliases"] for w in k.words(a)}
        shared = typed & (theirs - _FILLER)
        if shared and r["code"] != same:
            ranked.append(
                (
                    -len(shared) / len(typed | theirs),
                    r["name"].casefold(),
                    {"code": r["code"], "name": r["name"]},
                )
            )
    return [x[2] for x in sorted(ranked, key=lambda x: x[:2])[:_CLOSE_MOST]]


def close(conn: db.Conn, tenant: db.Id, name: str) -> list[dict[str, str]]:
    """The items whose names share a word with `name` but are not it: "did you mean". Closest first, at most eight; never the item `find` returns."""
    return _close(_items(conn, tenant), name)


def make(
    conn: db.Conn,
    tenant: db.Id,
    name: str,
    unit: str,
    who: db.Id | None,
    category: str | None = None,
    proposal: db.Id | None = None,
) -> Made:
    """The item these words are, or a new one: with no home and no value, which is what makes it wait for a person (M1-11). A person who added it
    (`who`) or the proposal that made it (`proposal`) is on the item, and so is when. `category` is one of the school's, or None to read "needs a
    category"; an item that already exists keeps the category it has."""
    name = " ".join(name.split())
    if not k.key(name):
        raise ValueError("a new item needs a name")
    chosen = None if category is None else category_of.check(conn, category)
    conn.execute("select pg_advisory_xact_lock(hashtext('material_item.code'))")
    have = find(conn, tenant, name)
    if have:
        return Made(have, False)
    last = db.one(
        conn,
        "select max(substr(code, 5)::int) as n from material_item where tenant_id = %s and code ~ '^MAT-[0-9]+$'",
        (tenant,),
    )["n"]
    code = f"MAT-{(last or 0) + 1:04d}"
    conn.execute(
        "insert into material_item (tenant_id, code, name, unit, category, proposal_id, proposed_by, proposed_at)"
        " values (%s, %s, %s, %s, %s, %s, %s, case when %s::uuid is null then null else clock_timestamp() end)",
        (tenant, code, name, unit.strip() or "piece", chosen, proposal, who, who),
    )
    return Made(code, True)


def _words_of(item: dict[str, Any]) -> set[str]:
    """Every word, as written and as a singular, of an item's name and of the words a person approved for it."""
    said = [item["name"], *item["aliases"]]
    return {w for s in said for w in (*k.spoken(s), *k.words(s))}


def _matches(item: dict[str, Any], typed: list[str]) -> bool:
    """Every word typed begins a word of the item (a plural typed is also read as its singular): "colour penc" finds "Colour pencils"."""
    have = _words_of(item)
    return all(any(h.startswith(f) for h in have for f in {t, k.singular(t)}) for t in typed)


def search(conn: db.Conn, tenant: db.Id, q: str | None) -> dict[str, Any]:
    """→ {"groups": [{category | None, items: [{code, name, unit, category, aliases}]}], "close": [{code, name}]}.
    Items whose name or approved words match everything typed (all of them with nothing typed), grouped by category in the school's order, each by
    name, with "needs a category" (`category` None) last: an item whose category the school has since dropped reads that way too. `close` is the
    names that share a word with what was typed and are not it."""
    items, listed = _items(conn, tenant), category_of.schools(conn)
    typed = k.spoken(q or "")
    seen = [r for r in items if _matches(r, typed)]
    by: dict[str | None, list[dict[str, Any]]] = {}
    for r in seen:
        mine = r["category"] if r["category"] in listed else None
        by.setdefault(mine, []).append(
            {
                "code": r["code"],
                "name": r["name"],
                "unit": r["unit"],
                "category": mine,
                "aliases": list(r["aliases"]),
            }
        )
    order: list[str | None] = [c for c in listed if c in by] + ([None] if None in by else [])
    return {
        "groups": [{"category": c, "items": by[c]} for c in order],
        "close": _close(items, q or "") if typed else [],
    }


def add(conn: db.Conn, tenant: db.Id, who: db.Id, name: str, unit: str, category: str) -> dict[str, Any]:
    """ "Not in the list? Add it": the name, the unit and the category are all needed. The item is usable at once and waits for a person to give it
    a home and a value, as `make` leaves it. If these words are an item already, that is the item, as it is (`created` False): its category is not
    changed by this. → {code, name, unit, category, aliases, created, close}."""
    if not unit.strip():
        raise ValueError("A new item needs a unit.")
    made = make(conn, tenant, name, unit, who, category_of.check(conn, category))
    item = db.one(
        conn,
        "select code, name, unit, category, aliases from material_item where tenant_id = %s and code = %s",
        (tenant, made.code),
    )
    return {
        "code": item["code"],
        "name": item["name"],
        "unit": item["unit"],
        "category": item["category"],
        "aliases": list(item["aliases"]),
        "created": made.created,
        "close": close(conn, tenant, name),
    }
