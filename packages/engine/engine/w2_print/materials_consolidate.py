"""The school's consolidated materials list for a month (task M1-16; D-074: "the system collates requirements from all the
teachers"). Built by code, never a model, from every class's list (M1-10): each catalogue item summed over the classes,
every line keeping which classes and activities it comes from. A class that gives no quantity makes the total unknown
("to confirm"), never a smaller number. The latest build is kept, so the next one shows what changed."""

import datetime as dt
import json
from decimal import Decimal
from typing import Any
from uuid import UUID

from engine.core import db, settings
from engine.w2_print import materials_coverage as coverage
from engine.w2_print.materials_list import num


def _total(quantities: list[Any]) -> Any:
    """The sum, or None when any part is unknown: a total with a part missing is not a smaller number."""
    return None if None in quantities else sum(quantities)


def _kept_lists(
    conn: db.Conn, tenant: UUID, lo: dt.date, hi: dt.date
) -> tuple[list[dict[str, Any]], list[UUID]]:
    """Each class's lists that touch the month. Two lists of one class that overlap (a week inside a fortnight) would
    count the same need twice: the widest is kept, and any list that overlaps one already kept is skipped and named."""
    lists = conn.execute(
        "select id, school_class_id, from_on, to_on from materials_list where tenant_id = %s"
        " and from_on <= %s and to_on >= %s order by school_class_id, (to_on - from_on) desc, id",
        (tenant, hi, lo),
    ).fetchall()
    kept: list[dict[str, Any]] = []
    skipped: list[UUID] = []
    for lst in lists:
        clash = any(
            k["school_class_id"] == lst["school_class_id"]
            and k["from_on"] <= lst["to_on"]
            and lst["from_on"] <= k["to_on"]
            for k in kept
        )
        if clash:
            skipped.append(lst["id"])
        else:
            kept.append(lst)
    return kept, skipped


def _gather(
    conn: db.Conn, tenant: UUID, lo: dt.date, hi: dt.date
) -> tuple[dict[str, dict[str, Any]], list[UUID]]:
    """{material_code: {unit, quantity | None, from: {class_id: {quantity, activity_codes}}}} and the lists skipped."""
    kept, skipped = _kept_lists(conn, tenant, lo, hi)
    out: dict[str, dict[str, Any]] = {}
    for lst in kept:
        for ln in conn.execute(
            "select l.id, l.material_code, l.quantity, i.unit, coalesce(array_agg(distinct s.activity_code)"
            " filter (where s.activity_code is not null), '{}') as acts, l.activity_code"
            " from materials_line l join material_item i on i.tenant_id = l.tenant_id and i.code = l.material_code"
            " left join materials_line_source s on s.line_id = l.id"
            " where l.list_id = %s and l.removed_at is null and l.needed_on between %s and %s"
            " group by l.id, i.unit",
            (lst["id"], lo, hi),
        ):
            item = out.setdefault(ln["material_code"], {"unit": ln["unit"], "from": {}})
            acts = sorted(set(ln["acts"]) | ({ln["activity_code"]} if ln["activity_code"] else set()))
            mine = item["from"].get(lst["school_class_id"])
            if mine is None:
                item["from"][lst["school_class_id"]] = {"quantity": ln["quantity"], "activity_codes": acts}
            else:  # one class, two lists in the month: its needs add up
                mine["quantity"] = _total([mine["quantity"], ln["quantity"]])
                mine["activity_codes"] = sorted(set(mine["activity_codes"]) | set(acts))
    for item in out.values():
        item["quantity"] = _total([f["quantity"] for f in item["from"].values()])
    return out, skipped


FLOW = "materials_consolidate"  # the school's list of a range: one row of the run list, its latest build in `result`


def _q(q: Any) -> Any:
    return None if q is None else num(Decimal(str(q)))


