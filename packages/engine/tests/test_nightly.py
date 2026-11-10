"""A hand calculation of a child's state is kept as it was written (CP-9 item 7, `w3_read/nightly.py`): a later
change of the system cannot make an honest old row wrong. It is a case of the one eval set (CP-27), beside cases a
person may still confirm or a review that is re-run, so the guarantee is the database's, on hand checks alone.
Rolled back."""

import os

import psycopg
import pytest

from engine.core import db
from engine.w3_read import gold, nightly
from tests import rows

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def test_a_hand_check_is_never_changed_or_removed_and_says_what_the_system_said_then(conn):
    child = rows.a_child(conn)
    said = nightly.hand_check(conn, child, "NUM.OPS.01", "G2", "secure", "a tester")
    (kept,) = nightly.hand_checks(conn, child)
    assert (
        (kept["expected_state"], kept["system_state"], kept["matches"])
        == ("secure", None, False)
        == (
            "secure",
            said["system_state"],
            said["matches"],
        )
    )
    for change in (
        "update eval_case set verdict = 'emerging' where kind = 'hand_check' and child_id = %s",
        "update eval_case set kind = 'report_finding' where kind = 'hand_check' and child_id = %s",
        "delete from eval_case where kind = 'hand_check' and child_id = %s",
    ):
        with pytest.raises(psycopg.errors.RaiseException, match="append-only"), conn.transaction():
            conn.execute(change, (child,))
    assert nightly.hand_checks(conn, child) == [kept]


def test_a_hand_check_names_its_day_and_the_person_who_did_it(conn):
    child = rows.a_child(conn)
    for missing in ("checked_on", "confirmed_by"):
        with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
            conn.execute(
                "insert into eval_case (tenant_id, kind, child_id, skill_code, verdict, confirmed_by, checked_on,"
                " detail) values (%s, 'hand_check', %s, 'NUM.OPS.01', 'secure', %s, %s,"
                ' \'{"grade": "G2", "matches": false}\')',
                (
                    rows.tenant(conn),
                    child,
                    None if missing == "confirmed_by" else "a tester",
                    None if missing == "checked_on" else "2026-11-10",
                ),
            )


def test_another_case_of_the_eval_set_is_still_confirmed_beside_a_kept_hand_check(conn):
    child = rows.a_child(conn)
    nightly.hand_check(conn, child, "NUM.OPS.01", "G2", "secure", "a tester")
    rows.a_report_finding(conn, child, "NO-SUCH-KEY")
    assert gold.confirm(conn, "a reader") >= 1
    assert len(nightly.hand_checks(conn, child)) == 1
