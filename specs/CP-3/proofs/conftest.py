"""CP-3 database proofs: the throwaway Postgres and a fake school built inside one rolled-back transaction.

The database is TEST_DATABASE_URL when set (GitHub's proofs job builds it from this repository's migrations, CP-20), and
must be on this machine. Otherwise a Postgres is made in a temp folder with initdb and every migration in
supabase/migrations is applied in filename order, after the three Supabase roles (as bin/testdb fresh does). With
neither, the proofs fail; they never skip. DATABASE_URL (the live database) is never read here.

Everything a test writes is fake (example.test emails, "Fake" names) and is rolled back at the end of the test.
Queries "as the website" run as a throwaway login that is a member of app_web, with the identity set exactly as the
website sets it: set_config('app.staff_id', <sign-in list entry id>, true) inside the transaction.
"""

import glob
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

import psycopg
import pytest

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = ROOT / "supabase" / "migrations"
PORT = "54333"

# the tables of the four kinds, as the scope names them (children, enrolment, staff, notes)
CHILDREN = ["public.child", "pii.child"]
ENROLMENT = ["public.enrolment"]
STAFF = ["public.staff", "public.staff_role_grant", "pii.staff"]
NOTES = ["pii.educator_note", "pii.note_claim"]
FOUR_KINDS = CHILDREN + ENROLMENT + STAFF + NOTES
PII = ["pii.child", "pii.staff", "pii.educator_note", "pii.note_claim"]


def _pg_bin() -> Path:
    for d in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True):
        if (Path(d) / "initdb").exists():
            return Path(d)
    found = shutil.which("initdb")
    if found:
        return Path(found).parent
    pytest.fail("no TEST_DATABASE_URL and no Postgres server binaries (initdb): CP-3's database proofs need one")


def _as_pg_user(cmd: list[str]) -> list[str]:
    return ["runuser", "-u", "postgres", "--", *cmd] if os.geteuid() == 0 else cmd


def _local_database():
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp3-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust",
                                "-E", "UTF8", "--locale=C"]),
                   check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {PORT}"]), check=True, capture_output=True)
    url = f"postgresql://postgres@/postgres?host={sock}&port={PORT}"

    def stop():
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)

    try:
        with psycopg.connect(url, autocommit=True) as c:
            for r in ("anon", "authenticated", "service_role"):
                c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                          f"then create role {r} nologin; end if; end $$")
        for f in sorted(MIGRATIONS.glob("*.sql")):
            out = subprocess.run(["psql", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(f)],
                                 capture_output=True, text=True)
            if out.returncode != 0:
                pytest.fail(f"migration {f.name} did not apply on a fresh Postgres: {out.stderr.strip()[-400:]}")
    except BaseException:
        stop()
        raise
    return url, stop


@pytest.fixture(scope="session")
def database_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = urlparse(url).hostname or ""
        assert host in ("127.0.0.1", "localhost") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a Postgres on this machine; refusing any other database"
        yield url
        return
    url, stop = _local_database()
    try:
        yield url
    finally:
        stop()


@pytest.fixture
def conn(database_url):
    with psycopg.connect(database_url) as c:
        assert c.execute("select rolsuper from pg_roles where rolname = current_user").fetchone()[0], \
            "the proofs build their fixtures as the database's superuser"
        try:
            yield c
        finally:
            c.rollback()


def one(c, sql, params=()):
    return c.execute(sql, params).fetchone()[0]


