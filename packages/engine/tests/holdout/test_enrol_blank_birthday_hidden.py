"""Hidden tests for #946 (ADR 0112): a blank birthday is "not known". It never clears a held birthday on the
--match-existing path either; a list mixing written and blank birthdays stores each as written; two rows with one name
and no birthday are still the same child twice; the age refusal no longer says K2."""

import pytest

from tests.test_cli import run
from tests.test_people import (  # noqa: F401  (school is a fixture)
    FROM,
    SIGNER,
    born,
    children,
    listing,
    needs_db,
    rows,
    school,
)

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")

HEAD = "number,name,birthday"


def apply(path, *flags):
    return run("enrol", "class", "--grade", "K2", path, "--apply", "--by", SIGNER, *flags)


def birthdays():
    return rows(
        "select c.roll_no, p.birthday from child_now c join pii.child p on p.child_id = c.id"
        " where c.section = 'K2' order by c.roll_no"
    )


@needs_db
def test_match_existing_with_a_blank_keeps_the_birthday_held(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    assert apply(listing(tmp_path, children(3), name="dated.csv"), "--from", FROM).exit_code == 0
    held = [r["birthday"] for r in birthdays()]
    blank = [HEAD, *(f"{i},Placeholder Child {i:02d}," for i in range(1, 4))]
    moved = apply(listing(tmp_path, blank, name="blank.csv"), "--from", "2027-06-01", "--match-existing")
    assert moved.exit_code == 0, moved.output_plain
    assert "existing children enrolled: 3" in moved.output_plain
    assert [r["birthday"] for r in birthdays()] == held


@needs_db
def test_a_list_of_written_and_blank_birthdays_stores_each_as_written(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    lines = [
        HEAD,
        f"1,Placeholder Child 01,{born(1)}",
        "2,Placeholder Child 02,",
        f"3,Placeholder Child 03,{born(3)}",
    ]
    assert apply(listing(tmp_path, lines), "--from", FROM).exit_code == 0
    got = {r["roll_no"]: r["birthday"] for r in birthdays()}
    assert got["2"] is None
    assert got["1"].strftime("%d/%m/%Y") == born(1) and got["3"].strftime("%d/%m/%Y") == born(3)


@needs_db
def test_one_name_twice_with_no_birthday_is_the_same_child_twice(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    lines = [HEAD, "1,Placeholder Twice,", "2,Placeholder Twice,  "]
    out = apply(listing(tmp_path, lines), "--from", FROM)
    assert out.exit_code == 1 and "line 3:" in out.output_plain and "same child as line 2" in out.output_plain
    assert birthdays() == []


@needs_db
def test_the_age_refusal_names_no_grade(tmp_path, school):  # noqa: F811
    lines = [HEAD, "1,Placeholder Old,01/01/1990", "2,Placeholder New,"]
    out = run("enrol", "class", "--grade", "K2", listing(tmp_path, lines), "--from", FROM)
    assert out.exit_code != 0
    assert "line 2:" in out.output_plain and "outside the ages a class list holds" in out.output_plain
    assert "K2 child" not in out.output_plain
    assert "line 3:" not in out.output_plain  # the blank row is not refused
