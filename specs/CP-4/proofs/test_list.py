"""CP-4 item 1: every table is listed in the repository (access_table, filled by a migration) as child data or
school-wide, with a one-line reason for each school-wide table; the list covers every table in the database, both ways;
and nothing that plainly holds a child's data is called school-wide."""

import json

import psycopg

from conftest import ROOT, base_tables, coverage_gaps

# Exemptions the design names, with its reasons: a paper's blueprint, and the school's structure.
EXEMPT = {"public.sheet_template", "public.school_class", "public.campus", "public.academic_year", "public.role"}
# Child data held in tables with no child_id column (design, "What exists").
CHILD_FAMILY = {"public.capture", "public.item_result", "public.narrative_observation", "public.gold",
                "public.page_choice", "public.capture_page", "public.mistake_named", "public.class_card"}


def test_1_every_table_is_listed_and_every_row_is_a_table(conn):
    unlisted, missing = coverage_gaps(conn)
    assert not unlisted, f"{len(unlisted)} tables are in no access_table row: {sorted(unlisted)}"
    assert not missing, f"access_table rows name tables that do not exist: {sorted(missing)}"


def test_1_a_row_naming_a_missing_table_is_caught(conn):
    assert conn.execute("select to_regclass('public.access_table') is not null").fetchone()[0], \
        "public.access_table does not exist"
    try:
        with conn.transaction(force_rollback=True):
            conn.execute("insert into public.access_table (schema_name, table_name, data_class, reason) "
                         "values ('public', 'cp4_no_such_table', 'school_wide', 'proof row')")
            _, missing = coverage_gaps(conn)
            assert "public.cp4_no_such_table" in missing
    except psycopg.errors.IntegrityError:
        return  # the database refuses a row naming no table outright: stronger than the coverage check


def test_1_every_row_is_child_data_or_school_wide(conn):
    bad = conn.execute("select schema_name, table_name, data_class from public.access_table "
                       "where data_class is null or data_class not in ('child_data', 'school_wide')").fetchall()
    assert not bad, f"rows not sorted into child_data or school_wide: {bad}"


def test_1_school_wide_rows_carry_a_one_line_reason(conn):
    bad = conn.execute("select schema_name || '.' || table_name from public.access_table "
                       "where data_class = 'school_wide' and (reason is null or btrim(reason) = '' "
                       "or reason ~ '[\\r\\n]')").fetchall()
    assert not bad, f"school-wide tables without a one-line reason: {[r[0] for r in bad]}"
    n = conn.execute("select count(*) from public.access_table where data_class = 'school_wide'").fetchone()[0]
    assert n > 0, "no table is school-wide: the skill registry, curriculum, plan and timetable should be"


def test_1_child_data_is_not_called_school_wide(conn):
    register = json.loads((ROOT / "supabase" / "seed" / "data_register.json").read_text())["data_register"]
    from_register = {t for entry in register for t in entry["tables"]}
    tables = base_tables(conn)
    with_child_id = {r[0] for r in conn.execute(
        "select table_schema || '.' || table_name from information_schema.columns "
        "where table_schema in ('public', 'pii') and column_name = 'child_id'")} & tables
    derived = (from_register | with_child_id | CHILD_FAMILY) & tables
    derived = {t for t in derived if t not in EXEMPT and not t.startswith("public.access_")}
    assert {"public.capture", "public.item_result", "public.child", "public.evidence_event"} <= derived
    rows = dict(conn.execute("select schema_name || '.' || table_name, data_class from public.access_table").fetchall())
    wrong = sorted(t for t in derived if rows.get(t) != "child_data")
    assert not wrong, f"tables holding a child's data that are not listed as child_data: {wrong}"
