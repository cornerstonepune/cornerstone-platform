"""A person's answers to a part of a K2 page: keep a draft, reject a draft, or change any part (D-073, task M1-11; CP-53).

The engine's side of the screens' buttons. Keep and reject answer only a part marked drafted. Change takes any part, the
school's words included (CP-53, Nimish 14 Nov: every part is edited in place by the curriculum's reviewers): the part is then
the person's, so a reload of the sheet leaves it (`k2_upload.mark_school`). Who answered is kept by id (D-046), on the
part's mark and in the curriculum's edit history, which also keeps the words it replaced.
"""

from typing import LiteralString

from psycopg.types.json import Jsonb

from engine.core import db
from engine.w1_bank import k2_part_source, map_ledger
from engine.w1_bank.k2_format import LISTS, edited, render
from engine.w1_bank.k2_gaps import column
from engine.w1_bank.map_agents import sampled
from engine.w1_bank.map_ledger import changed_by


def _column(conn: db.Conn, tenant: db.Id, code: str, part: str) -> LiteralString:
    """The part's column, once the part is a part of a page and is marked drafted."""
    col = column(part)  # a column name never comes from a caller
    mark = conn.execute(
        "select 1 from activity_part_source where tenant_id = %s and activity_code = %s and part = %s"
        " and source = 'drafted'",
        (tenant, code, part),
    ).fetchone()
    if not mark:
        raise ValueError(
            f"{code} {part} is not a drafted part: it is the school's words, or already a person's"
        )
    return col


def _made_theirs(conn: db.Conn, tenant: db.Id, staff: db.Id, code: str, part: str) -> None:
    """The part is the person's now; a part of the school's carries no mark before, and gets its first here."""
    was = k2_part_source.now(conn, tenant, code, part)
    k2_part_source.mark(
        conn, tenant, code, part, f"staff:{staff}", was, source="person", check_me=False, staff_id=staff
    )


def keep(conn: db.Conn, tenant: db.Id, staff: db.Id, code: str, part: str) -> None:
    """The draft stays as written and becomes the person's: its doubt is cleared."""
    _column(conn, tenant, code, part)
    _made_theirs(conn, tenant, staff, code, part)


def change(conn: db.Conn, tenant: db.Id, staff: db.Id, code: str, part: str, value: object) -> None:
    """The person's own words in place of what the part held, whoever wrote it: text, or for the steps a list and for the
    thinking an idea with its slips (the text beside is written from the list, so the site reads either)."""
    col = column(part)  # a column name never comes from a caller: an unknown part is refused here
    made = edited(part, value)
    changed_by(conn, f"staff:{staff}")
    listed = LISTS.get(part)
    structured = made if not isinstance(made, str) else None
    conn.execute(
        f"update activity set {col} = %s{f', {listed} = %s' if listed else ''} where tenant_id = %s and code = %s",  # noqa: S608
        (render(part, made), *((Jsonb(structured) if structured else None,) if listed else ()), tenant, code),
    )
    _made_theirs(conn, tenant, staff, code, part)


def reject(conn: db.Conn, tenant: db.Id, staff: db.Id, code: str, part: str) -> None:
    """The draft goes: the part is empty again and carries no mark."""
    col = _column(conn, tenant, code, part)
    changed_by(conn, f"staff:{staff}")
    listed = LISTS.get(part)
    conn.execute(
        f"update activity set {col} = ''{f', {listed} = null' if listed else ''} where tenant_id = %s and code = %s",  # noqa: S608
        (tenant, code),
    )
    if (was := k2_part_source.now(conn, tenant, code, part)) is not None:
        k2_part_source.mark(conn, tenant, code, part, f"staff:{staff}", was)


