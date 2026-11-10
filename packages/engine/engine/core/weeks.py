"""A week is a date (CP-27, docs/data-model.md: "a date in the year is a `date`"): the Monday of the ISO week. People and
the website name a week by its ISO label, `2026-W40`; the database keeps 2026-09-28. `day` turns a label (or a date) into
the Monday a `week` column holds; `label` turns it back. A label that is no ISO week is refused, never guessed: an old
paper's own label (`Sep W1`, `Baseline`) stays in the paper's key, and its week is empty."""

import datetime as dt
import re

# The label of a `week` column, for a query that hands weeks back as people name them.
SQL_LABEL = "to_char({}, 'IYYY-\"W\"IW')"
_ISO = re.compile(r"(\d{4})-W(\d{2})")


class NotAWeek(ValueError):
    """The text names no ISO week."""


def day(week: str | dt.date) -> dt.date:
    """The Monday of the week a label (`2026-W40`) names; a date is its own week's Monday."""
    if isinstance(week, dt.date):
        return week - dt.timedelta(days=week.weekday())
    found = _ISO.fullmatch(str(week).strip())
    if found:
        try:
            monday = dt.date.fromisocalendar(int(found[1]), int(found[2]), 1)
        except ValueError:
            monday = None
        if monday is not None:
            return monday
    raise NotAWeek(f"{week!r} is not a week: name it as an ISO week, like 2026-W40.")


def or_none(week: str | dt.date | None) -> dt.date | None:
    """The week's Monday, or None for a label that is no week (an old paper's `Sep W1`, kept in its key)."""
    try:
        return day(week) if week is not None else None
    except NotAWeek:
        return None


def label(week: dt.date | str | None) -> str | None:
    """The ISO label of the week a date falls in (`2026-W40`); a label is given back as it is."""
    if week is None or isinstance(week, str):
        return week
    year, number, _ = week.isocalendar()
    return f"{year}-W{number:02d}"


def sql_label(column: str) -> str:
    """`to_char(<column>, 'IYYY-"W"IW')`: the column's week as its label, in a query."""
    return SQL_LABEL.format(column)
