"""CP-71: the pattern checker, one pure function (specs/CP-71/spec.md Done when 5 to 7; design E4).

`check(world)` reads the cells of a few classes' patterns, the rules about them and who teaches what, and returns every problem in plain words.
A problem is *Must* (stops publishing until fixed or allowed) or *Try to* (counted and shown, never blocks): a rule row with a `weight` is a
Try to, one without is a Must; the educator clash and an educator's absence are always Must. No database in here, so it is tested without one
(`tt_check_load` builds the world from rows; `tt_check_fix` offers fixes by running every candidate back through this same function).
Code decides, code words it; no model, no name (an educator is a staff id, never a person's name)."""

from dataclasses import dataclass, field

DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
MUST, TRY = "must", "try"
WEEKS = ("A", "B")
ANY = "*"  # a day's limit whose subject is this is about every subject: "at most 2 of one subject in a day"
LESSONS = ("subject", "specialist")  # the cells that are a lesson with a subject; a fixed cell has none
Place = tuple[str, str, str, int]  # (class id, period id, week "A"|"B", weekday 1..5)


@dataclass
class World:
    classes: dict[str, str]  # class id -> "G2 A"
    periods: dict[str, dict]  # period id -> {label, start "HH:MM", end, ord, fixed}
    class_periods: dict[str, list[str]]  # class id -> its period ids in time order, as of the date
    cells: dict[Place, dict]  # a place -> {cell, subject_code, text}; a place with nothing is absent
    educators: dict[
        tuple[str, str, str], str | None
    ]  # (class id, head, cell kind) -> staff id, or None when nobody is named
    away: list[dict] = field(default_factory=list)  # {staff, weekday, week (or None), period_id (or None)}
    limits: list[dict] = field(default_factory=list)  # {id, class, subject_code, span, fewest, most, weight}
    labels: dict[str, str] = field(default_factory=dict)  # head -> words ("Maths")
    allowed: set[str] = field(default_factory=set)  # allow_keys somebody allowed, with a reason


