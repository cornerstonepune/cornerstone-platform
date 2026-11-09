"""Shared helpers for CP-9's database proofs (items 1 to 6).

The database is a throwaway one, never a live one:
- a template is built once per run from every migration in supabase/migrations (filename order, after Supabase's three
  roles) and then the seed (`bin/engine load`), as `bin/testdb fresh` does, without the bank or the library;
- it is built on TEST_DATABASE_URL's server when that is set (a database on this machine only), otherwise on a
  Postgres made here in a temp folder (initdb). Without Postgres's server binaries the proofs fail, they never skip;
- every test gets its own copy of the template (`create database ... template ...`), dropped afterwards, because the
  nightly job commits what it writes.
The engine reads DATABASE_URL. It is removed from this process before any test runs and set, inside this process only,
to the test's own copy. The live database is never read here.
"""

import datetime as dt
import glob
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

from engine.core import db as engine_db  # noqa: F401  imported first: it reads the repo's .env, popped just below

os.environ.pop("DATABASE_URL", None)  # nothing in this process may reach a database it was not given here

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
STATE_COLUMNS = ("id", "computed_at", "created_at", "updated_at")  # not the state itself


def _pg_bin() -> Path:
    for d in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True):
        if (Path(d) / "initdb").exists():
            return Path(d)
    found = shutil.which("initdb")
    if found:
        return Path(found).parent
    pytest.fail("TEST_DATABASE_URL is not set and this machine has no Postgres server binaries (initdb)")


def _as_pg_user(cmd: list[str]) -> list[str]:
    # initdb refuses to run as root; GitHub's runner is not root, a sandbox may be.
    return ["runuser", "-u", "postgres", "--", *cmd] if os.geteuid() == 0 else cmd


def _with_db(url: str, name: str) -> str:
    info = psycopg.conninfo.conninfo_to_dict(url)
    info["dbname"] = name
    return psycopg.conninfo.make_conninfo(**info)


def psql_file(url: str, path: Path) -> None:
    out = subprocess.run(["psql", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(path)],
                         capture_output=True, text=True)
    assert out.returncode == 0, f"{path.name}: {out.stderr.strip()[-800:]}"


@pytest.fixture(scope="session")
def server():
    """The admin url of a throwaway Postgres server."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp9-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    port = "54349"
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8",
                                "--locale=C"]), check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {port}"]), check=True, capture_output=True)
    try:
        yield f"postgresql://postgres@/postgres?host={sock}&port={port}"
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="session")
def template(server):
    """The name of a database built from every migration and the seed, used only as a template."""
    name = f"cp9_template_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(server, autocommit=True) as c:
        c.execute(f"create database {name}")
    url = _with_db(server, name)
    try:
        with psycopg.connect(url, autocommit=True) as c:
            for r in SUPABASE_ROLES:
                c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                          f"then create role {r} nologin; end if; end $$")
        for f in MIGRATIONS:
            psql_file(url, f)
        env = {k: v for k, v in os.environ.items() if k not in ("TEST_DATABASE_URL",)} | {"DATABASE_URL": url}
        out = subprocess.run([str(ROOT / "bin" / "engine"), "load"], capture_output=True, text=True, env=env,
                             cwd=ROOT)
        assert out.returncode == 0, f"engine load on the throwaway database failed: {out.stderr.strip()[-800:]}"
        yield name
    finally:
        with psycopg.connect(server, autocommit=True) as c:
            c.execute(f"drop database if exists {name} with (force)")


@pytest.fixture
def db_url(server, template, monkeypatch):
    """A fresh copy of the template for this test; DATABASE_URL names it inside this process only."""
    name = f"cp9_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(server, autocommit=True) as c:
        c.execute(f"create database {name} template {template}")
    url = _with_db(server, name)
    monkeypatch.setenv("DATABASE_URL", url)
    try:
        yield url
    finally:
        with psycopg.connect(server, autocommit=True) as c:
            c.execute(f"drop database if exists {name} with (force)")


def connect(url: str) -> psycopg.Connection:
    return psycopg.connect(url, row_factory=dict_row)


@pytest.fixture
def conn(db_url):
    """A connection to the test's own copy, as the database owner (fixtures are written as the owner)."""
    with connect(db_url) as c:
        yield c


def run_nightly(conn, now=None) -> dict:
    """The job the scope asks for (design decision 3), imported only when called, so the rows a test made first
    are known to be right when it fails here."""
    from engine.w3_read.nightly import nightly

    return nightly(conn, now=now)


def graph_runs(conn) -> list[dict]:
    return conn.execute("select * from graph_run order by started_at, id").fetchall()


def states(conn, table: str, child=None) -> list[dict]:
    """A state table's rows, without the surrogate id and timestamps, sorted."""
    rows = conn.execute(f"select * from {table}" + (" where child_id = %s" if child else ""),
                        (child,) if child else None).fetchall()
    out = [{k: v for k, v in r.items() if k not in STATE_COLUMNS} for r in rows]
    return sorted(out, key=lambda r: sorted((k, str(v)) for k, v in r.items()))


# ---- rows: placeholders only, never a real name ---------------------------------------------------------------------

def tenant(conn):
    return conn.execute("select id from tenant where slug = %s", (engine_db.tenant_slug(),)).fetchone()["id"]


def a_child(conn, t):
    child = conn.execute(
        "insert into child (tenant_id, roll_no, section, band) values (%s, '1', %s, 'G2') returning id",
        (t, f"CP9-{uuid.uuid4().hex[:6].upper()}")).fetchone()["id"]
    conn.execute("insert into pii.child (tenant_id, child_id, first_name) values (%s, %s, 'Placeholder')", (t, child))
    return child


