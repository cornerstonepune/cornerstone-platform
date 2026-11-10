"""The class list.

A child's name is the one piece of this system that is genuinely sensitive, so it lives in the
`pii` schema and nowhere else: `child` carries a band, its open `enrolment` the class (a `school_class` and its
label, the section pages show) and the roll number (CP-27 group 4; `child_now` reads them together), and every other
table joins to that. The roster file itself stays outside the repository — it has names in
it — and is read by path.
"""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TypedDict
from uuid import UUID

from engine.core import db, settings
from engine.core.people import year_label

Loaded = TypedDict(
    "Loaded",
    {
        "added": int,
        "already known": int,
        "grade changed": list[str],
        "kept as changed on the site": list[str],
    },
)


def load(path: Path) -> Loaded:
    """Upsert children from a roster file → how many were added, how many already existed, and each child whose
    grade it changed, by class and roll: the list is the only thing that sets a child's band, and one loaded again
    with an old slip in it (G3 roll 5 as G4, 2026-09-30) would undo a correction unseen.

    The file is `{"children": [{"roll_no", "section", "band", "first_name", "last_name"?}]}`.
    Matching is on (section, roll_no), so re-running after a correction updates rather than
    duplicating. A child a coordinator moved on the site (`move_child`, goals/mov_move_a_child.yaml) keeps their id; an
    older list still naming where they were would put the old grade back, or make a second child in the place they left.
    Such a row is left out and named (`kept as changed on the site`), so the change is never undone unseen.
    """
    children = json.loads(Path(path).read_text())["children"]
    added = updated = 0
    changed: list[str] = []
    kept: list[str] = []
    with db.connect() as conn:
        tenant = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        for c in children:
            key = (tenant, c["section"], str(c["roll_no"]))
            was = conn.execute(
                "select id, band from child_now where tenant_id = %s and section = %s and roll_no = %s", key
            ).fetchone()
            if told := _changed_on_the_site(conn, tenant, c, was):
                kept.append(told)
                continue
            if was:
                conn.execute("update child set band = %s where id = %s", (c["band"], was["id"]))
                row, updated = was, updated + 1
            else:
                row = {
                    "id": a_child(
                        conn, tenant, c["section"], c["band"], str(c["roll_no"]), "engine roster load"
                    )
                }
                added += 1
            if was and was["band"] != c["band"]:
                changed.append(f"{c['section']} roll {c['roll_no']}: {was['band']} → {c['band']}")
            conn.execute(
                "insert into pii.child (tenant_id, child_id, first_name, last_name, home_languages)"
                " values (%s,%s,%s,%s,%s)"
                " on conflict (tenant_id, child_id) do update set first_name = excluded.first_name,"
                " last_name = excluded.last_name, home_languages = excluded.home_languages,"
                " updated_at = now()",
                (tenant, row["id"], c["first_name"], c.get("last_name", ""), c.get("home_languages", [])),
            )
        conn.commit()
    return {
        "added": added,
        "already known": updated,
        "grade changed": changed,
        "kept as changed on the site": kept,
    }


def _changed_on_the_site(
    conn: db.Conn, tenant: UUID, row: dict[str, Any], here: dict[str, Any] | None
) -> str | None:
    """Why a list's row must not be applied, if a coordinator's change on the site stands against it: it names the place a
    child was moved away from (and nobody sits there now), or it names a grade other than the one set on the site."""
    section, roll = row["section"], str(row["roll_no"])
    moves = "select before, after, at from change_log where tenant_id = %s and table_name = 'child' and op = 'move'"
    if here is None:
        m = conn.execute(
            f"{moves} and before ->> 'section' = %s and before ->> 'roll_no' = %s order by at desc limit 1",
            (tenant, section, roll),
        ).fetchone()
        if m:
            to = m["after"]
            return f"{section} roll {roll}: moved to {to['section']} roll {to['roll_no']} ({to['band']}) on {m['at']:%Y-%m-%d}; the file still lists them here"
        return None
    m = conn.execute(
        f"{moves} and row_id = %s order by at desc limit 1", (tenant, str(here["id"]))
    ).fetchone()
    if (
        m
        and (m["after"]["section"], m["after"]["roll_no"], m["after"]["band"])
        == (section, roll, here["band"])
        and row["band"] != here["band"]
    ):
        return f"{section} roll {roll}: set to {here['band']} on {m['at']:%Y-%m-%d} on the site; the file says {row['band']}"
    return None


