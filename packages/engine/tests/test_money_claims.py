"""Money MM-2a (specs/CP-78): a member of staff files a claim and tracks it."""

import datetime as dt
import os

import psycopg
import pytest

from engine.core import db, settings
from engine.core import money_claims as mc
from engine.core.staff_write import grant
from tests import rows

DAY = dt.date(2026, 11, 10)


@pytest.fixture
def conn(tmp_path, monkeypatch):
    if not os.getenv("DATABASE_URL"):
        pytest.skip("needs DATABASE_URL (see .env.example)")
    monkeypatch.setattr(mc, "ROOT", tmp_path)
    with db.connect() as c:
        yield c
        c.rollback()


def _claim(conn, who, **over):
    args = (
        dict(
            amount="450.50",
            spent_on=DAY,
            vendor="Sai Stores",
            category="Stationery & art supplies",
            campus="Gurukul",
        )
        | over
    )
    return mc.submit_claim(conn, who, **args)


def test_a_claim_is_kept_with_the_rules_version_it_was_filed_under(conn):
    who, _ = rows.a_member_of_staff(conn)
    [mine] = [mc.my_claims(conn, who)[0] for _ in [_claim(conn, who, note="chart paper")]]
    assert (str(mine["amount"]), mine["vendor"], mine["category"], mine["campus"], mine["status"]) == (
        "450.50",
        "Sai Stores",
        "Stationery & art supplies",
        "Gurukul",
        "submitted",
    )
    assert (
        conn.execute("select rule_version from expense where id = %s", (mine["id"],)).fetchone()[
            "rule_version"
        ]
        == 1
    )


def test_every_bad_claim_is_refused_in_words_and_nothing_is_kept(conn):
    who, _ = rows.a_member_of_staff(conn)
    tomorrow = settings.school_today(conn) + dt.timedelta(days=1)
    for over, said in (
        ({"amount": "0"}, "more than nothing"),
        ({"amount": "abc"}, "more than nothing"),
        ({"spent_on": tomorrow}, "in the future"),
        ({"vendor": "  "}, "who was paid"),
        ({"category": "Gold plating"}, "not a category"),
        ({"campus": "Atlantis"}, "do not act for"),
        ({"bill": b"x", "bill_ext": ".exe"}, "photo or a PDF"),
        ({"bill": b"x" * (mc.MOST + 1), "bill_ext": ".jpg"}, "photo or a PDF"),
    ):
        with pytest.raises(ValueError, match=said):
            _claim(conn, who, **over)
    assert mc.my_claims(conn, who) == []


def test_the_bill_is_kept_privately_and_the_claim_holds_only_its_key(conn, tmp_path):
    who, _ = rows.a_member_of_staff(conn)
    claim = _claim(conn, who, bill=b"\xff\xd8photo", bill_ext=".JPG")
    key = conn.execute("select receipt_key from expense where id = %s", (claim,)).fetchone()["receipt_key"]
    assert key == f"receipts/{DAY.year}/{claim}.jpg" and (tmp_path / key).read_bytes() == b"\xff\xd8photo"


def test_a_person_sees_only_their_own_claims_newest_first(conn):
    a, _ = rows.a_member_of_staff(conn)
    b, _ = rows.a_member_of_staff(conn)
    first, second, other = (
        _claim(conn, a, vendor="First"),
        _claim(conn, a, vendor="Second"),
        _claim(conn, b, vendor="Other"),
    )
    conn.execute(
        "update expense set created_at = created_at - interval '1 minute' where id = %s", (first,)
    )  # one transaction, one clock
    assert [c["id"] for c in mc.my_claims(conn, a)] == [second, first]
    assert [c["id"] for c in mc.my_claims(conn, b)] == [other]


def test_a_claim_is_withdrawn_or_voided_never_deleted_and_each_is_in_the_history(conn):
    who, _ = rows.a_member_of_staff(conn)
    boss, _ = rows.a_member_of_staff(conn)
    grant(conn, rows.tenant(conn), boss, "ops", settings.school_today(conn), "test")
    mine, theirs = _claim(conn, who), _claim(conn, who)
    with pytest.raises(ValueError, match="not your claim"):
        mc.withdraw(conn, boss, mine)
    mc.withdraw(conn, who, mine)
    with pytest.raises(ValueError, match="withdrawn cannot be withdrawn"):
        mc.withdraw(conn, who, mine)
    with pytest.raises(PermissionError):
        mc.void(conn, who, theirs, "no")
    with pytest.raises(ValueError, match="say why"):
        mc.void(conn, boss, theirs, "  ")
    mc.void(conn, boss, theirs, "a duplicate of the Sai Stores bill")
    assert {c["id"]: (c["status"], c["reason"]) for c in mc.my_claims(conn, who)} == {
        mine: ("withdrawn", None),
        theirs: ("voided", "a duplicate of the Sai Stores bill"),
    }
    with pytest.raises(psycopg.errors.RaiseException, match="never deleted"), conn.transaction():
        conn.execute("delete from expense where id = %s", (mine,))
    logged = conn.execute(
        "select op, after->>'status' as status from change_log where table_name = 'expense' and row_id = %s order by at, id",
        (mine,),
    ).fetchall()
    assert [(r["op"], r["status"]) for r in logged] == [("insert", "submitted"), ("update", "withdrawn")]
