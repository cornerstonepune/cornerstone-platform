"""Shared helpers for CP-18's proofs (items 2-7).

The database is a throwaway one, never a live one (CP-20's pattern, as CP-13's proofs use it):
- TEST_DATABASE_URL when set (GitHub's athena job builds it with `bin/testdb fresh`), on this machine only;
- otherwise a Postgres made here in a temp folder (initdb), with Supabase's three roles and every migration in
  supabase/migrations applied in filename order. Without Postgres's server binaries the proofs fail, they never skip.
DATABASE_URL from `.env` (the live database) is overwritten with the throwaway URL before any test runs, and any
SMTP_* variable is removed, so nothing can reach the live database or a real mail server: no proof sends a message.

The school is the one the engine's commands name (TENANT_SLUG, `cornerstone-pune` by default); a migrations-only
database gets it made once. Every class, list, member of staff and contact is fake and made inside the test. Most proofs
run in one transaction that is rolled back. `deliver_due` commits after each message (design), so the proofs that run it
use `committed`, which deletes every row stamped since the test began and puts back the settings it changed.

CP-17 and CP-6 are not built yet. The two helpers below name their interfaces as CP-18's design assumes them; a proof
that uses one says so in its check name. If CP-17 or CP-6 ship other names, the proof is wrong: block, do not edit it.
"""

import datetime as dt
import glob
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import psycopg
import pytest
from engine.core import (
    db,  # loads .env; the two lines below undo what it may have loaded
)

for _k in [k for k in os.environ if k.startswith("SMTP_")]:
    del os.environ[_k]
os.environ.pop("DATABASE_URL", None)

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
MON = dt.date(2031, 11, 3)  # a Monday in a year no real row uses
END = MON + dt.timedelta(days=13)
LONG_BEFORE = dt.date(2031, 9, 1)


# ---- the throwaway database (CP-13's conftest) -------------------------------------------------------------------

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


def _ensure_school(url: str) -> None:
    """The school the engine's commands name: present on a `bin/testdb fresh` database, made on a bare one."""
    with psycopg.connect(url, autocommit=True) as c:
        c.execute("insert into tenant (slug, name) values (%s, 'Proof School') on conflict (slug) do nothing",
                  (db.tenant_slug(),))


@pytest.fixture(scope="session")
def server():
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        os.environ["DATABASE_URL"] = url
        _ensure_school(url)
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp18-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    port = "54318"
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8",
                                "--locale=C"]), check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {port}"]), check=True, capture_output=True)
    url = f"postgresql://postgres@/postgres?host={sock}&port={port}"
    try:
        _build(url)
        _ensure_school(url)
        os.environ["DATABASE_URL"] = url
        yield url
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(autouse=True)
def no_mail_account(monkeypatch):
    """Design §4: no proof runs with a sending account in its environment."""
    for k in [k for k in os.environ if k.startswith("SMTP_")]:
        monkeypatch.delenv(k)
    yield


@pytest.fixture
def conn(server):
    """One transaction on the throwaway database, always rolled back."""
    with db.connect(server) as c:
        try:
            yield c
        finally:
            c.rollback()


def _stamped_tables(c) -> list[tuple[str, str, str]]:
    return c.execute(
        "select col.table_schema, col.table_name, col.column_name from information_schema.columns col"
        " join information_schema.tables x on x.table_schema = col.table_schema and x.table_name = col.table_name"
        " where col.column_name in ('created_at', 'at') and col.table_schema in ('public', 'pii')"
        " and x.table_type = 'BASE TABLE' order by 1, 2, 3").fetchall()


@pytest.fixture
def committed(server):
    """For proofs whose code commits (deliver_due, `engine reminders --deliver`): a connection, then every row stamped
    since the test began is deleted (append-only triggers off for that transaction) and the settings put back."""
    with psycopg.connect(server) as c:
        since = c.execute("select clock_timestamp()").fetchone()[0]
        t = c.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()[0]
        saved = c.execute("select key, value from config where tenant_id = %s", (t,)).fetchall()
    with db.connect(server) as c:
        try:
            yield c
        finally:
            c.rollback()
    with psycopg.connect(server) as c:
        c.execute("set local session_replication_role = replica")
        for _ in range(2):  # a row may hang off another stamped row; replica mode skips the keys, two passes for safety
            for s, tbl, col in _stamped_tables(c):
                c.execute(f'delete from {s}."{tbl}" where "{col}" >= %s', (since,))
        c.execute("delete from materials_line_source where line_id not in (select id from materials_line)")
        c.execute("delete from materials_consolidated_source where consolidated_id not in"
                  " (select id from materials_consolidated)")
        c.execute("delete from materials_consolidated_line where consolidated_id not in"
                  " (select id from materials_consolidated)")
        for key, value in saved:
            c.execute("update config set value = %s where tenant_id = %s and key = %s",
                      (json.dumps(value), t, key))
        c.commit()


