"""CP-54: the skills' model calls go out together (skills/pool.py), and the run is as it was one by one: the same order, the same
ceiling, a failure that is its item's own."""

import threading
import time

import pytest

from engine.skills import pool, spend


def test_results_come_back_in_the_inputs_order_whatever_finishes_first():
    def slow_first(i):
        time.sleep(0.05 if i == 0 else 0.0)
        return i * 10

    got = pool.values(pool.settle(slow_first, list(range(8)), 4))
    assert got == [0, 10, 20, 30, 40, 50, 60, 70]


def test_calls_really_overlap_and_never_pass_the_pool_size():
    live, peak, lock = 0, 0, threading.Lock()

    def call(_):
        nonlocal live, peak
        with lock:
            live += 1
            peak = max(peak, live)
        time.sleep(0.03)
        with lock:
            live -= 1

    pool.settle(call, list(range(20)), 5)
    assert 2 <= peak <= 5


def test_one_pool_of_one_is_the_old_one_by_one_run():
    order = []
    pool.settle(order.append, [3, 1, 2], 1)
    assert order == [3, 1, 2]


def test_a_stop_begins_no_item_after_it_and_the_ones_that_never_began_say_so():
    began = []

    def call(i):
        began.append(i)
        if i == 2:
            raise spend.SpendStop("ceiling")
        return i

    got = pool.settle(call, list(range(10)), 1, spend.SpendStop)
    assert [r.value for r in got[:2]] == [0, 1]
    assert isinstance(got[2].error, spend.SpendStop)
    assert all(isinstance(r.error, pool.Skipped) for r in got[3:])
    assert began == [0, 1, 2]
    with pytest.raises(spend.SpendStop):
        pool.values(got)


def test_a_failed_item_is_its_own_result_and_the_others_still_finish():
    def call(i):
        if i == 1:
            raise ValueError("this one failed")
        return i

    got = pool.settle(call, [0, 1, 2], 3, spend.SpendStop)  # a ValueError is not a stop
    assert [r.value for r in got] == [0, None, 2]
    assert isinstance(got[1].error, ValueError)
    with pytest.raises(ValueError, match="this one failed"):
        pool.values(got)


def _ask(cost, held, log):
    def ask(purpose, variables, about):
        log.append(about)
        time.sleep(0.02)  # the call is in flight while the others reserve
        held.append(cost)
        return {"ok": True}

    return ask


def test_the_ceiling_holds_exactly_with_calls_in_flight(monkeypatch):
    """Ten calls of ₹2 at once against a ₹7 ceiling: three are let through (₹6), never four, however the threads fall."""
    monkeypatch.setattr(spend, "price", lambda conn, skill, validator, n=1: 2.0)
    recorded = {"n": 0.0}
    monkeypatch.setattr(spend, "spent", lambda conn, since: recorded["n"])
    log: list[str] = []
    done = threading.Lock()

    def ask(purpose, variables, about):
        log.append(about)
        time.sleep(0.03)
        with done:
            recorded["n"] += 2.0  # its cost reaches flow_run before it returns
        return {"ok": True}

    guarded = spend.capped(ask, None, {"a": {}}, limit=7.0, since=0.0)
    results = pool.settle(lambda i: guarded("skill.a", {}, str(i)), list(range(10)), 10, spend.SpendStop)
    made = [r for r in results if r.error is None]
    assert len(made) == 3 and recorded["n"] == 6.0 <= 7.0
    assert len(log) == 3, "a refused call was never asked"
    assert all(isinstance(r.error, (spend.SpendStop, pool.Skipped)) for r in results if r.error)
