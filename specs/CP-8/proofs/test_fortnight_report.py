"""CP-8 at fortnight level (items 1, 2 and 4; design decision 10): every count the commands print is also given per
fortnight, the share holds in each fortnight, and a run can be limited to one fortnight.
`engine timetable link` (dry run, `--fortnight N`, `--apply`), `engine timetable link-undo` and
`engine timetable unmatched` are run as a person runs them, on this test's rolled-back connection.

A fortnight is named in the output as "FN<n>" or "Fortnight <n>"; everything after that name, until the next one, is
that fortnight's part (a heading followed by rows, or a column on each row: both read the same way here).
The class has fortnight 37 (5 lines: 1 linked, 1 no_match, 1 several_matches, 2 ready_to_link) and fortnight 38
(3 lines: 2 no_match, 1 ready_to_link); no real plan uses those numbers. Placeholder rows only; no person's name.
"""

import re
from contextlib import contextmanager

import pytest
from conftest import BY, FN_A, FN_B, row
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
    assert 3 in numbers(parts[FN_B]) and 5 not in numbers(parts[FN_B]), (
        f"fortnight {FN_B}'s part does not count its own 3 lines: {parts[FN_B]}"
    )
    assert any(re.search(r"no[_ ]match", t, re.I) for t in parts[FN_B]), (
        "fortnight 38's lines are not counted by reason"
    )
    assert row(conn, k2["lines"]["ready"])["activity_id"] is None, "the dry run linked a line"
    assert row(conn, k2["lines"]["ready_b"])["activity_id"] is None, "the dry run linked a line"


def test_the_dry_run_for_one_fortnight_reports_that_fortnight_only(conn, k2, run_cli):
    parts = by_fortnight(run_cli("link", "--fortnight", str(FN_B)))
    assert FN_B in parts, f"the dry run for fortnight {FN_B} does not name it"
    assert FN_A not in parts, f"the dry run for fortnight {FN_B} also reports fortnight {FN_A}"


def test_after_a_run_every_fortnight_meets_the_default_target(conn, k2):
    """Item 1, default target, in each fortnight: once a run is applied no fortnight keeps a line with exactly one match
    unlinked, and the share linked per fortnight is the lines it could link (fortnight 37: 3 of 5; fortnight 38: 1 of 3)."""
    db.one(conn, "select plan_link_apply(%s, 'K2', %s) as run", (k2["tenant"], BY))
    per = {
        r["fortnight_number"]: (r["lines"], r["linked"], r["ready"])
        for r in conn.execute(
            "select f.number as fortnight_number, count(*) as lines, count(pe.activity_id) as linked,"
            " count(u.plan_entry_id) filter (where u.reason = 'ready_to_link') as ready"
            " from plan_entry pe join fortnight f on f.id = pe.fortnight_id"
            " left join plan_unmatched u on u.plan_entry_id = pe.id"
            " where pe.school_class_id = %s group by f.number",
            (k2["class"],),
        ).fetchall()
    }
    assert per == {FN_A: (5, 3, 0), FN_B: (3, 1, 0)}, per


def test_the_command_applies_a_run_to_one_fortnight_and_undoes_it_as_a_whole(conn, k2, run_cli):
    """Item 4 through the command a person runs: `link --fortnight N --apply` prints the run id; `link-undo` reverts it."""
    lines = k2["lines"]
    out = run_cli("link", "--fortnight", str(FN_B), "--apply")
    ids = re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", out)
    assert len(ids) == 1, f"the apply did not print one run id: {out[-400:]}"
    after = row(conn, lines["ready_b"])
    assert str(after["link_run"]) == ids[0] and after["link_rule"] == "exact_name", after
    assert row(conn, lines["ready"])["activity_id"] is None, (
        f"the run for fortnight {FN_B} linked a fortnight {FN_A} line"
    )
    run_cli("link-undo", ids[0])
    assert row(conn, lines["ready_b"])["activity_id"] is None, "link-undo left the run's line linked"


def test_the_unmatched_list_puts_each_line_under_its_fortnight_with_its_reason(conn, k2, run_cli):
    parts = by_fortnight(run_cli("unmatched"))
    names, tag = k2["names"], k2["tag"]
    expect = {
        names["none"]: (FN_A, "no_match"),
        names["tie"]: (FN_A, "several_matches"),
        names["ready2"]: (FN_A, "ready_to_link"),
        f"Placeholder unmatched b1 {tag}": (FN_B, "no_match"),
        f"Placeholder unmatched b2 {tag}": (FN_B, "no_match"),
        names["ready_b"]: (FN_B, "ready_to_link"),
    }
    for text, (fn, reason) in expect.items():
        rows = [t for t in parts.get(fn, []) if text in t]
        assert rows, f"the line '{text}' is not listed under fortnight {fn}"
        assert reason in rows[0], f"the line '{text}' is listed without its reason {reason}: {rows[0]}"
    every = "\n".join(t for p in parts.values() for t in p)
    assert names["loader"] not in every, "a linked line is on the unmatched list"
