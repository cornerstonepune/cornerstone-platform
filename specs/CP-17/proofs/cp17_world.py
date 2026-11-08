"""Shared fixtures for CP-17's database proofs (stock records, the rupee threshold, approval of a fortnight's list).

Everything is made here inside one transaction that is rolled back: the configured school's own tenant, a 2037-38
school year no real row uses, two K2 classes, fake staff ids with fake grants, and fake catalogue items. "Who" is a
staff uuid; no staff or child name is written. The names used are the design's contract (specs/CP-17/design.md, "Data"
and "The rules"): config keys `inventory.track_from_rupees`, `inventory.record_items`, `inventory.record_roles`,
`materials.approve_roles`; `material_is_tracked`, `stock_move`, `stock_on_hand`, `materials_list_digest`,
`materials_list_approval`, the `approval_list` view's kind `materials_list`.

CP-6 (`fortnight_cycle`) and CP-4 (`access_table.data_class`) are not on main yet: a proof that needs one fails with a
message naming it (`needs`), never skips.
"""

import datetime as dt
import json
import uuid
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from engine.core import db
from tests.rows import tenant

ROOT_DIR = Path(__file__).resolve().parents[3]
FROM = dt.date(2037, 11, 2)  # a Monday in a school year no real row uses
TO = FROM + dt.timedelta(days=13)
CHANGED_BY = f"staff:{uuid.uuid4()}"  # CP-6's `app.changed_by` for a fortnight's step: a staff id, never a name


def needs(conn, relation: str, scope: str) -> None:
    """Fail loudly when a dependency's table is not on this database."""
    have = conn.execute("select to_regclass(%s) is not null as ok", (relation,)).fetchone()["ok"]
    assert have, f"{relation} is missing: CP-17 needs {scope} merged first"


def needs_column(conn, table: str, column: str, scope: str) -> None:
    needs(conn, f"public.{table}", scope)
    have = conn.execute(
        "select exists (select 1 from information_schema.columns where table_schema = 'public'"
        " and table_name = %s and column_name = %s) as ok",
        (table, column),
    ).fetchone()["ok"]
    assert have, f"public.{table}.{column} is missing: CP-17 needs {scope} merged first"


@pytest.fixture
def conn():
    with db.connect() as c:
        c.execute("select set_config('app.changed_by', %s, true)", (CHANGED_BY,))
        c.execute("select set_config('app.change_reason', '', true)")
        try:
            yield c
        finally:
            c.rollback()


def make_school(conn) -> dict:
    """The configured school, its campus, a 2037-38 year and two K2 classes made for the proof."""
    t = tenant(conn)
    campus = conn.execute("select id from campus where tenant_id = %s order by created_at limit 1", (t,)).fetchone()["id"]
    year = conn.execute(
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2037-38',"
        " '2037-06-01', '2038-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id, (xmax = 0) as made",
        (t,),
    ).fetchone()
    year, year_made = year["id"], year["made"]
    classes = [
        conn.execute(
            "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
            " values (%s, %s, %s, 'K2', %s) returning id",
            (t, campus, year, f"P17{uuid.uuid4().hex[:6]}"),
        ).fetchone()["id"]
        for _ in range(2)
    ]
    act = conn.execute("select code from activity where tenant_id = %s order by code limit 1", (t,)).fetchone()
    return {"t": t, "campus": campus, "year": year, "year_made": year_made, "class": classes[0], "other_class": classes[1],
            "activity": act["code"] if act else None}


@pytest.fixture
def school(conn):
    return make_school(conn)


def set_config(conn, t, key: str, value) -> None:
    """A school's setting row, as the school would change it (rolled back with the proof)."""
    conn.execute(
        "insert into config (tenant_id, key, value, description) values (%s, %s, %s, 'CP-17 proof')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (t, key, json.dumps(value)),
    )


def get_config(conn, t, key: str):
    row = conn.execute("select value from config where tenant_id = %s and key = %s", (t, key)).fetchone()
    return None if row is None else row["value"]


def staff(conn, s, role: str | None, klass=None, valid_to: dt.date | None = None, t=None, campus=None):
    """A fake staff id, with an open grant in `role` (on `klass`, or on no class) unless `role` is None."""
    t, campus = t or s["t"], campus or s["campus"]
    sid = conn.execute("insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus)).fetchone()["id"]
    if role:
        conn.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, valid_to,"
            " granted_by) values (%s, %s, %s, %s, '2020-01-01', %s, 'CP-17 proof')",
            (t, sid, role, klass, valid_to),
        )
    return sid


def item(conn, s, unit_value=None, t=None) -> str:
    code = f"MAT-P17{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into material_item (tenant_id, code, name, unit, unit_value) values (%s, %s, %s, 'piece', %s)",
        (t or s["t"], code, f"Proof item {code}", unit_value),
    )
    return code


