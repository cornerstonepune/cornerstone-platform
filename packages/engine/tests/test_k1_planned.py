"""M6 ticket 2 (#926, ADR 0108): a K1 lesson the school has not planned yet loads as `planned = false`.

Not planned yet = a blank lesson cell, or one whose every line is a period name (`k1.part_heads`). The lesson keeps its
text verbatim and gets no plan line. Variants are made from the committed F.N 10 Week 1 block. Pure: no database."""

import csv
import io
import json
from datetime import date
from pathlib import Path

from engine.w2_print import k1_week as k1
from engine.w2_print import k2_timetable as tt
from engine.w2_print import k2_timetable_load as ld
from engine.w2_print import k2_timetable_sql as sq

REPO = Path(__file__).resolve().parents[3]
WEEK = (REPO / "supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv").read_text()
CAL = REPO / "supabase/seed/k2_tabs_2026_11_04/calendar.csv"
VOCAB = tt.Vocabulary.from_config(
    next(
        c["value"]
        for c in json.loads((REPO / "supabase/seed/config.json").read_text())["config"]
        if c["key"] == "timetable.vocabulary"
    )
)
MONDAY = date(2026, 11, 23)


def loaded(cells: dict[str, str] | None = None) -> ld.Load:
    """The block with Monday's cell in each named time row replaced."""
    rows = list(csv.reader(io.StringIO(WEEK)))
    for first, words in (cells or {}).items():
        next(r for r in rows if r[0].strip().startswith(first))[1] = words
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(rows)
    return k1.read_k1_week_csv(out.getvalue(), VOCAB, ld.read_calendar_csv(CAL.read_text(), VOCAB))


def monday(load: ld.Load, start: str) -> ld.Session:
    return next(s for s in load.sessions if s.day == MONDAY and s.start == start)


def test_the_week_as_the_school_filled_it_is_all_planned():
    load = loaded()
    assert len(load.sessions) == 44 and all(s.planned for s in load.sessions)


def test_a_cell_that_is_only_its_period_name_is_not_planned_yet_and_keeps_its_words():
    load = loaded({"11:50": "Story. P1\n\n"})
    s = monday(load, "11:50")
    assert s.planned is False
    assert (s.text, s.key, s.ord) == ("Story. P1", None, None)
    assert all(e.text != "Story. P1" for e in load.plan_entries)


def test_a_blank_cell_is_not_planned_yet_and_stays_blank():
    s = monday(loaded({"12:40": ""}), "12:40")
    assert s.planned is False
    assert (s.text, s.subject, s.key, s.ord) == ("", None, None, None)


def test_a_cell_of_two_period_names_and_nothing_else_is_not_planned_yet():
    s = monday(loaded({"12:15": "Music (Guest)\n\nRhymes. P2"}), "12:15")
    assert s.planned is False and s.text == "Music (Guest) Rhymes. P2"


def test_words_after_a_period_name_or_without_one_and_the_fixed_rows_are_planned():
    load = loaded(
        {"12:40": "Proper Use Of Dustbin\nwith a song", "12:15": "Music (Guest)\n\nRhymes. P2\nThe Sun"}
    )
    assert monday(load, "12:40").planned is True
    assert monday(load, "12:15").planned is True
    assert monday(load, "10:15").planned is True  # Academic 1 / Math / Sports Day Practice
    assert all(s.planned for s in load.sessions if s.start in ("09:30", "11:00", "13:25"))


def test_the_writer_writes_each_lesson_s_own_planned_and_not_a_fixed_true():
    target = ld.Target("K1", "A", "2026-27", "cornerstone", "fn10_w1.csv")
    planned = next(q for q in sq.statements(loaded(), target) if q.startswith("insert into session"))
    unplanned = next(
        q
        for q in sq.statements(loaded({"11:50": "Story. P1"}), target)
        if q.startswith("insert into session")
    )
    assert "false" not in planned
    assert unplanned.count("false") == 1
