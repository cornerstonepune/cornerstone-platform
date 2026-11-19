"""Two catalogue items that are one thing, made one (CP-84): the repair for items made twice before `catalogue_key.same_name` could see that
"flash card" and "flashcard" are one. `engine materials merge [--dry-run]`.

Every group of items whose names are one thing (`catalogue_key.groups`) keeps the item the most activities use (ties: the lowest code). For each
other item of the group, in one transaction: every row of every table that names it is pointed at the keeper (the tables are read from the
database's own foreign keys to `material_item`, so one added later is moved too); a row the keeper already has the like of (the activity has the
keeper; the list has a line of it) is dropped, since a second would break the table's unique key; the item's name and its approved words become
approved words of the keeper (a blank category, home or value is filled from it, nothing the keeper has is overwritten); one history row is kept
(row: the keeper, op `merge`, origin `engine:merge`, before: the item as it was); and the item is deleted. An item with a row in a table that is kept
for ever (stock moves are append-only) cannot be pointed anywhere: it is left, and said so, for a person. A second run finds nothing to merge.
A dry run does the work in a savepoint and rolls it back, so what it says is exactly what the real run does. Nothing here asks a model."""

from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from engine.core import catalogue_key as k
from engine.core import db, history
from engine.w2_print.materials_text import norm

BY_THE_ENGINE = "engine:merge"
STUCK = {
    "stock_move": "has stock recorded; merge it by hand"
}  # the words for a table kept for ever; any other says which table


@dataclass(frozen=True)
class Ref:
    """A table with a foreign key to `material_item (tenant_id, code)`: where its two columns are, which other columns a unique key of it holds
    beside the item's (one row an activity has of an item), and whether it is kept for ever (append-only)."""

    schema: str
    table: str
    tenant: str
    code: str
    alongside: tuple[tuple[str, ...], ...]
    kept_for_ever: bool

    @property
    def name(self) -> sql.Identifier:
        return sql.Identifier(self.schema, self.table)


def _unique_with(conn: db.Conn, rel: int, code: str) -> tuple[tuple[str, ...], ...]:
    """For each non-partial unique index of the table that holds the item's column: its other columns, in order."""
    found = conn.execute(
        "select array_agg(a.attname::text order by u.ord) as cols from pg_index i"
        " cross join lateral unnest(i.indkey::int2[]) with ordinality as u(num, ord)"
        " join pg_attribute a on a.attrelid = i.indrelid and a.attnum = u.num"
        " where i.indrelid = %s and i.indisunique and i.indpred is null and i.indexprs is null group by i.indexrelid",
        (rel,),
    ).fetchall()
    return tuple(tuple(c for c in r["cols"] if c != code) for r in found if code in r["cols"])


def refs(conn: db.Conn) -> list[Ref]:
    """Every table that names an item, from the database's catalogue (`pg_constraint`), by name."""
    found = conn.execute(
        "select c.conrelid::bigint as rel, n.nspname as schema, cl.relname as tbl,"
        " max(ca.attname::text) filter (where fa.attname = 'tenant_id') as tenant_col,"
        " max(ca.attname::text) filter (where fa.attname = 'code') as code_col,"
        " exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = c.conrelid"
        "   and not t.tgisinternal and p.proname = 'forbid_change') as kept"
        " from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace"
        " cross join lateral unnest(c.conkey, c.confkey) as u(own, theirs)"
        " join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = u.own"
        " join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = u.theirs"
        " where c.contype = 'f' and c.confrelid = 'material_item'::regclass"
        " group by c.oid, c.conrelid, n.nspname, cl.relname order by cl.relname"
    ).fetchall()
    return [
        Ref(
            r["schema"],
            r["tbl"],
            r["tenant_col"],
            r["code_col"],
            _unique_with(conn, r["rel"], r["code_col"]),
            r["kept"],
        )
        for r in found
        if r["tenant_col"] and r["code_col"]
    ]


def _has_the_like(ref: Ref) -> sql.Composable:
    """True of a row `r` when the keeper (a parameter) already has a row `x` that a unique key of the table would call the same."""
    ours = [
        sql.SQL(" and ").join(
            [sql.SQL("true")] + [sql.SQL("x.{c} = r.{c}").format(c=sql.Identifier(c)) for c in cols]
        )
        for cols in ref.alongside
    ]
    return sql.SQL(
        "exists (select 1 from {t} as x where x.{tenant} = r.{tenant} and x.{code} = %s and ({either}))"
    ).format(
        t=ref.name,
        tenant=sql.Identifier(ref.tenant),
        code=sql.Identifier(ref.code),
        either=sql.SQL(" or ").join(ours),
    )


