"""`bin/check --db` makes, migrates and drops a scratch database at TEST_DATABASE_URL, so the address must be this
machine and nothing else. It is matched whole against one exact shape (CP-21's lesson, docs/athena/learnings.md): a
glob such as `*@localhost:*` let `?host=remote` send libpq to another server. No database is used here."""

import subprocess
from pathlib import Path

import pytest

CHECK = Path(__file__).resolve().parents[3] / "bin" / "check"


def accepted(url: str) -> bool:
    return subprocess.run([CHECK, "--local-url", url], capture_output=True, text=True).returncode == 0


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://postgres@127.0.0.1:5432/postgres",
        "postgres://postgres:postgres@localhost:54322/postgres",  # supabase's local default carries a password
        "postgresql://postgres@localhost/postgres",
    ],
)
def test_a_database_on_this_machine_is_accepted(url):
    assert accepted(url)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://x@localhost:5432/db?host=remote.example.com",  # libpq takes the host from the query
        "postgresql://x@127.0.0.1:5432/db?hostaddr=203.0.113.9",
        "postgresql://x@localhost:5432/db#fragment",
        "postgresql://x@localhost:5432/db/../other",  # a path trick
        "postgresql://x@localhost:5432/db%2Fother",
        "postgresql://x@localhost:5432/db\n",  # a trailing line break
        "postgresql://x@localhost:5432/db\n?host=remote.example.com",  # a line break before the query
        "postgresql://x@remote.example.com:5432/db\npostgresql://x@localhost:5432/db",  # only the last line is local
        "postgresql://x@remote.example.com:5432/db,postgresql://x@localhost:5432/db",  # a comma list
        "postgresql://x@localhost.example.com:5432/db",  # a host that begins with localhost
        "postgresql://x@evil.example.com@localhost:5432/db",  # a second @
        "postgresql://localhost@remote.example.com:5432/db",  # localhost as the user
        "postgresql://x@localhost:5432/",  # no database name
        "postgresql://x@localhost:5432",
        "postgresql://@localhost:5432/db",  # no user
        "postgresql://x@localhost:port/db",
        "",
    ],
)
def test_anything_else_is_refused(url):
    assert not accepted(url)
