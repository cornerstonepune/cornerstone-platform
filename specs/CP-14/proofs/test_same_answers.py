"""CP-14 item 6: "ready next" per skill gives the same answers as before, and the child page's number of database reads
stays fixed whatever the class size.

Part 1 is the pure functions in `engine/w3_read/k2_growth.py` (no database). `ready_next(links, states, done_states)`
keeps its signature and its answers on fixed cases worked by hand (they are what it answers on main today). Design §3
adds `blocked(links, states, done_states) -> set` beside it, read the same way: a skill is blocked when it is not done
and a confirmed hard link before it is not done. No skill is ever both ready and blocked.

Part 2 is `k2_picture_reads.child_page` on the throwaway database: a class of 3 and a class of 30, each with links and
activities, ask the database the same number of times, and both answers carry `ready_activities` (so the count is of
the page CP-14 makes, not of today's page).
"""

from conftest import Counting, activity, child, k2_class, link, page, person, school, state

DONE = {"secure"}


def L(skill, before, strength="hard"):
    return {"skill": skill, "before": before, "strength": strength}


# (links, states, ready_next as worked by hand, blocked as worked by hand)
CASES = [
    # nothing seen, nothing linked
    ([], {}, [], set()),
    # one hard link, the first done
    ([L("C", "A")], {"A": "secure"}, [{"skill": "C", "because": [{"before": "A", "strength": "hard"}]}], set()),
    # the first only to re-check: not done, so C waits on it
    ([L("C", "A")], {"A": "secure_to_recheck"}, [], {"C"}),
    # the first not seen at all: C waits on it, and is never called "not ready"
    ([L("C", "A")], {}, [], {"C"}),
    # two hard links, one not done: blocked, not ready
    ([L("D", "A"), L("D", "X")], {"A": "secure", "X": "practising"}, [], {"D"}),
    # a soft link not done blocks nothing; the done hard one makes it ready, and only it is the reason
    ([L("F", "A"), L("F", "X", "soft")], {"A": "secure", "X": "practising"},
     [{"skill": "F", "because": [{"before": "A", "strength": "hard"}]}], set()),
    # only a soft link, done: ready because of it
    ([L("S", "A", "soft")], {"A": "secure"}, [{"skill": "S", "because": [{"before": "A", "strength": "soft"}]}], set()),
    # only a soft link, not done: neither ready nor blocked
    ([L("S", "A", "soft")], {}, [], set()),
    # a skill already done is neither ready nor blocked
    ([L("B", "A"), L("B", "X")], {"A": "secure", "B": "secure"}, [], set()),
    # a chain: B ready on A; C waits on B
    ([L("B", "A"), L("C", "B")], {"A": "secure"},
     [{"skill": "B", "because": [{"before": "A", "strength": "hard"}]}], {"C"}),
    # several ready, in code order, each with every done link before it
    ([L("E", "B"), L("C", "A"), L("C", "B", "soft")], {"A": "secure", "B": "secure"},
     [{"skill": "C", "because": [{"before": "A", "strength": "hard"}, {"before": "B", "strength": "soft"}]},
      {"skill": "E", "because": [{"before": "B", "strength": "hard"}]}], set()),
]


def test_ready_next_per_skill_gives_the_same_answers_and_never_names_a_blocked_skill():
    from engine.w3_read import k2_growth

    for links, states, ready, _ in CASES:
        assert k2_growth.ready_next(links, states, DONE) == ready, (links, states)
    assert hasattr(k2_growth, "blocked"), "k2_growth.blocked (design §3) does not exist"
    for links, states, ready, blocked in CASES:
        got = k2_growth.blocked(links, states, DONE)
        assert set(got) == blocked, (links, states, got)
        assert not set(got) & {r["skill"] for r in ready}, "a skill both ready and blocked"


def _class_of(c, s, size, klass=None):
    """A K2 class of `size` children by Sr. No., each secure on A and B and practising on X; its educator's email."""
    klass = klass or s["class"]
    _, email = person(c, s, "class_teacher", klass=klass)
    for roll in range(1, size + 1):
        kid = child(c, s, klass, str(roll))
        for letter, st in (("A", "secure"), ("B", "secure"), ("X", "practising")):
            state(c, s, kid, letter, st)
    return email


def test_the_child_page_asks_the_database_the_same_number_of_times_for_a_small_and_a_large_class(conn):
    s = school(conn)
    who, _ = person(conn, s, "coordinator")
    for after, before in (("C", "A"), ("D", "X"), ("E", "B"), ("F", "A")):
        link(conn, s, after, before, by=who)
    for n, letters in enumerate(("CU", "ED", "F", "EC"), start=1):
        activity(conn, s, n, letters)
    small = _class_of(conn, s, 3)
    big_class = k2_class(conn, s)
    big = _class_of(conn, s, 30, big_class)

    def asked(email, klass):
        c = Counting(conn)
        got = page(c, email, klass, "2")
        assert "ready_activities" in got, f"the child page has no ready_activities (keys: {sorted(got)})"
        assert got["ready_activities"], "a page with ready activities, so their read is counted"
        return c.n

    assert asked(small, s["class"]) == asked(big, big_class), "a read per child or per activity: N+1 is a defect"
