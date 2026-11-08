"""CP-7 item 8: the fortnight cannot be marked approved (CP-6's step, `fortnight_cycle` aligned -> approved) while any
class's fortnight is not settled or no longer matches the timetable (design, rule 6 "Gate").

Two K2 classes, A and B, each with a timetable in Fortnight 9. Message stem from the design's Refusals table:
`fortnight <n> cannot be approved: class <id> is not settled` (23514).
"""

from cp7_world import conn, refused, world  # noqa: F401


def gate_stem(world, n, klass):
    return f"fortnight {n} cannot be approved: class {klass} is not settled"


def aligned_fn9(world):
    world.timetable(world.a)
    world.timetable(world.b)
    world.freeze(9)
    world.move(9, "aligned")


def cycle_state(world, n):
    return world.c.execute("select state from fortnight_cycle where fortnight_id = %s", (world.fn[n],)).fetchone()[
        "state"]


def test_8_refused_while_a_class_has_no_drafted_fortnight(world):
    aligned_fn9(world)
    world.settle(world.a, 9)
    refused(world.move, 9, "approved", stem=gate_stem(world, 9, world.b), code="23514")
    assert cycle_state(world, 9) == "aligned"


def test_8_refused_while_a_class_has_a_changed_line_open(world):
    aligned_fn9(world)
    world.settle(world.a, 9)
    plan = world.draft(world.b, 9)  # no earlier fortnight: every line is a change
    world.decide(world.line(plan, "A", 1, 1)["id"])
    assert world.plan(plan)["state"] == "draft"
    refused(world.move, 9, "approved", stem=gate_stem(world, 9, world.b), code="23514")
    assert cycle_state(world, 9) == "aligned"


def test_8_allowed_once_every_class_is_settled(world):
    aligned_fn9(world)
    world.settle(world.a, 9)
    world.settle(world.b, 9)
    world.move(9, "approved")
    assert cycle_state(world, 9) == "approved"


def test_8_a_rolled_forward_fortnight_counts_as_settled(world):
    world.timetable(world.a)
    world.timetable(world.b)
    world.freeze(9, 11)
    world.move(9, "aligned")
    world.move(11, "aligned")
    world.settle(world.a, 9)
    world.settle(world.b, 9)
    world.move(9, "approved")
    for k in (world.a, world.b):
        assert world.plan(world.draft(k, 11))["state"] == "rolled_forward"
    world.move(11, "approved")
    assert cycle_state(world, 11) == "approved"


def test_8_refused_when_a_settled_fortnight_no_longer_matches_the_timetable(world):
    aligned_fn9(world)
    world.settle(world.a, 9)
    world.settle(world.b, 9)
    # after A was settled its frame changes (allowed with a reason under CP-6's freeze)
    world.change(world.a, "B", 4, 2, world.start[9], "Fake lesson changed late", reason="Fake reason: late change")
    refused(world.move, 9, "approved", stem=gate_stem(world, 9, world.a), code="23514")
    assert cycle_state(world, 9) == "aligned"
    world.settle(world.a, 9)  # drafted again and the change approved: the gate opens
    world.move(9, "approved")
    assert cycle_state(world, 9) == "approved"