def _repoint(conn: db.Conn, tenant: db.Id, ref: Ref, keeper: str, loser: str) -> tuple[int, int]:
    """(rows moved to the keeper, rows dropped because the keeper has the like). The loser's rows that clash go first, then the rest move."""
    where = sql.SQL("r.{tenant} = %s and r.{code} = %s").format(
        tenant=sql.Identifier(ref.tenant), code=sql.Identifier(ref.code)
    )
    dropped = 0
    if ref.alongside:
        drop = sql.SQL("delete from {t} as r where {where} and {has}").format(
            t=ref.name, where=where, has=_has_the_like(ref)
        )
        dropped = conn.execute(drop, (tenant, loser, keeper)).rowcount
    move = sql.SQL("update {t} set {code} = %s where {tenant} = %s and {code} = %s").format(
        t=ref.name, code=sql.Identifier(ref.code), tenant=sql.Identifier(ref.tenant)
    )
    return conn.execute(move, (keeper, tenant, loser)).rowcount, dropped


def _stuck(conn: db.Conn, tenant: db.Id, all_refs: list[Ref], code: str) -> str | None:
    """Why this item cannot be merged: it has a row in a table that is kept for ever, in words; None when it can."""
    for ref in all_refs:
        if not ref.kept_for_ever:
            continue
        has = sql.SQL("select exists (select 1 from {t} where {tenant} = %s and {code} = %s) as has").format(
            t=ref.name, tenant=sql.Identifier(ref.tenant), code=sql.Identifier(ref.code)
        )
        if db.one(conn, has, (tenant, code))["has"]:
            return STUCK.get(ref.table, f"has rows kept for ever in {ref.table}; merge it by hand")
    return None


def _keeper(conn: db.Conn, tenant: db.Id, codes: list[str]) -> str:
    """The item of the group the most activities use; the lowest code when they use them as much."""
    used = {
        r["code"]: r["n"]
        for r in conn.execute(
            "select material_code as code, count(*) as n from activity_material where tenant_id = %s and material_code = any(%s)"
            " group by material_code",
            (tenant, codes),
        )
    }
    return min(codes, key=lambda c: (-used.get(c, 0), c))


def _snapshot(item: dict[str, Any]) -> dict[str, Any]:
    """The item as a history row keeps it: its own columns, with no value json cannot hold."""
    value = item["unit_value"]
    return {
        "code": item["code"],
        "name": item["name"],
        "unit": item["unit"],
        "category": item["category"],
        "home": item["home"],
        "unit_value": None if value is None else str(value),
        "aliases": list(item["aliases"]),
        "conversions": item["conversions"],
    }


def _absorb(conn: db.Conn, tenant: db.Id, keeper: str, loser: dict[str, Any]) -> list[str]:
    """The loser's name and approved words, as `materials_review.approve_alias` keeps a word (`norm`), become the keeper's; a blank category, home
    or value of the keeper is filled from the loser's. → the keeper's approved words now."""
    have = db.one(
        conn,
        "select name, aliases from material_item where tenant_id = %s and code = %s for update",
        (tenant, keeper),
    )
    said = [*have["aliases"]]
    for word in (norm(w) for w in [loser["name"], *loser["aliases"]]):
        if word and word != norm(have["name"]) and word not in said:
            said.append(word)
    conn.execute(
        "update material_item set aliases = %s, category = coalesce(category, %s), home = coalesce(home, %s),"
        " unit_value = coalesce(unit_value, %s), conversions = %s::jsonb || conversions where tenant_id = %s and code = %s",
        (
            said,
            loser["category"],
            loser["home"],
            loser["unit_value"],
            Jsonb(loser["conversions"]),
            tenant,
            keeper,
        ),
    )
    return said