def a_k2_class(conn, campus=None) -> dict:
    """A K2 class, its educator (class teacher, placeholder email), five enrolled children with roll numbers 1 to 5,
    and an activity numbered on the K2 list naming two registry skills."""
    t = tenant(conn)
    tag = uuid.uuid4().hex[:6]
    campus = campus or conn.execute("select id from campus where tenant_id = %s order by id limit 1",
                                    (t,)).fetchone()["id"]
    year = conn.execute(
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2031-32', '2026-01-01',"
        " '2032-03-31') on conflict (tenant_id, label) do update set label = excluded.label returning id",
        (t,)).fetchone()["id"]
    klass = conn.execute(
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id", (t, campus, year, f"T{tag}")).fetchone()["id"]
    staff = conn.execute("insert into staff (tenant_id, campus_id) values (%s, %s) returning id",
                         (t, campus)).fetchone()["id"]
    email = f"placeholder.{tag}@example.test"
    conn.execute("insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder Educator', %s)",
                 (t, staff, email))
    conn.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)"
                 " values (%s, %s, 'class_teacher', %s, '2026-01-01', 'cp9 proof')", (t, staff, klass))
    children = {}
    for roll in ("1", "2", "3", "4", "5"):
        child = a_child(conn, t)
        conn.execute("insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
                     " values (%s, %s, %s, %s, '2026-01-01', 'cp9 proof')", (t, child, klass, roll))
        children[roll] = child
    code = f"ACT-K2-CP9{tag}"
    conn.execute("insert into activity (tenant_id, code, band, strand, name, sheet_no) values (%s, %s, 'K2', 'Maths',"
                 " 'Placeholder activity', '12')", (t, code))
    skills = [r["code"] for r in conn.execute(
        "select code from registry_skill where tenant_id = %s order by code limit 2", (t,)).fetchall()]
    for s in skills:
        conn.execute("insert into activity_skill (tenant_id, activity_code, skill_code) values (%s, %s, %s)",
                     (t, code, s))
    return {"tenant": t, "campus": campus, "year": year, "class": klass, "staff": staff, "email": email,
            "children": children, "activity": code, "skills": skills}


def a_paper(conn, t, child, answers: list[tuple[str, str]]) -> list:
    """One child's read paper (as tests/rows.py `a_read_paper` builds one): a worksheet, its copy, the scan and one
    candidate answer per (status, working_shown), each on its own question of skill NUM.OPS.02. → item_result ids."""
    import json

    tag = uuid.uuid4().hex.upper()
    tpl = conn.execute(
        "insert into sheet_template (tenant_id, band, child_id, week, key, batch_id) values (%s, 'G2', %s, %s, %s, %s)"
        " returning id", (t, child, f"CP9-{tag[:8]}", json.dumps({"code": "CP9-P1"}), "CP9-P1")).fetchone()["id"]
    inst = conn.execute(
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status)"
        " values (%s, %s, %s, %s, 'returned') returning id", (t, f"CS{tag}", tpl, child)).fetchone()["id"]
    cap = conn.execute(
        "insert into capture (tenant_id, path, pages, sheet_instance_id, status) values (%s, 'cp9.pdf', 1, %s,"
        " 'processed') returning id", (t, inst)).fetchone()["id"]
    out = []
    for n, (status, working) in enumerate(answers, start=1):
        item = conn.execute(
            "insert into item (tenant_id, item_key, template, rung_code, skill_codes, signal, fmt, spec, responses)"
            " values (%s, %s, 'rows', 'R24', '{NUM.OPS.02}', 'Procedural', 'column', %s, %s) returning id",
            (t, f"cp9/{tag}/{n}", json.dumps({"op": "-", "a": 62, "b": 27, "page": 1}),
             json.dumps([{"rid": "a", "answer": 35}]))).fetchone()["id"]
        raw = {"child_answer": "" if status == "blank" else "45", "answer_state": "blank" if status == "blank"
               else "written", "confidence": 95.0, "why": ""}
        out.append(conn.execute(
            "insert into item_result (tenant_id, capture_id, item_id, rid, raw_read, status, state, working_shown)"
            " values (%s, %s, %s, 'a', %s, %s, 'candidate', %s) returning id",
            (t, cap, item, json.dumps(raw), status, working)).fetchone()["id"])
    return out


MOVE = {"above": 1, "as_expected": 0, "below": -1}
MARK = {0: "not_yet", 1: "not_yet", 2: "sometimes", 3: "yes"}


def observed(conn, k, child, at: dt.datetime, outcome="above", expected=2, created_at=None, confirmed=True,
             note_id=None):
    """One observation as the typed form writes it and its evidence on each of the activity's skills; the evidence's
    `created_at` set when given (the proof's clock). Returns the observation id."""
    reached = min(3, max(0, expected + MOVE[outcome]))
    obs = conn.execute(
        "insert into activity_observation (tenant_id, confirmation_id, note_id, activity_code, child_id, class_id,"
        " outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)"
        " values (%s, %s, %s, %s, %s, %s, %s, 'individual', %s, %s, %s, %s, %s, %s) returning id",
        (k["tenant"], uuid.uuid4(), note_id, k["activity"], child, k["class"], outcome,
         "voice" if note_id else "form", expected, reached, at, k["staff"], k["staff"])).fetchone()["id"]
    for s in k["skills"]:
        conn.execute(
            "insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind,"
            " mark, seen_by, place, source, observation_id, created_at)"
            " values (%s, %s, %s, 'educator', %s, %s, 'observed', %s, %s, 'class', 'cp9 proof', %s,"
            " coalesce(%s, now()))",
            (k["tenant"], child, s, at, str(k["staff"]) if confirmed else None, MARK[reached], str(k["staff"]), obs,
             created_at))
    return obs
