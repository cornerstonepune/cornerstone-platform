"""Shared helpers for CP-14's proofs (items 1-6; item 7 is `live_k2_links.py`, on the box).

The database is a throwaway one built from every migration in this repository, never a live one (CP-20, CP-13's
pattern):
- TEST_DATABASE_URL when set (GitHub's athena job), and only if it is on this machine;
- otherwise a Postgres made here in a temp folder (initdb), with Supabase's three roles and every file in
  supabase/migrations applied in filename order. Without Postgres's server binaries the proofs fail, they never skip.
DATABASE_URL (the live database) is never read: in-process calls are handed the throwaway connection, and the one
engine command run (item 1) is given the throwaway URL as its DATABASE_URL.

Every proof makes its own fake school (a new tenant: its triggers give it grades, states, roles, a campus and the link
words), loads the school's settings rows into it with the engine's own loader (`settings.load`, what `engine load
--settings` runs on every deploy), and makes fake skills, staff on the reserved `.invalid` domain, children by Sr. No.
only, and placeholder activities. Every row is rolled back, except item 1's CLI run, which must commit for a second
process to see it and deletes what it wrote afterwards.

None of these proofs needs CP-4 (access rows); CP-4's own deferred test (an educator of the class still gets
`ready_activities`) is not part of CP-14's proofs.
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

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
LETTERS = "ABCDEFGHUVXYZ"
DECIDERS = {"coordinator", "deputy_coordinator", "class_teacher", "subject_educator", "cover_educator",
            "special_educator", "educator"}  # design §1, decided by Nimish 8 Nov: coordinators and educators


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


def _psql_file(url: str, path: Path) -> None:
    out = subprocess.run(["psql", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(path)],
                         capture_output=True, text=True)
    assert out.returncode == 0, f"{path.name}: {out.stderr.strip()[-800:]}"


def _build(url: str) -> None:
    with psycopg.connect(url, autocommit=True) as c:
        for r in SUPABASE_ROLES:
            c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                      f"then create role {r} nologin; end if; end $$")
    for f in MIGRATIONS:
        _psql_file(url, f)


@pytest.fixture(scope="session")
def server():
    """The url of the built throwaway database."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp14-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    port = "54354"
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8",
                                "--locale=C"]), check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {port}"]), check=True, capture_output=True)
    url = f"postgresql://postgres@/postgres?host={sock}&port={port}"
    try:
        _build(url)
        yield url
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def conn(server):
    """One transaction on the built database, rows as dicts (the engine's own kind), always rolled back."""
    with psycopg.connect(server, row_factory=dict_row) as c:
        try:
            yield c
        finally:
            c.rollback()


# ---- fake rows ---------------------------------------------------------------------------------------------------

def school(c, monkeypatch=None) -> dict:
    """A new fake school with skills CP14.A … CP14.Z, its settings rows (the seed's, by the engine's loader), and a K2
    class. When `monkeypatch` is given, the engine is pointed at this school (TENANT_SLUG), as a deploy names its own."""
    from engine.core import settings

    slug = f"cp14-{uuid.uuid4().hex[:8]}"
    t = c.execute("insert into tenant (slug, name) values (%s, 'Proof School') returning id", (slug,)).fetchone()["id"]
    sk = {k: f"CP14.{k}" for k in LETTERS}
    for code in sk.values():
        c.execute("insert into registry_skill (tenant_id, code, domain, strand, name) values (%s, %s, 'Proof', 'Proof',"
                  " %s)", (t, code, f"Proof skill {code[-1]}"))
    settings.load(c, t)
    if monkeypatch is not None:
        monkeypatch.setenv("TENANT_SLUG", slug)
    campus = c.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    year = c.execute("insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2026-27',"
                     " '2026-01-01', '2032-03-31') returning id", (t,)).fetchone()["id"]
    s = {"tenant": t, "slug": slug, "sk": sk, "campus": campus, "year": year}
    s["class"] = k2_class(c, s)
    return s


def k2_class(c, s) -> str:
    return str(c.execute("insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
                         " values (%s, %s, %s, 'K2', %s) returning id",
                         (s["tenant"], s["campus"], s["year"], f"T{uuid.uuid4().hex[:6]}")).fetchone()["id"])


