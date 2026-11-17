"""CP-74: what a lesson is offered to teach next (specs/CP-74/spec.md Done when 1 to 3; design D3, D4). Pure: no database, no model.

`offers(objectives, lessons, activities, today)` takes one class's objectives for one subject (code, unit, title, ord, retired, one_off), that
class's lessons of the subject (on_date, lo_code, state) and how many activities each objective has for the grade, and returns the tiers the
picker shows. The order is `ord` (the school's source order); a subject whose order nobody has checked (`ordered=False`) and a class with nothing
taught yet are offered the whole subject. A one-off unit (a field visit, a celebration day, "see source") never moves the sequence and sits last.

The *pointer* is the objective of the most recent lesson on a day gone by that has one in the sequence and was not marked `not_done` or `moved`;
a lesson still `planned` counts, as "not confirmed". Ties inside a tier break: not yet taught, then has an activity, then `ord`."""

import datetime as dt

SKIPPED = ("not_done", "moved")  # a lesson in one of these states taught nothing
NEXT_UNIT_WHEN = 2  # the next unit is offered once this many or fewer of the current one are left


def live(objectives: list[dict]) -> list[dict]:
    """Every objective that may be offered, in order: units by their smallest `ord`, one-off units last, then `ord` inside a unit."""
    rows = [o for o in objectives if not o["retired"]]
    first: dict[str, int] = {}
    for o in rows:
        first[o["unit"]] = min(first[o["unit"]], o["ord"]) if o["unit"] in first else o["ord"]
    return sorted(rows, key=lambda o: (o["one_off"], first[o["unit"]], o["unit"], o["ord"], o["code"]))


def units(rows: list[dict]) -> list[str]:
    """The units of `live` rows, in their order."""
    return list(dict.fromkeys(o["unit"] for o in rows))


def taught(lessons: list[dict], today: dt.date) -> dict[str, dt.date]:
    """Objective -> the last day it was taught to the class (a past lesson not marked as not happening)."""
    out: dict[str, dt.date] = {}
    for s in lessons:
        if s["lo_code"] and s["on_date"] < today and s["state"] not in SKIPPED:
            out[s["lo_code"]] = max(out[s["lo_code"]], s["on_date"]) if s["lo_code"] in out else s["on_date"]
    return out


def pointer(rows: list[dict], lessons: list[dict], today: dt.date) -> dict | None:
    """The last objective of the sequence taught to the class, with its day and whether somebody marked it done."""
    sequence = {o["code"] for o in rows if not o["one_off"]}
    past = [
        s for s in lessons if s["lo_code"] in sequence and s["on_date"] < today and s["state"] not in SKIPPED
    ]
    if not past:
        return None
    last = max(past, key=lambda s: (s["on_date"], s.get("starts") or ""))
    return {"code": last["lo_code"], "on_date": last["on_date"], "confirmed": last["state"] == "done"}


def next_after(rows: list[dict], code: str, done: set[str]) -> tuple[dict | None, bool]:
    """The objective after `code`: the first not in `done` later in its unit, else the first not in `done` of a later unit (a new unit);
    none at the end of the subject. One-off units are never next."""
    at = next(o for o in rows if o["code"] == code)
    same = [o for o in rows if o["unit"] == at["unit"] and o["ord"] > at["ord"] and o["code"] not in done]
    if same:
        return same[0], False
    order = units([o for o in rows if not o["one_off"]])
    later = order[order.index(at["unit"]) + 1 :]
    return next(
        ((o, True) for u in later for o in rows if o["unit"] == u and o["code"] not in done), (None, False)
    )


def _row(o: dict, when: dict[str, dt.date], activities: dict[str, int]) -> dict:
    return {
        "code": o["code"], "title": o["title"], "unit": o["unit"], "ord": o["ord"],
        "activities": activities.get(o["code"], 0), "taught_on": when.get(o["code"]),
    }  # fmt: skip


def _ranked(rows: list[dict], when: dict[str, dt.date], activities: dict[str, int]) -> list[dict]:
    out = [_row(o, when, activities) for o in rows]
    return sorted(out, key=lambda r: (r["taught_on"] is not None, r["activities"] == 0, r["ord"], r["code"]))


def _unit(
    rows: list[dict],
    unit: str,
    when: dict[str, dt.date],
    activities: dict[str, int],
    leave_out: frozenset = frozenset(),
    **more,
) -> dict:
    mine = [o for o in rows if o["unit"] == unit]
    shown = _ranked([o for o in mine if o["code"] not in leave_out], when, activities)
    done = sum(1 for o in mine if o["code"] in when)
    return {"unit": unit, "done": done, "of": len(mine), "rows": shown, **more}


def offers(
    objectives: list[dict],
    lessons: list[dict],
    activities: dict[str, int],
    today: dt.date,
    *,
    ordered: bool = True,
) -> dict:
    """The picker's tiers for one class and subject: `next_up` (one row, or none), then `rest_of_unit`, `next_unit` (when two or fewer are
    left), and always `all` (every unit in order, one-offs last under `other`)."""
    rows = live(objectives)
    when = taught(lessons, today)
    at = pointer(rows, lessons, today) if ordered else None
    whole = {
        "tier": "all",
        "units": [
            _unit(rows, u, when, activities, other=rows[[o["unit"] for o in rows].index(u)]["one_off"])
            for u in units(rows)
        ],
    }
    nxt, new_unit = next_after(rows, at["code"], set(when)) if at else (None, False)
    if nxt is None:
        return {"pointer": at, "next_up": None, "tiers": [whole]}
    tiers = [
        _unit(rows, nxt["unit"], when, activities, tier="rest_of_unit", leave_out=frozenset({nxt["code"]})),
    ]
    left = [o for o in rows if o["unit"] == nxt["unit"] and o["code"] not in when]
    order = units([o for o in rows if not o["one_off"]])
    later = order[order.index(nxt["unit"]) + 1 :]
    if len(left) <= NEXT_UNIT_WHEN and later:
        tiers.append(_unit(rows, later[0], when, activities, tier="next_unit"))
    return {
        "pointer": at,
        "next_up": {**_row(nxt, when, activities), "new_unit": new_unit},
        "tiers": [*tiers, whole],
    }
