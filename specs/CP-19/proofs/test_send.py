"""CP-19 item 4: a report is marked sent only through `report_mark_sent`, which refuses (writing nothing) when consent
is not on record for the child, when the school's data register changed since consent was given, when any line is not
approved twice, when the report has no lines, or when it is already sent. Any other attempt to mark a report sent (an
UPDATE of `parent_note.sent_at` or `channel` by the website's or the engine's login) is refused by the database, even
for a report that `report_mark_sent` would accept. Nothing is delivered to anyone: "sent" is the column only.
"""

import psycopg
import pytest

from conftest import (NOT_A_REFUSAL, act, DECIDE, INSIDE, MARK_SENT, PERIOD, consent, decide, mark_sent, need, note, ready_line, refused,
                      register_entry)

Q = "select public.report_mark_sent(%s, 'whatsapp')"


@pytest.fixture
def ready(conn, people):
    """A report of two lines, each approved by the class's educator then the coordinator; consent given."""
    need(conn, "report_line", DECIDE, MARK_SENT)
    p, s = people, people["s"]
    n = note(conn, s, p["kid"], *PERIOD)
    for _ in range(2):
        ln = ready_line(conn, s, p["kid"], n, INSIDE)
        decide(conn, ln, p["educator"])
        decide(conn, ln, p["coordinator"])
    consent(conn, s, p["kid"])
    return n


def sent(c, n):
    return c.execute("select sent_at is not null, channel from parent_note where id = %s", (n,)).fetchone()


def test_4_sent_when_consent_is_on_record_and_every_line_approved_twice(conn, people, ready):
    mark_sent(conn, ready, people["coordinator"])
    assert sent(conn, ready) == (True, "whatsapp")


def test_4_no_consent_is_refused(conn, people):
    need(conn, "report_line", DECIDE, MARK_SENT)
    p, s = people, people["s"]
    n = note(conn, s, p["kid"], *PERIOD)
    ln = ready_line(conn, s, p["kid"], n, INSIDE)
    decide(conn, ln, p["educator"])
    decide(conn, ln, p["coordinator"])
    refused(conn, "app_web", p["coordinator"], Q, (n,))
    assert sent(conn, n) == (False, None)


def test_4_withdrawn_consent_is_refused(conn, people, ready):
    consent(conn, people["s"], people["kid"], "withdrawn")
    refused(conn, "app_web", people["coordinator"], Q, (ready,))
    assert sent(conn, ready) == (False, None)


def test_4_register_changed_since_consent_is_refused(conn, people, ready):
    register_entry(conn, people["s"])
    refused(conn, "app_web", people["coordinator"], Q, (ready,))
    assert sent(conn, ready) == (False, None)


def test_4_a_line_approved_once_is_refused(conn, people, ready):
    ln = ready_line(conn, people["s"], people["kid"], ready, INSIDE)
    decide(conn, ln, people["educator"])
    refused(conn, "app_web", people["coordinator"], Q, (ready,))
    assert sent(conn, ready) == (False, None)


def test_4_a_report_with_no_lines_is_refused(conn, people):
    need(conn, "report_line", MARK_SENT)
    p = people
    n = note(conn, p["s"], p["kid"], *PERIOD)
    consent(conn, p["s"], p["kid"])
    refused(conn, "app_web", p["coordinator"], Q, (n,))
    assert sent(conn, n) == (False, None)


def test_4_already_sent_is_refused(conn, people, ready):
    mark_sent(conn, ready, people["coordinator"])
    first = conn.execute("select sent_at from parent_note where id = %s", (ready,)).fetchone()[0]
    refused(conn, "app_web", people["coordinator"], "select public.report_mark_sent(%s, 'email')", (ready,))
    assert conn.execute("select sent_at, channel from parent_note where id = %s", (ready,)).fetchone() == \
        (first, "whatsapp")


def test_4_the_engine_cannot_send(conn, people, ready):
    refused(conn, "app_engine", people["coordinator"], Q, (ready,))
    assert sent(conn, ready) == (False, None)


@pytest.mark.parametrize("role", ["app_web", "app_engine"])
def test_4_no_other_way_to_mark_sent(conn, people, ready, role):
    # The report is one report_mark_sent would accept, and approved twice the old way too (approved_by plus a
    # second approval), so nothing but the new rule stands between these updates and a sent report.
    s = people["s"]
    conn.execute("update parent_note set approved_by = 'proof-a' where id = %s", (ready,))
    conn.execute("insert into approval (tenant_id, kind, target, decision, by) "
                 "values (%s, 'parent_note', %s, 'approved', 'proof-b')", (s["tenant"], str(ready)))
    # Refused means an error, or (where a row rule hides the report from that login) nothing changed.
    for q in ("update parent_note set sent_at = now(), channel = 'whatsapp' where id = %s",
              "update parent_note set channel = 'email' where id = %s"):
        try:
            act(conn, role, people["coordinator"], q, (ready,))
        except NOT_A_REFUSAL as e:
            pytest.fail(f"not a refusal: {e}")
        except psycopg.Error:
            pass
        assert sent(conn, ready) == (False, None), f"{role} marked the report sent without report_mark_sent: {q}"