class School:
    """A fake school in its own tenant: classes X and Y, children and notes in each, and one person per case."""

    def __init__(self, c):
        self.c = c
        tag = uuid.uuid4().hex[:8]
        self.t = one(c, "insert into tenant (slug, name) values (%s, %s) returning id",
                     (f"cp3-proof-{tag}", f"CP-3 proof school {tag}"))
        self.today = one(c, "select internal.school_day(%s, now())", (self.t,))
        campus = one(c, "select id from campus where tenant_id = %s", (self.t,))
        year = one(c, "insert into academic_year (tenant_id, label, starts_on, ends_on) "
                      "values (%s, '2099-00', %s::date - 200, %s::date + 200) returning id",
                   (self.t, self.today, self.today))
        grade = one(c, "select code from grade where tenant_id = %s order by ord limit 1", (self.t,))
        cls = "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section) " \
              "values (%s, %s, %s, %s, %s) returning id"
        self.x = one(c, cls, (self.t, campus, year, grade, "PX"))
        self.y = one(c, cls, (self.t, campus, year, grade, "PY"))
        self.kids = {self.x: [], self.y: []}
        for n, k in enumerate([self.x, self.x, self.y], start=1):
            child = one(c, "insert into child (tenant_id, roll_no, band, section) values (%s, %s, 'G1', %s) "
                           "returning id", (self.t, f"P{n}", "PX" if k == self.x else "PY"))
            c.execute("insert into pii.child (tenant_id, child_id, first_name) values (%s, %s, 'Fake')",
                      (self.t, child))
            c.execute("insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by) "
                      "values (%s, %s, %s, %s, %s::date - 30, 'cp3 proof')", (self.t, child, k, f"P{n}", self.today))
            self.kids[k].append(child)

        self.staff, self.entry = {}, {}
        for who in ("coord", "edx", "edy", "late", "ended", "nogrant", "gone"):
            sid = one(c, "insert into staff (tenant_id, campus_id, active) values (%s, %s, %s) returning id",
                      (self.t, campus, who != "gone"))
            c.execute("insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Fake Person', %s)",
                      (self.t, sid, self.email(who, tag)))
            self.staff[who] = sid
        self.grant("coord", "coordinator")
        self.grant("gone", "coordinator")
        self.grant("edx", "assistant", self.x)
        self.grant("edy", "assistant", self.y)
        self.grant("late", "assistant", self.x, start=1)
        self.grant("ended", "assistant", self.x, start=-30, end=0)

        # the sign-in list (config app.staff): its trigger gives each entry the id the website sets
        names = list(self.staff) + ["unmatched"]
        c.execute("insert into config (tenant_id, key, value) values (%s, 'app.staff', %s)",
                  (self.t, psycopg.types.json.Jsonb(
                      [{"email": self.email(w, tag), "name": "Fake Person", "role": "educator"} for w in names])))
        for e in one(c, "select value from config where tenant_id = %s and key = 'app.staff'", (self.t,)):
            self.entry[e["email"].split(".")[0]] = e["id"]

        decision = one(c, "select code from claim_decision where tenant_id = %s and code <> 'changed' "
                          "order by code limit 1", (self.t,))
        self.note = {}
        for k, author in ((self.x, "edx"), (self.y, "edy")):
            nid = one(c, "insert into pii.educator_note (tenant_id, staff_id, class_id, audio_key) "
                         "values (%s, %s, %s, %s) returning id", (self.t, self.staff[author], k, f"proof/{author}.m4a"))
            c.execute("insert into pii.note_claim (tenant_id, note_id, section, read_as, words, span_start, span_end,"
                      " decision, decided_by) values (%s, %s, 'Fake', 'fake', 'fake', 0, 1, %s, %s)",
                      (self.t, nid, decision, self.staff[author]))
            self.note[k] = nid

        self.login = f"cp3_web_{tag}"
        c.execute(f"create role {self.login} login in role app_web")
        c.execute(f"grant select on {', '.join(PII)} to {self.login}")  # test only: the real app_web has none

    @staticmethod
    def email(who, tag):
        return f"{who}.{tag}@example.test"

    def grant(self, who, role, cls=None, start=-30, end=None):
        self.c.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, valid_to,"
            " granted_by) values (%s, %s, %s, %s, %s::date + %s::int, %s::date + %s::int, 'cp3 proof')",
            (self.t, self.staff[who], role, cls, self.today, start, self.today, end))

    def seen(self, who, sql, params=()):
        """count(*) of `sql` as the website login, with `who`'s sign-in entry id (None: no identity; a str that is
        not a name of this school is set as it is)."""
        c = self.c
        c.execute("savepoint as_web")
        try:
            c.execute(f"set local role {self.login}")
            if who is not None:
                c.execute("select set_config('app.staff_id', %s, true)", (str(self.entry.get(who, who)),))
            return one(c, f"select count(*) from ({sql}) q", params)
        finally:
            c.execute("rollback to savepoint as_web")

    def all_rows(self, table):
        """Every row of `table` in this school, counted as the superuser (no rule applies)."""
        return one(self.c, f"select count(*) from {table} where tenant_id = %s", (self.t,))


@pytest.fixture
def school(conn):
    return School(conn)
