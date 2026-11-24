"""M6 ticket 1 (#925, ADR 0108): one K1 week block of the school's sheet into the K2 loader's rows.

Input is F.N 10 Week 1 exactly as the Sheets connector returned it on 2026-11-24 (`supabase/seed/k1_tabs_2026_11_24/`,
sheet rows 349-372, merged cells filled across what they cover; no child data) and the Pre-Primary calendar tab the K2
load uses. Pure: no database."""

import json
from datetime import date
from pathlib import Path

from typer.testing import CliRunner

from engine.w2_print import k1_week as k1
from engine.w2_print import k2_timetable as tt
from engine.w2_print import k2_timetable_load as ld

REPO = Path(__file__).resolve().parents[3]
WEEK = REPO / "supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv"
CAL = REPO / "supabase/seed/k2_tabs_2026_11_04/calendar.csv"
VOCAB = tt.Vocabulary.from_config(
    next(
        c["value"]
        for c in json.loads((REPO / "supabase/seed/config.json").read_text())["config"]
        if c["key"] == "timetable.vocabulary"
    )
)


def loaded() -> ld.Load:
    return k1.read_k1_week_csv(WEEK.read_text(), VOCAB, ld.read_calendar_csv(CAL.read_text(), VOCAB))


def at(load: ld.Load, day: date, start: str) -> ld.Session:
    return next(s for s in load.sessions if s.day == day and s.start == start)


def test_the_block_is_fortnight_ten_week_a_with_its_eleven_periods_in_sheet_order():
    load = loaded()
    assert load.conflicts == []
    assert load.fortnights == [(10, date(2026, 11, 23), date(2026, 12, 6))]
    assert [p.start for p in load.periods] == [
        "09:30", "09:50", "10:15", "10:40", "11:00", "11:50", "12:15", "12:40", "13:10", "13:20", "13:25",
    ]  # fmt: skip
    assert [p.ord for p in load.periods] == list(range(1, 12))
    fixed = {p.start: p.label for p in load.periods if p.fixed}
    assert fixed == {
        "09:30": "Settling + Outdoor free play", "09:50": "Circle Time", "11:00": "Meal + Washroom",
        "13:10": "Reflection +", "13:20": "Dispersal Ritual", "13:25": "Boarding the bus",
    }  # fmt: skip


def test_the_holiday_comes_from_the_calendar_and_has_no_lessons_though_its_cells_are_filled():
    load = loaded()
    assert (date(2026, 11, 24), "holiday", "Guru Nanak Jayanti") in load.school_days
    assert [d for d, _, _ in load.school_days] == [date(2026, 11, d) for d in (23, 24, 25, 26, 27)]
    assert not [s for s in load.sessions if s.day == date(2026, 11, 24)]
    assert len(load.sessions) == 4 * 11
    assert {s.fortnight for s in load.sessions} == {10}


def test_a_one_part_cell_links_its_own_line_in_the_school_s_words():
    load = loaded()
    monday = at(load, date(2026, 11, 23), "10:15")
    assert (monday.subject, monday.key, monday.ord) == ("math", "math", 1)
    line = next(e for e in load.plan_entries if (e.key, e.ord) == ("math", 1))
    assert (line.fortnight, line.week, line.text) == (10, "A", "Academic 1 Math Sports Day Practice")
    assert monday.text == "Academic 1 Math Sports Day Practice"


def test_a_two_part_cell_is_cut_at_its_period_names_and_links_no_line():
    cell = "Extracurricular\nMusic & Dance\nAcademic 2\nMath\nIntroduction to number  tracing  (5)\n\nC.W Pg. no 29"
    assert k1.parts_of(cell, VOCAB) == [
        "Extracurricular Music & Dance",
        "Academic 2 Math Introduction to number tracing (5) C.W Pg. no 29",
    ]
    wednesday = at(loaded(), date(2026, 11, 25), "12:15")
    assert (wednesday.key, wednesday.ord) == (None, None)
    assert wednesday.subject == tt._subject_of("Extracurricular Music & Dance", VOCAB)


def test_every_line_is_the_school_s_own_words_and_week_a_numbers_from_one_per_key():
    load = loaded()
    cells = " | ".join(" ".join(c.split()) for c in WEEK.read_text().split('"'))
    assert load.plan_entries and all(e.text in cells for e in load.plan_entries)
    assert all(e.week == "A" and e.fortnight == 10 for e in load.plan_entries)
    for key in {e.key for e in load.plan_entries}:
        assert sorted(e.ord for e in load.plan_entries if e.key == key) == list(
            range(1, 1 + sum(e.key == key for e in load.plan_entries))
        )
    texts = " ".join(s.text for s in load.sessions)
    for not_loaded in (
        "Honest",
        "Ek Onkar",
        "Germination",
        "GURU NANAK",
        "Home engagement",
        "Health and Hygiene",
    ):
        assert not_loaded not in texts and all(not_loaded not in e.text for e in load.plan_entries)


def test_no_school_word_or_pattern_is_written_in_the_reader():
    source = (REPO / "packages/engine/engine/w2_print/k1_week.py").read_text().split('"""', 2)[2]
    for word in ("Academic", "Extracurricular", "Rhymes", "Story", "Music", "Week", "F.N", "%d.%m"):
        assert word not in source


def test_the_dry_run_prints_counts_and_never_the_school_s_text(tmp_path, monkeypatch):
    from engine.cli import app

    monkeypatch.delenv("DATABASE_URL", raising=False)
    out = tmp_path / "rows.sql"
    run = CliRunner().invoke(
        app,
        [
            "timetable",
            "load-k1",
            "--week",
            str(WEEK),
            "--calendar",
            str(CAL),
            "--section",
            "A",
            "--grade",
            "K1",
            "--sql",
            str(out),
        ],
    )
    assert run.exit_code == 0, run.output
    assert "44" in run.output
    for school_text in ("Sports Day", "Math", "Fati", "Clay", "Guru Nanak", "GURU NANAK"):
        assert school_text not in run.output
    sql = out.read_text()
    assert "insert into session" in sql and "'K1'" in sql
    refused = CliRunner().invoke(
        app,
        [
            "timetable",
            "load-k1",
            "--week",
            str(WEEK),
            "--calendar",
            str(CAL),
            "--section",
            "A",
            "--grade",
            "K1",
            "--apply",
        ],
    )
    assert refused.exit_code != 0 and "no database" in refused.output.lower()
