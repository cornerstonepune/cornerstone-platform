"""The category of a catalogue item (CP-84): one of the school's own categories, the words money uses (`money.categories`, a setting).

`material_item.category` is checked here, not by the database, because the list is a setting. An item with none reads "needs a category".
`categorise` gives each item with none the category the end of its name names (its last word, or a longer ending the words list) (rows of `materials.category_words`; a plural reads as its
singular); it never touches an item that already has one. A person who may (`materials.category_role` and above on the money ladder)
sets or changes one, and every change is a row of the one history log."""

from typing import Any

from engine.core import catalogue_key as k
from engine.core import db, history, money_rules, settings
from engine.core import money_rules_words as words

WORDS = "materials.category_words"
ROLE = "materials.category_role"
BY_THE_ENGINE = "engine:categorise"
NEEDS = "needs a category"


def schools(conn: db.Conn) -> list[str]:
    """The school's categories, in the school's order."""
    return money_rules.categories(conn)


def check(conn: db.Conn, category: object) -> str:
    """The category as the school's list spells it, whatever the case it was typed in; a ValueError in words when it is none of them."""
    named = str(category or "").strip()
    if not named:
        raise ValueError("A category is needed: pick one of the school's.")
    listed = {c.casefold(): c for c in schools(conn)}
    if named.casefold() not in listed:
        raise ValueError(f"{named} is not one of the school's categories.")
    return listed[named.casefold()]


def word_map(conn: db.Conn) -> tuple[dict[str, str], list[str]]:
    """({a word in the singular: its category}, the categories the setting names that the school's list lacks); a word of such a category names none."""
    rows: dict[str, str] = settings.config(conn, WORDS, {})
    listed = set(schools(conn))
    named = {" ".join(k.words(w)): c for w, c in rows.items()}
    return {w: c for w, c in named.items() if w and c in listed}, sorted(set(rows.values()) - listed)


def named(word_of: dict[str, str], name: str) -> str | None:
    """The category the end of the name names, or None: the words do not say. The longest ending the words know decides ("glue stick" is
    its own row, not the "stick" alone; "wooden pencil box" is a pencil box), and the last word alone is the fallback ("colour pencils" is
    a pencil; "chart paper" is paper)."""
    parts = k.words(name)
    for start in range(len(parts)):
        if category := word_of.get(" ".join(parts[start:])):
            return category
    return None


def named_by_words(conn: db.Conn, name: str) -> str | None:
    return named(word_map(conn)[0], name)


def may_set(conn: db.Conn, staff_id: Any) -> bool:
    """Whether this member of staff may set or change an item's category: the role the setting names, or one above it on the money ladder."""
    role: str = settings.config(conn, ROLE, "coordinator")
    return money_rules.reaches(conn, staff_id, role, money_rules.current(conn))


def _kept(
    conn: db.Conn, tenant: db.Id, code: str, before: str | None, after: str, origin: str, who: db.Id | None
) -> None:
    history.keep(
        conn,
        tenant,
        ("material_item", code, "category"),
        {"category": before},
        {"category": after},
        origin,
        staff=who,
    )


def set_category(conn: db.Conn, tenant: db.Id, staff_id: db.Id, code: str, category: str) -> None:
    """A person's category for an item, kept with the one it replaced. Refuses, changing nothing, a person who may not, an item that is none,
    and a category the school does not have; the same category again changes and keeps nothing."""
    if not may_set(conn, staff_id):
        role: str = settings.config(conn, ROLE, "coordinator")
        raise PermissionError(f"Only {words.role(role)} or above may change an item's category.")
    row = conn.execute(
        "select category from material_item where tenant_id = %s and code = %s for update", (tenant, code)
    ).fetchone()
    if row is None:
        raise ValueError(f"There is no item {code} in the materials catalogue.")
    chosen = check(conn, category)
    if row["category"] == chosen:
        return
    conn.execute(
        "update material_item set category = %s where tenant_id = %s and code = %s", (chosen, tenant, code)
    )
    _kept(conn, tenant, code, row["category"], chosen, f"staff:{staff_id}", staff_id)


