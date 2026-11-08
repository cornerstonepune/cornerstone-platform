"""CP-21 item 1: putting a placed draft live makes the educator's day show, on every date of the fortnight, exactly the
draft's lessons in the draft's periods; the fortnights before and after are unchanged."""

from conftest import day_view, draft_by_date, generated, go_live, lessons, run_with, swapped, teaching, world


def test_every_date_shows_exactly_the_draft_and_the_fortnights_around_it_do_not_change(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    draft = swapped(w)
    run = run_with(conn, generated(conn, engine, w), draft)
    want = draft_by_date(draft)
    days = teaching(w, 2)
    around = w["fortnights"][1]["dates"] + w["fortnights"][3]["dates"]
    shown = day_view(conn, w, days)
    assert any(lessons(d) != want[d["day"]] for d in shown), "the proof's draft must differ from the frame"
    before_around = day_view(conn, w, around)

    code, out = go_live(engine, w, run)
    assert code == 0, out

    after = day_view(conn, w, days)
    for d in after:
        assert lessons(d) == want[d["day"]], f"{d['day']}: shown {sorted(lessons(d))}, draft {sorted(want[d['day']])}"
        assert any(p["kind"] == "fixed" for p in d["periods"]), f"{d['day']}: the circle period is gone"
    assert day_view(conn, w, around) == before_around, "a fortnight before or after changed"