def _fold(
    conn: db.Conn, tenant: db.Id, all_refs: list[Ref], keeper: str, loser: dict[str, Any]
) -> tuple[int, int]:
    """The loser made one with the keeper, kept in the history log and deleted. → (rows moved, rows dropped) over every table."""
    moved: dict[str, int] = {}
    dropped: dict[str, int] = {}
    for ref in all_refs:
        if not ref.kept_for_ever:
            m, d = _repoint(conn, tenant, ref, keeper, loser["code"])
            moved |= {ref.table: m} if m else {}
            dropped |= {ref.table: d} if d else {}
    said = _absorb(conn, tenant, keeper, loser)
    history.keep(
        conn,
        tenant,
        ("material_item", keeper, "merge"),
        {"item": _snapshot(loser)},
        {"into": keeper, "aliases": said, "moved": moved, "dropped": dropped},
        BY_THE_ENGINE,
        f"{loser['name']} is {keeper}: the same item written twice",
    )
    conn.execute("delete from material_item where tenant_id = %s and code = %s", (tenant, loser["code"]))
    return sum(moved.values()), sum(dropped.values())


def _group(
    conn: db.Conn, tenant: db.Id, all_refs: list[Ref], items: dict[str, dict[str, Any]], codes: list[str]
) -> dict[str, Any]:
    keeper = _keeper(conn, tenant, codes)
    merged: list[dict[str, Any]] = []
    left: list[dict[str, str]] = []
    for code in (c for c in codes if c != keeper):
        mine = {"code": code, "name": items[code]["name"]}
        why = _stuck(conn, tenant, all_refs, code)
        if why:
            left.append({**mine, "why": why})
        else:
            moved, dropped = _fold(conn, tenant, all_refs, keeper, items[code])
            merged.append({**mine, "moved": moved, "dropped": dropped})
    return {"keeper": {"code": keeper, "name": items[keeper]["name"]}, "merged": merged, "left": left}


def merge(conn: db.Conn, tenant: db.Id, dry_run: bool) -> dict[str, Any]:
    """Every group of items that are one thing, made one: see the module. With `dry_run` the same work is done and rolled back, so nothing is
    changed and the counts are the real run's. → {"dry_run", "groups": [{"keeper": {code, name}, "merged": [{code, name, moved, dropped}],
    "left": [{code, name, why}]}]}; a group with nothing merged is one whose other items all have stock."""
    conn.execute(
        "select pg_advisory_xact_lock(hashtext('material_item.code'))"
    )  # as `catalogue.make`: no item is made while two are made one
    items = {
        r["code"]: r
        for r in conn.execute(
            "select code, name, unit, category, home, unit_value, aliases, conversions from material_item where tenant_id = %s order by code",
            (tenant,),
        )
    }
    all_refs = refs(conn)
    groups: list[dict[str, Any]] = []
    with conn.transaction() as work:
        groups += [
            _group(conn, tenant, all_refs, items, codes)
            for codes in k.groups({c: r["name"] for c, r in items.items()})
        ]
        if dry_run:
            raise psycopg.Rollback(work)
    return {"dry_run": dry_run, "groups": groups}


def _rows(n: int) -> str:
    return f"{n} row{'' if n == 1 else 's'}"


def lines(plan: dict[str, Any]) -> list[str]:
    """What `merge` did, or would do, in words, one line a group: `keeper <- loser, loser: n rows moved`, then the items left for a person."""
    dry = plan["dry_run"]
    done = [g for g in plan["groups"] if g["merged"]]
    gone = sum(len(g["merged"]) for g in done)
    if not plan["groups"]:
        return ["no two items are one thing: nothing to merge"]
    note = " (a dry run: nothing is changed)" if dry else ""
    out = [
        (f"{'would merge' if dry else 'merged'} {gone} items into {len(done)}{note}")
        if gone
        else f"no item can be merged here{note}"
    ]
    for g in done:
        moved, dropped = (sum(m[w] for m in g["merged"]) for w in ("moved", "dropped"))
        loser = ", ".join(f"{m['code']} {m['name']}" for m in g["merged"])
        said = f"  {g['keeper']['code']} {g['keeper']['name']} <- {loser}: {_rows(moved)} {'would move' if dry else 'moved'}"
        out.append(
            said
            + (
                f" ({_rows(dropped)} the keeper already had {'would be ' if dry else 'were '}dropped)"
                if dropped
                else ""
            )
        )
    left = [(g["keeper"], m) for g in plan["groups"] for m in g["left"]]
    if left:
        out.append("left as they are, for a person:")
        out += [
            f"  {m['code']} {m['name']}: {m['why']} (it is {keep['code']} {keep['name']} too)"
            for keep, m in left
        ]
    return out
