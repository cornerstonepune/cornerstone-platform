"""CP-8 items 1 to 3, as design decision 10 has them: every count the commands print is also given per fortnight.
`engine timetable link` (the dry run) and `engine timetable unmatched` are run as a person runs them, on this test's
rolled-back connection, and their output is read per fortnight.

A fortnight is named in the output as "FN<n>" or "Fortnight <n>"; everything after that name, until the next one, is
that fortnight's part (a heading followed by rows, or a column on each row: both read the same way here).
The class has fortnight 37 (5 lines: 1 linked, 1 no_match, 1 several_matches, 2 ready_to_link) and fortnight 38
(2 lines, both no_match); no real plan uses those numbers. Placeholder rows only; the output holds no person's name.
"""

import re
from contextlib import contextmanager

import pytest
from conftest import FN_A, FN_B, row
from engine import cli
from engine.core import db
from typer.testing import CliRunner

MARK = re.compile(r"\b(?:fn|fortnight)\s*[#:]?\s*(\d+)\b", re.I)


class _Shared:
    """This test's connection, handed to the command: it cannot commit, roll back or close what the test rolls back."""

    def __init__(self, conn):
        self._conn = conn

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


@pytest.fixture
def run_cli(conn, monkeypatch):
    @contextmanager
    def shared(url=None):
        yield _Shared(conn)

    monkeypatch.setattr(db, "connect", shared)

    def run(*args):
        out = CliRunner().invoke(cli.app, ["timetable", *args])
        assert out.exit_code == 0, (
            f"engine timetable {' '.join(args)} exited {out.exit_code}: {out.output[-800:]}"
        )
        return out.output

    return run


def by_fortnight(output: str) -> dict[int, list[str]]:
    parts: dict[int, list[str]] = {}
    current = None
    for text in output.splitlines():
        if m := MARK.search(text):
            current = int(m.group(1))
        if current is not None:
            parts.setdefault(current, []).append(text)
    return parts


def numbers(lines: list[str]) -> set[int]:
    return {
        int(n) for n in re.findall(r"(?<![\w.-])(\d+)(?![\w.-])", " ".join(MARK.sub(" ", t) for t in lines))
    }


def test_the_dry_run_counts_lines_per_fortnight_and_writes_nothing(conn, k2, run_cli):
    parts = by_fortnight(run_cli("link"))
    assert FN_A in parts and FN_B in parts, f"the dry run names no part for fortnight {FN_A} or {FN_B}"
    assert 5 in numbers(parts[FN_A]), f"fortnight {FN_A}'s part does not count its 5 lines: {parts[FN_A]}"
    assert 2 in numbers(parts[FN_B]) and 5 not in numbers(parts[FN_B]), (
        f"fortnight {FN_B}'s part does not count its own 2 lines: {parts[FN_B]}"
    )
    assert any(re.search(r"no[_ ]match", t, re.I) for t in parts[FN_B]), (
        "fortnight 38's lines are not counted by reason"
    )
    assert row(conn, k2["lines"]["ready"])["activity_id"] is None, "the dry run linked a line"


def test_the_unmatched_list_puts_each_line_under_its_fortnight_with_its_reason(conn, k2, run_cli):
    parts = by_fortnight(run_cli("unmatched"))
    names, tag = k2["names"], k2["tag"]
    expect = {
        names["none"]: (FN_A, "no_match"),
        names["tie"]: (FN_A, "several_matches"),
        names["ready2"]: (FN_A, "ready_to_link"),
        f"Placeholder unmatched b1 {tag}": (FN_B, "no_match"),
        f"Placeholder unmatched b2 {tag}": (FN_B, "no_match"),
    }
    for text, (fn, reason) in expect.items():
        rows = [t for t in parts.get(fn, []) if text in t]
        assert rows, f"the line '{text}' is not listed under fortnight {fn}"
        assert reason in rows[0], f"the line '{text}' is listed without its reason {reason}: {rows[0]}"
    every = "\n".join(t for p in parts.values() for t in p)
    assert names["loader"] not in every, "a linked line is on the unmatched list"
