"""Money history (specs/CP-81): the school's expense sheet filled in as history. The files here are made up, with made-up names: the real ones never enter the repository."""

import csv
import datetime as dt
import os
from pathlib import Path

import pytest

from engine.core import db, money_claims, money_import, settings
from tests import rows

HEAD = "line_id,source_row,academic_year,month,date,paid_by,description,purpose_or_location_raw,campus,amount_inr,category,cost_stream,event,is_capex,bill_status,late_payment,urgent,advance,founder_comment,sheet_side_notes,cell_colour".split(
    ","
)


def _line(ref, **o):
    base = dict(
        line_id=ref,
        source_row="1",
        academic_year="2025-26",
        month="2025-11",
        date="2025-11-10",
        paid_by="Zed",
        description="Sai Stores",
        purpose_or_location_raw="Bill",
        campus="Gurukul",
        amount_inr="450",
        category="Utilities & services",
        cost_stream="",
        event="",
        is_capex="N",
        bill_status="Bill",
        late_payment="N",
        urgent="N",
        advance="N",
        founder_comment="",
        sheet_side_notes="",
        cell_colour="FFD9D9D9",
    )
    return base | o


def _files(tmp_path: Path, lines: list[dict[str, str]]) -> tuple[Path, Path]:
    a, b = tmp_path / "expenses.csv", tmp_path / "bills.csv"
    with a.open("w", newline="") as f:
        w = csv.DictWriter(f, HEAD)
        w.writeheader()
        w.writerows(lines)
    with b.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["line_id", "bill_file_check", "matched_file_title"])
        for ln in lines:
            w.writerow(
                [
                    ln["line_id"],
                    "desc+date" if ln["description"] == "Sai Stores" else "none",
                    "Bill 10.11.25 (Sai Stores)" if ln["description"] == "Sai Stores" else "",
                ]
            )
    return a, b


@pytest.fixture
def conn():
    if not os.getenv("DATABASE_URL"):
        pytest.skip("needs DATABASE_URL (see .env.example)")
    with db.connect() as c:
        yield c
        c.rollback()


SHEET = [
    _line("T-1", paid_by="Zed", amount_inr="450"),
    _line(
        "T-2",
        paid_by="ZED (implied)",
        description="Garbage payment",
        cost_stream="Garbage collection",
        amount_inr="300",
        campus="Both",
        bill_status="Not recorded",
    ),
    _line(
        "T-3",
        paid_by="Yara",
        date="",
        month="2025-09",
        amount_inr="1200.50",
        category="Events & celebrations",
        event="Sports Day",
        campus="Event",
        is_capex="Y",
        advance="Y",
        bill_status="Payment proof only",
        sheet_side_notes="paid in two parts",
        founder_comment="check this",
    ),
    _line("T-4", paid_by="Yaraa", date="2099-01-01", month="2025-10", amount_inr="75"),
    _line("T-5", paid_by="Zed", amount_inr="0"),
    _line("T-6", paid_by="", date="", month="", amount_inr="10"),
    _line("T-7", paid_by="Zed", amount_inr="-50", category="Advances & adjustments"),
]


def test_the_dry_run_says_what_it_would_do_and_writes_nothing(conn, tmp_path):
    p = money_import.plan(conn, *_files(tmp_path, SHEET))
    assert (len(p.lines), p.skipped, p.dated, p.same) == (
        5,
        [("T-5", "no amount"), ("T-6", "no date and no month")],
        {"month only": 1, "after today": 1},
        {"Yaraa": "Yara"},
    )
    assert sum(ln.amount for ln in p.lines) == 450 + 300 + 1200.50 + 75 - 50 and p.new_people == [
        "Yara",
        "Zed",
    ]
    assert conn.execute("select count(*) n from expense where status = 'historic'").fetchone()["n"] == 0


