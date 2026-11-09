"""CP-8 item 4: a linking run (`plan_link_apply`) records which rule linked each line, can be limited to one fortnight
(`p_fortnight`, a fortnight number), and can be undone as a whole (`plan_link_undo`). Placeholder rows, one rolled-back
transaction (see conftest.py)."""

import uuid

from conftest import BY, FN_A, FN_B, apply_run, row, undo_run, unmatched
from engine.core import db


def _run_lines(conn, run):
    return {r["id"] for r in conn.execute("select id from plan_entry where link_run = %s", (run,)).fetchall()}


def test_a_line_the_loader_linked_says_its_rule_and_belongs_to_no_run(conn, k2):
    r = row(conn, k2["lines"]["loader"])
    assert r["activity_id"] == k2["acts"]["loader"], "the loader did not link the line naming one activity"
    assert r["link_rule"] == "exact_name" and r["link_run"] is None, (r["link_rule"], r["link_run"])


def test_a_run_links_each_line_with_one_match_and_records_rule_run_who_and_when(conn, k2):
    lines, acts = k2["lines"], k2["acts"]
    rule = db.one(
        conn, "select rule, rank from plan_line_candidate where plan_entry_id = %s", (lines["ready"],)
    )
    assert (rule["rule"], rule["rank"]) == ("exact_name", 1), rule
    run = apply_run(conn, k2)
    assert isinstance(run, uuid.UUID), f"plan_link_apply returned {run!r}, not a run id"
    for role in ("ready", "ready2"):
        r = row(conn, lines[role])
        assert r["activity_id"] == acts[role], f"the {role} line was not linked to its one match"
        assert (r["link_rule"], r["link_run"], r["linked_by"]) == ("exact_name", run, BY), r
        assert r["linked_at"] is not None, "the run did not record when it linked the line"


def test_the_loaders_links_stay_out_of_the_run_and_out_of_its_undo(conn, k2):
    loader = k2["lines"]["loader"]
    before = row(conn, loader)
    run = apply_run(conn, k2)
    assert loader not in _run_lines(conn, run)
    assert row(conn, loader) == before, "the run changed a line the loader had linked"
    undo_run(conn, run)
    assert row(conn, loader) == before, "the undo changed a line the loader had linked"


def test_undo_reverts_exactly_the_runs_lines_and_says_how_many_and_a_second_undo_finds_none(conn, k2):
    lines = k2["lines"]
    run = apply_run(conn, k2)
    in_run = _run_lines(conn, run)
    assert {lines["ready"], lines["ready2"]} <= in_run
    untouched = {lid: row(conn, lid) for lid in (lines["loader"], lines["tie"], lines["none"])}
    assert undo_run(conn, run) == len(in_run), "the undo's count is not the number of lines the run linked"
    for lid in in_run:
        r = row(conn, lid)
        assert (r["activity_id"], r["link_rule"], r["link_run"], r["linked_at"], r["linked_by"]) == (
            None,
        ) * 5, r
    assert {lid: row(conn, lid) for lid in untouched} == untouched, "the undo touched a line outside the run"
    assert undo_run(conn, run) == 0, "a second undo of the same run changed rows"


def test_a_line_changed_by_a_person_after_the_run_is_left_by_the_undo_and_says_person(conn, k2):
    lines, acts = k2["lines"], k2["acts"]
    run = apply_run(conn, k2)
    conn.execute("update plan_entry set activity_id = %s where id = %s", (acts["other"], lines["ready2"]))
    hand = row(conn, lines["ready2"])
    assert (hand["link_rule"], hand["link_run"]) == ("person", None), hand
    left = _run_lines(conn, run)
    assert lines["ready2"] not in left and lines["ready"] in left
    assert undo_run(conn, run) == len(left)
    assert row(conn, lines["ready2"])["activity_id"] == acts["other"], "the undo reverted a person's change"
    assert row(conn, lines["ready2"])["link_rule"] == "person"
    assert row(conn, lines["ready"])["activity_id"] is None


def test_a_tie_is_never_linked_and_is_listed_for_a_person(conn, k2):
    tie = k2["lines"]["tie"]
    found = conn.execute(
        "select activity_id, rank from plan_line_candidate where plan_entry_id = %s", (tie,)
    ).fetchall()
    assert {r["activity_id"] for r in found} == {k2["acts"]["tie_1"], k2["acts"]["tie_2"]}
    assert {r["rank"] for r in found} == {1}
    apply_run(conn, k2)
    assert row(conn, tie)["activity_id"] is None, "a run broke a tie"
    assert unmatched(conn, k2).get(tie) == ("several_matches", 2)


def _fortnights_of(conn, ids):
    if not ids:
        return set()
    return {
        r["number"]
        for r in conn.execute(
            "select distinct f.number from plan_entry pe join fortnight f on f.id = pe.fortnight_id where pe.id = any(%s)",
            (list(ids),),
        ).fetchall()
    }


def test_a_run_limited_to_one_fortnight_touches_only_that_fortnights_lines_and_undoes_as_a_whole(conn, k2):
    lines, acts = k2["lines"], k2["acts"]
    run = apply_run(conn, k2, fortnight=FN_B)
    in_run = _run_lines(conn, run)
    assert lines["ready_b"] in in_run, f"the run for fortnight {FN_B} did not link its line with one match"
    r = row(conn, lines["ready_b"])
    assert (r["activity_id"], r["link_rule"], r["linked_by"]) == (acts["ready_b"], "exact_name", BY), r
    assert _fortnights_of(conn, in_run) == {FN_B}, "the run limited to one fortnight linked lines of another"
    for role in ("ready", "ready2"):
        assert row(conn, lines[role])["activity_id"] is None, f"the {FN_B} run linked a fortnight {FN_A} line"
    assert unmatched(conn, k2).get(lines["ready"]) == ("ready_to_link", 1)
    assert undo_run(conn, run) == len(in_run)
    assert row(conn, lines["ready_b"])["activity_id"] is None, "the undo left the fortnight's line linked"
    assert undo_run(conn, run) == 0


def test_a_run_over_all_fortnights_links_in_each(conn, k2):
    lines = k2["lines"]
    run = apply_run(conn, k2)
    in_run = _run_lines(conn, run)
    assert {lines["ready"], lines["ready2"], lines["ready_b"]} <= in_run, (
        "a run over all fortnights missed a line with one match"
    )
    assert {FN_A, FN_B} <= _fortnights_of(conn, in_run)
    assert undo_run(conn, run) == len(in_run)


def test_apply_never_changes_an_existing_link(conn, k2):
    """A line a person linked elsewhere keeps that link, even though its text names exactly one activity."""
    lines, acts = k2["lines"], k2["acts"]
    conn.execute("update plan_entry set activity_id = %s where id = %s", (acts["other"], lines["ready"]))
    before = row(conn, lines["ready"])
    assert before["link_rule"] == "person"
    run = apply_run(conn, k2)
    assert row(conn, lines["ready"]) == before, "the run overwrote a link a person had made"
    second = apply_run(conn, k2)
    assert second != run and _run_lines(conn, second) & set(lines.values()) == set(), (
        "a second run re-linked lines the first had already linked"
    )