# ---- fake rows ---------------------------------------------------------------------------------------------------

def tenant(c):
    return c.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]


def set_config(c, t, key, value):
    c.execute("insert into config (tenant_id, key, value, description) values (%s, %s, %s, 'cp18 proof')"
              " on conflict (tenant_id, key) do update set value = excluded.value", (t, key, json.dumps(value)))


def fake_phone() -> str:
    # "+91 0…": no Indian mobile number starts with 0 after the country code
    return "+91 0" + "".join(str(uuid.uuid4().int)[:9])


def staff(c, s, contact=True, phone=True):
    """A fake member of staff; with `contact`, her pii row (fake name, example.test email, fake phone)."""
    sid = c.execute("insert into staff (tenant_id, campus_id) values (%s, %s) returning id",
                    (s["tenant"], s["campus"])).fetchone()["id"]
    tag = uuid.uuid4().hex[:8]
    person = {"id": sid, "name": f"Fakename Cpeighteen{tag}", "email": f"cp18.{tag}@example.test",
              "phone": fake_phone() if phone else None}
    if contact:
        c.execute("insert into pii.staff (tenant_id, staff_id, name, email, phone) values (%s, %s, %s, %s, %s)",
                  (s["tenant"], sid, person["name"], person["email"], person["phone"]))
    s.setdefault("people", []).append(person)
    return person


def school(c, start=MON, fortnight=True):
    """The school, the school year holding `start` (an existing row is used as it is, never changed) and, with
    `fortnight`, a teaching fortnight starting `start`."""
    t = tenant(c)
    campus = c.execute("select id from campus where tenant_id = %s order by created_at limit 1", (t,)).fetchone()["id"]
    y = start.year if start.month >= 4 else start.year - 1
    label = f"{y}-{(y + 1) % 100:02d}"
    c.execute("insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, %s, %s, %s)"
              " on conflict (tenant_id, label) do nothing", (t, label, dt.date(y, 4, 1), dt.date(y + 1, 3, 31)))
    year = c.execute("select id from academic_year where tenant_id = %s and label = %s", (t, label)).fetchone()["id"]
    if fortnight:
        fortnight = c.execute(
            "insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)"
            " values (%s, %s, %s, 'teaching', %s, %s) returning id",
            (t, year, 100000 + uuid.uuid4().int % 900000, start, start + dt.timedelta(days=13))).fetchone()["id"]
    return {"tenant": t, "campus": campus, "year": year, "fortnight": fortnight, "start": start}


def klass(c, s, educators=1):
    """A K2 class and the educators who hold it (class teacher, then cover educators), each with a fake contact."""
    cid = c.execute(
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
        " values (%s, %s, %s, 'K2', %s) returning id",
        (s["tenant"], s["campus"], s["year"], f"T{uuid.uuid4().hex[:6]}")).fetchone()["id"]
    held = []
    for n in range(educators):
        e = staff(c, s)
        c.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from,"
                  " granted_by) values (%s, %s, %s, %s, '2026-01-01', 'cp18 proof')",
                  (s["tenant"], e["id"], "class_teacher" if n == 0 else "cover_educator", cid))
        held.append(e)
    name = c.execute("select grade_code || ' ' || section as n from school_class where id = %s", (cid,)).fetchone()["n"]
    return {"id": cid, "name": name, "educators": held}


def class_list(c, s, k, qty=2, first=None):
    """The class's list for the fortnight with one catalogue line, needed on `first` (the fortnight's first day)."""
    from engine.w2_print import materials_list as ml

    first = first or s["start"]
    code = f"MAT-T{uuid.uuid4().hex[:6]}"
    c.execute("insert into material_item (tenant_id, code, name, unit) values (%s, %s, %s, 'packet')",
              (s["tenant"], code, f"Clay {code}"))
    lid = ml.build(c, k["id"], "fortnight", s["start"], s["start"] + dt.timedelta(days=13))
    ml.add(c, lid, code, qty, first, None, k["educators"][0]["id"])
    return lid


def line_ids(c, lid):
    return [r["id"] for r in c.execute("select id from materials_line where list_id = %s and removed_at is null",
                                       (lid,))]


# ---- CP-17 and CP-6, as CP-18's design assumes them --------------------------------------------------------------

