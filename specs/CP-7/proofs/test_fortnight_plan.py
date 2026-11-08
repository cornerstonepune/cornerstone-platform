"""CP-7 items 1 to 7: a class's fortnight timetable is drafted, compared with its last settled fortnight, and only the
changed periods need a person (specs/CP-7/spec.md; names from specs/CP-7/design.md).

Fixtures in cp7_world.py: a fake school, academic year 2031-32, fortnights 9 to 12, 2031-32 Fortnight 10 listed as an
exception, an approver (coordinator) and a non-approver (the class's own class teacher). Rolled back after each test.
"""

import pytest
from psycopg.types.json import Jsonb

from cp7_world import LINES, NOT_APPROVER, WHO, World, conn, real_date, refused, sql_as, world  # noqa: F401


def changed(lines):
    return [(r["week_code"], r["weekday"], r["period_id"]) for r in lines if r["changed"]]


def frame(w: World):
    """Class A's timetable: the same every fortnight until a test changes it (before anything is frozen)."""
    w.timetable(w.a)


# ---- item 1: one line per period of each school day of weeks A and B, on its real date, who and when ----


def test_1_a_draft_has_one_line_per_period_of_each_day_of_weeks_a_and_b_on_its_real_date(world):
    world.timetable(world.a)
    # from week B's Monday, its first period reads differently: the line must follow the slot valid on its own date
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
        assert r["text"] == want, f"{r['week_code']}{r['weekday']}.{o} reads {r['text']!r}, not the slot of its date"


def test_1_a_draft_records_who_drafted_it_and_when(world):
    world.timetable(world.a)
    world.freeze(9)
    p = world.plan(world.draft(world.a, 9))
    assert p["drafted_by"] == WHO, f"drafted_by is {p['drafted_by']!r}, not the session's app.changed_by"
    assert p["drafted_at"] is not None
    assert (p["school_class_id"], p["fortnight_id"], p["version"]) == (world.a, world.fn[9], 1)


# ---- item 2: an unchanged fortnight rolls forward and writes no approval ----


def test_2_a_fortnight_matching_the_last_approved_one_rolls_forward_with_no_approval(world):
    frame(world)
    world.freeze(9, 11)
    fn9 = world.settle(world.a, 9)
    before = len(world.approvals())
    p = world.plan(world.draft(world.a, 11))
    assert p["state"] == "rolled_forward", f"an unchanged fortnight is {p['state']}"
    assert p["baseline_id"] == fn9
    assert p["settled_at"] is not None and p["settled_by"]
    assert changed(world.lines(p["id"])) == []
    assert len(world.approvals()) == before, "rolling forward wrote an approval"


def test_2_a_rolled_forward_fortnight_is_the_next_ones_baseline(world):
    frame(world)
    world.freeze(9, 11, 12)
    world.settle(world.a, 9)
    fn11 = world.draft(world.a, 11)
    before = len(world.approvals())
    p = world.plan(world.draft(world.a, 12))
    assert p["state"] == "rolled_forward"
    assert p["baseline_id"] == fn11, "the baseline is not the newest settled fortnight (a rolled-forward one)"
    assert len(world.approvals()) == before


def test_2_a_period_removed_and_approved_once_is_not_a_change_again(world):
    frame(world)
    world.change(world.a, "A", 3, 3, world.start[11])  # the period is gone from Fortnight 11 on
    world.freeze(9, 11, 12)
    world.settle(world.a, 9)
    fn11 = world.draft(world.a, 11)
    assert world.plan(fn11)["state"] == "draft"
    assert changed(world.lines(fn11)) == [("A", 3, world.period[3])], "the removed period is not the one change"
    assert world.approve_open(fn11) == 1
    before = len(world.approvals())
    p = world.plan(world.draft(world.a, 12))
    assert p["state"] == "rolled_forward", f"the period removed and approved once counted again: {p['state']}"
    assert changed(world.lines(p["id"])) == []
    assert len(world.approvals()) == before


# ---- item 3: a differing line is changed; approving it writes exactly one row with who and when ----


def _two_changes(world):
    """Fortnight 9 settled; in Fortnight 11 one period reads differently and another is removed."""
    frame(world)
    world.change(world.a, "A", 2, 2, world.start[11], "Fake lesson changed")
    world.change(world.a, "B", 5, 1, world.start[11])
    world.freeze(9, 11)
    world.settle(world.a, 9)
    return world.draft(world.a, 11)


