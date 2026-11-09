"""Shared helpers for CP-12's proofs: the timetable by hand. Copied from specs/CP-21/proofs/conftest.py (never imported
across specs).

The database is a throwaway one built from this repository's migrations, never a live one (CP-13's pattern):
- TEST_DATABASE_URL when set (GitHub's athena job, CP-20), on this machine only;
- otherwise a Postgres made here in a temp folder (initdb), with Supabase's three roles and every migration applied in
  filename order. Without Postgres's server binaries the proofs fail, they never skip.
DATABASE_URL (the live database) is never read: every engine command is run in this process on the proof's own
connection (`engine.core.db.connect` handed that connection), and DATABASE_URL is pointed at the throwaway database too.

Every proof makes its own fake school (a new tenant), one K2 class in far-future fortnights (January 2031) unless it
needs days already past, fake staff with placeholder emails, and is rolled back at the end: nothing is kept.

Names used are the contract of specs/CP-12/design.md:
- `engine timetable move --grade --section --year --from DATE --from-period N --to DATE --to-period N --by EMAIL
  [--reason TEXT]`: N is the period's number in its grade's day (`period.ord`); moving onto a lesson swaps the two.
- `engine timetable accept --key CLASH_KEY --by EMAIL --reason TEXT`;
  `engine timetable clashes --year --fortnight N` (one group per fortnight headed `FN<n>`).
- table `timetable_move (school_class_id, fortnight_id, from_date, from_period, to_date, to_period, reason, who, at)`;
  view `timetable_clash (fortnight_id, fortnight_number, week_code, kind, clash_key, places, detail, accepted)` with
  kinds `blocked`, `over_limit`, `under_limit`; table `timetable_clash_accept (fortnight_id, clash_key, kind, reason,
  who, at)`; setting `timetable.open_clash_blocks_approval` (on by default), checked by the approve command
  `engine fortnight approve --year --fortnight N --by EMAIL` (decision 6; its name is `APPROVE` below).
What the proofs need from scopes not yet on main, each named where it is used:
- CP-6 (issue #454): `fortnight_cycle (tenant_id, fortnight_id, state)`, states planning, frozen, aligned, approved,
  moved one step at a time by updating `state`; `fortnight_edit` keeps a frozen change's reason.
- CP-21 (issue #496): the dated layer (`timetable_slot.fortnight_id`, `timetable_fortnight_layer`); the educator's day
  prefers it.
- CP-3 / CP-4: the coordinator holds a current `coordinator` grant (the `everything` group); an educator holds
  `class_teacher` on the class; `access_table (schema_name, table_name, data_class, key_column)`.
"""


import datetime as dt
import fcntl
import glob
import hashlib
import os
import shutil
import subprocess
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from engine.core import db
from psycopg.pq import TransactionStatus

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
YEAR = "2030-31"


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
    tmp = Path(tempfile.mkdtemp(prefix="cp12-pg-"))
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


def _start(pg: Path, data: Path, tmp: Path, port: str = "54381") -> str:
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
    done = Path(tempfile.gettempdir()) / f"cp12-pgdata-{key}"
    with open(f"{done}.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not (done / "PG_VERSION").exists():
            tmp = Path(tempfile.mkdtemp(prefix="cp12-build-"))
            os.chmod(tmp, 0o777)
            data = tmp / "data"
            subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust",
                                        "-E", "UTF8", "--locale=C"]), check=True, capture_output=True)
            try:
                _build(_start(pg, data, tmp, "54382"))
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
        self._c.execute("release savepoint cp12_cli")
        self._c.execute("savepoint cp12_cli")

    def rollback(self):
        self._c.execute("rollback to savepoint cp12_cli")

    def close(self):
        pass


@pytest.fixture
def engine(conn, server, monkeypatch):
    """Runs `bin/engine …` in this process, against the proof's transaction. A command that ends with an error has its
    work undone, as a real connection closing without a commit would."""
    from engine.cli import app
    from typer.testing import CliRunner

    monkeypatch.setenv("DATABASE_URL", server)  # nothing can reach a live database, even by another path

    @contextmanager
    def connect(url=None):
        conn.execute("savepoint cp12_cli")
        try:
            yield _Shared(conn)
        except BaseException:
            conn.execute("rollback to savepoint cp12_cli")
            raise
        if conn.info.transaction_status == TransactionStatus.INERROR:
            conn.execute("rollback to savepoint cp12_cli")

    monkeypatch.setattr(db, "connect", connect)

    def run(*args: str):
        res = CliRunner().invoke(app, [str(a) for a in args])
        if conn.info.transaction_status == TransactionStatus.INERROR:
            conn.execute("rollback to savepoint cp12_cli")
        text = res.output + ("" if res.exception is None or isinstance(res.exception, SystemExit)
                             else f"\n{type(res.exception).__name__}: {res.exception}")
        return res.exit_code, text

    return run



