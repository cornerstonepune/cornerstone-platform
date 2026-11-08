"""Shared helpers for CP-21's proofs: a draft goes live.

The database is a throwaway one built from this repository's migrations, never a live one (CP-13's pattern):
- TEST_DATABASE_URL when set (GitHub's athena job, CP-20), on this machine only;
- otherwise a Postgres made here in a temp folder (initdb), with Supabase's three roles and every migration applied in
  filename order. Without Postgres's server binaries the proofs fail, they never skip.
DATABASE_URL (the live database) is never read: every engine command is run in this process on the proof's own
connection (`engine.core.db.connect` handed that connection), and DATABASE_URL is pointed at the throwaway database too.

Every proof makes its own fake school (a new tenant), one K2 class in far-future fortnights (January 2031), fake staff
with placeholder emails, and is rolled back at the end: nothing is kept. No real name, email or child appears.

Names used are the contract of specs/CP-21/design.md: `engine timetable go-live --grade --section --year --fortnight
--run --by [--reason] [--discard-changes] [--dry]`, table `timetable_live`, column `timetable_slot.fortnight_id`,
setting `timetable.go_live_group`. What the proofs need from scopes not yet on main, each named where it is used:
- CP-11 (issue #459): table `timetable_run (id, school_class_id, fortnight_id, outcome, input_text, draft)` and the
  command `engine timetable generate --grade --section --year --fortnight`, which keeps a run whose `input_text` is
  the rules as they are now. A draft is a list with one entry per placed lesson: date, week, period id, subject code,
  read here as the keys `date`, `week`, `period_id`, `subject_code` (checked against a run CP-11 makes, below).
- CP-6 (issue #454): table `fortnight_cycle (tenant_id, fortnight_id, state)`; `planning`, then `frozen`.
- CP-3 / CP-4: the coordinator is a person with a current `coordinator` grant (CP-3's `everything` group); an educator
  holds `class_teacher` on the class (CP-3's `own_classes`).
"""

import datetime as dt
import fcntl
import glob
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.pq import TransactionStatus

from engine.core import db

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
YEAR = "2030-31"
START = dt.date(2031, 1, 6)  # a Monday, far in the future
DRAFT_KEYS = {"date", "week", "period_id", "subject_code"}


# ---- the throwaway database --------------------------------------------------------------------------------------

def _pg_bin() -> Path:
    for d in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True):
        if (Path(d) / "initdb").exists():
            return Path(d)
    found = shutil.which("initdb")
    if found:
        return Path(found).parent
    pytest.fail("TEST_DATABASE_URL is not set and this machine has no Postgres server binaries (initdb)")


def _as_pg_user(cmd: list[str]) -> list[str]:
    return ["runuser", "-u", "postgres", "--", *cmd] if os.geteuid() == 0 else cmd


def _build(url: str) -> None:
    with psycopg.connect(url, autocommit=True) as c:
        for r in SUPABASE_ROLES:
            c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                      f"then create role {r} nologin; end if; end $$")
    for f in MIGRATIONS:
        out = subprocess.run(["psql", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(f)],
                             capture_output=True, text=True)
        assert out.returncode == 0, f"{f.name}: {out.stderr.strip()[-800:]}"


@pytest.fixture(scope="session")
def server():
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp21-pg-"))
    os.chmod(tmp, 0o777)
    data = tmp / "data"
    subprocess.run(_as_pg_user(["cp", "-a", str(_built(pg)), str(data)]), check=True, capture_output=True)
    url = _start(pg, data, tmp)
    try:
        yield url
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


def _start(pg: Path, data: Path, tmp: Path, port: str = "54371") -> str:
    sock = tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {port}"]), check=True, capture_output=True)
    return f"postgresql://postgres@/postgres?host={sock}&port={port}"


def _built(pg: Path) -> Path:
    """A data folder with every migration applied, built once per set of migrations and copied by each proof run, so
    the eight checks do not build the same database eight times. Keyed by the migrations' bytes: any change rebuilds."""
    key = hashlib.sha256(b"".join(f.name.encode() + f.read_bytes() for f in MIGRATIONS)).hexdigest()[:16]
    done = Path(tempfile.gettempdir()) / f"cp21-pgdata-{key}"
    with open(f"{done}.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not (done / "PG_VERSION").exists():
            tmp = Path(tempfile.mkdtemp(prefix="cp21-build-"))
            os.chmod(tmp, 0o777)
            data = tmp / "data"
            subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust",
                                        "-E", "UTF8", "--locale=C"]), check=True, capture_output=True)
            try:
                _build(_start(pg, data, tmp, "54372"))
            finally:
                subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "fast", "-w", "stop"]),
                               capture_output=True)
            shutil.rmtree(done, ignore_errors=True)
            os.rename(data, done)  # whole or not at all: a half-copied folder is never taken for a built one
            shutil.rmtree(tmp, ignore_errors=True)
    return done