def a_child(conn: db.Conn, tenant: UUID, label: str, band: str, roll: str, by: str) -> UUID:
    """A new child of grade `band`, enrolled from the school year's start at roll `roll` of the class labelled `label`
    (made when there is none). → their id. A roll already held in the class is refused (UniqueViolation)."""
    child = db.one(conn, "insert into child (tenant_id, band) values (%s,%s) returning id", (tenant, band))[
        "id"
    ]
    conn.execute(
        "insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
        " select %s, %s, sc.id, %s, y.starts_on, %s from school_class sc"
        " join academic_year y on y.id = sc.academic_year_id where sc.id = %s",
        (tenant, child, roll, by, _class(conn, tenant, label, band)),
    )
    return child


def _class(conn: db.Conn, tenant: UUID, label: str, band: str) -> UUID:
    """The class labelled `label` in this school year, made (with the year, April to March) when there is none, as
    `engine enrol k2` makes one: the school's campus, the grade of the first child listed in it, section A."""
    year = year_label(settings.school_today(conn))
    found = conn.execute(
        "select sc.id from school_class sc join academic_year y on y.id = sc.academic_year_id"
        " where sc.tenant_id = %s and y.label = %s and sc.label = %s",
        (tenant, year, label),
    ).fetchone()
    if found:
        return found["id"]
    start = int(year[:4])
    y = db.one(
        conn,
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, %s, make_date(%s, 4, 1),"
        " make_date(%s, 3, 31)) on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (tenant, year, start, start + 1),
    )["id"]
    return db.one(
        conn,
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label)"
        " select %s, (select id from campus where tenant_id = %s order by created_at limit 1), %s, %s, 'A', %s"
        " returning id",
        (tenant, tenant, y, band, label),
    )["id"]


def class_band(conn: db.Conn, section: str) -> str | None:
    """The grade a class works at: the one most of its active children are in, the lower on a tie, so the same every
    time. A child may work at another grade within a class, and is prescribed at their own (`test_week`); a class's
    week is its own grade's. `limit 1` over the class took whichever child came first, so one child entered in the
    wrong grade could move the whole class's week (G3 roll 5 as G4, 2026-09-30). None for a class with no child."""
    row = conn.execute(
        # the rule is the database's (`class_band`), so the engine and every page say one grade for a class
        "select class_band(tenant_id, section) as band from child_now where section = %s and active limit 1",
        (section,),
    ).fetchone()
    return row["band"] if row else None


def names[K: (UUID, str)](conn: db.Conn, child_ids: Sequence[K], actor: str) -> dict[K, str]:
    """Names for printing on a worksheet, through the logging accessor — every read is recorded
    in `access_log` with who asked. Nothing else in the engine may touch `pii.child` directly."""
    out: dict[K, str] = {}
    for cid in child_ids:
        row = conn.execute("select * from pii.read_child(%s, %s)", (cid, actor)).fetchone()
        if row:
            out[cid] = " ".join(x for x in (row["first_name"], row["last_name"]) if x)
    return out


def find(conn: db.Conn, section: str, first_name: str, actor: str) -> UUID:
    """The child id for a first name in a section, for the legacy importer's `--child`: through the accessor that logs
    the lookup like a read, because it is one (`pii.find_child`) — neither service may read `pii.child` itself."""
    rows = conn.execute("select pii.find_child(%s, %s, %s) as id", (section, first_name, actor)).fetchall()
    if len(rows) != 1:
        raise ValueError(f"{len(rows)} children called {first_name!r} in {section}")
    return rows[0]["id"]
