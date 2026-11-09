"""CP-10 item 2: what the educator confirmed stays after the clean-up: the observation, its evidence rows, what she
decided on each line, and the free sentence she confirmed, which the child's page still shows."""

from conftest import SENTENCE, cleanup, confirmed, note_row, received_ago, record, recording_path

from engine.assess import graph
from engine.w3_read import k2_picture_reads, voice_confirm


def _rows(conn, note_id):
    obs = conn.execute("select * from activity_observation where note_id = %s order by child_id", (note_id,)).fetchall()
    ev = conn.execute("select e.* from evidence_event e join activity_observation o on o.id = e.observation_id"
                      " where o.note_id = %s order by e.id", (note_id,)).fetchall()
    lines = conn.execute("select id, section, read_as, decision, kept_as, decided_by, decided_at from pii.note_claim"
                         " where note_id = %s order by id", (note_id,)).fetchall()
    return obs, ev, lines


def _sentence_on_page(conn, school, roll):
    page = k2_picture_reads.child_page(conn, school.email, school.classes["A"], roll)
    return [s["sentence"] for s in page["skills"] if s["sentence"]]


def test_2_observation_evidence_decisions_and_her_sentence_stay_after_the_clean_up(conn, school, client, voice_dir):
    note = record(conn, school)
    voice_confirm.confirm_note(conn, str(note["id"]), school.email, confirmed(school))
    graph.rebuild(conn)
    conn.commit()
    before = _rows(conn, note["id"])
    obs, ev, lines = before
    assert obs and ev and lines, "the confirmed note made observations, evidence and her decisions"
    shown = _sentence_on_page(conn, school, "1")
    assert shown and SENTENCE in shown[0], "before the clean-up the child's page shows the sentence she confirmed"
    conn.commit()

    received_ago(conn, note["id"], 49)
    conn.commit()
    r = cleanup(client)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    assert not recording_path(voice_dir, note).exists() and note_row(conn, note["id"])["transcript"] is None, \
        "the clean-up ran on this note"

    assert _rows(conn, note["id"]) == before, "the observation, its evidence or her decisions changed"
    graph.rebuild(conn)
    after = _sentence_on_page(conn, school, "1")
    assert after and SENTENCE in after[0], "after the clean-up the child's page no longer shows her sentence"