def review_list(conn: db.Conn, tenant: db.Id) -> list[dict]:
    """The drafted pages a person reads, in order: those tagged check_me first, then the audit share (`map.audit_share`,
    D-063) of the rest, drawn by code (the same draw every time). Each: the page's code, check_me, the proposal's reason."""
    share = map_ledger.rules(conn)["audit_share"]
    rows = conn.execute(
        "select p.subject_code as code, p.reason, bool_or(s.check_me) as check_me from curriculum_proposal p"
        " join activity_part_source s on s.tenant_id = p.tenant_id and s.proposal_id = p.id and s.source = 'drafted'"
        " where p.tenant_id = %s and p.kind = 'page_part' and p.about is null group by p.id, p.subject_code, p.reason"
        " order by p.subject_code",
        (tenant,),
    ).fetchall()
    doubtful = [dict(r) for r in rows if r["check_me"]]
    rest = [dict(r) for r in rows if not r["check_me"] and sampled("page_part", r["code"], share)]
    return [*doubtful, *rest]


def _item(conn: db.Conn, tenant: db.Id, name: str, staff: db.Id) -> str:
    """The catalogue item of this name, or a new one waiting for a person to give it a home and a value: the same rule as
    `w2_print/materials_list.propose_item` (a name in any case or spacing is the one item), which a workflow of W1 does
    not import."""
    conn.execute("select pg_advisory_xact_lock(hashtext('material_item.code'))")
    found = conn.execute(
        "select code from material_item where tenant_id = %s and lower(name) = lower(%s)", (tenant, name)
    ).fetchone()
    if found:
        return found["code"]
    last = db.one(
        conn,
        "select max(substr(code, 5)::int) as n from material_item where tenant_id = %s and code ~ '^MAT-[0-9]+$'",
        (tenant,),
    )["n"]
    code = f"MAT-{(last or 0) + 1:04d}"
    conn.execute(
        "insert into material_item (tenant_id, code, name, unit, proposed_by, proposed_at)"
        " values (%s, %s, %s, 'piece', %s, clock_timestamp())",
        (tenant, code, name, staff),
    )
    return code


def set_materials(
    conn: db.Conn, tenant: db.Id, staff: db.Id, code: str, items: list[tuple[str, float | None]]
) -> None:
    """The activity's materials as the person lists them (CP-53): each a catalogue item with a count, or none where the
    person gives none; a line left out goes. The part is the person's, and its text is written from the list."""
    lines: list[tuple[str, float | None]] = []
    for name, qty in items:
        name = " ".join(name.split())
        if not name:
            raise ValueError("a material needs a name")
        if qty is not None and qty <= 0:
            raise ValueError(f"{name}: a count is 1 or more, or left empty")
        if name.lower() not in {n.lower() for n, _ in lines}:
            lines.append((name, qty))
    changed_by(conn, f"staff:{staff}")
    mats = [_item(conn, tenant, name, staff) for name, _ in lines]
    conn.execute(
        "delete from activity_material where tenant_id = %s and activity_code = %s and not (material_code = any(%s))",
        (tenant, code, mats),
    )
    for i, (mat, (_, qty)) in enumerate(zip(mats, lines, strict=True), start=1):
        conn.execute(
            "insert into activity_material (tenant_id, activity_code, material_code, quantity, ord, source)"
            " values (%s, %s, %s, %s, %s, 'person') on conflict (tenant_id, activity_code, material_code) do update"
            " set quantity = excluded.quantity, ord = excluded.ord, source = 'person', proposal_id = null,"
            " updated_at = now()",
            (tenant, code, mat, qty, i),
        )
    named = {
        r["code"]: r["name"]
        for r in conn.execute(
            "select code, name from material_item where tenant_id = %s and code = any(%s)", (tenant, mats)
        ).fetchall()
    }  # the catalogue's name, so the text says what the list shows
    words = ", ".join(
        named[m] if q is None else f"{named[m]} × {q:g}" for m, (_, q) in zip(mats, lines, strict=True)
    )
    conn.execute(
        "update activity set materials = %s where tenant_id = %s and code = %s", (words, tenant, code)
    )
    _made_theirs(conn, tenant, staff, code, "materials")