def test_3_each_differing_line_and_a_removed_period_is_marked_changed(world):
    plan = _two_changes(world)
    assert sorted(changed(world.lines(plan))) == sorted([("A", 2, world.period[2]), ("B", 5, world.period[1])])
    gone = world.line(plan, "B", 5, 1)
    assert gone["kind"] == "empty", f"a removed period is written as {gone['kind']}, not empty"
    assert world.plan(plan)["state"] == "draft"


def test_3_approving_a_changed_line_writes_exactly_one_approval_with_who_and_when(world):
    plan = _two_changes(world)
    ln = world.line(plan, "A", 2, 2)
    before = len(world.approvals())
    world.decide(ln["id"])
    rows = world.approvals(ln["id"])
    assert len(world.approvals()) == before + 1, "approving one line did not write exactly one row"
    assert len(rows) == 1 and rows[0]["decision"] == "approved"
    assert rows[0]["by"] == WHO and rows[0]["created_at"] is not None
    assert world.line(plan, "A", 2, 2)["approval_id"] == rows[0]["id"]


def test_3_an_approved_line_keeps_exactly_one_approval(world):
    plan = _two_changes(world)
    ln = world.line(plan, "A", 2, 2)
    world.decide(ln["id"])
    refused(world.decide, ln["id"], stem="line is not open", code="23514")
    assert len(world.approvals(ln["id"], "approved")) == 1


def test_3_an_unchanged_line_is_not_approved(world):
    plan = _two_changes(world)
    same = world.line(plan, "A", 1, 1)
    assert not same["changed"]
    before = len(world.approvals())
    refused(world.decide, same["id"], stem="line is not open", code="23514")
    assert len(world.approvals()) == before


# ---- item 4: approved only when every changed line is; one action for all; sent back, then approved ----


def _changes(world, n):
    frame(world)
    for d in range(1, n + 1):
        world.change(world.a, "A", d, 1, world.start[11], f"Fake lesson changed {d}")
    world.freeze(9, 11)
    world.settle(world.a, 9)
    return world.draft(world.a, 11)


def test_4_a_fortnight_is_approved_only_when_every_changed_line_is(world):
    plan = _changes(world, 2)
    first, second = (world.line(plan, "A", d, 1)["id"] for d in (1, 2))
    world.decide(first)
    assert world.plan(plan)["state"] == "draft", "approved with a changed line still open"
    assert world.plan(plan)["settled_at"] is None
    world.decide(second)
    p = world.plan(plan)
    assert p["state"] == "approved" and p["settled_at"] is not None


def test_4_one_action_approves_every_open_line_with_one_row_each(world):
    plan = _changes(world, 3)
    world.decide(world.line(plan, "A", 1, 1)["id"])
    before = len(world.approvals())
    assert world.approve_open(plan) == 2, "the count returned is not the open lines"
    assert len(world.approvals()) == before + 2
    for r in world.lines(plan):
        if r["changed"]:
            assert len(world.approvals(r["id"], "approved")) == 1, "a line has other than one approval"
            assert r["approval_id"] is not None
    assert world.plan(plan)["state"] == "approved"


def test_4_a_line_sent_back_needs_a_reason_and_can_be_approved_later(world):
    plan = _changes(world, 1)
    ln = world.line(plan, "A", 1, 1)["id"]
    refused(world.decide, ln, "sent_back")  # no reason
    world.decide(ln, "sent_back", "Fake reason: the period clashes")
    back = world.approvals(ln)
    assert [r["decision"] for r in back] == ["sent_back"] and back[0]["reason"] == "Fake reason: the period clashes"
    assert world.line(plan, "A", 1, 1)["approval_id"] is None
    assert world.plan(plan)["state"] == "draft", "a fortnight with a line sent back counts as approved"
    world.decide(ln)
    assert len(world.approvals(ln, "approved")) == 1
    assert world.plan(plan)["state"] == "approved"


# ---- item 5: drafting again with nothing changed writes nothing; after a fix, approved lines stay approved ----


