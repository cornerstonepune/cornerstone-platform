"""Shared helpers for CP-10's proofs.

The database is a throwaway one built from this repository's migrations, never a live one (CP-3 and CP-13's pattern):
- on TEST_DATABASE_URL's server when it is set (GitHub's proofs job), which must be on this machine;
- otherwise on a Postgres made here in a temp folder (initdb). Without either the proofs fail; they never skip.
Once per run a base database is built there (Supabase's three roles, then every migration in filename order), and
every test gets its own copy of it (`create database ... template`), dropped afterwards. So a test may commit, as the
engine's routes and commands do, and nothing it writes reaches another test or survives the run. DATABASE_URL (live)
is never read: each test points it at its own copy.

Every row is fake: one made-up school, made-up names and a made-up transcript whose distinctive words
(FIXTURE_WORDS) are searched for by item 7. Recordings are a few fake bytes in a temp folder that stands in for the
engine's `data/` folder (`voice_store.ROOT`, as the engine's own voice tests point it). No service is called: the
speech service is answered by an in-process fake transport.
"""

import datetime as dt
import glob
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import httpx
import psycopg
import pytest
from psycopg.rows import dict_row

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
PORT = "54373"
KEY = "cp10-proof-engine-key"
SLUG = "cp10-proof-school"

# --- the fixture: made-up words only ------------------------------------------------------------------------------
FIXTURE_WORDS = ("vorquillian", "plimsackery", "zandrofel")
SENTENCE = "She stacked the vorquillian blocks beside the plimsackery tray with zandrofel care"
TRANSCRIPT = f"Activity 12. Above 1. Below 2. The rest did as expected. {SENTENCE}."
AUDIO = b"\x00\x01CP10-FAKE-AUDIO-qwxzvbnk-7f3e9d\x00" * 8  # not a real recording; a marker searched for by item 7
AUDIO_MARKER = "CP10-FAKE-AUDIO-qwxzvbnk"
EDUCATOR_NAME = "Brindlewick Ostravane"
CHILD_NAMES = ("Quenmarrow", "Tibbalyne", "Orsquith", "Wendravel", "Yaxmorrin")
ALL_NAMES = (*EDUCATOR_NAME.split(), *CHILD_NAMES)


# --- the throwaway server and one database per test ---------------------------------------------------------------

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


def _with_db(url: str, name: str) -> str:
    info = psycopg.conninfo.conninfo_to_dict(url)
    info["dbname"] = name
    return psycopg.conninfo.make_conninfo(**info)


@pytest.fixture(scope="session")
def server():
    """→ a url on the throwaway server (its maintenance database)."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp10-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8",
                                "--locale=C"]), check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {PORT}"]), check=True, capture_output=True)
    try:
        yield f"postgresql://postgres@/postgres?host={sock}&port={PORT}"
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="session")
def base(server):
    """The name of a database built from every migration, the template each test copies."""
    name = f"cp10_base_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(server, autocommit=True) as c:
        c.execute(f"create database {name}")
        for r in ("anon", "authenticated", "service_role"):
            c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                      f"then create role {r} nologin; end if; end $$")
    url = _with_db(server, name)
    try:
        for f in MIGRATIONS:
            out = subprocess.run(["psql", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(f)],
                                 capture_output=True, text=True)
            assert out.returncode == 0, f"migration {f.name}: {out.stderr.strip()[-600:]}"
        yield name
    finally:
        with psycopg.connect(server, autocommit=True) as c:
            c.execute(f"drop database if exists {name} with (force)")


@pytest.fixture
def dburl(server, base):
    """A database of this test's own, copied from the base, dropped after the test."""
    name = f"cp10_t_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(server, autocommit=True) as c:
        c.execute(f"create database {name} template {base}")
    try:
        yield _with_db(server, name)
    finally:
        with psycopg.connect(server, autocommit=True) as c:
            c.execute(f"drop database if exists {name} with (force)")


