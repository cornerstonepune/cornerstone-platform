"""Hidden tests for #934 (ADR 0108 ticket 3): `engine enrol class --grade`. A grade that is not a row is refused with
nothing written; the grade is read in any case and stored as the table's code; a K1 class and a K2 class with the same
roll numbers are different children, and a second K1 run adds nothing."""

import pytest

from tests.test_cli import run
from tests.test_people import (  # noqa: F401  (school is a fixture)
    FROM,
    SIGNER,
    listing,
    needs_db,
    rows,
    school,
)

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")


def enrol(tmp_path, grade):
    return run(
        "enrol", "class", listing(tmp_path), "--grade", grade, "--apply", "--by", SIGNER, "--from", FROM
    )


@needs_db
def test_a_grade_that_is_not_a_row_is_refused_and_nothing_is_written(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    out = enrol(tmp_path, "G99")
    assert out.exit_code != 0
    assert "no grade called G99" in out.output_plain
    assert rows("select count(*) as n from school_class")[0]["n"] == 0
    assert rows("select count(*) as n from enrolment")[0]["n"] == 0


@needs_db
def test_k1_and_k2_are_two_classes_of_different_children_and_a_second_run_adds_nothing(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    assert enrol(tmp_path, "K2").exit_code == 0
    first = enrol(tmp_path, "k1")  # any case: the code stored is the table's
    assert first.exit_code == 0, first.output_plain
    per_class = rows(
        "select c.grade_code, count(distinct e.child_id) as n from school_class c"
        " join enrolment e on e.class_id = c.id and e.to_date is null group by c.grade_code order by c.grade_code"
    )
    assert [(r["grade_code"], r["n"]) for r in per_class] == [("K1", 22), ("K2", 22)]
    assert rows("select count(distinct child_id) as n from enrolment where to_date is null")[0]["n"] == 44
    again = enrol(tmp_path, "K1")
    assert again.exit_code == 0, again.output_plain
    assert "children added" not in again.output_plain
    assert rows("select count(*) as n from enrolment")[0]["n"] == 44
