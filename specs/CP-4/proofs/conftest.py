"""Shared helpers for CP-4's database proofs (items 1, 3, 4, 6).

The database is a throwaway one built from this repository's migrations, never a live one:
- TEST_DATABASE_URL when set (GitHub's athena job: CP-20 builds it with `bin/testdb fresh`), on this machine only;
- otherwise a Postgres made here in a temp folder (initdb), with Supabase's three roles and every migration in
  supabase/migrations applied in filename order, as `bin/testdb fresh` does. Without Postgres's server binaries the
  proofs fail, they never skip.
DATABASE_URL (the live database) is never read.
"""

import glob
import os
import shutil
import subprocess
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
OPEN_TO = ("app_web", "public", "authenticated", "anon")


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


def psql_file(url: str, path: Path) -> None:
    out = subprocess.run(["psql", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(path)],
                         capture_output=True, text=True)
    assert out.returncode == 0, f"{path.name}: {out.stderr.strip()[-800:]}"


def build(url: str, files: list[Path]) -> None:
    """Supabase's roles, then the given migrations in order (bin/testdb fresh, without the seed)."""
    with psycopg.connect(url, autocommit=True) as c:
        for r in SUPABASE_ROLES:
            c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                      f"then create role {r} nologin; end if; end $$")
    for f in files:
        psql_file(url, f)


@pytest.fixture(scope="session")
def server():
    """(url of the built database, admin url on the same server)."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp4-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    port = "54344"
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"]),
                   check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {port}"]), check=True, capture_output=True)
    url = f"postgresql://postgres@/postgres?host={sock}&port={port}"
    try:
        build(url, MIGRATIONS)
        yield url
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


@contextmanager
def scratch_database(url: str):
    """A new, empty database on the same throwaway server; dropped afterwards."""
    name = f"cp4_scratch_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(url, autocommit=True) as c:
        c.execute(f"create database {name}")
    info = psycopg.conninfo.conninfo_to_dict(url)
    info["dbname"] = name
    try:
        yield psycopg.conninfo.make_conninfo(**info)
    finally:
        with psycopg.connect(url, autocommit=True) as c:
            c.execute(f"drop database if exists {name} with (force)")


@pytest.fixture
def conn(server):
    """One transaction on the built database, always rolled back: nothing a proof does is kept."""
    with psycopg.connect(server) as c:
        try:
            yield c
        finally:
            c.rollback()


def base_tables(c) -> set[str]:
    return {r[0] for r in c.execute(
        "select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname in ('public', 'pii') and c.relkind in ('r', 'p')")}


def listed(c) -> set[str]:
    return {r[0] for r in c.execute("select schema_name || '.' || table_name from public.access_table")}


def coverage_gaps(c) -> tuple[set[str], set[str]]:
    """(tables in the database with no access_table row, access_table rows naming no table)."""
    tables, rows = base_tables(c), listed(c)
    return tables - rows, rows - tables


def opening_policies(c, where: str = "true", args=()) -> list[tuple]:
    """Policies that would let the website login (or anyone) through: they apply to app_web, public, authenticated or
    anon, and their using or check clause is true or missing where the command needs one."""
    return c.execute(
        "select schemaname, tablename, policyname, cmd from pg_policies p "
        f"where roles && %s::name[] and ({where}) and ("
        "  (cmd <> 'INSERT' and (qual is null or btrim(qual, ' ()') = 'true'))"
        "  or (cmd not in ('SELECT', 'DELETE') and btrim(coalesce(with_check, qual, 'true'), ' ()') = 'true'))",
        (list(OPEN_TO), *args)).fetchall()