def approve(c, list_id, who):
    """CP-17 (not built): the educator approves her class's list as it reads now. Assumed interface:
    `engine.w2_print.materials_approval.approve(conn, list_id, who)`."""
    from engine.w2_print import materials_approval

    materials_approval.approve(c, list_id, who)


def fortnight_step(c, fortnight_id, state, who):
    """CP-6 (not built): move a fortnight to its next state. Assumed interface:
    `engine.w2_print.fortnight_cycle.step(conn, fortnight_id, state, who)`; states planning, frozen, aligned,
    approved, list_sent."""
    from engine.w2_print import fortnight_cycle

    fortnight_cycle.step(c, fortnight_id, state, who)


def fortnight_state(c, fortnight_id) -> dict:
    """CP-6 (not built): the fortnight's state now, with who moved it there and when. Assumed interface:
    `engine.w2_print.fortnight_cycle.state(conn, fortnight_id)` -> {"state", "who", "at"}."""
    from engine.w2_print import fortnight_cycle

    return fortnight_cycle.state(c, fortnight_id)


# ---- the fake sender ---------------------------------------------------------------------------------------------

class FakeSender:
    """Stands in for `engine.adapters.notify.send`: records (address, subject, text); sends nothing."""

    def __init__(self, status="sent", fail_for=(), delay=0.0):
        self.calls, self.status, self.fail_for, self.delay = [], status, set(fail_for), delay

    def __call__(self, address, subject, text):
        import time

        self.calls.append((address, subject, text))
        if self.delay:
            time.sleep(self.delay)
        if address in self.fail_for:
            return ("failed", None)
        return (self.status, f"fake-{len(self.calls)}" if self.status == "sent" else None)

    def per_address(self) -> dict:
        out: dict = {}
        for a, _, _ in self.calls:
            out[a] = out.get(a, 0) + 1
        return out


@pytest.fixture
def fake_sender(monkeypatch):
    from engine.adapters import (
        notify,  # CP-18's sender (ring C): its absence is the failure until it is built
    )

    sender = FakeSender()
    monkeypatch.setattr(notify, "send", sender)
    return sender


def deliveries(c, list_ids) -> set:
    """{(reminder_id, audience, to_staff, status)} of the given lists' reminders."""
    return {(r["reminder_id"], r["audience"], r["to_staff"], r["status"]) for r in c.execute(
        "select d.reminder_id, r.audience, d.to_staff, d.status from reminder_delivery d"
        " join reminder r on r.id = d.reminder_id where r.list_id = any(%s)", (list(list_ids),))}


def reminders(c, lid, audience=None):
    return [r["id"] for r in c.execute(
        "select id from reminder where list_id = %s and state = 'pending' and (%s::text is null or audience = %s)",
        (lid, audience, audience))]


def due_today(c):
    """For the command, which reads the school's own today: a list needed three days from now (both reminders due at
    once), its class teacher and a named materials-team member, each with a fake contact. Committed."""
    from engine.w2_print import materials_remind as rem

    today = rem.school_today(c)
    s = school(c, start=today + dt.timedelta(days=3), fortnight=False)
    set_config(c, s["tenant"], "educator.timetable_enabled", True)
    team = staff(c, s)
    set_config(c, s["tenant"], "materials.team_staff", str(team["id"]))
    k = klass(c, s)
    lid = class_list(c, s, k)
    rem.sync(c, lid, today=today)
    c.commit()
    return s, k, team, lid


def engine_cmd(server, *args, tmp: Path) -> tuple[subprocess.CompletedProcess, Path]:
    """`engine …` against the throwaway database, with no SMTP_* variable, `.env` not read, and every Python-level
    network connection refused and written to a file (libpq, the database driver, does not use Python's sockets)."""
    guard = tmp / "guard"
    guard.mkdir(exist_ok=True)
    tried = tmp / "network_tried"
    (guard / "sitecustomize.py").write_text(
        "import socket, dotenv\n"
        "dotenv.load_dotenv = lambda *a, **k: False\n"
        f"_f = {str(tried)!r}\n"
        "def _no(*a, **k):\n"
        "    open(_f, 'a').write(repr(a[1:2] or a[:1]) + '\\n')\n"
        "    raise OSError('cp18 proof: no network')\n"
        "socket.socket.connect = _no\n"
        "socket.create_connection = _no\n")
    env = {k: v for k, v in os.environ.items() if not k.startswith("SMTP_")}
    env.update(DATABASE_URL=server, PYTHONPATH=str(guard), TENANT_SLUG=db.tenant_slug())
    engine = ROOT / "packages" / "engine" / ".venv" / "bin" / "engine"
    out = subprocess.run([str(engine), *args], capture_output=True, text=True, env=env, timeout=90)
    return out, tried
