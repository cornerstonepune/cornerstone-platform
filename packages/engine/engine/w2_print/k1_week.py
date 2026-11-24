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

import re
from datetime import date, datetime, timedelta

from engine.w2_print import k2_timetable as tt
from engine.w2_print import k2_timetable_load as ld


def _cut(cell: str, vocab: tt.Vocabulary) -> list[list[str]]:
    heads = re.compile("|".join(f"(?:{h})" for h in vocab.k1["part_heads"]), re.I)
    parts: list[list[str]] = []
    for raw in cell.split("\n"):
        line = tt._one_line(raw)
        if line and (not parts or heads.fullmatch(line)):
            parts.append([])
        if line:
            parts[-1].append(line)
    return parts


def _unplanned(cell: str, vocab: tt.Vocabulary) -> bool:
    heads = re.compile("|".join(f"(?:{h})" for h in vocab.k1["part_heads"]), re.I)
    return all(heads.fullmatch(tt._one_line(x)) for x in cell.split("\n") if tt._one_line(x))


def parts_of(cell: str, vocab: tt.Vocabulary) -> list[str]:
    """A cell cut at its period-name lines, each part one line."""
    return [" ".join(p) for p in _cut(cell, vocab)]


def _header(rows: list[list[str]], vocab: tt.Vocabulary, cal: ld.Calendar, load: ld.Load):
    """The block's fortnight, week and five days; else one conflict on `load` and None."""
    k1 = vocab.k1
    title = next((m for r in rows if (m := re.search(k1["title"], r[0]))), None)
    days: list[date] = []
    for r in rows:
        try:
            days = [datetime.strptime(c.strip(), k1["date_format"]).date() for c in ld._cells(r, 1, 6)]
            break
        except ValueError:
            continue
    if not title or not days:
        load.conflicts.append((0, "no title row or no five dates in this block: nothing loaded"))
        return None
    n, w = int(title.group(1)), int(title.group(2))
    if n not in cal.fortnights:
        load.conflicts.append((n, "no dates for this fortnight in the calendar: nothing loaded"))
        return None
    start, end = cal.fortnights[n]
    if days[0] != start + timedelta(days=7 * (w - 1)):
        load.conflicts.append((n, f"week {w} starts {days[0]}, the calendar says {start}: nothing loaded"))
        return None
    load.fortnights.append((n, start, end))
    for d in days:
        cd = cal.days.get(d, ld.TEACHING)
        load.school_days.append((d, cd.kind, cd.note))
    return n, w, days


def _lines(raw: str, n: int, w: int, ords: dict[str, int], vocab: tt.Vocabulary, load: ld.Load):
    """One lesson cell's plan lines; its subject, and the (key, ord) of its line when it has one part."""
    parts = _cut(raw, vocab)
    key, at = None, None
    for part in parts:
        sub = tt._subject_of(" ".join(part[:2]), vocab)
        if sub and len(part) > 1:
            k = vocab.plan_key_of_subject.get(sub, sub)
            ords[k] = ords.get(k, int(vocab.k1["week_b_first_ord"]) - 1 if w > 1 else 0) + 1
            load.plan_entries.append(ld.PlanEntry(n, k, ords[k], " ".join(part), "", "A" if w == 1 else "B"))
            if len(parts) == 1:
                key, at = k, ords[k]
    return tt._subject_of(" ".join(parts[0][:2]), vocab), key, at


def _block(rows: list[list[str]], vocab: tt.Vocabulary) -> list[tuple[ld.Period, list[str], list[str]]]:
    """Each time row: its period, its five cells one line each, and as written."""
    time_row = r"^\s*(\d{1,2}):(\d{2})\s*(?:-\s*(\d{1,2}):(\d{2}))?\s*$"
    block = []
    for r in rows:
        if m := re.match(time_row, r[0]):
            h, mi, h2, mi2 = m.groups()
            raw = ld._cells(r, 1, 6)
            ones = [tt._one_line(c) for c in raw]
            fixed = bool(ones[0]) and all(not c or tt._subject_of(c, vocab) is None for c in ones)
            label = next(x.strip() for x in raw[0].split("\n") if x.strip()) if fixed else tt._one_line(r[0])
            end_at = ld._h24(f"{int(h2):02d}:{mi2}", vocab) if h2 else ""
            period = ld.Period(len(block) + 1, ld._h24(f"{int(h):02d}:{mi}", vocab), end_at, label, fixed)
            block.append((period, ones, raw))
    return block


def read_k1_week_csv(text: str, vocab: tt.Vocabulary, cal: ld.Calendar) -> ld.Load:
    """One K1 week block as CSV -> its fortnight, school days, periods, plan lines and sessions."""
    load = ld.Load()
    rows = ld._rows(text)
    head = _header(rows, vocab, cal, load)
    if head is None:
        return load
    n, w, days = head
    block = _block(rows, vocab)
    load.periods.extend(p for p, _, _ in block)
    ords: dict[str, int] = {}
    for i, d in enumerate(days):
        if cal.days.get(d, ld.TEACHING).kind != "teaching":
            continue
        for period, ones, raw in block:
            cell = ones[0] if period.fixed and not ones[i] else ones[i]
            lesson = not period.fixed and cell
            subject, key, at = _lines(raw[i], n, w, ords, vocab, load) if lesson else (None, None, None)
            planned = period.fixed or not _unplanned(raw[i], vocab)
            load.sessions.append(ld.Session(d, period.start, subject, cell, key, at, n, planned))
    return load
