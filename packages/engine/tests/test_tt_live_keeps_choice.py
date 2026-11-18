"""CP-74, Done when 7 (specs/CP-74/spec.md): a lesson a person set keeps its objective, and whose choice it was, when a draft is put live.
Go-live takes the lessons that change place out and puts them back at the same id (`tt_live._write`), so every column it does not carry is
lost; this holds it to carrying `lo_code` and `source`. The world and the swapped draft are `test_timetable_go_live`'s."""

import os

import pytest

from tests.test_timetable_go_live import a_run, conn, go, swapped_draft, world  # noqa: F401  (fixtures)

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


def test_a_lesson_moved_by_go_live_keeps_its_objective_and_who_chose_it(conn, world):  # noqa: F811
    i = world["i"]
    draft, day, swap = swapped_draft(conn, i)
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal)"
        " values (%s, 'LO-T-LIVE', 'K2', 'Numeracy', 'Test unit', 'A test objective', 'Conceptual')",
        (i.tenant_id,),
    )
    moving = conn.execute(
        "select s.id from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and d.on_date = %s and s.period_id = any(%s::uuid[]) order by s.id",
        (i.class_id, day, list(swap)),
    ).fetchall()
    assert len(moving) == 2
    hers, machine = moving[0]["id"], moving[1]["id"]
    # the scene: she chose an objective for one of the two lessons; the other holds a machine-made suggestion
    conn.execute("update session set lo_code = 'LO-T-LIVE', source = 'person' where id = %s", (hers,))
    conn.execute("update session set lo_code = 'LO-T-LIVE' where id = %s", (machine,))
    place = {
        r["id"]: r["period_id"]
        for r in conn.execute(
            "select id, period_id from session where id = any(%s)", ([hers, machine],)
        ).fetchall()
    }
    go(conn, world, a_run(conn, i, draft))
    after = {
        r["id"]: r
        for r in conn.execute(
            "select id, period_id, lo_code, source from session where id = any(%s)", ([hers, machine],)
        ).fetchall()
    }
    assert all(after[x]["period_id"] != place[x] for x in (hers, machine)), (
        "the draft was meant to move both lessons"
    )
    assert (after[hers]["lo_code"], after[hers]["source"]) == ("LO-T-LIVE", "person")
    assert (after[machine]["lo_code"], after[machine]["source"]) == ("LO-T-LIVE", "machine")