@pytest.mark.parametrize("settle", ["draft", "approved", "rolled_forward"])
def test_5_drafting_again_with_nothing_changed_writes_nothing(world, settle):
    frame(world)
    if settle != "rolled_forward":
        world.change(world.a, "A", 1, 1, world.start[11], "Fake lesson changed")
    world.freeze(9, 11)
    world.settle(world.a, 9)
    plan = world.draft(world.a, 11)
    if settle == "approved":
        world.approve_open(plan)
    assert world.plan(plan)["state"] == settle
    before_row, before_counts = world.plan(plan), world.counts()
    assert world.draft(world.a, 11) == plan, "a rerun returned another plan"
    assert world.counts() == before_counts, "a rerun with nothing changed wrote rows"
    assert world.plan(plan) == before_row, "a rerun with nothing changed rewrote the plan"


def test_5_after_a_fix_lines_already_approved_stay_approved(world):
    plan = _changes(world, 2)
    kept = world.line(plan, "A", 1, 1)
    world.decide(kept["id"])
    kept_approval = world.line(plan, "A", 1, 1)["approval_id"]
    world.change(world.a, "A", 2, 1, world.start[11], "Fake lesson fixed", reason="Fake reason: a fix")
    before = len(world.approvals())
    fixed = world.draft(world.a, 11)
    assert fixed != plan and world.plan(fixed)["version"] == 2
    assert len(world.approvals()) == before, "drafting a fix wrote an approval"
    assert world.line(fixed, "A", 1, 1)["approval_id"] == kept_approval, "an approved line lost its approval"
    assert world.line(fixed, "A", 2, 1)["approval_id"] is None
    assert world.line(fixed, "A", 2, 1)["text"] == "Fake lesson fixed"
    assert world.plan(fixed)["state"] == "draft"
    assert len(world.approvals(kept["id"], "approved")) == 1


def test_5_a_fix_that_leaves_only_approved_lines_settles_with_no_new_approval(world):
    plan = _changes(world, 2)
    world.decide(world.line(plan, "A", 1, 1)["id"])
    # the other change is undone: back to Fortnight 9's wording
    world.change(world.a, "A", 2, 1, world.start[11], World.text("A", 2, 1), reason="Fake reason: undo")
    before = len(world.approvals())
    p = world.plan(world.draft(world.a, 11))
    assert p["state"] == "approved", f"every line carried or unchanged, yet {p['state']}"
    assert p["settled_at"] is not None
    assert len(world.approvals()) == before


# ---- item 6: an exception fortnight rolls nothing forward ----


def test_6_every_school_has_the_exception_setting_defaulting_to_2026_27_fortnights_10_and_11(world):
    value = world.setting("fortnight.no_roll_forward")
    assert sorted(value.get("2026-27", [])) == [10, 11], f"the default is {value.get('2026-27')}"


def test_6_in_an_exception_fortnight_every_line_needs_approval(world):
    frame(world)
    world.freeze(9, 10)
    world.settle(world.a, 9)
    before = len(world.approvals())
    plan = world.draft(world.a, 10)  # identical to Fortnight 9, but 2031-32 lists Fortnight 10
    p = world.plan(plan)
    assert p["state"] == "draft", f"an exception fortnight rolled forward: {p['state']}"
    assert len(changed(world.lines(plan))) == LINES, "not every line of the exception fortnight needs approval"
    assert len(world.approvals()) == before
    assert world.approve_open(plan) == LINES
    assert world.plan(plan)["state"] == "approved"


def test_6_the_exception_is_per_school_year(world):
    # 11 is listed for 2026-27 only: in 2031-32, Fortnight 11 unchanged rolls forward
    frame(world)
    world.freeze(9, 11)
    world.settle(world.a, 9)
    assert world.plan(world.draft(world.a, 11))["state"] == "rolled_forward"


def test_6_the_exception_is_a_setting_of_the_school(world, conn):
    frame(world)
    conn.execute("update config set value = value || %s where tenant_id = %s and key = 'fortnight.no_roll_forward'",
                 (Jsonb({"2031-32": [10, 11]}), world.t))
    world.freeze(9, 11)
    world.settle(world.a, 9)
    plan = world.draft(world.a, 11)
    assert world.plan(plan)["state"] == "draft"
    assert len(changed(world.lines(plan))) == LINES


# ---- item 7: the coordinator or "Everything" group approves; anyone else is refused, however they try ----


