"""CP-54 B1: Cambridge's words go into the private database only where they are the stored fingerprint's.

No PDF and no network: the reader is replaced by made-up words, and the fingerprints of three statements are set to
those words' (the real fingerprints are of Cambridge's words, which this public repository does not hold). Each test
rolls back.
"""

import os

import pytest
from typer.testing import CliRunner

from engine.core import cambridge, cambridge_words, db, frameworks
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

FRAMEWORK = "CAM-PRI-ENG-0058"
GOOD = {
    "code": "x",
    "text": "Made up stem about a made up thing:",
    "items": ["first made up item", "second one"],
}
SAME_AS_STORED = "Words this test made up"


@pytest.fixture
def three(monkeypatch):
    """Three Cambridge statements: one whose reading is the fingerprint's, one whose is not, one already filled."""
    with db.connect() as conn:
        t = tenant(conn)
        frameworks.load(conn, t)
        codes = [
            r["code"]
            for r in conn.execute(
                "select code from framework_statement where tenant_id = %s and framework_code = %s"
                " and kind = 'learning_objective' order by code limit 3",
                (t, FRAMEWORK),
            )
        ]
        a, b, c = codes
        good = {**GOOD, "code": a}
        held = {"code": c, "text": SAME_AS_STORED, "items": []}
        for code, sha in ((a, cambridge.fingerprint(good)), (b, "0" * 64), (c, cambridge.fingerprint(held))):
            conn.execute(
                "update framework_statement set text_sha256 = %s where tenant_id = %s and framework_code = %s and code = %s",
                (sha, t, FRAMEWORK, code),
            )
        conn.execute(
            "update framework_statement set text = null where tenant_id = %s and framework_code = %s and code = any(%s)",
            (t, FRAMEWORK, [a, b]),
        )
        conn.execute(
            "update framework_statement set text = %s where tenant_id = %s and framework_code = %s and code = %s",
            (SAME_AS_STORED, t, FRAMEWORK, c),
        )
        reading = {a: good, b: {"code": b, "text": "Some other words", "items": []}, c: held}
        monkeypatch.setattr(cambridge_words, "_readings", lambda source, folder: reading)
        monkeypatch.setattr(
            cambridge_words, "_sources", lambda: [s for s in _all() if s["framework"] == FRAMEWORK]
        )
        yield conn, t, a, b, c
        conn.rollback()


def _all():
    import json

    return [
        s for s in json.loads(cambridge_words.SOURCES.read_text()) if s.get("reader") == "cambridge_primary"
    ]


def _row(conn, t, code):
    return conn.execute(
        "select text, items from framework_statement where tenant_id = %s and framework_code = %s and code = %s",
        (t, FRAMEWORK, code),
    ).fetchone()


def test_words_are_filled_only_where_they_are_the_fingerprints(three):
    conn, t, a, b, c = three
    (res,) = cambridge_words.fill(conn, t, apply=True)
    assert _row(conn, t, a) == {"text": GOOD["text"], "items": GOOD["items"]}
    assert _row(conn, t, b)["text"] is None
    assert b in res.mismatched
    assert a not in res.mismatched and c not in res.mismatched
    assert (res.filled, res.already) == (1, 1)


def test_a_dry_run_changes_nothing(three):
    conn, t, a, *_ = three
    (res,) = cambridge_words.fill(conn, t, apply=False)
    assert res.filled == 1
    assert _row(conn, t, a)["text"] is None


def test_a_second_run_changes_nothing(three):
    conn, t, a, *_ = three
    cambridge_words.fill(conn, t, apply=True)
    (res,) = cambridge_words.fill(conn, t, apply=True)
    assert (res.filled, res.already) == (0, 2)  # the made-up readings cover only three statements


def test_loading_the_frameworks_again_keeps_the_words():
    """The files carry text NULL and the fingerprint; a load must not blank words the database already holds."""
    with db.connect() as conn:
        t = tenant(conn)
        frameworks.load(conn, t)
        conn.execute(
            "update framework_statement set text = 'held', items = '[\"an item\"]' where tenant_id = %s"
            " and framework_code = %s and code = '1Ra.02'",
            (t, FRAMEWORK),
        )
        frameworks.load(conn, t)
        assert _row(conn, t, "1Ra.02") == {"text": "held", "items": ["an item"]}
        conn.execute(
            "update framework_statement set text_sha256 = %s where tenant_id = %s and framework_code = %s and code = '1Ra.02'",
            ("0" * 64, t, FRAMEWORK),
        )
        frameworks.load(conn, t)  # the words of a changed fingerprint are not the ones held: the file wins
        assert _row(conn, t, "1Ra.02")["text"] is None
        conn.rollback()


def test_the_command_prints_counts_and_codes_never_a_word(three, monkeypatch):
    from engine.cli import app

    conn, t, a, b, c = three
    conn.commit = lambda: None  # the fixture rolls back
    monkeypatch.setattr(db, "connect", lambda url=None: _Same(conn))
    out = CliRunner().invoke(app, ["frameworks", "cambridge-words", "--apply"])
    assert out.exit_code == 1  # one statement does not match
    assert b in out.output and "1 not matching" in out.output
    for words in (GOOD["text"], *GOOD["items"], SAME_AS_STORED, "Some other words"):
        assert words not in out.output


class _Same:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self.conn

    def __exit__(self, *a):
        return False
