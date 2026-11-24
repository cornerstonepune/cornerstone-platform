"""The K1 week block (ADR 0108): one "F.N n Week w" block of the K1 sheet, exported as CSV, into the K2 loader's `Load`.
Pure: no database, no network, no model. The rows are written by `k2_timetable_sql`, as K2's are.

Rules (every word and pattern is the `timetable.vocabulary` row's `k1` key, never code):
  title      the block's title row gives fortnight n and week w (`k1.title`); its Date row gives the five days
             (`k1.date_format`). Week 1's Monday must be the calendar's start of fortnight n, week 2's that plus 7
             days; else one entry in `conflicts` and nothing else loads.
  days       each date's kind and note come from the Pre-Primary calendar (`read_calendar_csv`), never from the
             Events row. A holiday gets a `school_days` row and no sessions.
  periods    one per time row (`09:30 - 9:50` … `1:25`), numbered from 1 in sheet order; times through `_h24`. A row
             whose five cells are all fixed rows (`fixed_rows`) is fixed and labelled with its Monday cell's first
             line; any other row is labelled with its time as written. A fixed row filled on Monday only is the
             whole week's. Rows that are not time rows (Word of the week, Good deed, Prayer, Theme, Routines,
             Events, Note to parents, Note to educators) are not loaded.
  parts      `parts_of` cuts a cell at lines that are period names (`k1.part_heads`, whole line, any case); each
             part is its lines joined by one space. A part's subject is `_subject_of` its head and the line after
             it only. Its plan key is `plan_key_of_subject`, else the subject code.
  lines      a part with text after its head is one `plan_entry`: the school's words verbatim (whitespace made
             single), numbered per plan key in reading order (Monday first, then down the periods), week A from 1,
             week B from `k1.week_b_first_ord`, `week` "A" or "B". A part that is only its head makes no line.
  sessions   one per teaching day per period. The text is the whole cell (whitespace made single). A blank cell has
             no subject; a fixed cell has no subject and no line; a one-part cell links to its line (key, ord); a
             cell of two or more parts takes its first part's subject and links to no line.
"""

from engine.w2_print import k2_timetable as tt
from engine.w2_print import k2_timetable_load as ld


def parts_of(cell: str, vocab: tt.Vocabulary) -> list[str]:
    """A cell cut at its period-name lines, each part one line."""
    raise NotImplementedError


def read_k1_week_csv(text: str, vocab: tt.Vocabulary, cal: ld.Calendar) -> ld.Load:
    """One K1 week block as CSV -> its fortnight, school days, periods, plan lines and sessions."""
    raise NotImplementedError
