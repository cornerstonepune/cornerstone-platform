"""CP-9 item 2: a confirmed note can be corrected through the engine; the correction is a new row that supersedes the
old one and the old row is never changed.

Through `voice_confirm.correct` and the registered route `POST /voice/observations/correct`, on rows the typed form's
Save writes (`voice_confirm.save_form`): a new row with `supersedes` and `reason`; the old row byte-identical
(`to_jsonb` before and after) and refused when updated or deleted; its evidence untouched; after the nightly run only
the correction counts in the picture (the child's picture equals that of a child noted once with the corrected
outcome); a second correction of the same row is refused (409).
"""

import datetime as dt

import pytest
from fastapi.testclient import TestClient

from conftest import a_k2_class, run_nightly, states

DAY = dt.date(2026, 6, 1)
KEY = "cp9-proof-engine-key"


def _saved(conn):
    """A K2 class where the form saved: roll 3 above (to be corrected to below), roll 4 below (the control)."""
    from engine.w3_read import voice_confirm as vc

    k = a_k2_class(conn)
    vc.save_form(conn, k["email"], str(k["class"]),
                 vc.Confirmed(k["activity"], 2, {"above": ["3"], "below": ["4"]}, False, DAY))
    old = conn.execute("select id from activity_observation where child_id = %s",
                       (k["children"]["3"],)).fetchone()["id"]
    return k, old


def _row(conn, oid):
    return conn.execute("select to_jsonb(o) as j from activity_observation o where id = %s", (oid,)).fetchone()["j"]


def _evidence(conn, oid):
    return sorted(str(r["j"]) for r in conn.execute(
        "select to_jsonb(e) as j from evidence_event e where observation_id = %s", (oid,)))


def _picture(conn, child):
    return [{k: v for k, v in r.items() if k != "child_id"} for r in states(conn, "child_observed_state", child)]


def _old_row_holds(conn, old, before_row, before_evidence):
    assert _row(conn, old) == before_row, "the corrected row changed"
    assert _evidence(conn, old) == before_evidence, "the corrected row's evidence changed"
    for sql in ("update activity_observation set reason = 'edited' where id = %s",
                "delete from activity_observation where id = %s"):
        with pytest.raises(Exception), conn.transaction():
            conn.execute(sql, (old,))
    assert _row(conn, old) == before_row


def _only_the_correction_counts(conn, k):
    conn.commit()
    conn.execute("set role app_engine")
    run_nightly(conn)
    conn.commit()
    conn.execute("reset role")
    corrected, control = k["children"]["3"], k["children"]["4"]
    assert _picture(conn, control), "the control child has no picture: the run did not rebuild"
    assert _picture(conn, corrected) == _picture(conn, control), \
        "the corrected child's picture still reads the row that was corrected"


def test_2_correct_writes_a_new_row_and_the_old_one_never_changes(conn):
    from engine.w3_read import voice_confirm as vc
    from engine.w3_read.voice_store import Refused

    k, old = _saved(conn)
    before_row, before_evidence = _row(conn, old), _evidence(conn, old)
    new = vc.correct(conn, str(old), k["email"], "below", "misheard: below, not above")
    got = conn.execute("select supersedes, reason, outcome, child_id from activity_observation where id = %s",
                       (new,)).fetchone()
    assert new != old and got["supersedes"] == old and got["reason"] == "misheard: below, not above"
    assert got["outcome"] == "below" and got["child_id"] == k["children"]["3"]
    assert _evidence(conn, new), "the correction carries no evidence of its own"
    _old_row_holds(conn, old, before_row, before_evidence)
    with pytest.raises(Refused) as refused:
        vc.correct(conn, str(old), k["email"], "as_expected", "a second try")
    assert refused.value.status == 409
    _only_the_correction_counts(conn, k)


def test_2_correct_through_the_registered_route(conn, monkeypatch):
    from engine.api.app import app
    from engine.api.deps import get_conn

    k, old = _saved(conn)
    before_row, before_evidence = _row(conn, old), _evidence(conn, old)
    conn.execute("update config set value = 'true' where tenant_id = %s and key = 'voice.screens_enabled'",
                 (k["tenant"],))
    monkeypatch.setenv("ENGINE_KEY", KEY)

    def same_conn():
        yield conn

    app.dependency_overrides[get_conn] = same_conn
    try:
        client = TestClient(app)
        body = {"actor": k["email"], "observation_id": str(old), "outcome": "below", "reason": "misheard"}
        first = client.post("/voice/observations/correct", json=body, headers={"X-Engine-Key": KEY})
        assert first.status_code == 200, first.text
        new = first.json()["observation_id"]
        again = client.post("/voice/observations/correct", json=body | {"outcome": "as_expected"},
                            headers={"X-Engine-Key": KEY})
        assert again.status_code == 409, again.text
    finally:
        app.dependency_overrides.pop(get_conn, None)
    got = conn.execute("select supersedes, reason from activity_observation where id = %s", (new,)).fetchone()
    assert got["supersedes"] == old and got["reason"] == "misheard"
    _old_row_holds(conn, old, before_row, before_evidence)
    _only_the_correction_counts(conn, k)
