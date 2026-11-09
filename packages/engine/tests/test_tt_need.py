"""CP-11: what a fortnight needs, worked out by code (engine/w2_print/tt_need.py). No database: the inputs are built
by hand. Made-up subjects, no names."""

import datetime as dt

from engine.adapters import fet
from engine.w2_print import tt_need as need

START = dt.date(2031, 6, 2)  # a Monday
P1, P2 = "p1", "p2"


def inputs(frame, blocks=(), limits=(), n_days=10) -> need.Inputs:
    days = [d for d in (START + dt.timedelta(days=i) for i in range(14)) if d.isoweekday() <= 5][:n_days]
    return need.Inputs(
        "c", "t", "f", "ZP A",
        [need.Day(d, "A" if (d - START).days < 7 else "B") for d in days],
        [{"id": P1, "starts_at": "09:00"}, {"id": P2, "starts_at": "10:00"}],
        frame, list(blocks), list(limits),
    )  # fmt: skip


def week_frame(*cells):
    """The same frame in both weeks: every weekday holds `cells` = (kind, subject) for P1, P2."""
    return {(w, wd, p): c for w in "AB" for wd in range(1, 6) for p, c in zip((P1, P2), cells, strict=True)}


def limit(subject, span, fewest=None, most=None, id="l1"):
    return {"id": id, "subject_code": subject, "span": span, "fewest": fewest, "most": most}


def block(reason="Trip", on_date=None, weekday=None, week=None, period_id=None, id="b1"):
    return {"id": id, "on_date": on_date, "weekday": weekday, "week": week, "period_id": period_id, "reason": reason,
            "period": None}  # fmt: skip


def test_a_subject_needs_the_cells_the_frame_holds():
    n = need.needs(inputs(week_frame(("subject", "MATH"), ("empty", None))))
    assert n.lessons == {"MATH": {"A": 5, "B": 5}} and n.total() == 10


def test_a_week_limit_applies_per_week_and_a_fortnight_limit_to_the_total():
    n = need.needs(inputs(week_frame(("subject", "MATH"), ("subject", "ENG")), limits=[
        limit("MATH", "week", most=3), limit("ENG", "fortnight", fewest=12, id="l2")]))  # fmt: skip
    assert n.lessons["MATH"] == {"A": 3, "B": 3}
    assert n.total("ENG") == 12 and n.weekly == {"MATH"}


def test_contradicting_limits_are_named_not_fitted():
    n = need.needs(inputs(week_frame(("subject", "MATH"), ("empty", None)), limits=[
        limit("MATH", "week", fewest=5), limit("MATH", "fortnight", most=6, id="l2")]))  # fmt: skip
    assert [c["id"] for c in n.contradiction] == ["l1", "l2"]
    failing, why = need.checks(inputs(week_frame(("subject", "MATH"), ("empty", None))), n)
    assert "cannot both hold" in failing[0] and {w["id"] for w in why} == {"l1", "l2"}


def test_a_holiday_is_left_out_and_a_blocked_cell_is_not_free_but_its_lesson_is_moved():
    i = inputs(
        week_frame(("subject", "MATH"), ("empty", None)), blocks=[block(on_date="2031-06-04")], n_days=10
    )
    wednesday = next(d for d in i.days if d.date.isoformat() == "2031-06-04")
    assert not need.is_free(i, wednesday, P1) and not need.is_free(i, wednesday, P2)
    assert need.needs(i).total() == 10  # moved, not dropped
    assert need.free_by_week(i) == {"A": 8, "B": 10}


def test_too_many_lessons_names_the_limit_and_the_block():
    i = inputs(week_frame(("subject", "MATH"), ("empty", None)), blocks=[block(on_date="2031-06-04")],
               limits=[limit("MATH", "fortnight", fewest=30)])  # fmt: skip
    failing, why = need.checks(i, need.needs(i))
    assert failing == ["Fortnight: 30 lessons needed, 18 free periods"]
    assert {w["kind"] for w in why} == {"limit", "block"} and "Trip" in [w["words"] for w in why][1]


def test_the_input_file_is_the_same_bytes_every_time_and_escapes_text():
    plan = fet.Plan("ZP <A> & B", ["2031-06-02"], ["09:00"], ["MATH"], [(1, "MATH")])
    first = fet.build_input(plan, "FET version 6.8.5")
    assert first == fet.build_input(plan, "FET version 6.8.5")
    assert "ZP &lt;A&gt; &amp; B" in first and "ZP <A>" not in first