def person(c, s, role=None, klass=None, ended=False) -> tuple[uuid.UUID, str]:
    """A placeholder member of staff (an `.invalid` email) holding `role`: on `klass` for a class role, campus-wide
    otherwise; an ended grant when `ended`. Returns (staff id, email)."""
    sid = c.execute("insert into staff (tenant_id, campus_id) values (%s, %s) returning id",
                    (s["tenant"], s["campus"])).fetchone()["id"]
    email = f"p{uuid.uuid4().hex[:8]}@school.invalid"
    c.execute("insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'A placeholder', %s)",
              (s["tenant"], sid, email))
    if role:
        scope = c.execute("select scope from role where tenant_id = %s and code = %s",
                          (s["tenant"], role)).fetchone()["scope"]
        c.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, valid_to,"
            " granted_by, override_reason) values (%s, %s, %s, %s, %s, %s, 'proof', %s)",
            (s["tenant"], sid, role, (klass or s["class"]) if scope == "class" else None,
             dt.date(2025, 1, 1), dt.date(2025, 12, 31) if ended else None,
             "proof" if role == "class_teacher" else None))
    return sid, email


def csv_of(tmp_path, *pairs, header="before_code,after_code,reason,source"):
    """A list in `engine skill-links load`'s columns; line 1 is the header, so the n-th pair is on line n + 1."""
    p = tmp_path / f"pairs-{uuid.uuid4().hex[:6]}.csv"
    p.write_text("\n".join([header, *(f"{a},{b},A proof reason,proof list" for a, b in pairs)]) + "\n",
                 encoding="utf-8")
    return p


def link(c, s, after, before, status="confirmed", strength="hard", by=None):
    """A link row as a fixture (what loading and confirming leave behind), for the page proofs."""
    c.execute(
        "insert into skill_link (tenant_id, skill_code, before_code, strength, reason, source, status, confirmed_by,"
        " confirmed_at) values (%s, %s, %s, %s, 'a proof reason', 'proof', %s, %s, %s)",
        (s["tenant"], s["sk"][after], s["sk"][before], strength, status,
         by if status == "confirmed" else None, dt.datetime.now(dt.UTC) if status == "confirmed" else None))


def status_of(c, s, before, after) -> dict:
    return c.execute("select l.*, st.confirmed as counts from skill_link l join link_status st"
                     " on st.tenant_id = l.tenant_id and st.code = l.status"
                     " where l.tenant_id = %s and l.before_code = %s and l.skill_code = %s",
                     (s["tenant"], s["sk"][before], s["sk"][after])).fetchone()


def activity(c, s, n, letters, band="K2") -> str:
    code = f"ACT-K2-CP14-{s['slug'][-4:]}-{n}"
    c.execute("insert into activity (tenant_id, code, band, strand, name) values (%s, %s, %s, 'Maths', %s)",
              (s["tenant"], code, band, f"Proof activity {n}"))
    for k in letters:
        c.execute("insert into activity_skill (tenant_id, activity_code, skill_code) values (%s, %s, %s)",
                  (s["tenant"], code, s["sk"][k]))
    return code


def child(c, s, klass, roll) -> uuid.UUID:
    kid = c.execute("insert into child (tenant_id, roll_no, section, band) values (%s, %s, %s, 'G2') returning id",
                    (s["tenant"], roll, f"P-{uuid.uuid4().hex[:6]}")).fetchone()["id"]
    c.execute("insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
              " values (%s, %s, %s, %s, '2026-01-01', 'proof')", (s["tenant"], kid, klass, roll))
    return kid


def state(c, s, kid, letter, st):
    """The child's observed state on a skill (ring B, what the graph's rebuild writes), as a fixture."""
    c.execute("insert into child_observed_state (tenant_id, child_id, skill_code, grade_code, state, named_days, adults,"
              " last_seen) values (%s, %s, %s, 'K2', %s, 1, 1, now() - interval '3 days')",
              (s["tenant"], kid, s["sk"][letter], st))


def page(c, email, klass, roll):
    from engine.w3_read import k2_picture_reads

    return k2_picture_reads.child_page(c, email, klass, roll)


class Counting:
    """The connection, counting every question put to the database (tests/test_k2_reads.py's Counting)."""

    def __init__(self, conn):
        self.conn, self.n = conn, 0

    def execute(self, *a, **k):
        self.n += 1
        return self.conn.execute(*a, **k)

    def __getattr__(self, name):
        return getattr(self.conn, name)
