"""CP-6 item 6: no hard-coded "frozen" remains in the engine or the website.

Search: every tracked source file of `packages/engine/engine` and `apps/web` (tests, e2e and fixtures excluded; git's
list, so no node_modules) holds no literal frozen-is-false (`"frozen": False`, `frozen=False`, `frozen: false`, ...).
Behaviour: `/timetable/day`, `week` and `period` say `frozen: true` for a date in a frozen fortnight and `false` for a
date in no fortnight, read from the fortnight's state (`fortnight_cycle.is_frozen`; the fortnight is frozen with
`fortnight_cycle.move`). Reuses `world` and `call` from test_k2_day.py (the school's own Fortnight 10 text).
"""

import re
import subprocess
import uuid
from pathlib import Path

from engine.core import db
from tests.test_k2_day import call, conn, world  # noqa: F401

ROOT = Path(__file__).resolve().parents[3]
LITERAL = re.compile(r"""\bfrozen["']?\s*[:=]\s*(False|false)\b""")
NOT_SOURCE = re.compile(r"(^|/)(tests?|e2e|__tests__|fixtures?)/|\.(test|spec)\.[cm]?[jt]sx?$")
SOURCE = re.compile(r"\.(py|[cm]?[jt]sx?)$")


def test_6_no_literal_frozen_false_in_engine_or_website_source():
    files = subprocess.run(
        ["git", "ls-files", "packages/engine/engine", "apps/web"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    assert files, "git listed no engine or website files"
    hits = []
    for f in files:
        if not SOURCE.search(f) or NOT_SOURCE.search(f):
            continue
        for n, line in enumerate((ROOT / f).read_text(errors="replace").splitlines(), 1):
            if LITERAL.search(line):
                hits.append(f"{f}:{n}: {line.strip()}")
    assert not hits, "hard-coded frozen remains:\n" + "\n".join(hits)


def _freeze_fortnight_of(conn, klass, day: str) -> None:
    f = db.one(
        conn,
        "select f.id, f.tenant_id from fortnight f join school_class c on c.academic_year_id = f.academic_year_id"
        " and c.tenant_id = f.tenant_id where c.id = %s and f.kind = 'teaching' and %s::date between f.starts_on"
        " and f.ends_on",
        (klass, day),
    )
    conn.execute(
        "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')"
        " on conflict (fortnight_id) do nothing",
        (f["tenant_id"], f["id"]),
    )
    from engine.w2_print import fortnight_cycle

    fortnight_cycle.move(conn, f["id"], "frozen", f"staff:{uuid.uuid4()}")


def test_6_day_week_and_period_say_frozen_from_the_database(world):
    klass = world["k"]["class"]
    assert call(world, "day", day="2026-11-23").json()["frozen"] is False, "frozen before anything was frozen"
    _freeze_fortnight_of(world["conn"], klass, "2026-11-23")
    day = call(world, "day", day="2026-11-23").json()
    assert day["frozen"] is True
    assert call(world, "week", week_of="2026-11-23").json()["frozen"] is True
    pid = day["periods"][0]["period_id"]
    assert call(world, "period", class_id=klass, day="2026-11-23", period_id=pid).json()["frozen"] is True


def test_6_a_date_in_no_fortnight_is_not_frozen(world):
    c, klass = world["conn"], world["k"]["class"]
    _freeze_fortnight_of(c, klass, "2026-11-23")
    campus = db.one(c, "select campus_id from school_class where id = %s", (klass,))["campus_id"]
    c.execute(
        "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, '2026-12-08', 'teaching')"
        " on conflict do nothing",
        (world["k"]["tenant"], campus),
    )
    assert call(world, "day", day="2026-12-08").json()["frozen"] is False
