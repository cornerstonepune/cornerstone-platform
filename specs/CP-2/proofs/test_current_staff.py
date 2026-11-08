"""CP-2 item 2: public.current_staff() returns the signed-in person's id from the request, and nothing when no
identity is set, when it is empty, or when it is not a valid id.

Runs the repository's own migration that defines the function on a throwaway Postgres made in a temp folder (no
network, fake ids only), then calls the function the way the website will: inside a transaction, after
set_config('app.staff_id', <value>, true). Needs Postgres's server binaries (initdb, pg_ctl), which GitHub's
ubuntu-24.04 runner and this sandbox both carry; without them it fails, it never skips.
"""

import glob
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import pytest

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = ROOT / "supabase" / "migrations"
DEFINES = re.compile(r"function\s+(public\.)?current_staff\s*\(", re.I)
ROLES = ["anon", "authenticated", "service_role", "app_web", "app_engine"]


def _pg_bin() -> Path:
    for d in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True):
        if (Path(d) / "initdb").exists():
            return Path(d)
    found = shutil.which("initdb")
    if found:
        return Path(found).parent
    pytest.fail("no Postgres server binaries (initdb) on this machine: item 2's proof needs them")


def _as_pg_user(cmd: list[str]) -> list[str]:
    # initdb refuses to run as root; GitHub's runner is not root, this sandbox is.
    return ["runuser", "-u", "postgres", "--", *cmd] if os.geteuid() == 0 else cmd


def _migration_files() -> list[Path]:
    files = [f for f in sorted(MIGRATIONS.glob("*.sql")) if DEFINES.search(f.read_text())]
    assert files, "no migration in supabase/migrations defines public.current_staff()"
    return files


@pytest.fixture(scope="module")
def db():
    files = _migration_files()
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp2-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust"]),
                   check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p 54329"]), check=True, capture_output=True)

    def psql(sql: str, *, file: Path | None = None) -> str:
        cmd = ["psql", "-h", str(sock), "-p", "54329", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA",
               "-v", "ON_ERROR_STOP=1"]
        cmd += ["-f", str(file)] if file else ["-c", sql]
        out = subprocess.run(cmd, capture_output=True, text=True)
        assert out.returncode == 0, out.stderr
        return out.stdout.strip()

    try:
        for r in ROLES:
            psql(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                 f"then create role {r} nologin; end if; end $$")
        for f in files:
            psql("", file=f)
        yield psql
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


def _seen(psql, value: str | None, role: str | None = None) -> str:
    """What current_staff() returns in one transaction where the identity was set (or not) as the website sets it."""
    lines = ["begin;"]
    if role:
        lines.append(f"set local role {role};")
    if value is not None:
        lines.append("select set_config('app.staff_id', " + "'" + value.replace("'", "''") + "'" + ", true);")
    lines.append("select coalesce(public.current_staff()::text, '<null>');")
    lines.append("rollback;")
    script = Path(tempfile.mkstemp(suffix=".sql")[1])
    script.write_text("\n".join(lines) + "\n")
    os.chmod(script, 0o644)
    try:
        return psql("", file=script).splitlines()[-1]
    finally:
        script.unlink()


def test_the_function_is_in_public(db):
    assert db("select to_regprocedure('public.current_staff()') is not null") == "t"


def test_returns_the_id_that_was_set(db):
    me = str(uuid.uuid4())
    assert _seen(db, me) == me


def test_returns_the_id_to_the_website_login(db):
    me = str(uuid.uuid4())
    assert _seen(db, me, role="app_web") == me


def test_nothing_when_no_identity_is_set(db):
    assert _seen(db, None) == "<null>"


@pytest.mark.parametrize("value", ["", "   "])
def test_nothing_when_identity_is_empty(db, value):
    assert _seen(db, value) == "<null>"


@pytest.mark.parametrize("value", ["not-a-uuid", "undefined", "123", "1; drop table x", str(uuid.uuid4())[:-1]])
def test_nothing_when_identity_is_not_a_valid_id(db, value):
    assert _seen(db, value) == "<null>"