def minutes(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def overlap(a: dict, b: dict) -> bool:
    return minutes(a["start"]) < minutes(b["end"]) and minutes(b["start"]) < minutes(a["end"])


def when(w: World, period_id: str) -> str:
    p = w.periods[period_id]
    return f"{p['start']} to {p['end']}"


def subject_words(w: World, place: Place) -> str:
    c = w.cells[place]
    return w.labels.get(c["subject_code"], c["text"] or c["subject_code"] or "")


def educator_of(w: World, place: Place) -> str | None:
    c = w.cells[place]
    if c["cell"] not in LESSONS or not c["subject_code"]:
        return None
    return w.educators.get((place[0], c["subject_code"], c["cell"]))


def _where(w: World, place: Place) -> dict:
    return {
        "class_id": place[0], "class": w.classes[place[0]], "period_id": place[1], "week": place[2], "weekday": place[3],
        "subject_code": w.cells[place]["subject_code"],
    }  # fmt: skip


def _problem(
    kind: str, level: str, key: str, allow_key: str, sentence: str, places: list[dict], w: World
) -> dict:
    return {
        "kind": kind, "level": level, "key": key, "allow_key": allow_key, "sentence": sentence,
        "places": places, "allowed": allow_key in w.allowed,
    }  # fmt: skip


def unnamed(w: World) -> list[str]:
    """Lessons nobody is named for: the educator clash skips them, and says so (never a silent pass)."""
    seen, out = set(), []
    for place, c in sorted(w.cells.items()):
        if c["cell"] in LESSONS and c["subject_code"] and educator_of(w, place) is None:
            note = (w.classes[place[0]], c["subject_code"])
            if note not in seen:
                seen.add(note)
                out.append(
                    f"No educator is named for {w.labels.get(c['subject_code'], c['subject_code'])} in {note[0]}, so the clash and"
                    " absence checks skip it."
                )
    return out


def _educator_clashes(w: World) -> list[dict]:
    by: dict[tuple[str, str, int], list[Place]] = {}
    for place in w.cells:
        who = educator_of(w, place)
        if who:
            by.setdefault((who, place[2], place[3]), []).append(place)
    found = []
    for (who, week, wd), here in sorted(by.items()):
        here.sort()
        for i, a in enumerate(here):
            for b in here[i + 1 :]:
                if a[0] == b[0] or not overlap(w.periods[a[1]], w.periods[b[1]]):
                    continue
                key = f"educator:{who}:{week}:{wd}:{a[0]}:{a[1]}:{b[0]}:{b[1]}"
                sentence = (
                    f"One educator is down for {w.classes[a[0]]} ({subject_words(w, a)}, {when(w, a[1])}) and for {w.classes[b[0]]}"
                    f" ({subject_words(w, b)}, {when(w, b[1])}) on {DAYS[wd - 1]} of week {week}."
                )
                found.append(
                    _problem("educator", MUST, key, f"pat:{key}", sentence, [_where(w, a), _where(w, b)], w)
                )
    return found


def _lessons_of(w: World, klass: str, subject: str, week: str | None, weekday: int | None) -> list[Place]:
    return sorted(
        p for p, c in w.cells.items()
        if p[0] == klass and c["cell"] in LESSONS and c["subject_code"] == subject
        and (week is None or p[2] == week) and (weekday is None or p[3] == weekday)
    )  # fmt: skip


def _over(w: World, rule: dict, week: str | None, weekday: int | None) -> list[dict]:
    here = _lessons_of(w, rule["class"], rule["subject_code"], week, weekday)
    if rule["most"] is None or len(here) <= rule["most"]:
        return []
    span = rule["span"]
    kind = {"day": "most_in_day", "week": "most_in_week", "fortnight": "most_in_fortnight"}[span]
    where = {
        "day": f"on {DAYS[(weekday or 1) - 1]} of week {week}",
        "week": f"in week {week}",
        "fortnight": "in the fortnight",
    }[span]
    key = f"{kind}:{rule['class']}:{week or 'AB'}:{weekday or 0}:{rule['subject_code']}"
    label = w.labels.get(rule["subject_code"], rule["subject_code"])
    sentence = (
        f"{w.classes[rule['class']]} has {label} {len(here)} times {where}; the most is {rule['most']}."
    )
    level = TRY if rule["weight"] else MUST
    return [_problem(kind, level, key, f"pat:{key}:{len(here)}", sentence, [_where(w, p) for p in here], w)]


def _limits(w: World) -> list[dict]:
    found = []
    for each in w.limits:
        if each["class"] not in w.classes:
            continue
        for rule in _per_subject(w, each):
            found += _of_span(w, rule)
    return found


def _per_subject(w: World, rule: dict) -> list[dict]:
    """A rule about every subject, as one rule for each subject the class has a lesson of."""
    if rule["subject_code"] != ANY:
        return [rule]
    here = {c["subject_code"] for p, c in w.cells.items() if p[0] == rule["class"] and c["cell"] in LESSONS}
    return [{**rule, "subject_code": s} for s in sorted(s for s in here if s)]


def _of_span(w: World, rule: dict) -> list[dict]:
    if rule["span"] == "day":
        return [x for week in WEEKS for wd in range(1, 6) for x in _over(w, rule, week, wd)]
    if rule["span"] == "week":
        return [x for week in WEEKS for x in _over(w, rule, week, None)]
    return _over(w, rule, None, None)


def _absent(w: World) -> list[dict]:
    found = []
    for place in sorted(w.cells):
        who = educator_of(w, place)
        if not who:
            continue
        mine = w.periods[place[1]]
        for a in w.away:
            if a["staff"] != who or a["weekday"] != place[3] or a["week"] not in (None, place[2]):
                continue
            if a["period_id"] and not overlap(mine, w.periods[a["period_id"]]):
                continue
            key = f"away:{who}:{place[2]}:{place[3]}:{place[0]}:{place[1]}"
            sentence = (
                f"The educator for {subject_words(w, place)} in {w.classes[place[0]]} is away on {DAYS[place[3] - 1]} of week"
                f" {place[2]} at {when(w, place[1])}."
            )
            found.append(_problem("away", MUST, key, f"pat:{key}", sentence, [_where(w, place)], w))
            break
    return found


def check(w: World) -> list[dict]:
    """Every problem of the world's patterns, in a fixed order (Must first, then by place); no fixes (see `tt_check_fix`)."""
    found = _educator_clashes(w) + _limits(w) + _absent(w)
    return sorted(found, key=lambda p: (p["level"] != MUST, p["kind"], p["key"]))


def blocking(problems: list[dict]) -> list[dict]:
    """The problems that stop publishing: a Must nobody allowed."""
    return [p for p in problems if p["level"] == MUST and not p["allowed"]]
