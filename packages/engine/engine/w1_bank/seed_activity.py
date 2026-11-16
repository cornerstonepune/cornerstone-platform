"""CP-54: an activity a seed has already made. One still the machine's (made by a seed, never changed by a member of staff)
is brought to what the file now says; any other stands. Split from `apply_seed.py` when it passed its ceiling."""

from typing import Any

from psycopg.types.json import Jsonb

from engine.core import db
from engine.w1_bank.seed_rows import Row


def by_a_person(conn: db.Conn, t: db.Id, table: str, key: str) -> bool:
    """Whether a member of staff ever changed the row (the history keeps who): a person's edit always stands."""
    return bool(
        conn.execute(
            "select 1 from change_log where tenant_id = %s and table_name = %s and row_id = %s and staff_id is not null"
            " limit 1",
            (t, table, key),
        ).fetchone()
    )


ACTIVITY_FIELDS = ("strand", "name", "objective", "level_0", "level_1", "level_2", "level_3", "confidence", "note",
                   "source_tab", "source_row", "source_url", "materials", "steps", "steps_list", "subject_code",
                   "thinking_doc")  # fmt: skip


def refresh_activity(conn: db.Conn, t: db.Id, row: Row, lo_title: str, rep: Any) -> None:
    """An activity the database already has: one still the machine's (made by a seed, never touched by a person) is brought
    to what the file now says; any other stands. Its machine-made links follow the file; a person's link stays."""
    have = conn.execute(
        "select "
        + ", ".join(ACTIVITY_FIELDS)
        + ", source_file from activity where tenant_id = %s and code = %s",
        (t, row["code"]),
    ).fetchone()
    if (
        not have
        or not str(have["source_file"]).startswith("machine seed")
        or by_a_person(conn, t, "activity", row["code"])
    ):
        return rep.skip("an activity the database already has")
    src, lv = row["source"], row.get("levels") or {}
    where = src.get("sheet") or src.get("doc")
    doc = {k: row[k] for k in ("look_fors", "basis") if row.get(k)}
    new = {
        "strand": row.get("unit") or row.get("subject_given") or "", "name": row["name"], "objective": lo_title,
        "level_0": lv.get("0", ""), "level_1": lv.get("1", ""), "level_2": lv.get("2", ""), "level_3": lv.get("3", ""),
        "confidence": row.get("confidence", "medium"), "note": row.get("note", ""), "source_tab": src["tab"],
        "source_row": src.get("cell") or src.get("section") or src.get("bullet", ""),
        "source_url": f"https://docs.google.com/{where}", "materials": row.get("materials", ""),
        "steps": "\n".join(f"{i}. {s}" for i, s in enumerate(row["steps"], 1)), "steps_list": row["steps"],
        "subject_code": row["subject_code"], "thinking_doc": doc or None,
    }  # fmt: skip
    links = [r["lo_code"] for r in conn.execute(
        "select lo_code from activity_objective where tenant_id = %s and activity_code = %s and source = 'machine'"
        " order by ord", (t, row["code"]))]  # fmt: skip
    if all(have[k] == new[k] for k in ACTIVITY_FIELDS) and links == list(row["lo_codes"]):
        return rep.skip("already as the file says")
    sets = ", ".join(f"{k} = %s" for k in ACTIVITY_FIELDS)
    conn.execute(
        f"update activity set {sets}, updated_at = now() where tenant_id = %s and code = %s",  # noqa: S608
        (
            *[
                Jsonb(new[k]) if k in ("steps_list", "thinking_doc") and new[k] is not None else new[k]
                for k in ACTIVITY_FIELDS
            ],
            t,
            row["code"],
        ),
    )
    conn.execute(
        "delete from activity_objective where tenant_id = %s and activity_code = %s and source = 'machine'",
        (t, row["code"]),
    )
    for i, lo in enumerate(row["lo_codes"], 1):
        conn.execute(
            "insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (%s,%s,%s,%s,'machine')"
            " on conflict do nothing", (t, row["code"], lo, i))  # fmt: skip
    rep.changes.append({"kind": "activity_updated", "code": row["code"],
                        "before": {k: have[k] for k in ACTIVITY_FIELDS}, "links": links})  # fmt: skip
