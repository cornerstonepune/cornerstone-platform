"""CP-19: report lines, two approvals a line, consent before a send, the counts (engine/w4_close/report_lines.py and the
rules the database holds). Placeholder class, educator and children (tests/voice_rows.py), rolled back: no school data."""

import datetime as dt
import os
import re

import psycopg
import pytest

from engine.core import db, settings
from engine.w3_read import voice_confirm as vc
from engine.w3_read.voice_store import Refused
from engine.w4_close import report_lines as rl
from tests.test_notes_history_and_coordinator import _coordinator
from tests.voice_rows import a_k2_class, a_note

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _monday(conn) -> dt.date:
    today = settings.school_today(conn)
    return today - dt.timedelta(days=today.weekday())


def _world(conn):
    """A class, its educator and a coordinator, a child (roll 3) with one confirmed observation's evidence, and a report."""
    k = a_k2_class(conn)
    note = a_note(conn, k, "Activity 12. Above 3.")
    vc.confirm_note(conn, str(note["id"]), k["email"], vc.Confirmed(k["activity"], 2, {"above": ["3"]}))
    child = k["children"]["3"]
    evidence = [
        str(r["id"])
        for r in conn.execute(
            "select id from evidence_event where child_id = %s and confirmed_by is not null order by id",
            (child,),
        ).fetchall()
    ]
    assert evidence
    report = conn.execute(
        "insert into parent_note (tenant_id, child_id, week, body) values (%s, %s, %s, 'words') returning id",
        (k["tenant"], child, _monday(conn)),
    ).fetchone()["id"]
    return k, child, evidence, str(report), _coordinator(conn, k)


def _consent(conn, k, child, decision="given"):
    conn.execute(
        "insert into consent (tenant_id, child_id, decision, given_by, how, recorded_by)"
        " values (%s, %s, %s, 'mother', 'a signed form', 'the coordinator')",
        (k["tenant"], child, decision),
    )


def _two(conn, k, boss, report, line):
    rl.approve_line(conn, k["email"], report, line)
    rl.approve_line(conn, boss, report, line)


# ---- the lines ------------------------------------------------------------------------------------------------------


def test_an_educator_of_the_class_writes_lines_that_rest_on_confirmed_evidence_of_this_child(conn):
    k, child, ev, report, boss = _world(conn)
    out = rl.set_lines(conn, k["email"], report, [{"words": "Counts to ten.", "evidence": ev}])
    assert [x["stage"] for x in out["lines"]] == ["drafted"] and out["lines"][0]["evidence"] == ev
    with pytest.raises(Refused) as no:
        rl.set_lines(conn, boss, report, [{"words": "x", "evidence": ev}])  # a coordinator not on the class
    assert no.value.status == 403


def test_a_line_citing_another_childs_unconfirmed_or_later_evidence_is_refused(conn):
    k, child, ev, report, _ = _world(conn)
    other = k["children"]["1"]

    def another(on_child, observed, confirmed):
        """A copy of this child's confirmed evidence row, for `on_child`, dated and confirmed as given."""
        return conn.execute(
            "insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark,"
            " seen_by, place, source) select tenant_id, %s, skill_code, channel, "
            + observed
            + ", %s, kind, mark, seen_by,"
            " place, source from evidence_event where child_id = %s and confirmed_by is not null limit 1 returning id",
            (on_child, confirmed, child),
        ).fetchone()["id"]

    theirs = another(other, "now()", "x")
    unconfirmed = another(child, "now()", None)
    late = another(child, "now() + interval '40 days'", "x")
    for bad in (theirs, unconfirmed, late):
        with pytest.raises(Refused) as no:
            rl.set_lines(conn, k["email"], report, [{"words": "x", "evidence": [str(bad)]}])
        assert no.value.status == 422 and "confirmed evidence" in str(no.value)


def test_a_line_on_fewer_pieces_than_the_setting_is_thin_and_the_setting_changes_it_with_no_code_change(conn):
    k, child, ev, report, _ = _world(conn)
    one = rl.set_lines(conn, k["email"], report, [{"words": "Counts.", "evidence": ev[:1]}])
    assert one["lines"][0]["thin"] is (len(ev[:1]) < 2)
    conn.execute(
        "insert into config (tenant_id, key, value, description) values (%s, 'report.seen_enough', '1', 't')"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (k["tenant"],),
    )
    assert rl.stages(conn, k["email"], report)["lines"][0]["thin"] is False


# ---- two approvals a line -------------------------------------------------------------------------------------------


def test_a_line_needs_an_educator_first_then_a_coordinator_and_never_the_same_person_or_a_third(conn):
    k, child, ev, report, boss = _world(conn)
    line = rl.set_lines(conn, k["email"], report, [{"words": "Counts.", "evidence": ev}])["lines"][0]["id"]
    with pytest.raises(Refused) as no:
        rl.approve_line(conn, boss, report, line)  # a coordinator may not give the first
    assert no.value.status == 403
    first = rl.approve_line(conn, k["email"], report, line)["lines"][0]
    assert first["stage"] == "educator_approved" and first["educator_approved_by"] == str(k["staff"])
    with pytest.raises(Refused) as no:
        rl.approve_line(
            conn, k["email"], report, line
        )  # the educator is not a coordinator: refused as the second
    assert no.value.status == 403
    second = rl.approve_line(conn, boss, report, line)["lines"][0]
    assert second["stage"] == "coordinator_approved" and second["coordinator_approved_by"] != str(k["staff"])
    with pytest.raises(Refused) as no:
        rl.approve_line(conn, boss, report, line)
    assert no.value.status == 409