@pytest.fixture
def conn(server):
    """One transaction on the throwaway database, always rolled back."""
    with db.connect(server) as c:
        c.execute("select set_config('app.changed_by', %s, true)", (f"staff:{uuid.uuid4()}",))
        try:
            yield c
        finally:
            c.rollback()


# ---- engine commands, run on the proof's own connection ---------------------------------------------------------

class _Shared:
    """The proof's connection as the engine sees it: commit keeps the work inside the proof's transaction (a savepoint
    is released), rollback undoes the command's work only. Everything is still rolled back when the proof ends."""

    def __init__(self, c):
        self._c = c

    def __getattr__(self, name):
        return getattr(self._c, name)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def commit(self):
        self._c.execute("release savepoint cp21_cli")
        self._c.execute("savepoint cp21_cli")

    def rollback(self):
        self._c.execute("rollback to savepoint cp21_cli")

    def close(self):
        pass


@pytest.fixture
def engine(conn, server, monkeypatch):
    """Runs `bin/engine …` in this process, against the proof's transaction. A command that ends with an error has its
    work undone, as a real connection closing without a commit would."""
    from typer.testing import CliRunner

    from engine.cli import app

    monkeypatch.setenv("DATABASE_URL", server)  # nothing can reach a live database, even by another path

    @contextmanager
    def connect(url=None):
        conn.execute("savepoint cp21_cli")
        try:
            yield _Shared(conn)
        except BaseException:
            conn.execute("rollback to savepoint cp21_cli")
            raise
        if conn.info.transaction_status == TransactionStatus.INERROR:
            conn.execute("rollback to savepoint cp21_cli")

    monkeypatch.setattr(db, "connect", connect)

    def run(*args: str):
        res = CliRunner().invoke(app, [str(a) for a in args])
        if conn.info.transaction_status == TransactionStatus.INERROR:
            conn.execute("rollback to savepoint cp21_cli")
        text = res.output + ("" if res.exception is None or isinstance(res.exception, SystemExit)
                             else f"\n{type(res.exception).__name__}: {res.exception}")
        return res.exit_code, text

    return run


# ---- the fake school -------------------------------------------------------------------------------------------

def week_of(d: dt.date, start: dt.date) -> str:
    return "A" if (d - start).days < 7 else "B"


def dates(start: dt.date, days: int) -> list[dt.date]:
    return [start + dt.timedelta(n) for n in range(days)]


def _one(c, q, p=()):
    return c.execute(q, p).fetchone()


def needs(c, table: str, scope: str) -> None:
    """A table another scope adds; a clear failure naming that scope when it is not on this database."""
    if _one(c, "select to_regclass(%s) as t", (table,))["t"] is None:
        pytest.fail(f"this proof needs `{table}` from {scope}, which is not on this database yet")