def test_every_line_becomes_one_historic_claim_with_what_the_sheet_says(conn, tmp_path):
    p = money_import.plan(conn, *_files(tmp_path, SHEET))
    assert money_import.apply(conn, p) == {"claims": 5, "people added": 2, "categories added": 0}
    got = {
        r["source_ref"]: r for r in conn.execute("select * from expense where status = 'historic'").fetchall()
    }
    assert sum(r["amount"] for r in got.values()) == sum(ln.amount for ln in p.lines)
    one, two, three, four = got["T-1"], got["T-2"], got["T-3"], got["T-4"]
    assert (one["vendor"], one["bill_quality"], one["bill_ref"], one["tags"]) == (
        "Sai Stores",
        "vendor_bill",
        "Bill 10.11.25 (Sai Stores)",
        [],
    )
    assert (
        two["campus_id"],
        two["subcategory"],
        two["bill_quality"],
        "payer implied by the sheet" in two["note"],
    ) == (None, "Garbage collection", None, True)
    assert (three["event"], sorted(three["tags"]), three["bill_quality"], three["spent_on"]) == (
        "Sports Day",
        ["advance", "capex"],
        "payment_proof",
        dt.date(2025, 9, 1),
    )
    assert (
        "date in the sheet: none" in three["note"]
        and "paid in two parts" in three["note"]
        and "Founder: check this" in three["note"]
    )
    assert (four["spent_on"], four["claimant_id"]) == (dt.date(2025, 10, 1), three["claimant_id"]), (
        "Yaraa is Yara"
    )
    assert (got["T-7"]["amount"], "refund" in got["T-7"]["note"]) == (-50, True)


def test_running_it_again_changes_nothing_and_a_payer_on_the_staff_list_is_that_person(conn, tmp_path):
    sid, _ = rows.a_member_of_staff(conn)
    conn.execute("update pii.staff set name = 'Zed Testperson' where staff_id = %s", (sid,))
    files = _files(tmp_path, SHEET)
    first = money_import.plan(conn, *files)
    assert first.new_people == ["Yara"], "Zed is on the list"
    money_import.apply(conn, first)
    again = money_import.plan(conn, *files)
    assert (len(again.lines), again.already) == (0, 5)
    assert money_import.apply(conn, again) == {"claims": 0, "people added": 0, "categories added": 0}
    assert (
        conn.execute(
            "select count(*) n from expense where status = 'historic' and claimant_id = %s", (sid,)
        ).fetchone()["n"]
        == 3
    )


def test_a_former_payer_cannot_sign_in_and_a_historic_claim_is_in_no_queue(conn, tmp_path):
    money_import.apply(conn, money_import.plan(conn, *_files(tmp_path, SHEET)))
    row = conn.execute(
        "select s.id, s.active, s.role_code, p.password_hash from staff s join pii.staff p on p.staff_id = s.id where p.name = 'Yara'"
    ).fetchone()
    assert (row["active"], row["role_code"], row["password_hash"]) == (False, None, None)
    lead, _ = rows.a_member_of_staff(conn)
    conn.execute("update staff set role_code = 'ops' where id = %s", (lead,))
    assert money_claims.queue(conn, lead) == []
    mine = money_claims.my_claims(conn, row["id"])
    assert {c["status"] for c in mine} == {"historic"} and mine[0]["next"].startswith("An earlier record")


def test_a_new_category_in_the_sheet_is_added_to_the_settings_and_the_school_s_own_are_there(conn, tmp_path):
    assert (
        len(settings.config(conn, "money.categories", [])) == 15
        and "Garbage collection" in settings.config(conn, "money.subcategories", {})["Utilities & services"]
    )
    p = money_import.plan(conn, *_files(tmp_path, [_line("T-9", category="A brand new category")]))
    assert p.new_categories == ["A brand new category"]
    money_import.apply(conn, p)
    assert "A brand new category" in settings.config(conn, "money.categories", [])


def test_a_claim_may_carry_a_sub_category_its_category_lists(conn):
    who, _ = rows.a_member_of_staff(conn)
    ok = money_claims.submit_claim(
        conn,
        who,
        "100",
        dt.date(2026, 11, 10),
        "Tanker man",
        "Utilities & services",
        "Gurukul",
        subcategory="Water tanker",
    )
    assert (
        conn.execute("select subcategory from expense where id = %s", (ok,)).fetchone()["subcategory"]
        == "Water tanker"
    )
    with pytest.raises(ValueError, match="not offered under"):
        money_claims.submit_claim(
            conn,
            who,
            "100",
            dt.date(2026, 11, 10),
            "Tanker man",
            "Printing & copying",
            "Gurukul",
            subcategory="Water tanker",
        )


def test_the_command_refuses_files_inside_the_repository():
    from tests.test_cli import run

    inside = str(db.REPO_ROOT / "specs" / "CP-81" / "spec.md")
    r = run("money", "import", inside, inside)
    assert r.exit_code != 0 and "outside the repository" in " ".join(r.output_plain.split())
