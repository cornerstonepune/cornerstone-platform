"""CP-7 items 1 to 6: a class's fortnight timetable is drafted, compared with its last settled fortnight, and rolls
forward when nothing differs; otherwise one person approves the whole fortnight with one yes (specs/CP-7/spec.md;
names from specs/CP-7/design.md, lean revision). Since CP-27 a class's fortnight is its lessons (`session`): a draft
gives them from the frame, the yes is a row of the one approval list with the fortnight's signature, and the baseline
is the signature of the class's last settled fortnight, carried forward by a fortnight that rolled forward.

Fixtures in cp7_world.py: a fake school, academic year 2031-32, fortnights 9 to 12, 2031-32 Fortnight 10 listed as an
exception, an approver (coordinator) and a non-approver (the class's own class teacher). Rolled back after each test.
"""

import pytest
from psycopg.types.json import Jsonb

from cp7_world import LINES, NOT_APPROVER, WHO, World, conn, real_date, refused, sql_as, world  # noqa: F401

NOT_OPEN = "fortnight is not open"


def settled_9_then_11(world, change=False):
    """Class A's timetable; Fortnight 9 settled; Fortnight 11 drafted, with one period reading differently if `change`."""
    world.timetable(world.a)
    if change:
        world.change(world.a, "A", 2, 2, world.start[11], "Fake lesson changed")
    world.freeze(9, 11)
    fn9 = world.settle(world.a, 9)
    return fn9, world.draft(world.a, 11)


# ---- item 1: one line per period of each school day of weeks A and B, on its real date, who and when ----


def test_1_a_draft_has_one_line_per_period_of_each_day_of_weeks_a_and_b_on_its_real_date(world):
    world.timetable(world.a)
    # from week B's Monday, its first period reads differently: the line must follow the frame valid on its own date
    b_monday = real_date(world.start[9], "B", 1)
    world.change(world.a, "B", 1, 1, b_monday, "Fake lesson moved")
    world.change(world.a, "A", 1, 1, b_monday, "Fake lesson moved")  # A's Monday is before that date: unaffected
    world.freeze(9)
    plan = world.draft(world.a, 9)
    lines = world.lines(plan)
    assert len(lines) == LINES, f"{len(lines)} lines, not one per period of each day of weeks A and B ({LINES})"
    keys = {(r["week_code"], r["weekday"], r["period_id"]) for r in lines}
    assert len(keys) == LINES, "a period of a day appears twice"
    for r in lines:
        o = next(o for o, p in world.period.items() if p == r["period_id"])
        assert r["on_date"] == real_date(world.start[9], r["week_code"], r["weekday"]), \
            f"{r['week_code']}{r['weekday']} is dated {r['on_date']}"
        want = "Fake lesson moved" if (r["week_code"], r["weekday"], o) == ("B", 1, 1) else \
            World.text(r["week_code"], r["weekday"], o)
        assert r["text"] == want, f"{r['week_code']}{r['weekday']}.{o} reads {r['text']!r}, not the frame of its date"


def test_1_a_draft_records_who_drafted_it_and_when(world):
    world.timetable(world.a)
    world.freeze(9)
    p = world.plan(world.draft(world.a, 9))
    assert p["drafted_by"] == WHO, f"drafted_by is {p['drafted_by']!r}, not who the draft was made by"
    assert p["drafted_at"] is not None


# ---- item 2: an unchanged fortnight rolls forward with no approval; any difference waits for approval ----


def test_2_a_fortnight_matching_the_last_approved_one_rolls_forward_with_no_approval(world):
    world.timetable(world.a)
    world.freeze(9, 11)
    fn9 = world.settle(world.a, 9)
    assert world.plan(fn9)["state"] == "approved", "the first fortnight, with nothing before it, did not wait for a yes"
    before = world.approvals()
    p = world.plan(world.draft(world.a, 11))
    assert p["state"] == "rolled_forward", f"an unchanged fortnight is {p['state']}"
    assert p["baseline"] == world.plan(fn9)["signature"]
    assert world.approvals() == before, "rolling forward wrote an approval"