def categorise(conn: db.Conn, tenant: db.Id, dry_run: bool) -> dict[str, Any]:
    """Every item with no category given the one its last word names, each a row of the history log (origin `engine:categorise`); the rest
    left reading "needs a category". An item that has a category is never read: a person's choice stays. With `dry_run` nothing is written.
    → {"set": [{code, name, category}], "left": [{code, name}], "kept": how many already had one, "not_on_list": [...]}."""
    word_of, not_on_list = word_map(conn)
    gave: list[dict[str, str]] = []
    left: list[dict[str, str]] = []
    for r in conn.execute(
        "select code, name from material_item where tenant_id = %s and category is null order by lower(name), code",
        (tenant,),
    ).fetchall():
        category = named(word_of, r["name"])
        if category is None:
            left.append({"code": r["code"], "name": r["name"]})
        elif dry_run or _give(conn, tenant, r["code"], category):
            gave.append({"code": r["code"], "name": r["name"], "category": category})
    had = db.one(
        conn,
        "select count(*) as n from material_item where tenant_id = %s and category is not null",
        (tenant,),
    )["n"]
    return {
        "set": gave,
        "left": left,
        "kept": had - (0 if dry_run else len(gave)),
        "not_on_list": not_on_list,
    }


def common_words(conn: db.Conn, tenant: db.Id, most: int = 20) -> list[dict[str, Any]]:
    """The words the items with no category most often end in, each as its singular: [{word, items}], the commonest first (then alphabetical), at most
    `most`. What "Teach a word" offers, so a person teaches the word that sets the most items at once."""
    count: dict[str, int] = {}
    for r in conn.execute(
        "select name from material_item where tenant_id = %s and category is null", (tenant,)
    ).fetchall():
        for last in k.words(r["name"])[-1:]:
            count[last] = count.get(last, 0) + 1
    ranked = sorted(count.items(), key=lambda x: (-x[1], x[0]))
    return [{"word": w, "items": n} for w, n in ranked[:most]]


def _give(
    conn: db.Conn,
    tenant: db.Id,
    code: str,
    category: str,
    origin: str = BY_THE_ENGINE,
    who: db.Id | None = None,
) -> bool:
    """The category given to an item that still has none (a person may have chosen one since it was read: then it is theirs)."""
    done = conn.execute(
        "update material_item set category = %s where tenant_id = %s and code = %s and category is null",
        (category, tenant, code),
    )
    if done.rowcount:
        _kept(conn, tenant, code, None, category, origin, who)
    return bool(done.rowcount)


def teach_word(conn: db.Conn, tenant: db.Id, staff_id: db.Id, word: str, category: str) -> dict[str, Any]:
    """A word the school's items end in, taught its category: kept in `materials.category_words` (a change of the setting kept like any other), so
    the next fill reads it, and given at once to every item that still has no category and whose last word it is. An item that has a category,
    a person's or the engine's, is never read. Refuses, changing nothing, a person who may not, a word that is not one word, and a category the
    school does not have. → {"word", "category", "items_set"}; the word is the singular."""
    if not may_set(conn, staff_id):
        role: str = settings.config(conn, ROLE, "coordinator")
        raise PermissionError(f"Only {words.role(role)} or above may teach a word.")
    typed = k.spoken(word)
    if not typed:
        raise ValueError("A word is needed.")
    if len(typed) > 1:
        raise ValueError("Teach one word at a time: the last word of the item's name.")
    chosen, one = check(conn, category), k.singular(typed[0])
    settings.lock(conn, WORDS)
    before: dict[str, str] = settings.config(conn, WORDS, {})
    after = {w: c for w, c in before.items() if k.singular(w.strip().lower()) != one} | {one: chosen}
    if after != before:
        settings.put(conn, WORDS, after)
        history.keep(
            conn,
            tenant,
            ("config", WORDS, "set"),
            {"words": before},
            {"words": after},
            f"staff:{staff_id}",
            None,
            staff_id,
        )
    items = conn.execute(
        "select code, name from material_item where tenant_id = %s and category is null order by lower(name), code",
        (tenant,),
    ).fetchall()
    set_n = sum(
        _give(conn, tenant, r["code"], chosen, f"staff:{staff_id}", staff_id)
        for r in items
        if k.words(r["name"])[-1:] == [one]
    )
    return {"word": one, "category": chosen, "items_set": set_n}