def move(conn, s, code: str, kind: str, who, quantity=None, klass=None, reason=None, counted=None, t=None) -> dict:
    """One `stock_move` row, as a caller writes it; returns the row as stored."""
    return conn.execute(
        "insert into stock_move (tenant_id, material_code, kind, quantity, class_id, counted_on_hand, reason, who)"
        " values (%s, %s, %s, %s, %s, %s, %s, %s) returning *",
        (t or s["t"], code, kind, quantity, klass, counted, reason, who),
    ).fetchone()


def on_hand(conn, t, code: str) -> dict:
    """{place: number} from `stock_on_hand`, place None being the store. The view is per tenant, item and place
    (`class_id`, as on `stock_move`); its one other numeric column is the number on hand."""
    cur = conn.execute("select * from stock_on_hand where tenant_id = %s and material_code = %s", (t, code))
    rows = cur.fetchall()
    names = [d.name for d in cur.description]
    assert "class_id" in names, f"stock_on_hand has no class_id (the place) column: {names}"
    qty = [n for n in names if n not in ("tenant_id", "material_code", "class_id")]
    out: dict = {}
    for r in rows:
        nums = [r[n] for n in qty if isinstance(r[n], (int, Decimal))]
        assert len(nums) == 1, f"stock_on_hand should have one number per place, has {qty}"
        out[r["class_id"]] = out.get(r["class_id"], 0) + nums[0]
    return {k: v for k, v in out.items() if v != 0}


def refused(conn, sql: str, params=()) -> str:
    """Run `sql` in a savepoint; it must raise. Returns the database's message."""
    with pytest.raises(psycopg.Error) as e:
        with conn.transaction():
            conn.execute(sql, params)
    return str(e.value)


# ---- the fortnight list and its approval (CP-6 for the freeze) ----------------------------------------------------

def teaching_fortnight(conn, s, starts_on: dt.date = FROM) -> dict:
    """A teaching fortnight of the proof year, with its CP-6 cycle row at `planning`."""
    needs(conn, "public.fortnight_cycle", "CP-6 (the fortnight cycle)")
    number = 100000 + uuid.uuid4().int % 800000
    ends_on = starts_on + dt.timedelta(days=13)
    fid = conn.execute(
        "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
        " values (%s, %s, %s, 'teaching', %s, %s) returning id",
        (s["t"], s["year"], number, starts_on, ends_on),
    ).fetchone()["id"]
    conn.execute(
        "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')"
        " on conflict (fortnight_id) do nothing",
        (s["t"], fid),
    )
    return {"id": fid, "starts_on": starts_on, "ends_on": ends_on}


def freeze(conn, fortnight_id) -> None:
    conn.execute("update fortnight_cycle set state = 'frozen' where fortnight_id = %s", (fortnight_id,))


def fortnight_list(conn, s, klass=None, period="fortnight", lo=FROM, hi=TO) -> uuid.UUID:
    return conn.execute(
        "insert into materials_list (tenant_id, school_class_id, period, from_on, to_on) values (%s, %s, %s, %s, %s)"
        " returning id",
        (s["t"], klass or s["class"], period, lo, hi),
    ).fetchone()["id"]


def school_line(conn, s, list_id, code: str, quantity=2, needed_on=FROM) -> uuid.UUID:
    """A line as the system's build writes it (source 'school', tied to an activity), with no edit row."""
    assert s["activity"], "the configured school has no activity to tie a system-built line to"
    return conn.execute(
        "insert into materials_line (tenant_id, list_id, material_code, unit, quantity, needed_on, activity_code)"
        " values (%s, %s, %s, 'piece', %s, %s, %s) returning id",
        (s["t"], list_id, code, quantity, needed_on, s["activity"]),
    ).fetchone()["id"]


def digest(conn, list_id) -> str:
    return conn.execute("select public.materials_list_digest(%s) as d", (list_id,)).fetchone()["d"]


APPROVE = "insert into materials_list_approval (materials_list_id, approved_by, lines_digest) values (%s, %s, %s)"


def approve(conn, list_id, who, shown: str | None = None) -> dict:
    """An educator approves the lines she was shown (`shown`, by default the list's digest now)."""
    return conn.execute(
        APPROVE + " returning *", (list_id, who, shown if shown is not None else digest(conn, list_id))
    ).fetchone()


def approval_row(conn, s, list_id) -> dict | None:
    return conn.execute(
        "select * from approval_list where tenant_id = %s and kind = 'materials_list' and target = %s",
        (s["t"], str(list_id)),
    ).fetchone()


def approvable(conn, s) -> dict:
    """A frozen teaching fortnight, the class's fortnight list on its dates with two system lines, and an approver:
    a class teacher of the class whose role the school allows (`materials.approve_roles` set for the proof)."""
    f = teaching_fortnight(conn, s)
    freeze(conn, f["id"])
    set_config(conn, s["t"], "materials.approve_roles", ["class_teacher", "coordinator"])
    lid = fortnight_list(conn, s, lo=f["starts_on"], hi=f["ends_on"])
    codes = [item(conn, s, 600), item(conn, s)]
    for c in codes:
        school_line(conn, s, lid, c)
    return {"fortnight": f, "list": lid, "codes": codes, "educator": staff(conn, s, "class_teacher", s["class"])}
