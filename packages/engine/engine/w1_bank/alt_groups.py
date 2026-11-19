"""Which materials of an activity are alternatives (CP-85): "Puppets or flashcards" asks for either, not both. Told by code from
the school's own note, never by a model: two items the split returned are one group when the note has them, each once, with the
word "or" (or "and/or") between them, in any case. What the code cannot tell is left as it was, both needed, for a person: an
item the note names twice, and a pair with an "and" beside it ("glue, paper and pencils or crayons" could mean two things)."""

import re
from collections import Counter

from engine.core import db
from engine.w1_bank import k2_batch as batch


def _where(toks: list[str], phrase: list[str]) -> list[int]:
    n = len(phrase)
    return [i for i in range(len(toks) - n + 1) if toks[i : i + n] == phrase] if n else []


def _either(gap: list[str]) -> bool:
    """The words between two items say "or" or "and/or", and at most a number of the second ("pencils or 10 crayons")."""
    rest = gap[2:] if gap[:2] == ["and", "or"] else gap[1:] if gap[:1] == ["or"] else None
    return rest is not None and all(w.isdigit() for w in rest)


def _alternatives(toks: list[str], a: tuple[int, int], b: tuple[int, int]) -> bool:
    """Item `a` then item `b` of the note, an "or" between, and no "and" on the outer side of either."""
    if b[0] < a[1] or not _either(toks[a[1] : b[0]]):
        return False
    before = toks[a[0] - 1] if a[0] else ""
    after = toks[b[1]] if b[1] < len(toks) else ""
    return "and" not in (before, after)


def groups(text: str, names: list[str]) -> list[int | None]:
    """For each name the split returned (in order), the number of its group of alternatives (1, 2, ... by first member), or
    None when it is needed on its own. Each name is looked for as the school's text names it (the words `judge_materials` checks)."""
    toks = batch._tokens(text or "")
    spot: list[tuple[int, int] | None] = []
    for name in names:
        phrase = batch._tokens(re.sub(r"[^A-Za-z ]", " ", name))
        at = _where(toks, phrase)
        spot.append((at[0], at[0] + len(phrase)) if len(at) == 1 else None)  # named twice: cannot tell which
    head = list(range(len(names)))

    def root(i: int) -> int:
        while head[i] != i:
            i = head[i]
        return i

    for i, a in enumerate(spot):
        for j, b in enumerate(spot):
            if a and b and i != j and _alternatives(toks, a, b):
                head[root(j)] = root(i)
    size = Counter(root(i) for i in range(len(names)))
    number: dict[int, int] = {}
    return [
        None if size[root(i)] < 2 else number.setdefault(root(i), len(number) + 1) for i in range(len(names))
    ]


def forget_lonely(conn: db.Conn, tenant: db.Id, activity: str) -> None:
    """An item left alone in its group (its partner was taken out, or never made an item) is needed on its own."""
    conn.execute(
        "update activity_material set alt_group = null where tenant_id = %(t)s and activity_code = %(a)s"
        " and alt_group in (select alt_group from activity_material where tenant_id = %(t)s and activity_code = %(a)s"
        " and alt_group is not null group by alt_group having count(*) = 1)",
        {"t": tenant, "a": activity},
    )


def words(parts: list[str], alt: list[int | None]) -> str:
    """The note written from a list: a comma between items, "or" between neighbours of one group."""
    out = ""
    for i, part in enumerate(parts):
        glue = "" if i == 0 else " or " if alt[i] is not None and alt[i] == alt[i - 1] else ", "
        out += glue + part
    return out