def test_2_a_rolled_forward_fortnight_is_the_next_ones_baseline(world):
    world.timetable(world.a)
    world.freeze(9, 11, 12)
    fn9 = world.settle(world.a, 9)
    fn11 = world.draft(world.a, 11)
    assert world.plan(fn11)["state"] == "rolled_forward"
    before = world.approvals()
    p = world.plan(world.draft(world.a, 12))
    assert p["state"] == "rolled_forward"
    assert p["baseline"] == world.plan(fn11)["signature"] == world.plan(fn9)["signature"], \
        "the baseline is not the newest settled fortnight's (a rolled-forward one carries the last yes's signature)"
    assert world.approvals() == before


def test_2_a_first_fortnight_with_nothing_settled_before_waits_for_approval(world):
    world.timetable(world.a)
    world.freeze(9)
    p = world.plan(world.draft(world.a, 9))
    assert p["state"] == "draft", f"a fortnight with no earlier settled fortnight is {p['state']}"
    assert p["approved_at"] is None and p["approved_by"] is None


def test_2_a_fortnight_with_one_difference_waits_for_approval(world):
    fn9, plan = settled_9_then_11(world, change=True)
    p = world.plan(plan)
    assert p["state"] == "draft", f"a fortnight with one period reading differently is {p['state']}"
    assert p["approved_at"] is None and p["approved_by"] is None
    assert world.line(plan, "A", 2, 2)["text"] == "Fake lesson changed"


# ---- item 3: approving records exactly one approval, who and when, on the fortnight; rolled forward has none ----


def test_3_approving_records_one_approval_with_who_and_when_and_the_fortnight_counts_as_approved(world):
    _, plan = settled_9_then_11(world, change=True)
    before = world.approvals()
    world.approve(plan)
    p = world.plan(plan)
    assert p["state"] == "approved", f"after the yes the fortnight is {p['state']}"
    assert p["approved_by"] == WHO, f"approved_by is {p['approved_by']!r}, not the session's app.changed_by"
    assert p["approved_at"] is not None
    (yes,) = world.yeses(plan)
    assert world.approvals() == before + 1, "the yes is not exactly one row of the approval list"
    assert yes["detail"]["signature"] == p["signature"], "the yes does not keep what it was given on"


def test_3_an_approved_fortnight_cannot_be_approved_a_second_time(world):
    _, plan = settled_9_then_11(world, change=True)
    world.approve(plan)
    first = world.plan(plan)
    refused(world.approve, plan, stem=NOT_OPEN, code="23514")
    assert world.plan(plan) == first and len(world.yeses(plan)) == 1, "a second yes was written"


def test_3_a_rolled_forward_fortnight_has_no_approval(world):
    _, plan = settled_9_then_11(world)
    assert world.plan(plan)["state"] == "rolled_forward"
    before = world.approvals()
    refused(world.approve, plan, stem=NOT_OPEN, code="23514")
    assert world.plan(plan)["state"] == "rolled_forward", "a rolled-forward fortnight was approved"
    assert world.approvals() == before and world.yeses(plan) == []


# ---- item 4: drafting again with nothing changed writes nothing ----


@pytest.mark.parametrize("settle", ["draft", "approved", "rolled_forward"])
def test_4_drafting_again_with_nothing_changed_writes_nothing(world, settle):
    _, plan = settled_9_then_11(world, change=settle != "rolled_forward")
    if settle == "approved":
        world.approve(plan)
    assert world.plan(plan)["state"] == settle
    before_row, before_counts = world.plan(plan), world.counts()
    assert world.draft(world.a, 11) == plan, "a rerun returned another fortnight"
    assert world.counts() == before_counts, "a rerun with nothing changed wrote rows"
    assert world.plan(plan) == before_row, "a rerun with nothing changed changed where the fortnight stands"


# ---- item 5: an exception fortnight rolls nothing forward ----


def test_5_every_school_has_the_exception_setting_defaulting_to_2026_27_fortnights_10_and_11(world):
    value = world.setting("fortnight.no_roll_forward")
    assert sorted(value.get("2026-27", [])) == [10, 11], f"the default is {value.get('2026-27')}"


def test_5_an_unchanged_exception_fortnight_needs_a_yes(world):
    world.timetable(world.a)
    world.freeze(9, 10)
    world.settle(world.a, 9)
    before = world.approvals()
    plan = world.draft(world.a, 10)  # identical to Fortnight 9, but 2031-32 lists Fortnight 10
    assert world.plan(plan)["state"] == "draft", f"an exception fortnight rolled forward: {world.plan(plan)['state']}"
    assert world.approvals() == before
    world.approve(plan)
    assert world.plan(plan)["state"] == "approved"