def world(c, monkeypatch, *, start=START, days=14, holiday=None, missing=None, neighbours=True, sessions=True):
    """One fake school with one K2 class: periods (circle fixed, two subject periods, one specialist/empty period), the
    standing frame (week A and B: maths then English, music on Wednesday), the target fortnight (number 2) and, with
    `neighbours`, the fortnights before (1) and after (3); school days, plan lines and planned sessions for each; a
    coordinator and an educator. `holiday` is a date of kind holiday; `missing` a weekday with no school-day row."""
    slug = f"cp21-{uuid.uuid4().hex[:8]}"
    t = _one(c, "insert into tenant (slug, name) values (%s, 'Proof School') returning id", (slug,))["id"]
    monkeypatch.setenv("TENANT_SLUG", slug)
    campus = _one(c, "insert into campus (tenant_id, name) values (%s, 'Proof campus') returning id", (t,))["id"]
    year = _one(c, "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, %s, '2026-01-01',"
                   " '2031-12-31') returning id", (t, YEAR))["id"]
    section = f"P{uuid.uuid4().hex[:5]}"
    klass = _one(c, "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
                    " values (%s, %s, %s, 'K2', %s) returning id", (t, campus, year, section))["id"]
    per = {}
    for name, at, fixed in (("circle", "08:30", True), ("s1", "09:00", False), ("s2", "10:00", False),
                            ("extra", "11:00", False)):
        per[name] = str(_one(c, "insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed)"
                                " values (%s, 'K2', %s, %s, %s::time + interval '45 minutes', %s, %s) returning id",
                             (t, len(per) + 1, at, at, f"Proof {name}", fixed))["id"])
    frame = {}
    for wk in "AB":
        for wd in range(1, 6):
            cells = {"circle": ("fixed", None, "Circle"), "s1": ("subject", "math", "Maths"),
                     "s2": ("subject", "english", "English"),
                     "extra": ("specialist", "music", "Visiting music") if wd == 3 else ("empty", None, "")}
            for p, (kind, subj, text) in cells.items():
                c.execute("insert into timetable_slot (tenant_id, school_class_id, period_id, week_code, weekday, kind,"
                          " subject_code, text, valid_from) values (%s, %s, %s, %s, %s, %s, %s, %s, '2026-01-01')",
                          (t, klass, per[p], wk, wd, kind, subj, text))
                frame[(wk, wd, p)] = (kind, subj, text)
    coord, educator = _staff(c, t, campus, klass)
    w = {"tenant": t, "slug": slug, "campus": campus, "year": year, "class": klass, "section": section,
         "period": per, "frame": frame, "coordinator": coord, "educator": educator, "fortnights": {},
         "holiday": holiday, "missing": missing}
    spans = [(2, start, days)]
    if neighbours:
        spans += [(1, start - dt.timedelta(14), 14), (3, start + dt.timedelta(days), 14)]
    for number, s, n in sorted(spans):
        fid = _one(c, "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
                      " values (%s, %s, %s, 'teaching', %s, %s) returning id",
                   (t, year, number, s, s + dt.timedelta(n - 1)))["id"]
        fn = {"id": fid, "number": number, "start": s, "dates": dates(s, n)}
        w["fortnights"][number] = fn
        for d in fn["dates"]:
            if d.isoweekday() <= 5 and d != missing:
                c.execute("insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s, %s)",
                          (t, campus, d, "holiday" if d == holiday else "teaching"))
        if sessions:
            _plan(c, w, fn)
    needs(c, "public.fortnight_cycle", "CP-6 (the fortnight cycle, issue #454)")
    for fn in w["fortnights"].values():
        c.execute("insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')"
                  " on conflict (fortnight_id) do nothing", (t, fn["id"]))
    return w


def _staff(c, t, campus, klass):
    out = []
    for role, on_class in (("coordinator", None), ("class_teacher", klass)):
        sid = _one(c, "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus))["id"]
        email = f"{role.replace('_', '-')}-{uuid.uuid4().hex[:8]}@example.org"
        c.execute("insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Proof Person', %s)",
                  (t, sid, email))
        c.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from,"
                  " granted_by) values (%s, %s, %s, %s, '2026-01-01', 'proof')", (t, sid, role, on_class))
        out.append({"id": sid, "email": email})
    return out


def teaching(w, number) -> list[dt.date]:
    """The fortnight's weekdays that are not a holiday (a weekday with no school-day row included)."""
    return [d for d in w["fortnights"][number]["dates"] if d.isoweekday() <= 5 and d != w["holiday"]]


def _plan(c, w, fn):
    """Plan lines and planned sessions on the frame: one session per occupied cell; subject sessions carry their
    subject's next plan line of that week (week A lines on week A days)."""
    ords = {}
    for d in teaching(w, fn["number"]):
        if d == w["missing"]:
            continue
        day = _one(c, "select id from school_day where campus_id = %s and on_date = %s", (w["campus"], d))["id"]
        wk = week_of(d, fn["start"])
        for p, (kind, subj, text) in ((p, w["frame"][(wk, d.isoweekday(), p)]) for p in w["period"]):
            if kind == "empty":
                continue
            entry = None
            if kind == "subject":  # the planner numbers a subject's lines through the fortnight, week A first
                n = ords[subj] = ords.get(subj, 0) + 1
                text = f"{subj} line {wk}{n} of fortnight {fn['number']}"
                entry = _one(c, "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord,"
                                " text, source, week_code) values (%s, %s, %s, %s, %s, %s, 'proof', %s) returning id",
                             (w["tenant"], w["class"], fn["id"], subj, n, text, wk))["id"]
            c.execute("insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code,"
                      " plan_entry_id, text) values (%s, %s, %s, %s, %s, %s, %s)",
                      (w["tenant"], w["class"], day, w["period"][p], subj, entry, text))


