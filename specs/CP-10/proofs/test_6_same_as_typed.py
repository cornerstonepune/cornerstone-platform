"""CP-10 item 6: a confirmed voice note and the same observation saved on the typed form give the same
`activity_observation` values (except route and note), the same `evidence_event` rows and, after the rebuild, the same
child state. A voice note not confirmed in 48 hours produces no observation and no evidence, even after the clean-up and
the rebuild.

Twin children: class A's roll n and class B's roll n, the same educator, the same activity. The note is confirmed in
class A, the form saved in class B, in one transaction (one clock). Ids that only say which twin a row is (row ids, the
child, the class, the confirmation, the observation a row points to) are set aside; every other value must be equal.
The rebuild is the one on main today, `engine.assess.graph.rebuild` (CP-9's nightly is not on main)."""

import re

from conftest import cleanup, confirmed, received_ago, record

from engine.assess import graph
from engine.w3_read import voice_confirm

TWIN_IDS = {"id", "child_id", "class_id", "confirmation_id", "observation_id", "note_id", "route"}
CLOCKS = {"created_at", "updated_at", "computed_at"}
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def _same_shape(row: dict) -> dict:
    return {k: UUID.sub("<id>", v) if isinstance(v, str) else v
            for k, v in row.items() if k not in TWIN_IDS | CLOCKS}


def _by_roll(conn, school, section, sql):
    out = {}
    for roll in ("1", "2", "3", "4", "5"):
        rows = conn.execute(sql, (school.children[(section, roll)],)).fetchall()
        out[roll] = sorted((_same_shape(r) for r in rows), key=lambda r: sorted(map(str, r.items())))
    return out


def test_6_a_confirmed_voice_note_and_the_typed_form_give_the_same_rows_and_the_same_state(conn, school):
    note = record(conn, school, "A")
    voice_confirm.confirm_note(conn, str(note["id"]), school.email, confirmed(school))
    voice_confirm.save_form(conn, school.email, school.classes["B"], confirmed(school))
    routes = conn.execute("select route, count(*) n from activity_observation group by route order by route").fetchall()
    assert [(r["route"], r["n"]) for r in routes] == [("form", 5), ("voice", 5)], routes

    for sql, what in (("select * from activity_observation where child_id = %s", "activity_observation"),
                      ("select * from evidence_event where child_id = %s", "evidence_event")):
        a, b = _by_roll(conn, school, "A", sql), _by_roll(conn, school, "B", sql)
        assert any(a.values()), f"no {what} rows"
        assert a == b, f"{what}: the voice note and the form differ"

    graph.rebuild(conn)
    for table in ("child_observed_state", "child_skill_state"):
        sql = f"select * from {table} where child_id = %s"
        a, b = _by_roll(conn, school, "A", sql), _by_roll(conn, school, "B", sql)
        assert a == b, f"{table}: the voice note and the form give a different state"
    assert any(_by_roll(conn, school, "A", "select * from child_observed_state where child_id = %s").values())


def test_6_a_note_not_confirmed_in_48_hours_gives_no_observation_and_no_evidence(conn, school, client):
    note = record(conn, school, "A")
    received_ago(conn, note["id"], 49)
    conn.commit()
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    graph.rebuild(conn)
    kids = [school.children[("A", roll)] for roll in ("1", "2", "3", "4", "5")]
    assert conn.execute("select count(*) n from activity_observation where note_id = %s or child_id = any(%s::uuid[])",
                        (note["id"], kids)).fetchone()["n"] == 0
    assert conn.execute("select count(*) n from evidence_event where child_id = any(%s::uuid[])",
                        (kids,)).fetchone()["n"] == 0
    assert conn.execute("select count(*) n from child_observed_state where child_id = any(%s::uuid[])",
                        (kids,)).fetchone()["n"] == 0