# ---- the fake school -------------------------------------------------------------------------------------------

START = dt.date(2031, 1, 6)  # a Monday, far in the future
ORD = {"circle": 1, "s1": 2, "s2": 3, "extra": 4}  # the periods' numbers in the K2 day
REASON = "Proof reason: the school agreed this change"


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


def needs_layer(c) -> None:
    """CP-21's dated layer: a move works on a fortnight's own dated rows (specs/CP-12/design.md decision 1)."""
    has = _one(c, "select exists (select from information_schema.columns where table_schema = 'public'"
                  " and table_name = 'timetable_slot' and column_name = 'fortnight_id') as col,"
                  " exists (select from pg_proc where proname = 'timetable_fortnight_layer') as fn")
    if not (has["col"] and has["fn"]):
        pytest.fail("this proof needs CP-21's dated layer (`timetable_slot.fortnight_id`, `timetable_fortnight_layer`,"
                    " issue #496), which is not on this database yet")


def today(c) -> dt.date:
    return _one(c, "select (now() at time zone 'Asia/Kolkata')::date as d")["d"]


def world(c, monkeypatch, *, start=START, days=14, holiday=None, neighbours=True):
    """One fake school with one K2 class: periods (circle fixed, two subject periods, one specialist/empty period), the
    standing frame (week A and B: maths then English, music on Wednesday, the fourth period empty on other days), the
    target fortnight (number 2) and, with `neighbours`, the fortnights before (1) and after (3); school days, plan lines
    and planned sessions for each; a coordinator and an educator; every fortnight in CP-6's `planning`."""
    slug = f"cp12-{uuid.uuid4().hex[:8]}"
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
                             (t, ORD[name], at, at, f"Proof {name}", fixed))["id"])
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
         "holiday": holiday}
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
            if d.isoweekday() <= 5:
                c.execute("insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s, %s)",
                          (t, campus, d, "holiday" if d == holiday else "teaching"))
        _plan(c, w, fn)
    needs(c, "public.fortnight_cycle", "CP-6 (the fortnight cycle, issue #454)")
    for fn in w["fortnights"].values():
        c.execute("insert into fortnight_cycle (tenant_id, fortnight_id, state) values (%s, %s, 'planning')"
                  " on conflict (fortnight_id) do nothing", (t, fn["id"]))
    needs_layer(c)
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
    """The fortnight's weekdays that are not a holiday."""
    return [d for d in w["fortnights"][number]["dates"] if d.isoweekday() <= 5 and d != w["holiday"]]


def _plan(c, w, fn):
    """Plan lines and planned sessions on the frame: one session per occupied cell; subject sessions carry their
    subject's next plan line of that week."""
    ords = {}
    for d in teaching(w, fn["number"]):
        day = _one(c, "select id from school_day where campus_id = %s and on_date = %s", (w["campus"], d))["id"]
        wk = week_of(d, fn["start"])
        for p, (kind, subj, text) in ((p, w["frame"][(wk, d.isoweekday(), p)]) for p in w["period"]):
            if kind == "empty":
                continue
            entry = None
            if kind == "subject":
                n = ords[subj] = ords.get(subj, 0) + 1
                text = f"{subj} line {wk}{n} of fortnight {fn['number']}"
                entry = _one(c, "insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord,"
                                " text, source, week_code) values (%s, %s, %s, %s, %s, %s, 'proof', %s) returning id",
                             (w["tenant"], w["class"], fn["id"], subj, n, text, wk))["id"]
            c.execute("insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code,"
                      " plan_entry_id, text) values (%s, %s, %s, %s, %s, %s, %s)",
                      (w["tenant"], w["class"], day, w["period"][p], subj, entry, text))


def session_at(c, w, d: dt.date, p: str):
    """The session at one place (date, period name), or None."""
    return _one(c, "select s.* from session s join school_day d on d.id = s.school_day_id"
                   " where s.school_class_id = %s and d.on_date = %s and s.period_id = %s",
                (w["class"], d, w["period"][p]))


