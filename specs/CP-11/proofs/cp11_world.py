"""Shared helpers for CP-11's proofs: a made-up class with its rules, the command run as a person runs it, the kept run.

Everything is made up and dated 2031: a grade `ZP` that exists only for these proofs (so its periods are the proofs'
own), a class with a random section, 2031-32 fortnights with generated numbers. No staff or child is named anywhere.
The command is a second process, so the rows are committed; the module's `forgets_what_it_commits` deletes them.

Names are the design's contract (specs/CP-11/design.md):
  `bin/engine timetable generate --grade --section --year --fortnight [--dry]`;
  `timetable_run(outcome placed|unmeetable|not_found_in_time, needed, placed, input_text, output_text, fet_version,
  seed, solve_seconds, report, draft, created_at, ...)`; settings `timetable.solve_seconds`, `timetable.seed`.

Pinned by the proof-writer on FET 6.8.5 (Ubuntu 24.04's and Debian's `fet` package, the one CI installs), as the design
asks ("the proof-writer pins the exact fet-cl flags (time limit, seeds) and output file name"):
  * FET is run as `fet-cl --inputfile=F --outputdir=D --timelimitseconds=<solve_seconds>` with all six seed components
    `--randomseeds10/11/12/20/21/22=<seed>` set to the run's stored `seed`;
  * the output kept is the file FET writes as `D/timetables/<name>/<name>_activities.xml` (or, equally,
    `<name>_data_and_timetable.fet`): FET's own bytes (a leading byte-order mark may be kept or dropped);
  * days in the input are named by date (ISO, `2031-06-02`), hours by the period's start time (`09:00`), and each
    activity's `<Subject>` is its subject code, as the design says;
  * `draft` is a JSON array, one object per placed lesson: `date` (ISO), `week` (`A`/`B`), `period_id`, `subject_code`;
  * the command prints the outcome and the two numbers as `needed <n>` and `placed <n>` (a colon after the word is
    allowed).
With those, a proof replays FET on the kept input with the kept seed and time limit and gets the kept output back.
"""

import datetime as dt
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
import xml.etree.ElementTree as ET
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest

from engine.core import db

ROOT = Path(__file__).resolve().parents[3]
YEAR = "2031-32"
GRADE = "ZP"  # a grade made up for these proofs
PERIODS = {"P0": "07:50", "P1": "09:00", "P2": "10:00", "P3": "11:00"}  # P0 is a fixed period (circle time)

# The standing frame, the same in week A and week B: weekday -> (P1, P2, P3). P0 is a `fixed` cell every day.
# Per week: MATH 4, ENG 5, EVS 3 subject cells, one specialist cell (pinned), two empty cells.
FRAME = {
    1: (("subject", "MATH"), ("subject", "ENG"), ("subject", "EVS")),
    2: (("subject", "MATH"), ("subject", "ENG"), ("subject", "ENG")),
    3: (("subject", "MATH"), ("subject", "EVS"), ("specialist", None)),
    4: (("subject", "ENG"), ("subject", "MATH"), ("empty", None)),
    5: (("subject", "ENG"), ("subject", "EVS"), ("empty", None)),
}


def need_fet() -> None:
    """A proof that runs FET fails, with a plain reason, where FET is not installed. It never skips."""
    if not shutil.which("fet-cl"):
        pytest.fail("CP-11 proof cannot run: `fet-cl` is not installed here. CI installs Debian's package `fet` "
                    "(apt-get install fet), as the engine image does.", pytrace=False)


def fet_version() -> str:
    return subprocess.run(["fet-cl", "--version"], capture_output=True, text=True, timeout=30).stdout.splitlines()[0]


def week_of(day: dt.date, starts_on: dt.date) -> str:
    """The rule the day page uses (k2_day.py): fewer than 7 days after the fortnight starts is week A."""
    return "A" if (day - starts_on).days < 7 else "B"