def sessions(c, w, number=2) -> list[dict]:
    """The fortnight's sessions with their date, period, plan line and week of that line."""
    fn = w["fortnights"][number]
    return c.execute(
        "select s.id, s.subject_code, s.state, s.text, s.plan_entry_id, s.period_id::text as period_id,"
        " d.on_date, pe.week_code, pe.ord from session s join school_day d on d.id = s.school_day_id"
        " left join plan_entry pe on pe.id = s.plan_entry_id"
        " where s.school_class_id = %s and d.on_date between %s and %s order by d.on_date, s.period_id",
        (w["class"], fn["dates"][0], fn["dates"][-1])).fetchall()


# ---- drafts (CP-11's runs) --------------------------------------------------------------------------------------

def entry(w, number, d, p, subj) -> dict:
    return {"date": d.isoformat(), "week": week_of(d, w["fortnights"][number]["start"]), "period_id": w["period"][p],
            "subject_code": subj}


def swapped(w, number=2) -> list[dict]:
    """A placed draft that differs from the frame: on every other calendar day English comes before maths (so a weekday
    seven days later has the other order, and a week A/B frame could not hold it)."""
    out = []
    for d in teaching(w, number):
        first, second = ("english", "math") if d.toordinal() % 2 == 0 else ("math", "english")
        out += [entry(w, number, d, "s1", first), entry(w, number, d, "s2", second)]
    return out


def moving(w, number=2) -> list[dict]:
    """A placed draft that moves lessons between days: week A's Monday has two maths lessons, its Tuesday two English
    lessons; every other day as the frame. A maths session that was on Tuesday must change date."""
    out = []
    for d in teaching(w, number):
        if d == START:
            out += [entry(w, number, d, "s1", "math"), entry(w, number, d, "s2", "math")]
        elif d == START + dt.timedelta(1):
            out += [entry(w, number, d, "s1", "english"), entry(w, number, d, "s2", "english")]
        else:
            out += [entry(w, number, d, "s1", "math"), entry(w, number, d, "s2", "english")]
    return out


def generated(c, engine, w, number=2) -> dict:
    """A run CP-11's own command makes for the fortnight as its rules are now (so its input file is current)."""
    needs(c, "public.timetable_run", "CP-11 (the generator, issue #459)")
    code, out = engine("timetable", "generate", "--grade", "K2", "--section", w["section"], "--year", YEAR,
                       "--fortnight", number)
    row = _one(c, "select * from timetable_run where school_class_id = %s and fortnight_id = %s"
                  " order by created_at desc limit 1", (w["class"], w["fortnights"][number]["id"]))
    if row is None:
        pytest.fail(f"CP-11's `engine timetable generate` (issue #459) kept no run (exit {code}):\n{out[-1500:]}")
    assert row["outcome"] == "placed", f"CP-11's run for the proof's plain frame was not placed: {row['outcome']}"
    draft = row["draft"]
    assert isinstance(draft, list) and draft and all(DRAFT_KEYS <= set(e) for e in draft), (
        f"CP-11's draft entries are not {sorted(DRAFT_KEYS)} as specs/CP-21/design.md reads them: {str(draft)[:300]}")
    return row


def run_with(c, base: dict, draft: list[dict], outcome: str = "placed"):
    """A run as CP-11 keeps them, made from `base` (same class, fortnight and input file, so the same rules) with the
    given draft and outcome. CP-11's table only refuses update and delete."""
    cols = [r["column_name"] for r in c.execute(
        "select column_name::text from information_schema.columns where table_schema = 'public'"
        " and table_name = 'timetable_run' and is_generated = 'NEVER' order by ordinal_position").fetchall()
        if r["column_name"] not in ("id", "draft", "outcome", "created_at")]
    q = sql.SQL("insert into timetable_run ({cols}, draft, outcome) select {cols}, %s, %s from timetable_run"
                " where id = %s returning id").format(cols=sql.SQL(", ").join(map(sql.Identifier, cols)))
    return _one(c, q, (json.dumps(draft), outcome, base["id"]))["id"]


def go_live(engine, w, run, *, by=None, number=2, extra=()):
    return engine("timetable", "go-live", "--grade", "K2", "--section", w["section"], "--year", YEAR,
                  "--fortnight", number, "--run", run, "--by", by or w["coordinator"]["email"], *extra)


# ---- what the educator sees, and what is written ----------------------------------------------------------------

def klass(w) -> dict:
    return {"id": str(w["class"]), "academic_year_id": w["year"], "campus_id": w["campus"],
            "grade": "K2", "section": w["section"]}


