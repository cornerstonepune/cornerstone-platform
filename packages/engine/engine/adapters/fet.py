"""FET, the timetable program (M1-14, D-074): the only file that names it. FET is AGPL, so it runs as its own process
(`fet-cl`), unmodified, never linked. This file turns a plain description of one class's fortnight into FET's input file,
runs it with a time limit and fixed seeds, and reads the placements back. It decides nothing about the school: every
count and every rule is worked out by the caller (`w2_print/tt_generate.py`)."""

import subprocess
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

NAME = "cp11"  # FET names its output folder after the input file
SEEDS = ("10", "11", "12", "20", "21", "22")  # the six components of FET's random seed


class FetMissing(RuntimeError):
    """`fet-cl` is not installed on this machine."""


@dataclass
class Plan:
    """One class and the days and hours it has. Days and hours are names; the caller maps them back to dates and periods."""

    students: str
    days: list[str]
    hours: list[str]
    subjects: list[str]
    activities: list[tuple[int, str]]  # (id, subject)
    unavailable: list[tuple[str, str]] = field(default_factory=list)  # (day, hour) nothing may be placed on
    only_on: dict[int, list[str]] = field(default_factory=dict)  # activity id -> the days it may fall on
    apart: list[list[int]] = field(default_factory=list)  # activity ids that must fall on different days


@dataclass
class Result:
    version: str
    output_text: str | None
    placed: dict[int, tuple[str, str]]  # activity id -> (day, hour)
    timed_out: bool
    impossible: str | None  # FET's own words when it says the input cannot be met


def _text(parent: ET.Element, tag: str, value: object = "") -> ET.Element:
    el = ET.SubElement(parent, tag)
    el.text = str(value)
    return el


def _constraint(parent: ET.Element, tag: str) -> ET.Element:
    c = ET.SubElement(parent, tag)
    _text(c, "Weight_Percentage", 100)
    return c


def _tail(c: ET.Element) -> None:
    _text(c, "Active", "true")
    _text(c, "Comments")


def version() -> str:
    """The first line of `fet-cl --version`."""
    try:
        out = subprocess.run(["fet-cl", "--version"], capture_output=True, text=True, timeout=30)
    except FileNotFoundError as gone:
        raise FetMissing("fet-cl is not installed here (Debian's package `fet`)") from gone
    return out.stdout.splitlines()[0] if out.stdout else ""


def build_input(plan: Plan, fet_version: str) -> str:
    """FET's input file. Standard-library XML escapes every name; the order of everything is fixed, so the same plan
    gives the same bytes."""
    root = ET.Element("fet", version=fet_version.rsplit(" ", 1)[-1])
    _text(root, "Mode", "Official")
    _text(root, "Institution_Name", "CP-11")
    _text(root, "Comments")
    days = ET.SubElement(root, "Days_List")
    _text(days, "Number_of_Days", len(plan.days))
    for d in plan.days:
        _text(ET.SubElement(days, "Day"), "Name", d)
    hours = ET.SubElement(root, "Hours_List")
    _text(hours, "Number_of_Hours", len(plan.hours))
    for h in plan.hours:
        _text(ET.SubElement(hours, "Hour"), "Name", h)
    subjects = ET.SubElement(root, "Subjects_List")
    for s in plan.subjects:
        sub = ET.SubElement(subjects, "Subject")
        _text(sub, "Name", s)
        _text(sub, "Comments")
    ET.SubElement(root, "Activity_Tags_List")
    ET.SubElement(root, "Teachers_List")
    students = ET.SubElement(root, "Students_List")
    year = ET.SubElement(students, "Year")
    _text(year, "Name", plan.students)
    _text(year, "Number_of_Students", 0)
    _text(year, "Comments")
    acts = ET.SubElement(root, "Activities_List")
    for aid, subject in plan.activities:
        a = ET.SubElement(acts, "Activity")
        _text(a, "Subject", subject)
        _text(a, "Students", plan.students)
        _text(a, "Duration", 1)
        _text(a, "Total_Duration", 1)
        _text(a, "Id", aid)
        _text(a, "Activity_Group_Id", 0)
        _text(a, "Active", "true")
        _text(a, "Comments")
    ET.SubElement(root, "Buildings_List")
    ET.SubElement(root, "Rooms_List")
    _time_constraints(ET.SubElement(root, "Time_Constraints_List"), plan)
    space = ET.SubElement(root, "Space_Constraints_List")
    _tail(_constraint(space, "ConstraintBasicCompulsorySpace"))
    ET.indent(root)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"


def _time_constraints(time: ET.Element, plan: Plan) -> None:
    _tail(_constraint(time, "ConstraintBasicCompulsoryTime"))
    if plan.unavailable:
        c = _constraint(time, "ConstraintStudentsSetNotAvailableTimes")
        _text(c, "Students", plan.students)
        _text(c, "Number_of_Not_Available_Times", len(plan.unavailable))
        for day, hour in plan.unavailable:
            n = ET.SubElement(c, "Not_Available_Time")
            _text(n, "Day", day)
            _text(n, "Hour", hour)
        _tail(c)
    for aid in sorted(plan.only_on):
        c = _constraint(time, "ConstraintActivityPreferredStartingTimes")
        _text(c, "Activity_Id", aid)
        slots = [(d, h) for d in plan.only_on[aid] for h in plan.hours]
        _text(c, "Number_of_Preferred_Starting_Times", len(slots))
        for day, hour in slots:
            p = ET.SubElement(c, "Preferred_Starting_Time")
            _text(p, "Preferred_Starting_Day", day)
            _text(p, "Preferred_Starting_Hour", hour)
        _tail(c)
    for ids in plan.apart:
        c = _constraint(time, "ConstraintMinDaysBetweenActivities")
        _text(c, "Consecutive_If_Same_Day", "false")
        _text(c, "Number_of_Activities", len(ids))
        for aid in ids:
            _text(c, "Activity_Id", aid)
        _text(c, "MinDays", 1)
        _tail(c)


def run(input_text: str, solve_seconds: int, seed: int) -> Result:
    """Run `fet-cl` on the input with the time limit and the seed in every component. The output kept is FET's own
    `<name>_activities.xml`, byte for byte."""
    found = version()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"{NAME}.fet"
        src.write_text(input_text, encoding="utf-8")
        try:
            out = subprocess.run(
                ["fet-cl", f"--inputfile={src}", f"--outputdir={tmp}/out", f"--timelimitseconds={solve_seconds}",
                 *[f"--randomseeds{k}={seed}" for k in SEEDS]],
                capture_output=True, text=True, timeout=solve_seconds + 120,
            )  # fmt: skip
        except (
            subprocess.TimeoutExpired
        ):  # FET did not stop at its own limit: the same answer as running out of time
            return Result(found, None, {}, True, None)
        acts = Path(tmp) / "out" / "timetables" / NAME / f"{NAME}_activities.xml"
        log = out.stdout + out.stderr
        if not acts.exists():
            lowered = log.lower()
            return Result(
                found,
                None,
                {},
                "time exceeded" in lowered or "time limit" in lowered,
                log.strip()[-600:] or None,
            )
        text = acts.read_text(encoding="utf-8")
    placed = {
        int(a.findtext("Id", "0")): (a.findtext("Day", ""), a.findtext("Hour", ""))
        for a in ET.fromstring(text.lstrip("﻿")).iter("Activity")
        if a.findtext("Day")
    }
    return Result(found, text, placed, False, None)