def _stored(items: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """A build's lines as the run row keeps them: each item, its total and where it comes from, class by class."""
    return [
        {
            "material_code": code,
            "unit": item["unit"],
            "quantity": _q(item["quantity"]),
            "to_confirm": item["quantity"] is None,
            "from": [
                {
                    "class_id": str(c),
                    "quantity": _q(f["quantity"]),
                    "activity_codes": list(f["activity_codes"]),
                }
                for c, f in sorted(item["from"].items(), key=lambda kv: str(kv[0]))
            ],
        }
        for code, item in sorted(items.items())
    ]


def build(conn: db.Conn, tenant: UUID, lo: dt.date, hi: dt.date) -> UUID:
    """Make a new build of the school's list for `lo`..`hi` and note what moved since the one before. The list of a
    range is one row of the run list (`flow_run`, flow `materials_consolidate`, keyed by its range; CP-27 group 6: once
    the tables `materials_consolidated`, `_line`, `_source` and `_change`), which keeps its latest build and what that
    build changed: its id names the list for every build."""
    if hi < lo:
        raise ValueError("The last day is before the first day.")
    key = f"{lo}..{hi}"
    run = db.one(
        conn,
        "insert into flow_run (tenant_id, flow, trigger, status, idempotency_key, request, result)"
        " values (%s, %s, 'school list', 'ok', %s, %s, jsonb_build_object('build', 0))"
        " on conflict (tenant_id, flow, idempotency_key) where idempotency_key is not null"
        " do update set updated_at = now() returning id, result",
        (tenant, FLOW, key, json.dumps({"from": str(lo), "to": str(hi)})),
    )
    cid, before = run["id"], run["result"]
    items, skipped = _gather(conn, tenant, lo, hi)
    lines = _stored(items)
    if before["build"] and lines == before["lines"] and [str(x) for x in skipped] == before["skipped_lists"]:
        return cid  # nothing moved: no new build, so no empty "what changed"
    conn.execute(
        "update flow_run set finished_at = clock_timestamp(), result = %s where id = %s",
        (
            json.dumps(
                {
                    "build": before["build"] + 1,
                    "lines": lines,
                    "changes": _changes(before.get("lines") or [], lines) if before["build"] else [],
                    "skipped_lists": [str(x) for x in skipped],
                }
            ),
            cid,
        ),
    )
    return cid


def _changes(old_lines: list[dict[str, Any]], new_lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """What moved between two builds: an item added or removed, or its total changed, and the classes whose part moved."""
    old = {
        x["material_code"]: (x["quantity"], {f["class_id"]: f["quantity"] for f in x["from"]})
        for x in old_lines
    }
    new = {
        x["material_code"]: (x["quantity"], {f["class_id"]: f["quantity"] for f in x["from"]})
        for x in new_lines
    }
    out = []
    for code in sorted(set(old) | set(new)):
        if code not in old:
            kind, was, is_ = "added", None, new[code][0]
        elif code not in new:
            kind, was, is_ = "removed", old[code][0], None
        elif old[code][0] != new[code][0]:
            kind, was, is_ = "quantity", old[code][0], new[code][0]
        else:
            continue
        was_by, now_by = old.get(code, (None, {}))[1], new.get(code, (None, {}))[1]
        classes = sorted(c for c in was_by.keys() | now_by.keys() if was_by.get(c) != now_by.get(c))
        out.append({"kind": kind, "material_code": code, "before": was, "after": is_, "class_ids": classes})
    return out


def tenant_of(conn: db.Conn, cid: UUID) -> UUID | None:
    """The school whose list `cid` is, or None for no such list."""
    row = conn.execute("select tenant_id from flow_run where id = %s and flow = %s", (cid, FLOW)).fetchone()
    return row["tenant_id"] if row else None


def read(conn: db.Conn, cid: UUID) -> dict[str, Any]:
    run = db.one(
        conn,
        "select tenant_id, request, result, finished_at from flow_run where id = %s and flow = %s",
        (cid, FLOW),
    )
    got, tenant = run["result"], run["tenant_id"]
    names = coverage.class_names(conn, tenant)
    items = {
        r["code"]: r["name"]
        for r in conn.execute("select code, name from material_item where tenant_id = %s", (tenant,))
    }
    lines = [
        {
            "material_code": x["material_code"],
            "item": items.get(x["material_code"], ""),
            "quantity": x["quantity"],
            "unit": x["unit"],
            "to_confirm": x["to_confirm"],
            "from": [
                {
                    "class_id": UUID(f["class_id"]),
                    "class": names.get(UUID(f["class_id"]), ""),
                    "quantity": f["quantity"],
                    "activity_codes": f["activity_codes"],
                }
                for f in x["from"]
            ],
        }
        for x in got.get("lines") or []
    ]
    changes = [
        {
            **{k: c[k] for k in ("kind", "material_code", "before", "after")},
            "item": items.get(c["material_code"], ""),
            "class_ids": [UUID(x) for x in c["class_ids"]],
            "at": run["finished_at"],
        }
        for c in got.get("changes") or []
    ]
    return {
        "id": cid,
        "from": dt.date.fromisoformat(run["request"]["from"]),
        "to": dt.date.fromisoformat(run["request"]["to"]),
        "build": got["build"],
        "lines": sorted(lines, key=lambda x: x["item"]),
        "changes": sorted(changes, key=lambda x: x["item"]),
        "skipped_lists": [UUID(x) for x in got.get("skipped_lists") or []],
    }


def may_consolidate(conn: db.Conn, staff: UUID, today: dt.date) -> bool:
    """Whether she holds an open grant, on the school's `today`, in a role that builds and sends the school's list
    (`materials.consolidate_roles`, a config row). A class is not needed: these are campus-wide roles."""
    roles = list(settings.config(conn, "materials.consolidate_roles", ["coordinator", "head"]))
    held = conn.execute(
        "select 1 from staff_role_grant where staff_id = %s and role_code = any(%s)"
        " and valid_from <= %s and (valid_to is null or valid_to >= %s)",
        (staff, roles, today, today),
    ).fetchone()
    return held is not None