def world(starts_on: dt.date, *, days: int = 14, frame=FRAME, blocks=(), limits=(), holidays=(),
          with_lessons: bool = False) -> dict:
    """Commit one made-up class of grade ZP with its frame, its rules and one teaching fortnight from `starts_on`.

    blocks: dicts with `on_date` or `weekday` (+ optional `week_code`), optional `period` (P1..P3), and `reason`.
    limits: (subject_code, span, fewest, most). holidays: dates that get a `school_day` row of kind `holiday`.
    with_lessons: also one plan line and one session for the class, so "nothing written to them" has rows to watch.
    """
    with db.connect() as c:
        t = db.one(c, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        campus = db.one(c, "select id from campus where tenant_id = %s order by created_at limit 1", (t,))["id"]
        c.execute("insert into grade (tenant_id, code, name, ord) values (%s, %s, 'CP-11 proof grade', 990)"
                  " on conflict (tenant_id, code) do nothing", (t, GRADE))
        year = db.one(c, "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, %s,"
                         " '2031-06-01', '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label"
                         " returning id", (t, YEAR))["id"]
        section = f"P11{uuid.uuid4().hex[:6]}"
        klass = db.one(c, "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
                          " values (%s, %s, %s, %s, %s) returning id", (t, campus, year, GRADE, section))["id"]
        periods = {}
        for i, (name, starts) in enumerate(PERIODS.items()):
            periods[name] = db.one(
                c, "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed)"
                   " values (%s, %s, %s, %s, %s::time + interval '50 minutes', %s, %s)"
                   " on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id",
                (t, GRADE, i + 1, starts, starts, "Circle" if name == "P0" else f"Period {i}", name == "P0"))["id"]
        for week in ("A", "B"):
            for wd, cells in frame.items():
                rows = [("P0", "fixed", None, "Circle")] + [
                    (f"P{i + 1}", kind, subj if kind == "subject" else None,
                     subj if kind == "subject" else ("Music" if kind == "specialist" else ""))
                    for i, (kind, subj) in enumerate(cells)]
                for p, kind, subj, text in rows:
                    c.execute("insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday,"
                              " kind, subject_code, text, valid_from) values (%s, %s, %s, %s, %s, %s, %s, %s,"
                              " '2031-01-01')", (t, klass, periods[p], week, wd, kind, subj, text))
        number = 100000 + uuid.uuid4().int % 800000
        ends_on = starts_on + dt.timedelta(days=days - 1)
        fortnight = db.one(c, "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
                              " values (%s, %s, %s, 'teaching', %s, %s) returning id",
                           (t, year, number, starts_on, ends_on))["id"]
        block_ids = []
        for b in blocks:
            block_ids.append(db.one(
                c, "insert into timetable_block (tenant_id, school_class_id, on_date, weekday, week_code, period_id,"
                   " reason) values (%s, %s, %s, %s, %s, %s, %s) returning id",
                (t, klass, b.get("on_date"), b.get("weekday"), b.get("week_code"),
                 periods[b["period"]] if b.get("period") else None, b["reason"]))["id"])
        limit_ids = []
        for subj, span, fewest, most in limits:
            limit_ids.append(db.one(
                c, "insert into timetable_limit (tenant_id, school_class_id, subject_code, span, fewest, most)"
                   " values (%s, %s, %s, %s, %s, %s) returning id", (t, klass, subj, span, fewest, most))["id"])
        for h in holidays:
            c.execute("insert into school_day (tenant_id, campus_id, on_date, kind, note) values (%s, %s, %s,"
                      " 'holiday', 'CP-11 proof holiday')", (t, campus, h))
        if with_lessons:
            entry = db.one(c, "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text,"
                              " source) values (%s, %s, %s, 'cp11', 1, 'A made-up plan line', 'CP-11 proof')"
                              " returning id", (t, klass, fortnight))["id"]
            day = db.one(c, "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s,"
                            " 'teaching') returning id", (t, campus, starts_on))["id"]
            c.execute("insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code,"
                      " plan_entry_id, text) values (%s, %s, %s, %s, 'MATH', %s, 'A made-up session')",
                      (t, klass, day, periods["P1"], entry))
        c.commit()
    return {"t": t, "class": klass, "section": section, "number": number, "fortnight": fortnight,
            "starts_on": starts_on, "ends_on": ends_on, "periods": periods, "frame": frame, "blocks": list(blocks),
            "block_ids": block_ids, "limit_ids": limit_ids, "holidays": set(holidays)}


def generate(w: dict, *extra: str) -> subprocess.CompletedProcess:
    """`bin/engine timetable generate` for the world's class and fortnight, against the test database only."""
    env = {**os.environ, "DATABASE_URL": db.local_copy()}  # the throwaway database, never the live one
    return subprocess.run(
        [str(ROOT / "bin" / "engine"), "timetable", "generate", "--grade", GRADE, "--section", w["section"],
         "--year", YEAR, "--fortnight", str(w["number"]), *extra],
        capture_output=True, text=True, env=env, cwd=ROOT, timeout=300)


def said(out: subprocess.CompletedProcess) -> str:
    return f"exit {out.returncode}\nstdout: {out.stdout[-1500:]}\nstderr: {out.stderr[-1500:]}"


def runs(w: dict, out: subprocess.CompletedProcess | None = None) -> list[dict]:
    """The kept runs of the world's class and fortnight, oldest first."""
    with db.connect() as c:
        if c.execute("select to_regclass('public.timetable_run') is null as missing").fetchone()["missing"]:
            pytest.fail("table timetable_run does not exist" + (f"; the command said: {said(out)}" if out else ""),
                        pytrace=False)
        return c.execute("select * from timetable_run where school_class_id = %s and fortnight_id = %s"
                         " order by created_at, id", (w["class"], w["fortnight"])).fetchall()


def one_run(w: dict, out: subprocess.CompletedProcess) -> dict:
    found = runs(w, out)
    assert len(found) == 1, f"{len(found)} timetable_run rows for this class and fortnight, not 1; {said(out)}"
    return found[0]


def printed(stdout: str) -> tuple[int, int]:
    """(needed, placed) as the command prints them: `needed <n>` and `placed <n>`."""
    needed = re.search(r"\bneeded\s*:?\s*(\d+)", stdout, re.I)
    placed = re.search(r"\bplaced\s*:?\s*(\d+)", stdout, re.I)
    assert needed and placed, f"the command did not print `needed <n>` and `placed <n>`: {stdout[-1500:]}"
    return int(needed.group(1)), int(placed.group(1))


def lessons(run: dict) -> list[dict]:
    draft = run["draft"]
    draft = json.loads(draft) if isinstance(draft, str) else draft
    assert isinstance(draft, list), f"draft is not a JSON array of lessons: {type(draft).__name__}"
    return draft


def teaching_days(w: dict) -> list[dt.date]:
    d, out = w["starts_on"], []
    while d <= w["ends_on"]:
        if d.isoweekday() <= 5 and d not in w["holidays"]:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def _blocked(w: dict, day: dt.date, period: str) -> bool:
    for b in w["blocks"]:
        if b.get("on_date") is not None and b["on_date"] != day:
            continue
        if b.get("weekday") is not None and (b["weekday"] != day.isoweekday()
                                             or b.get("week_code") not in (None, week_of(day, w["starts_on"]))):
            continue
        if b.get("period") in (None, period):
            return True
    return False


def cells(w: dict) -> dict[tuple[str, str], str]:
    """Every (date, period_id) of the fortnight's teaching days: `free` (a subject or empty cell, not blocked),
    `blocked`, or the pinned kind (`fixed`, `specialist`)."""
    out = {}
    for day in teaching_days(w):
        frame = w["frame"][day.isoweekday()]
        out[(day.isoformat(), str(w["periods"]["P0"]))] = "fixed"
        for i, (kind, _) in enumerate(frame):
            p = f"P{i + 1}"
            if kind in ("fixed", "specialist"):
                state = kind
            else:
                state = "blocked" if _blocked(w, day, p) else "free"
            out[(day.isoformat(), str(w["periods"][p]))] = state
    return out


def snapshot() -> dict[str, tuple[int, str]]:
    """Row count and a digest of every row of the timetable, the sessions and the plan lines."""
    with db.connect() as c:
        return {t: tuple(c.execute(f"select count(*) as n, md5(coalesce(string_agg(x::text, '|' order by x.id), ''))"
                                   f" as h from {t} x").fetchone().values())
                for t in ("timetable_slot", "session", "plan_entry")}


@contextmanager
def setting(t, key: str, value) -> None:
    """Commit one per-school setting for the command to read, and put the old value back afterwards."""
    with db.connect() as c:
        old = c.execute("select value from config where tenant_id = %s and key = %s", (t, key)).fetchone()
        c.execute("insert into config (tenant_id, key, value) values (%s, %s, %s) on conflict (tenant_id, key)"
                  " do update set value = excluded.value", (t, key, json.dumps(value)))
        c.commit()
    try:
        yield
    finally:
        with db.connect() as c:
            if old is None:
                c.execute("delete from config where tenant_id = %s and key = %s", (t, key))
            else:
                c.execute("update config set value = %s where tenant_id = %s and key = %s",
                          (json.dumps(old["value"]), t, key))
            c.commit()


def replay(run: dict) -> tuple[list[str], dict[str, tuple[str, str]], dict[str, str]]:
    """Run the real fet-cl on the kept input with the kept seed and time limit, the pinned flags.

    Returns FET's output files (activities and data-and-timetable, as text), its placements {activity id: (day, hour)}
    and the input's {activity id: subject}."""
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "cp11.fet"
        src.write_text(run["input_text"], encoding="utf-8")
        seed = str(run["seed"])
        out = subprocess.run(
            ["fet-cl", f"--inputfile={src}", f"--outputdir={d}/out", f"--timelimitseconds={run['solve_seconds']}",
             *[f"--randomseeds{k}={seed}" for k in ("10", "11", "12", "20", "21", "22")]],
            capture_output=True, text=True, timeout=600)
        folder = Path(d) / "out" / "timetables" / "cp11"
        acts = folder / "cp11_activities.xml"
        assert out.returncode == 0 and acts.exists(), f"FET did not place the kept input: {out.stdout[-800:]}"
        files = [acts.read_text(encoding="utf-8"), (folder / "cp11_data_and_timetable.fet").read_text(encoding="utf-8")]
    placed = {a.findtext("Id"): (a.findtext("Day"), a.findtext("Hour"))
              for a in ET.fromstring(files[0].lstrip("﻿")).iter("Activity")}
    subjects = {a.findtext("Id"): a.findtext("Subject")
                for a in ET.fromstring(run["input_text"].lstrip("﻿")).iter("Activity")}
    return files, placed, subjects


def refused(conn: db.Conn, sql: str, params=()) -> str:
    """Run `sql` in its own transaction; it must raise. Returns the database's message."""
    with pytest.raises(psycopg.Error) as e:
        with conn.transaction():
            conn.execute(sql, params)
    return str(e.value)