@pytest.fixture
def voice_dir(tmp_path, monkeypatch):
    """The engine's data folder for this test: `<tmp>/data`, with recordings under `<tmp>/data/voice`."""
    from engine.w3_read import voice_store

    data = tmp_path / "data"
    (data / "voice").mkdir(parents=True)
    monkeypatch.setattr(voice_store, "ROOT", data)
    return data


@pytest.fixture
def engine_env(dburl, voice_dir, monkeypatch):
    """The engine pointed at this test's database and folder, with a key; no speech service key."""
    monkeypatch.setenv("DATABASE_URL", dburl)
    monkeypatch.setenv("TENANT_SLUG", SLUG)
    monkeypatch.setenv("ENGINE_KEY", KEY)
    monkeypatch.delenv("ENGINE_POOL", raising=False)
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    return dburl


@pytest.fixture
def conn(engine_env):
    """The test's own connection (rows as dicts, as the engine's are). Commit to let a route or command see a row."""
    with psycopg.connect(engine_env, row_factory=dict_row) as c:
        yield c
        c.rollback()


@pytest.fixture
def client(engine_env):
    """The engine's HTTP app, in process; each request opens its own connection to this test's database."""
    from fastapi.testclient import TestClient

    from engine.api.app import app

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def post(client, path, body=None):
    return client.post(path, json=body if body is not None else {}, headers={"X-Engine-Key": KEY})


def cleanup(client):
    """One run of the clean-up, as the schedule calls it."""
    return post(client, "/voice/cleanup")


def cli(*args):
    """`engine <args>` in process (Typer's runner) → (exit code, everything it printed)."""
    from typer.testing import CliRunner

    from engine.cli import app

    r = CliRunner().invoke(app, list(args))
    return r.exit_code, r.output


# --- one made-up K2 school ---------------------------------------------------------------------------------------

class School:
    """A fake school (the only tenant in the test's database): two K2 classes A and B with the same five roll numbers
    (children with made-up names), one educator holding both, a coordinator-free staff list, and activity 12 on the K2
    list with two skills."""

    def __init__(self, c):
        self.c = c
        tag = uuid.uuid4().hex[:6]
        self.t = c.execute("insert into tenant (slug, name) values (%s, 'CP-10 proof school') returning id",
                           (SLUG,)).fetchone()["id"]
        from engine.core import settings

        settings.load_config(c, self.t)  # the seed's config rows, as `engine load --settings` gives every deploy
        today = c.execute("select current_date as d").fetchone()["d"]
        self.campus = c.execute("select id from campus where tenant_id = %s limit 1", (self.t,)).fetchone()["id"]
        year = c.execute("insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2099-00', %s,"
                         " %s) returning id", (self.t, today - dt.timedelta(days=300),
                                               today + dt.timedelta(days=300))).fetchone()["id"]
        self.classes = {}
        for sec in ("A", "B"):
            self.classes[sec] = str(c.execute(
                "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
                " values (%s, %s, %s, 'K2', %s) returning id", (self.t, self.campus, year, f"P{sec}{tag}"),
            ).fetchone()["id"])
        self.staff = c.execute("insert into staff (tenant_id, campus_id) values (%s, %s) returning id",
                               (self.t, self.campus)).fetchone()["id"]
        self.email = f"educator.{tag}@example.test"
        c.execute("insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, %s, %s)",
                  (self.t, self.staff, EDUCATOR_NAME, self.email))
        for klass in self.classes.values():
            c.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from,"
                      " granted_by) values (%s, %s, 'class_teacher', %s, %s, 'cp10 proof')",
                      (self.t, self.staff, klass, today - dt.timedelta(days=60)))
        self.children = {}  # (section, roll) -> child id
        for sec, klass in self.classes.items():
            for roll, first in zip(("1", "2", "3", "4", "5"), CHILD_NAMES):
                child = c.execute("insert into child (tenant_id, roll_no, section, band) values (%s, %s, %s, 'K2')"
                                  " returning id", (self.t, roll, f"P{sec}{tag}")).fetchone()["id"]
                c.execute("insert into pii.child (tenant_id, child_id, first_name) values (%s, %s, %s)",
                          (self.t, child, first))
                c.execute("insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
                          " values (%s, %s, %s, %s, %s, 'cp10 proof')",
                          (self.t, child, klass, roll, today - dt.timedelta(days=30)))
                self.children[(sec, roll)] = str(child)
        self.activity = f"ACT-K2-CP10{tag}"
        c.execute("insert into activity (tenant_id, code, band, strand, name, sheet_no) values (%s, %s, 'K2', 'Maths',"
                  " 'Placeholder activity', '12')", (self.t, self.activity))
        self.skills = ["CP10.SKILL.01", "CP10.SKILL.02"]
        for skill in self.skills:
            c.execute("insert into registry_skill (tenant_id, code, domain, strand, name) values (%s, %s, 'Maths',"
                      " 'Maths', 'Placeholder skill')", (self.t, skill))
            c.execute("insert into activity_skill (tenant_id, activity_code, skill_code) values (%s, %s, %s)",
                      (self.t, self.activity, skill))

    def switch(self, key: str, on: bool):
        self.c.execute(
            "insert into config (tenant_id, key, value, description) values (%s, %s, %s::jsonb, 'cp10 proof')"
            " on conflict (tenant_id, key) do update set value = excluded.value",
            (self.t, key, "true" if on else "false"))