def test_changing_a_line_withdraws_its_approvals(conn):
    k, child, ev, report, boss = _world(conn)
    line = rl.set_lines(conn, k["email"], report, [{"words": "Counts.", "evidence": ev}])["lines"][0]["id"]
    _two(conn, k, boss, report, line)
    again = rl.set_lines(
        conn, k["email"], report, [{"id": line, "words": "Counts to twenty.", "evidence": ev}]
    )
    assert again["lines"][0]["stage"] == "drafted"


# ---- the send -------------------------------------------------------------------------------------------------------


def test_a_report_is_sent_only_with_consent_on_record_and_two_approvals_of_every_line(conn):
    k, child, ev, report, boss = _world(conn)
    a = rl.set_lines(
        conn, k["email"], report, [{"words": "A.", "evidence": ev}, {"words": "B.", "evidence": ev}]
    )
    one, two = [x["id"] for x in a["lines"]]
    with pytest.raises(Refused, match="consent"):
        rl.send(conn, boss, report)  # no consent yet
    _consent(conn, k, child)
    _two(conn, k, boss, report, one)
    with pytest.raises(Refused, match="two approvals"):
        rl.send(conn, boss, report)  # the second line is not approved twice
    _two(conn, k, boss, report, two)
    with pytest.raises(Refused) as no:
        rl.send(conn, k["email"], report)  # an educator does not send
    assert no.value.status == 403
    assert rl.send(conn, boss, report)["sent_at"] is not None
    with pytest.raises(Refused) as no:
        rl.send(conn, boss, report)
    assert no.value.status == 409
    with pytest.raises(Refused):
        rl.set_lines(conn, k["email"], report, [])  # a sent report keeps its lines


def test_a_withdrawn_consent_or_a_changed_register_stops_a_send_and_the_database_refuses_any_other_route(
    conn,
):
    k, child, ev, report, boss = _world(conn)
    line = rl.set_lines(conn, k["email"], report, [{"words": "A.", "evidence": ev}])["lines"][0]["id"]
    _two(conn, k, boss, report, line)
    _consent(conn, k, child)
    _consent(conn, k, child, "withdrawn")
    with pytest.raises(psycopg.Error, match="consent"), conn.transaction():
        conn.execute(
            "update parent_note set sent_at = now() where id = %s", (report,)
        )  # not through the engine
    _consent(conn, k, child)
    conn.execute("update data_register set why = why || ' (changed)' where code = 'name'")
    with pytest.raises(psycopg.Error, match="consent"), conn.transaction():
        conn.execute("update parent_note set sent_at = now() where id = %s", (report,))


def test_a_report_with_no_lines_is_not_sent_by_the_engine_and_keeps_the_old_rule_in_the_database(conn):
    k, child, ev, report, boss = _world(conn)
    _consent(conn, k, child)
    with pytest.raises(Refused):
        rl.send(conn, boss, report)
    with pytest.raises(psycopg.Error, match="two approvals"), conn.transaction():
        conn.execute("update parent_note set sent_at = now() where id = %s", (report,))


# ---- the counts and the words ---------------------------------------------------------------------------------------


def test_the_counts_are_whole_numbers_in_a_fixed_order_with_no_score_rate_or_rank(conn):
    k, child, ev, report, boss = _world(conn)
    line = rl.set_lines(conn, k["email"], report, [{"words": "A.", "evidence": ev}])["lines"][0]["id"]
    rl.approve_line(conn, k["email"], report, line)
    out = rl.counts(conn, boss)
    mine = next(c for c in out["classes"] if c["class_id"] == k["class"])
    assert mine["lines_educator_approved"] == 1 and mine["lines_drafted"] == 0 and mine["reports_sent"] == 0
    assert mine["notes_confirmed"] == 1
    educator = next(e for e in out["educators"] if e["staff"] == str(k["staff"]))
    assert educator["notes_confirmed"] == 1 and educator["lines_accepted"] + educator["lines_changed"] >= 1
    for part in (*out["classes"], *out["educators"]):
        assert all(isinstance(v, int) for key, v in part.items() if key not in ("class", "class_id", "staff"))
        assert not [key for key in part if re.search(r"score|rate|rank|percent|accuracy", key)]
    assert [e["staff"] for e in out["educators"]] == sorted(e["staff"] for e in out["educators"])
    with pytest.raises(Refused) as no:
        rl.counts(conn, k["email"])  # an educator does not read the school's counts
    assert no.value.status == 403


def test_no_role_label_says_teacher(conn):
    assert conn.execute("select count(*) n from role where label ilike '%teacher%'").fetchone()["n"] == 0
    assert (
        conn.execute("select label from role where code = 'class_teacher'").fetchone()["label"]
        == "Class educator"
    )
