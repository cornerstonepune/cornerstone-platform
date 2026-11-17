"""CP-74: many lessons at once (specs/CP-74/spec.md Done when 4 to 7; design D5). Pure: no database, no model; the writer applies the answers.

- `spread(codes, lessons)`: lays k objectives, in order, over a fortnight's n lessons of one class and subject; holidays and fixed lessons take
  nothing. k <= n: each gets n // k lessons and the first n % k one more. k > n: the first n get one each; the rest are left for later.
- `same_as_last_week(lesson, lessons)`: the objective and activity of the subject's lesson in the same place one week earlier, or a refusal
  in words.
- `suggest(objectives, lessons, today)`: the suggestion job. Carries the sequence on from the last objective taught over the lessons still to
  come; it touches only a lesson with nothing chosen or a machine-made choice, never one a person set (a person's objective moves the sequence
  on from there). Nothing for a subject with no checked order or nothing taught yet. Asking again with its answers applied gives nothing."""

import datetime as dt

from engine.w2_print import tt_offer
from engine.w2_print.tt_live_plan import Refused

DAY_WORDS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


def _says(d: dt.date) -> str:
    return f"{DAY_WORDS[d.weekday()]} {d.day} {MONTHS[d.month - 1]}"


def _in_order(lessons: list[dict]) -> list[dict]:
    return sorted(lessons, key=lambda s: (s["on_date"], s.get("starts") or "", s["id"]))


def _open(s: dict) -> bool:
    return not s["holiday"] and not s["fixed"]


def spread(codes: list[str], lessons: list[dict]) -> dict:
    """Which objective each lesson gets, what is left for next fortnight and which lessons took nothing (holiday or fixed)."""
    ordered = _in_order(lessons)
    usable = [s for s in ordered if _open(s)]
    n, k = len(usable), len(codes)
    shares = [n // k + (1 if i < n % k else 0) for i in range(k)] if 0 < k <= n else [1] * min(k, n)
    plan = [code for code, times in zip(codes, shares, strict=False) for _ in range(times)]
    return {
        "lessons": [{"id": s["id"], "lo_code": code} for s, code in zip(usable, plan, strict=True)],
        "left_over": codes[len(shares) :],
        "skipped": [s["id"] for s in ordered if not _open(s)],
    }


def same_as_last_week(lesson: dict, lessons: list[dict], *, subject: str) -> dict:
    """The choice to copy onto `lesson` from the class's lesson of the subject one week earlier, in the same period when there is one that
    day. Raises `Refused` when there is no such lesson or it has nothing chosen."""
    day = lesson["on_date"] - dt.timedelta(days=7)
    that_day = [s for s in _in_order(lessons) if s["on_date"] == day and s["id"] != lesson["id"]]
    if not that_day:
        raise Refused(f"there is no {subject} lesson on {_says(day)}, one week earlier, to copy.")
    last = next((s for s in that_day if s["period_id"] == lesson["period_id"]), that_day[0])
    if not last["lo_code"] and not last["activity_code"]:
        raise Refused(
            f"the {subject} lesson on {_says(day)} has nothing chosen yet, so there is nothing to copy."
        )
    return {"lo_code": last["lo_code"], "activity_code": last["activity_code"], "from": last["id"]}


def suggest(
    objectives: list[dict], lessons: list[dict], today: dt.date, *, ordered: bool = True
) -> list[dict]:
    """The lessons whose objective the job changes, with the objective each gets, in order."""
    if not ordered:
        return []
    rows = tt_offer.live(objectives)
    at = tt_offer.pointer(rows, lessons, today)
    if at is None:
        return []
    known = {o["code"] for o in rows if not o["one_off"]}
    done, code, out = set(tt_offer.taught(lessons, today)), at["code"], []
    for s in _in_order(lessons):
        if s["on_date"] < today or not _open(s) or s["state"] != "planned":
            continue
        if s["source"] == "person":
            if s["lo_code"] in known:  # her choice: the sequence goes on from there
                code = s["lo_code"]
                done.add(code)
            continue
        nxt, _ = tt_offer.next_after(rows, code, done)
        if nxt is None:
            break
        if s["lo_code"] != nxt["code"]:
            out.append({"id": s["id"], "lo_code": nxt["code"]})
        code = nxt["code"]
        done.add(code)
    return out
