"""CP-19 item 3: each line needs two approvals, through `report_line_decide` as the website calls it (role app_web,
`app.staff_id` set with set_config): first an educator of the child's class, then the coordinator. Refused: the
coordinator first, an educator of another class first, someone who is not a coordinator second, the same person twice,
a third approval, an approval with no signed-in person, and an approval from the engine (app_engine) instead of the
website, whether through the function or straight into `approval`.
"""

import pytest

from conftest import (DECIDE, INSIDE, PERIOD, approvals, decide, need, note, ready_line, refused)


@pytest.fixture
def ln(conn, people):
    need(conn, "report_line", DECIDE)
    p = people
    return ready_line(conn, p["s"], p["kid"], note(conn, p["s"], p["kid"], *PERIOD), INSIDE)


Q = "select public.report_line_decide(%s, 'approved', null)"


def test_3_educator_then_coordinator_approves(conn, people, ln):
    decide(conn, ln, people["educator"])
    assert approvals(conn, ln) == 1
    decide(conn, ln, people["coordinator"])
    assert approvals(conn, ln) == 2
    state = conn.execute("select state from approval_list where kind = 'report_line' and target = %s",
                         (str(ln),)).fetchone()
    assert state and state[0] == "approved", f"the line is not approved after two approvals: {state}"


def test_3_coordinator_first_is_refused(conn, people, ln):
    refused(conn, "app_web", people["coordinator"], Q, (ln,))
    assert approvals(conn, ln) == 0


def test_3_educator_of_another_class_first_is_refused(conn, people, ln):
    refused(conn, "app_web", people["elsewhere"], Q, (ln,))
    assert approvals(conn, ln) == 0


def test_3_second_approval_needs_a_coordinator(conn, people, ln):
    decide(conn, ln, people["educator"])
    refused(conn, "app_web", people["elsewhere"], Q, (ln,))
    assert approvals(conn, ln) == 1


def test_3_the_same_person_twice_is_refused(conn, people, ln):
    decide(conn, ln, people["both"])  # the class's cover educator, who is also a coordinator
    refused(conn, "app_web", people["both"], Q, (ln,))
    assert approvals(conn, ln) == 1


def test_3_a_third_approval_is_refused(conn, people, ln):
    decide(conn, ln, people["educator"])
    decide(conn, ln, people["coordinator"])
    refused(conn, "app_web", people["coordinator2"], Q, (ln,))
    assert approvals(conn, ln) == 2


def test_3_no_signed_in_person_is_refused(conn, people, ln):
    refused(conn, "app_web", None, Q, (ln,))
    decide(conn, ln, people["educator"])
    refused(conn, "app_web", None, Q, (ln,))
    assert approvals(conn, ln) == 1


def test_3_the_engine_cannot_approve(conn, people, ln):
    refused(conn, "app_engine", people["educator"], Q, (ln,))
    for role in ("app_engine", "app_web"):
        refused(conn, role, people["educator"],
                "insert into approval (tenant_id, kind, target, decision, by, step, staff_id) "
                "values (%s, 'report_line', %s, 'approved', %s, 1, %s)",
                (people["s"]["tenant"], str(ln), str(people["educator"]), people["educator"]))
    decide(conn, ln, people["educator"])
    refused(conn, "app_engine", people["coordinator"], Q, (ln,))
    assert approvals(conn, ln) == 1
