"""`engine timetable draft` (CP-7): one line per class, never a name. The database decides rolled forward or waiting; the
locked proofs of the scope (specs/CP-7/proofs) are the long form. Each test works in a transaction that is rolled back,
in a made-up 2033 year, with a made-up class."""

import re
import uuid

import pytest
from typer.testing import CliRunner

from engine.core import db
from engine.w2_print import cli_timetable
from engine.w2_print import fortnight_cycle as fc

WHO = f"staff:{uuid.uuid4()}"


@pytest.fixture
def world():
    with db.connect() as c:
        t = db.one(c, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        campus = db.one(c, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))[
            "id"
        ]
        year = db.one(
            c,
            "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2033-34', '2033-06-01',"
            " '2034-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
            (t,),
        )["id"]
        section = f"T{uuid.uuid4().hex[:5]}"
        klass = db.one(
            c,
            "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
            " values (%s, %s, %s, 'K2', %s) returning id",
            (t, campus, year, section),
        )["id"]
        period = db.one(
            c,
            "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label) values (%s, 'K2', 98,"
            " '05:51', '05:52', 'CP-7 test period') on conflict (tenant_id, grade_code, starts_at) do update"
            " set label = period.label returning id",
            (t,),
        )["id"]
        for week in "AB":
            for day in range(1, 6):
                c.execute(
                    "insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind, text,"
                    " valid_from) values (%s, %s, %s, %s, %s, 'subject', 'Test lesson', '2033-06-01')",
                    (t, klass, period, week, day),
                )
        fid = db.one(
            c,
            "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
            " values (%s, %s, 77, 'teaching', '2033-09-05', '2033-09-18') returning id",
            (t, year),
        )["id"]
        c.execute(
            "insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'frozen')", (t, fid)
        )
        yield c, section
        c.rollback()


def test_a_class_with_nothing_before_it_waits_for_approval(world):
    c, section = world
    rows = fc.draft_classes(c, "2033-34", 77, WHO)
    assert [(r["grade"], r["section"], r["state"]) for r in rows] == [("K2", section, "draft")]
    assert fc.draft_classes(c, "2033-34", 77, WHO) == rows  # again with nothing changed: the same answer


def test_a_fortnight_that_is_not_there_is_refused(world):
    c, _ = world
    with pytest.raises(fc.CycleError):
        fc.draft_classes(c, "2033-34", 78, WHO)


def test_the_command_prints_a_line_per_class_and_a_dry_run_says_so(world, monkeypatch):
    c, section = world
    monkeypatch.setattr(cli_timetable, "_connect", lambda stack: c)
    out = CliRunner().invoke(
        cli_timetable.timetable_app, ["draft", "--fortnight", "77", "--year", "2033-34", "--by", WHO]
    )
    assert out.exit_code == 0, out.output
    assert f"K2 {section}: waiting for approval" in out.output and "dry run" in out.output
    assert datetime_free(out.output)


def test_a_fortnight_not_yet_frozen_is_refused_with_its_reason(world, monkeypatch):
    c, _ = world
    c.execute(
        "update fortnight_cycle set state = 'planning' where fortnight_id = (select id from fortnight where number = 77"
        " and academic_year_id = (select id from academic_year where label = '2033-34' limit 1))"
    )
    monkeypatch.setattr(cli_timetable, "_connect", lambda stack: c)
    out = CliRunner().invoke(
        cli_timetable.timetable_app, ["draft", "--fortnight", "77", "--year", "2033-34", "--by", WHO]
    )
    assert out.exit_code == 1 and "cannot be drafted" in out.output and "Nothing was written" in out.output


def datetime_free(text: str) -> bool:
    """A line about a class carries no date or time of day, only its grade, section and what became of it."""
    return not any(
        re.search(r"\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}", ln) for ln in text.splitlines() if ln.startswith("  ")
    )


def test_the_command_does_not_print_who_drafted(world, monkeypatch):
    c, _ = world
    monkeypatch.setattr(cli_timetable, "_connect", lambda stack: c)
    args = ["draft", "--fortnight", "77", "--year", "2033-34", "--by", WHO]
    out = CliRunner().invoke(cli_timetable.timetable_app, args)
    assert WHO not in out.output  # who drafted is kept in the database, not printed
