"""CP-24's database proofs run on the engine's own test harness: packages/engine/tests/conftest.py, loaded here as it
is. It points DATABASE_URL at the local copy named by TEST_DATABASE_URL (refusing any other address) and fails a module
that leaves a committed row. Every proof here works inside one transaction that is rolled back.
"""

import runpy
import sys
from pathlib import Path

import pytest

ENGINE = Path(__file__).resolve().parents[4] / "packages" / "engine"
sys.path.insert(0, str(ENGINE))

globals().update(
    {k: v for k, v in runpy.run_path(str(ENGINE / "tests" / "conftest.py")).items() if not k.startswith("__")}
)

from engine.core import db  # noqa: E402  (after the path and the harness above)


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


@pytest.fixture
def tenant(conn):
    return db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