def test_5_the_exception_is_per_school_year(world):
    # 11 is listed for 2026-27 only: in 2031-32, Fortnight 11 unchanged rolls forward
    _, plan = settled_9_then_11(world)
    assert world.plan(plan)["state"] == "rolled_forward"


def test_5_the_exception_is_a_setting_of_the_school(world, conn):
    world.timetable(world.a)
    conn.execute("update config set value = value || %s where tenant_id = %s and key = 'fortnight.no_roll_forward'",
                 (Jsonb({"2031-32": [10, 11]}), world.t))
    world.freeze(9, 11)
    world.settle(world.a, 9)
    assert world.plan(world.draft(world.a, 11))["state"] == "draft"


# ---- item 6: the coordinator or "Everything" group approves; anyone else is refused, however they try ----


def test_6_the_approver_groups_are_a_setting_of_the_school(world):
    groups = world.setting("fortnight.approver_groups")
    assert isinstance(groups, list) and "everything" in groups, f"approver groups: {groups}"


def test_6_someone_outside_the_groups_is_refused_by_the_function(world):
    _, plan = settled_9_then_11(world, change=True)
    for who in ("other", None, "not-a-uuid"):
        refused(world.approve, plan, who=who, stem=NOT_APPROVER, code="42501")
    p = world.plan(plan)
    assert p["state"] == "draft" and p["approved_at"] is None
    world.approve(plan)  # the coordinator may
    assert world.plan(plan)["state"] == "approved"


def _a_yes(world, plan, detail=None):
    klass, n = plan
    return ("insert into approval (tenant_id, kind, target, decision, by, detail) values (%s, 'timetable', %s,"
            " 'approve', 'staff:fake', %s)", (world.t, f"{klass} {world.fn[n]}", Jsonb(detail or {})))


@pytest.mark.parametrize("role", ["app_web", "app_engine"])
def test_6_the_list_cannot_be_written_directly_by_an_app_login(world, conn, role):
    _, plan = settled_9_then_11(world, change=True)
    refused(sql_as, conn, role, world.staff["other"], *_a_yes(world, plan), stem=NOT_APPROVER, code="42501")
    # the approving group's own direct row is held to what the function holds it to: the fortnight as it stands
    refused(sql_as, conn, role, world.staff["approver"], *_a_yes(world, plan), stem=NOT_OPEN, code="23514")
    world.approve(plan)
    for sql in ("update approval set decision = 'approve' where tenant_id = %s", "delete from approval where tenant_id = %s"):
        refused(sql_as, conn, role, world.staff["approver"], sql, (world.t,))
    assert world.plan(plan)["state"] == "approved" and len(world.yeses(plan)) == 1


def test_6_a_direct_write_by_the_owner_is_held_to_the_group_rule(world, conn):
    # the owner, as both services still connect on the live site: the trigger on approval holds it to the rule
    _, plan = settled_9_then_11(world, change=True)
    for who in (world.staff["other"], None):
        refused(sql_as, conn, None, who, *_a_yes(world, plan), stem=NOT_APPROVER, code="42501")
    assert world.plan(plan)["state"] == "draft"


def test_6_no_one_deletes_a_yes(world, conn):
    _, plan = settled_9_then_11(world, change=True)
    world.approve(plan)
    refused(sql_as, conn, None, None, "delete from approval where kind = 'timetable' and tenant_id = %s", (world.t,))
    assert len(world.yeses(plan)) == 1


def test_6_changing_the_setting_changes_who_may_approve(world, conn):
    _, plan = settled_9_then_11(world, change=True)
    refused(world.approve, plan, who="other", stem=NOT_APPROVER, code="42501")
    conn.execute("update config set value = %s where tenant_id = %s and key = 'fortnight.approver_groups'",
                 (Jsonb(["everything", "own_classes"]), world.t))
    world.approve(plan, who="other")
    assert world.plan(plan)["state"] == "approved"


def test_6_the_functions_cannot_be_called_by_anon_or_authenticated(world, conn):
    _, plan = settled_9_then_11(world, change=True)
    for role in ("anon", "authenticated"):
        for sql, params in (("select public.fortnight_approve(%s, %s)", (world.a, world.fn[11])),
                            ("select * from public.timetable_standing(%s, %s)", (world.a, world.fn[11]))):
            refused(sql_as, conn, role, world.staff["approver"], sql, params, code="42501")
