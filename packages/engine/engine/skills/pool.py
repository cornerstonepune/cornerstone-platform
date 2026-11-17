"""Several model calls at once (CP-54, Nimish 17 Nov: the skills' runs took ~12 minutes a skill because every call waited for the one
before). `settle` runs one function over a list on a bounded pool of threads and returns the results IN THE INPUT'S ORDER, so a run
is as deterministic as it was one by one. The size of the pool is the setting `skill.workers`.

A function that raises `SpendStop` stops the rest: items not yet started are not started (their slot says `Skipped`), calls already
in flight finish (their cost is on record, and `spend.capped` counted it before they began). Any other exception is that item's own
result, so a caller decides what a failed item means; nothing here swallows it."""

from collections.abc import Callable, Sequence
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

from engine.core import db, settings

DEFAULT_WORKERS = 8  # the row `skill.workers` says; this is only what a database with no such row does


class Skipped(Exception):
    """The item was never started: an earlier one stopped the run."""


@dataclass
class Settled:
    """One item's end: its `value`, or the `error` it raised (`Skipped` when it was never started)."""

    value: Any = None
    error: BaseException | None = None


def workers(conn: db.Conn) -> int:
    return max(1, int(settings.config(conn, "skill.workers", DEFAULT_WORKERS)))


def _serial(fn: Callable[[Any], Any], items: Sequence[Any], stop_on: type[BaseException]) -> list[Settled]:
    out: list[Settled] = []
    for i, item in enumerate(items):
        try:
            out.append(Settled(fn(item)))
        except BaseException as e:  # noqa: BLE001 — returned to the caller, never lost
            out.append(Settled(error=e))
            if isinstance(e, stop_on):
                out += [Settled(error=Skipped()) for _ in items[i + 1 :]]
                break
    return out


def _ended(f: Future[Any]) -> Settled:
    if f.cancelled():
        return Settled(error=Skipped())
    e = f.exception()
    return Settled(error=e) if e is not None else Settled(f.result())


def settle(
    fn: Callable[[Any], Any],
    items: Sequence[Any],
    n: int,
    stop_on: type[BaseException] = Exception,
) -> list[Settled]:
    """`fn(item)` for each item, at most `n` at once; one `Settled` per item, in order. When a call raises `stop_on` no item
    that has not begun is begun."""
    if n <= 1 or len(items) <= 1:
        return _serial(fn, items, stop_on)
    futures: list[Future[Any]] = []

    def stop(done: Future[Any]) -> None:
        if not done.cancelled() and isinstance(done.exception(), stop_on):
            for f in futures:
                f.cancel()  # a no-op for one already running

    with ThreadPoolExecutor(max_workers=min(n, len(items))) as pool:
        for item in items:
            f = pool.submit(fn, item)
            f.add_done_callback(stop)
            futures.append(f)
    return [_ended(f) for f in futures]  # the pool has finished every call in flight


def values(results: list[Settled]) -> list[Any]:
    """The values, in order; the first error (the earliest item's) is raised, `Skipped` ones last, as nothing else went wrong."""
    first = next((r.error for r in results if r.error and not isinstance(r.error, Skipped)), None)
    if first:
        raise first
    if any(r.error for r in results):
        raise Skipped("the run was stopped before every item began")
    return [r.value for r in results]