@pytest.fixture
def school(conn):
    return School(conn)


# --- a note, through the engine's own path ----------------------------------------------------------------------

def fake_speech(transcript: str) -> httpx.Client:
    """An HTTP client whose every answer is the speech service's shape, with `transcript`; nothing leaves the process."""
    return httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"transcript": transcript, "language_code": "en-IN",
                                                  "request_id": "cp10-proof"})))


def record(c, s: School, section="A", transcript=TRANSCRIPT, audio=AUDIO, monkeypatch=None) -> dict:
    """A note received (its recording kept by the engine) and transcribed (by the fake service), on connection `c`."""
    from engine.w3_read import voice_intake

    note = voice_intake.receive(c, s.email, s.classes[section], "note.m4a", audio)
    old = os.environ.get("SARVAM_API_KEY")
    os.environ["SARVAM_API_KEY"] = "cp10-fake-key"  # the fake transport never sends it anywhere
    try:
        voice_intake.transcribe(c, str(note["id"]), client=fake_speech(transcript))
    finally:
        if old is None:
            os.environ.pop("SARVAM_API_KEY", None)
        else:
            os.environ["SARVAM_API_KEY"] = old
    return c.execute("select * from pii.educator_note where id = %s", (note["id"],)).fetchone()


def confirmed(s: School):
    """What she confirms for TRANSCRIPT: activity 12 at level 2, roll 1 above, roll 2 below, the rest as expected."""
    from engine.w3_read import voice_confirm

    return voice_confirm.Confirmed(s.activity, 2, {"above": ["1"], "below": ["2"]}, True)


def received_ago(c, note_id, hours: float):
    """Move a note's received time back by `hours` (the test's clock; no waiting). The database keeps that column
    from moving, so the triggers are bypassed for this one update, as the engine's own voice tests do."""
    c.execute("set session_replication_role = replica")
    c.execute("update pii.educator_note set received_at = now() - make_interval(secs => %s) where id = %s",
              (hours * 3600, note_id))
    c.execute("set session_replication_role = origin")


def recording_path(voice_dir: Path, note: dict) -> Path:
    return voice_dir / note["audio_key"]


def note_row(c, note_id) -> dict:
    return c.execute("select * from pii.educator_note where id = %s", (note_id,)).fetchone()