def test_7_the_approver_groups_are_a_setting_of_the_school(world):
    groups = world.setting("fortnight.approver_groups")
    assert isinstance(groups, list) and "everything" in groups, f"approver groups: {groups}"


def test_7_someone_outside_the_groups_is_refused_by_the_functions(world):
    plan = _changes(world, 2)
    ln = world.line(plan, "A", 1, 1)["id"]
    before = len(world.approvals())
    for who in ("other", None, "not-a-uuid"):
        refused(world.decide, ln, who=who, stem=NOT_APPROVER, code="42501")
        refused(world.decide, ln, "sent_back", "Fake reason", who=who, stem=NOT_APPROVER, code="42501")
        refused(world.approve_open, plan, who=who, stem=NOT_APPROVER, code="42501")
    assert len(world.approvals()) == before
    assert world.plan(plan)["state"] == "draft"
    world.decide(ln)  # the coordinator may
    assert len(world.approvals()) == before + 1


def test_7_a_direct_approval_row_from_someone_outside_the_groups_is_refused(world, conn):
    plan = _changes(world, 1)
    ln = str(world.line(plan, "A", 1, 1)["id"])
    row = ("insert into approval (tenant_id, kind, target, decision, by) values (%s, 'timetable_line', %s,"
           " 'approved', 'staff:fake')")
    for role in ("app_web", "app_engine"):
        for who in (world.staff["other"], None):
            refused(sql_as, conn, role, who, row, (world.t, ln), code="42501")
    # the owner, as both services still connect on the live site: held to the group rule by the ledger itself
    for who in (world.staff["other"], None):
        refused(sql_as, conn, None, who, row, (world.t, ln), stem=NOT_APPROVER, code="42501")
    assert world.approvals(ln) == []


@pytest.mark.parametrize("role", ["app_web", "app_engine"])
def test_7_the_tables_cannot_be_written_directly_by_an_app_login(world, conn, role):
    plan = _changes(world, 1)
    ln = world.line(plan, "A", 1, 1)
    for who in (world.staff["other"], world.staff["approver"]):
        for sql, params in (
            ("update fortnight_plan set state = 'approved' where id = %s", (plan,)),
            ("update fortnight_plan_line set changed = false where id = %s", (ln["id"],)),
            ("update fortnight_plan_line set approval_id = gen_random_uuid() where id = %s", (ln["id"],)),
            ("insert into fortnight_plan (tenant_id, school_class_id, fortnight_id, version, state)"
             " values (%s, %s, %s, 99, 'approved')", (world.t, world.a, world.fn[11])),
            ("delete from fortnight_plan_line where id = %s", (ln["id"],)),
        ):
            refused(sql_as, conn, role, who, sql, params, code="42501")
    assert world.plan(plan)["state"] == "draft"
    assert world.line(plan, "A", 1, 1)["changed"] is True


def test_7_no_one_deletes_a_plan_or_its_lines(world, conn):
    plan = _changes(world, 1)
    for sql in ("delete from fortnight_plan_line where fortnight_plan_id = %s", "delete from fortnight_plan where id = %s"):
        refused(sql_as, conn, None, None, sql, (plan,))
    assert len(world.lines(plan)) == LINES


def test_7_changing_the_setting_changes_who_may_approve(world, conn):
    plan = _changes(world, 1)
    ln = world.line(plan, "A", 1, 1)["id"]
    refused(world.decide, ln, who="other", stem=NOT_APPROVER, code="42501")
    conn.execute("update config set value = %s where tenant_id = %s and key = 'fortnight.approver_groups'",
                 (Jsonb(["everything", "own_classes"]), world.t))
    world.decide(ln, who="other")
    assert len(world.approvals(ln, "approved")) == 1


def test_7_the_functions_cannot_be_called_by_anon_or_authenticated(world, conn):
    plan = _changes(world, 1)
    ln = world.line(plan, "A", 1, 1)["id"]
    for role in ("anon", "authenticated"):
        for sql, params in (("select public.fortnight_line_decide(%s, 'approved')", (ln,)),
                            ("select public.fortnight_approve_open(%s)", (plan,)),
                            ("select public.fortnight_draft(%s, %s)", (world.a, world.fn[11]))):
            refused(sql_as, conn, role, world.staff["approver"], sql, params, code="42501")