def day_view(c, w, ds) -> list[dict]:
    """The educator's day (`k2_day.days`) for each date."""
    from engine.w2_print import k2_day
    return k2_day.days(c, klass(w), list(ds))


def lessons(day: dict) -> set[tuple[str, str]]:
    return {(p["period_id"], p["subject"]) for p in day["periods"] if p["kind"] == "subject"}


def draft_by_date(draft) -> dict[str, set[tuple[str, str]]]:
    out: dict[str, set] = {}
    for e in draft:
        out.setdefault(e["date"], set()).add((str(e["period_id"]), e["subject_code"]))
    return out


SNAP = {
    "timetable_slot": "select * from timetable_slot where school_class_id = %(k)s order by id",
    "session": "select * from session where school_class_id = %(k)s order by id",
    "plan_entry": "select * from plan_entry where school_class_id = %(k)s order by id",
    "materials_list": "select * from materials_list where school_class_id = %(k)s order by id",
    "materials_line": "select l.* from materials_line l join materials_list m on m.id = l.list_id"
                      " where m.school_class_id = %(k)s order by l.id",
    "materials_line_source": "select s.* from materials_line_source s join session x on x.id = s.session_id"
                             " where x.school_class_id = %(k)s order by s.line_id, s.session_id",
    "timetable_live": "select * from timetable_live where school_class_id = %(k)s order by id",
}


def snapshot(c, w) -> dict:
    return {name: c.execute(q, {"k": w["class"]}).fetchall() for name, q in SNAP.items()}


def materials(c, w, session_ids, *, from_on=None, to_on=None, state="draft", per="fortnight") -> dict:
    """One materials list for the class (the fortnight by default), one line per session, each linked to its session
    on the session's date. Returns {session id: line id}."""
    fn = w["fortnights"][2]
    lst = _one(c, "insert into materials_list (tenant_id, school_class_id, period, from_on, to_on, state)"
                  " values (%s, %s, %s, %s, %s, %s) returning id",
               (w["tenant"], w["class"], per, from_on or fn["dates"][0], to_on or fn["dates"][-1], state))["id"]
    out = {}
    for sid in session_ids:
        on = _one(c, "select d.on_date from session s join school_day d on d.id = s.school_day_id where s.id = %s",
                  (sid,))["on_date"]
        code = f"MAT-{uuid.uuid4().hex[:6]}"
        c.execute("insert into material_item (tenant_id, code, name) values (%s, %s, %s)",
                  (w["tenant"], code, f"Proof material {code}"))
        line = _one(c, "insert into materials_line (tenant_id, list_id, material_code, unit, quantity, needed_on,"
                       " source) values (%s, %s, %s, 'piece', 1, %s, 'educator') returning id",
                    (w["tenant"], lst, code, on))["id"]
        c.execute("insert into materials_line_source (line_id, session_id, activity_code, on_date, quantity)"
                  " values (%s, %s, 'ACT-PROOF', %s, 1)", (line, sid, on))
        out[sid] = line
    return out


FAKE = {"uuid": "gen_random_uuid()", "text": "'cp21'", "character varying": "'cp21'", "integer": "0",
        "smallint": "0", "bigint": "0", "numeric": "0", "boolean": "false", "date": "current_date",
        "timestamp with time zone": "now()", "jsonb": "'{}'", "ARRAY": "'{}'"}


def ins(c, table: str, **vals):
    """Insert one row with the given values and a placeholder for every other required column (CP-13's helper), for
    a table of another scope whose other columns this proof does not read; returns its id."""
    for r in c.execute(
            "select column_name::text as col, data_type::text as typ from information_schema.columns"
            " where table_schema = 'public' and table_name = %s and is_nullable = 'NO' and column_default is null"
            " and is_generated = 'NEVER'", (table,)).fetchall():
        col, typ = r["col"], r["typ"]
        if col not in vals:
            assert typ in FAKE, f"{table}.{col}: no placeholder for {typ}"
            vals[col] = sql.SQL(FAKE[typ])
    q = sql.SQL("insert into {} ({}) values ({}) returning id").format(
        sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, vals)),
        sql.SQL(", ").join(v if isinstance(v, sql.Composable) else sql.Literal(v) for v in vals.values()))
    return c.execute(q).fetchone()["id"]


def refused(c, statement: str, params=()) -> None:
    """`statement` must raise; the proof's transaction carries on."""
    with pytest.raises(psycopg.Error):
        with c.transaction():
            c.execute(statement, params)
