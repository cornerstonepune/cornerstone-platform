"""#946 (ADR 0112): a class-list row whose birthday cell is empty or only spaces enrols the child with birthday not
known (`pii.child.birthday` NULL). A birthday that is written but not read still refuses the whole run. A blank never
clears or contradicts a birthday already held, and a second run of the same list changes nothing.

Every child here is a PLACEHOLDER; runs only on the local test database."""

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


def blank(n: int = 3, cell: str = "") -> list[str]:
    return [HEAD, *(f"{i},Placeholder Child {i:02d},{cell}" for i in range(1, n + 1))]


def enrol(path, *flags):
    return run("enrol", "class", "--grade", "K2", path, "--from", FROM, *flags)


def apply(path, *flags):
    return enrol(path, "--apply", "--by", SIGNER, *flags)


def birthdays():
    return rows(
        "select c.roll_no, p.birthday from child_now c join pii.child p on p.child_id = c.id"
        " where c.section = 'K2' order by c.roll_no"
    )


@needs_db
def test_a_blank_birthday_enrols_the_child_with_birthday_not_known(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    path = listing(tmp_path, blank())
    dry = enrol(path)
    assert dry.exit_code == 0, dry.output_plain
    assert "children added: 3" in dry.output_plain and "dry run" in dry.output_plain
    assert birthdays() == []
    done = apply(path)
    assert done.exit_code == 0, done.output_plain
    assert [(r["roll_no"], r["birthday"]) for r in birthdays()] == [("1", None), ("2", None), ("3", None)]


@needs_db
def test_a_birthday_cell_of_only_spaces_is_blank(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    done = apply(listing(tmp_path, blank(2, "   ")))
    assert done.exit_code == 0, done.output_plain
    assert [r["birthday"] for r in birthdays()] == [None, None]


@needs_db
def test_an_unreadable_birthday_still_refuses_the_whole_run(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    lines = blank(2) + ["3,Placeholder Child 03,31/02/2021", "4,Placeholder Child 04,soon"]
    out = apply(listing(tmp_path, lines))
    assert out.exit_code == 1 and "nothing was written" in (text := out.output_plain)
    assert "line 4:" in text and "line 5:" in text and "birthday not read" in text, text
    assert birthdays() == []


@needs_db
def test_a_second_run_of_a_blank_birthday_list_changes_nothing(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    path = listing(tmp_path, blank())
    assert apply(path).exit_code == 0

    def state():
        return (
            rows("select id, updated_at from child_now where section = 'K2' order by roll_no"),
            rows("select id, updated_at from enrolment order by roll_no"),
            birthdays(),
        )

    first = state()
    again = apply(path)
    assert again.exit_code == 0, again.output_plain
    assert "already there: 3" in again.output_plain and "added" not in again.output_plain
    assert state() == first


@needs_db
def test_a_blank_never_overwrites_or_contradicts_a_birthday_already_held(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    assert apply(listing(tmp_path, children(3), name="dated.csv")).exit_code == 0
    held = birthdays()
    assert all(r["birthday"] is not None for r in held)
    again = apply(listing(tmp_path, blank(), name="blank.csv"))
    assert again.exit_code == 0, again.output_plain  # the same children, not "a different child"
    assert "already there: 3" in again.output_plain
    assert birthdays() == held
    assert [r["birthday"].strftime("%d/%m/%Y") for r in held] == [born(i) for i in range(1, 4)]
