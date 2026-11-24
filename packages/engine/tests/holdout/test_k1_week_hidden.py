"""Hidden tests for #925 (ADR 0108): week 2 numbering, a block whose dates disagree with the calendar, a Meal row filled
on Monday only, a cell with no period name, and loading twice on a K1 class. Variants are made from the committed
F.N 10 Week 1 block; the database test works in a transaction that is rolled back, on a K1 class made for the test."""

import csv
import io
import json
import os
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest

from engine.core import db
from engine.w2_print import k1_week as k1
from engine.w2_print import k2_timetable as tt
from engine.w2_print import k2_timetable_load as ld
from engine.w2_print import k2_timetable_sql as sq

REPO = Path(__file__).resolve().parents[4]
WEEK = (REPO / "supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv").read_text()
CAL = REPO / "supabase/seed/k2_tabs_2026_11_04/calendar.csv"
VOCAB = tt.Vocabulary.from_config(
    next(
        c["value"]
        for c in json.loads((REPO / "supabase/seed/config.json").read_text())["config"]
        if c["key"] == "timetable.vocabulary"
    )
)


def calendar() -> ld.Calendar:
    return ld.read_calendar_csv(CAL.read_text(), VOCAB)


def edited(change) -> str:
    rows = list(csv.reader(io.StringIO(WEEK)))
    change(rows)
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(rows)
    return out.getvalue()


def row(rows, first: str) -> list[str]:
    return next(r for r in rows if r[0].strip().startswith(first))


def as_week_two(rows, shift: int = 7, title: str = "Week 2"):
    rows[0][0] = rows[0][0].replace("Week 1", title)
    dates = row(rows, "Date")
    for i in range(1, 6):
        d = date(2026, 11, 22 + i) + timedelta(days=shift)
        dates[i] = d.strftime("%d.%m.%y")


def test_week_two_is_week_b_and_numbers_its_lines_from_the_vocabulary_row():
    load = k1.read_k1_week_csv(edited(as_week_two), VOCAB, calendar())
    assert load.conflicts == [] and load.fortnights == [(10, date(2026, 11, 23), date(2026, 12, 6))]
    assert [d for d, _, _ in load.school_days] == [date(2026, 11, 30) + timedelta(days=i) for i in range(5)]
    first = VOCAB.k1["week_b_first_ord"]
    assert load.plan_entries and all(e.week == "B" and e.ord >= first for e in load.plan_entries)
    for key in {e.key for e in load.plan_entries}:
        assert min(e.ord for e in load.plan_entries if e.key == key) == first
    linked = [s for s in load.sessions if s.ord is not None]
    assert linked and all(s.ord >= first for s in linked)


def test_week_one_that_is_dated_like_week_two_is_a_conflict_and_loads_nothing():
    load = k1.read_k1_week_csv(edited(lambda rows: as_week_two(rows, title="Week 1")), VOCAB, calendar())
    assert [n for n, _ in load.conflicts] == [10]
    assert (load.fortnights, load.periods, load.plan_entries, load.sessions, load.school_days) == (
        [],
        [],
        [],
        [],
        [],
    )


def test_a_meal_row_filled_on_monday_only_is_the_whole_week_s():
    def monday_only(rows):
        meal = row(rows, "11:00")
        meal[2:6] = ["", "", "", ""]

    load = k1.read_k1_week_csv(edited(monday_only), VOCAB, calendar())
    meal = next(p for p in load.periods if p.start == "11:00")
    assert meal.fixed and meal.label == "Meal + Washroom"
    at_meal = [s for s in load.sessions if s.start == "11:00"]
    assert len(at_meal) == 4 and all(s.text == "Meal + Washroom" and s.key is None for s in at_meal)


def test_a_cell_with_no_period_name_is_one_part_and_one_line():
    words = "Proper Use Of Dustbin\nwith a song"

    def no_head(rows):
        row(rows, "12:40")[3] = words

    assert k1.parts_of(words, VOCAB) == ["Proper Use Of Dustbin with a song"]
    load = k1.read_k1_week_csv(edited(no_head), VOCAB, calendar())
    s = next(s for s in load.sessions if s.day == date(2026, 11, 25) and s.start == "12:40")
    assert s.text == "Proper Use Of Dustbin with a song" and s.key is not None
    line = next(e for e in load.plan_entries if (e.key, e.ord) == (s.key, s.ord))
    assert line.text == "Proper Use Of Dustbin with a song"


def test_a_part_that_is_only_its_period_name_makes_no_line():
    def head_only(rows):
        row(rows, "11:50")[1] = "Story. P1\n\n"

    load = k1.read_k1_week_csv(edited(head_only), VOCAB, calendar())
    s = next(s for s in load.sessions if s.day == date(2026, 11, 23) and s.start == "11:50")
    assert s.text == "Story. P1" and (s.key, s.ord) == (None, None)
    assert all(e.text != "Story. P1" for e in load.plan_entries)


needs_db = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@needs_db
def test_loading_twice_on_a_k1_class_adds_nothing_the_second_time(conn):
    t = conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    year = conn.execute(
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2031-32', '2026-01-01',"
        " '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,),
    ).fetchone()["id"]
    section = f"T{uuid.uuid4().hex[:6]}"
    conn.execute(
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K1', %s)",
        (t, campus, year, section),
    )
    load = k1.read_k1_week_csv(WEEK, VOCAB, calendar())
    target = ld.Target("K1", section, "2031-32", db.tenant_slug(), "fn10_w1.csv")
    first = sq.apply(conn, load, target)
    assert first["session"] == len(load.sessions) == 44
    assert first["plan_entry"] == len(load.plan_entries)
    assert sq.apply(conn, load, target) == {k: 0 for k in first}
    k1_periods = conn.execute(
        "select count(*) n from period where tenant_id = %s and grade_code = 'K1'", (t,)
    ).fetchone()["n"]
    assert k1_periods >= 11
