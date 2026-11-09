"""CP-9 item 4: the picture reads only confirmed notes.

On a throwaway database, one child with confirmed and unconfirmed evidence of both kinds, then the nightly run:
- observed evidence with `confirmed_by` null never reaches `child_observed_state`; the same child's confirmed observed
  evidence does;
- written evidence with `confirmed_by` null never reaches `child_skill_state`; the same child's confirmed written
  answer does;
- evidence from a voice note still drafted is refused by the database.
"""

import datetime as dt
import uuid

import pytest

from conftest import IST, a_k2_class, a_paper, observed, run_nightly

D = dt.datetime(2026, 6, 1, 10, 0, tzinfo=IST)


def _second_activity(conn, k):
    """Another K2 activity naming a third registry skill, for the evidence nobody confirmed."""
    code = f"ACT-K2-CP9U{uuid.uuid4().hex[:5]}"
    conn.execute("insert into activity (tenant_id, code, band, strand, name, sheet_no) values (%s, %s, 'K2', 'Maths',"
                 " 'Placeholder activity', '13')", (k["tenant"], code))
    skill = conn.execute("select code from registry_skill where tenant_id = %s and code <> all(%s) order by code"
                         " limit 1", (k["tenant"], k["skills"])).fetchone()["code"]
    conn.execute("insert into activity_skill (tenant_id, activity_code, skill_code) values (%s, %s, %s)",
                 (k["tenant"], code, skill))
    return {**k, "activity": code, "skills": [skill]}


def test_4_only_confirmed_evidence_reaches_either_picture(conn):
    k = a_k2_class(conn)
    child = k["children"]["3"]
    unconfirmed = _second_activity(conn, k)
    observed(conn, k, child, D)                                  # confirmed
    observed(conn, unconfirmed, child, D, confirmed=False)       # nobody confirmed it
    a_paper(conn, k["tenant"], child, [("correct", "none"), ("wrong", "none"), ("correct", "full")])
    conn.execute("select confirm_results(%s, 'cp9 proof')", (child,))  # the written answers, signed off
    conn.execute(  # a written answer nobody signed off, on another skill
        "insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, channel, observed_at,"
        " confirmed_by) values (%s, %s, 'NUM.OPS.01', 'R24', true, 'item', %s, null)", (k["tenant"], child, D))
    conn.execute("delete from child_skill_state where child_id = %s", (child,))  # the sign-off rebuilt it; the run must
    conn.commit()

    conn.execute("set role app_engine")
    run_nightly(conn)
    conn.commit()
    conn.execute("reset role")

    seen = {r["skill_code"] for r in conn.execute(
        "select skill_code from child_observed_state where child_id = %s", (child,))}
    assert seen == set(k["skills"]), f"observed picture: {sorted(seen)}; confirmed skills {k['skills']}, " \
                                     f"unconfirmed {unconfirmed['skills']}"
    written = {r["skill_code"] for r in conn.execute(
        "select skill_code from child_skill_state where child_id = %s", (child,))}
    assert written == {"NUM.OPS.02"}, f"written picture: {sorted(written)}"


def test_4_evidence_from_a_drafted_voice_note_is_refused_by_the_database(conn):
    k = a_k2_class(conn)
    note = conn.execute(
        "insert into pii.educator_note (tenant_id, staff_id, class_id, audio_key, transcript, status)"
        " values (%s, %s, %s, %s, 'placeholder words', 'drafted') returning id",
        (k["tenant"], k["staff"], k["class"], f"voice/2026/{uuid.uuid4()}.m4a")).fetchone()["id"]
    with pytest.raises(Exception, match="confirmed note"), conn.transaction():
        observed(conn, k, k["children"]["3"], D, note_id=note)
    observed(conn, k, k["children"]["3"], D)  # the form's own confirmation is evidence
    conn.commit()
    conn.execute("set role app_engine")
    run_nightly(conn)
    conn.commit()
    conn.execute("reset role")
    assert {r["skill_code"] for r in conn.execute(
        "select skill_code from child_observed_state where child_id = %s", (k["children"]["3"],))} == set(k["skills"])
    assert conn.execute("select count(*) as n from activity_observation where note_id = %s",
                        (note,)).fetchone()["n"] == 0
