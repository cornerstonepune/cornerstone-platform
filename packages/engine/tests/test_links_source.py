"""CP-48: every curriculum link says where it came from (school | machine | person), migration 20270128130000.
The school's sheets load as 'school', the machine's applied proposals as 'machine', a row added by hand stays 'person'.
Each test rolls back."""

import os
from pathlib import Path

import pytest

from engine.w1_bank import map_ledger
from tests.test_map_ledger import _band, _made, _staff
from tests.test_map_ledger import conn as conn  # the fixture

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase/migrations/20270128130000_cp48_links_from_the_school.sql"
)
TABLES = ("activity_skill", "activity_objective", "learning_objective_skill", "learning_objective")


def test_the_school_sheets_load_as_school_and_nothing_loaded_reads_person(conn):
    for t in TABLES:
        assert conn.execute(f"select count(*) as n from {t} where source = 'person'").fetchone()["n"] == 0, t
    assert (
        conn.execute("select count(*) as n from activity_skill where source = 'school'").fetchone()["n"] > 0
    )


def test_a_row_added_by_hand_is_a_persons(conn):
    t = _band(conn)
    conn.execute("delete from activity_skill where tenant_id = %s and activity_code = 'ACT-KX-0101'", (t,))
    conn.execute(
        "insert into activity_skill (tenant_id, activity_code, skill_code) values (%s, 'ACT-KX-0101', 'NUM.CNT.01')",
        (t,),
    )
    assert (
        conn.execute(
            "select source from activity_skill where tenant_id = %s and activity_code = 'ACT-KX-0101'", (t,)
        ).fetchone()["source"]
        == "person"
    )
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal)"
        " values (%s, 'LO-KX-HAND-1', 'KX', 'Maths', 'Maths', 'The children will count to five by hand.', '')",
        (t,),
    )
    assert (
        conn.execute(
            "select source from learning_objective where tenant_id = %s and code = 'LO-KX-HAND-1'", (t,)
        ).fetchone()["source"]
        == "person"
    )


def test_a_machine_objective_and_its_link_are_the_machines(conn, tmp_path):
    t = _band(conn)
    lead = _staff(conn, t)
    map_ledger.record(conn, t, _made(conn, tmp_path, t), lead)
    map_ledger.apply(conn, t, lead, write=True, kind="objective", fill=True)
    row = conn.execute(
        "select ao.source as link, l.source as objective from activity_objective ao join learning_objective l"
        " on l.tenant_id = ao.tenant_id and l.code = ao.lo_code where ao.tenant_id = %s and ao.activity_code = 'ACT-KX-0102'",
        (t,),
    ).fetchone()
    assert (row["link"], row["objective"]) == ("machine", "machine")


def test_the_migration_relabels_what_the_loaders_wrote_keeps_the_machines_and_twice_is_the_same(conn):
    conn.execute(
        "update activity_skill set source = 'person' where (tenant_id, activity_code, skill_code) in"
        " (select tenant_id, activity_code, skill_code from activity_skill where source = 'school' limit 3)"
    )
    conn.execute(
        "update learning_objective set source = 'person' where code in (select code from learning_objective limit 2)"
    )
    machine = conn.execute("select count(*) as n from activity_skill where source = 'machine'").fetchone()[
        "n"
    ]
    conn.execute(MIGRATION.read_text())
    conn.execute(MIGRATION.read_text())
    assert (
        conn.execute("select count(*) as n from activity_skill where source = 'person'").fetchone()["n"] == 0
    )
    assert (
        conn.execute("select count(*) as n from learning_objective where source = 'person'").fetchone()["n"]
        == 0
    )
    assert (
        conn.execute("select count(*) as n from activity_skill where source = 'machine'").fetchone()["n"]
        == machine
    )
    conn.execute("savepoint s")
    with pytest.raises(Exception, match="source_check"):
        conn.execute("update activity_skill set source = 'guess' where source = 'school'")
    conn.execute("rollback to savepoint s")