def sessions(c, w, number) -> list[dict]:
    fn = w["fortnights"][number]
    return c.execute(
        "select s.*, d.on_date from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = %s and d.on_date between %s and %s order by s.id",
        (w["class"], fn["dates"][0], fn["dates"][-1])).fetchall()


# ---- the engine's commands -------------------------------------------------------------------------------------

def move(engine, w, frm: dt.date, fp: str, to: dt.date, tp: str, *, by=None, reason=None):
    args = ["timetable", "move", "--grade", "K2", "--section", w["section"], "--year", YEAR,
            "--from", frm.isoformat(), "--from-period", ORD[fp], "--to", to.isoformat(), "--to-period", ORD[tp],
            "--by", by or w["coordinator"]["email"]]
    return engine(*args, *(("--reason", reason) if reason is not None else ()))


def accept(engine, w, key: str, *, by=None, reason=REASON):
    return engine("timetable", "accept", "--key", key, "--by", by or w["coordinator"]["email"], "--reason", reason)


APPROVE = ("fortnight", "approve")  # the approve command's name: the one place to point at CP-6's real name


def approve(engine, w, number=2, *, by=None):
    """The step into `approved`, through the engine's approve command (design decision 6), never a direct update."""
    code, out = engine(*APPROVE, "--year", YEAR, "--fortnight", number, "--by", by or w["coordinator"]["email"])
    if code == 2 and "No such command" in out:
        pytest.fail(f"this proof needs the approve command `engine {' '.join(APPROVE)}` (CP-6's approve step as an"
                    f" engine command, issue #454; CP-6's design leaves the command to CP-7), which is not in the"
                    f" engine yet:\n{out}")
    return code, out


def clashes(c, w, number=2) -> list[dict]:
    """The clash list of one fortnight (the view `timetable_clash`)."""
    needs(c, "public.timetable_clash", "CP-12 (this scope)")
    return c.execute("select * from timetable_clash where fortnight_id = %s order by kind, week_code nulls last",
                     (w["fortnights"][number]["id"],)).fetchall()


def step(c, w, *states, number=2):
    """CP-6's cycle, one step at a time."""
    for s in states:
        c.execute("update fortnight_cycle set state = %s where fortnight_id = %s", (s, w["fortnights"][number]["id"]))


# ---- what the educator sees, and what is written ----------------------------------------------------------------

def klass(w) -> dict:
    return {"id": str(w["class"]), "academic_year_id": w["year"], "campus_id": w["campus"],
            "grade": "K2", "section": w["section"]}


def day_view(c, w, ds) -> list[dict]:
    """The educator's day (`k2_day.days`) for each date."""
    from engine.w2_print import k2_day
    return k2_day.days(c, klass(w), list(ds))


def shown(c, w, d: dt.date, p: str) -> dict:
    """What the educator's day shows at one place."""
    day = day_view(c, w, [d])[0]
    return next(x for x in day["periods"] if x["period_id"] == w["period"][p])


SNAP = {
    "timetable_slot": "select * from timetable_slot where school_class_id = %(k)s order by id",
    "session": "select * from session where school_class_id = %(k)s order by id",
    "plan_entry": "select * from plan_entry where school_class_id = %(k)s order by id",
    "materials_line_source": "select s.* from materials_line_source s join session x on x.id = s.session_id"
                             " where x.school_class_id = %(k)s order by s.line_id, s.session_id",
    "timetable_move": "select * from timetable_move where school_class_id = %(k)s order by id",
}


def snapshot(c, w) -> dict:
    needs(c, "public.timetable_move", "CP-12 (this scope)")
    return {name: c.execute(q, {"k": w["class"]}).fetchall() for name, q in SNAP.items()}


def materials(c, w, session_ids) -> dict:
    """One materials list for the class over fortnight 2, one line per session, linked to it. {session id: line id}."""
    fn = w["fortnights"][2]
    lst = _one(c, "insert into materials_list (tenant_id, school_class_id, period, from_on, to_on)"
                  " values (%s, %s, 'fortnight', %s, %s) returning id",
               (w["tenant"], w["class"], fn["dates"][0], fn["dates"][-1]))["id"]
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


def refused(c, statement: str, params=()) -> None:
    """`statement` must raise; the proof's transaction carries on."""
    with pytest.raises(psycopg.Error), c.transaction():
        c.execute(statement, params)
