"""Hidden tests for #926 (ADR 0108): the `session` row on a database says what the lesson's `planned` says. A K1 lesson
that is blank or only its period name is `planned = false`; every K2 lesson stays planned. Each test works in a
transaction that is rolled back, on a class made for the test."""

import csv
import io
import json
import os
import uuid
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from engine.core import db
from engine.w2_print import k1_week as k1
from engine.w2_print import k2_timetable as tt
from engine.w2_print import k2_timetable_load as ld
from engine.w2_print import k2_timetable_sql as sq
from tests.voice_rows import a_k2_class

REPO = Path(__file__).resolve().parents[4]
WEEK = (REPO / "supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv").read_text()
K2 = REPO / "supabase/seed/k2_tabs_2026_11_04"
VOCAB = tt.Vocabulary.from_config(
    next(
        c["value"]
        for c in json.loads((REPO / "supabase/seed/config.json").read_text())["config"]
        if c["key"] == "timetable.vocabulary"
    )
)
CAL = ld.read_calendar_csv((K2 / "calendar.csv").read_text(), VOCAB)
MONDAY = date(2026, 11, 23)

needs_db = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def a_k1_target(conn) -> tuple[str, ld.Target]:
    t = conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    year = conn.execute(
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2031-32', '2026-01-01',"
        " '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,),
    ).fetchone()["id"]
    section = f"T{uuid.uuid4().hex[:6]}"
    klass = conn.execute(
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K1', %s) returning id",
        (t, campus, year, section),
    ).fetchone()["id"]
    return klass, ld.Target("K1", section, "2031-32", db.tenant_slug(), "fn10_w1.csv")


def k1_load() -> ld.Load:
    """The block with two of Monday's lessons not planned yet: one only its period name, one blank."""
    rows = list(csv.reader(io.StringIO(WEEK)))
    for first, words in (("11:50", "Story. P1\n"), ("12:40", "")):
        next(r for r in rows if r[0].strip().startswith(first))[1] = words
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(rows)
    return k1.read_k1_week_csv(out.getvalue(), VOCAB, CAL)


def rows(conn, klass) -> dict[tuple[date, str], tuple[bool, str | None]]:
    got = conn.execute(
        "select d.on_date, to_char(p.starts_at, 'HH24:MI') st, s.planned, s.text from session s"
        " join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id"
        " where s.school_class_id = %s",
        (klass,),
    ).fetchall()
    return {(r["on_date"], r["st"]): (r["planned"], r["text"]) for r in got}


@needs_db
def test_a_k1_lesson_not_planned_yet_is_a_row_that_says_planned_false(conn):
    klass, target = a_k1_target(conn)
    load = k1_load()
    assert sq.apply(conn, load, target)["session"] == 44
    got = rows(conn, klass)
    assert got[(MONDAY, "11:50")] == (False, "Story. P1")
    assert got[(MONDAY, "12:40")] == (False, "")
    assert sorted(key for key, (planned, _) in got.items() if not planned) == [
        (MONDAY, "11:50"),
        (MONDAY, "12:40"),
    ]
    assert got[(MONDAY, "10:15")][0] is True
    assert {k: p for k, (p, _) in got.items()} == {(s.day, s.start): s.planned for s in load.sessions}


@needs_db
def test_k2_lessons_still_load_planned_and_the_writer_takes_planned_from_the_lesson_not_its_text(conn):
    k = a_k2_class(conn)
    section = conn.execute("select section from school_class where id = %s", (k["class"],)).fetchone()[
        "section"
    ]
    frame = ld.read_frame_csv(
        (K2 / "frame.csv").read_text(), VOCAB, json.loads((K2 / "frame_spans.json").read_text())
    )
    load = ld.build(
        frame, ld.read_planner_csv((K2 / "planner.csv").read_text(), VOCAB), CAL, VOCAB, 10, 10, None
    )
    target = ld.Target("K2", section, "2031-32", db.tenant_slug())
    sq.apply(conn, load, target)
    got = rows(conn, k["class"])
    assert got and all(planned for planned, _ in got.values())

    # one lesson marked not planned on a fresh class: the writer writes exactly that one false, whatever its text
    k2 = a_k2_class(conn)
    section2 = conn.execute("select section from school_class where id = %s", (k2["class"],)).fetchone()[
        "section"
    ]
    one = load.sessions[0]
    marked = replace(load, sessions=[replace(one, planned=False), *load.sessions[1:]])
    sq.apply(conn, marked, ld.Target("K2", section2, "2031-32", db.tenant_slug()))
    got2 = rows(conn, k2["class"])
    assert [key for key, (planned, _) in got2.items() if not planned] == [(one.day, one.start)]
