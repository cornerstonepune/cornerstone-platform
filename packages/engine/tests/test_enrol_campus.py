"""#939 (ADR 0109, 0110): K1 is at Gurukul and at Neev, so `engine enrol class --grade K1` names the campus with
`--campus`; without it the import refuses in words and writes nothing. A class is found at its own campus only.

Every child here is a PLACEHOLDER; runs only on the local test database."""

import pytest

from tests.test_cli import run
from tests.test_people import (  # noqa: F401  (school is a fixture)
    FROM,
    SIGNER,
    born,
    listing,
    needs_db,
    rows,
    school,
)

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")


def _enrol(tmp_path, *flags, name="list.csv", lines=None):
    return run("enrol", "class", listing(tmp_path, lines, name), "--grade", "K1", "--from", FROM, *flags)


def _classes():
    return [
        (c["grade_code"], c["section"], c["campus"])
        for c in rows(
            "select c.grade_code, c.section, p.name as campus from school_class c"
            " join campus p on p.id = c.campus_id order by p.name"
        )
    ]


@needs_db
def test_k1_without_a_campus_refuses_and_names_both(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    out = _enrol(tmp_path, "--apply", "--by", SIGNER)
    assert out.exit_code != 0
    assert "Gurukul and Neev" in out.output_plain and "--campus" in out.output_plain
    assert _classes() == []


@needs_db
def test_k1_at_gurukul_goes_to_gurukul(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    done = _enrol(tmp_path, "--campus", "Gurukul", "--apply", "--by", SIGNER)
    assert done.exit_code == 0, done.output_plain
    assert _classes() == [("K1", "A", "Gurukul")]


@needs_db
def test_k1_a_at_each_campus_is_its_own_class_with_its_own_children(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    neev = ["number,name,birthday", *(f"{i},Placeholder Neev {i:02d},{born(i)}" for i in range(1, 6))]
    assert (
        _enrol(tmp_path, "--campus", "Neev", "--apply", "--by", SIGNER, name="neev.csv", lines=neev).exit_code
        == 0
    )
    done = _enrol(tmp_path, "--campus", "Gurukul", "--apply", "--by", SIGNER)
    assert done.exit_code == 0, done.output_plain
    assert _classes() == [("K1", "A", "Gurukul"), ("K1", "A", "Neev")]
    per_campus = rows(
        "select p.name, count(*) as n from enrolment e join school_class c on c.id = e.class_id"
        " join campus p on p.id = c.campus_id where e.to_date is null group by p.name order by p.name"
    )
    assert [(r["name"], r["n"]) for r in per_campus] == [("Gurukul", 22), ("Neev", 5)]


@needs_db
def test_a_campus_that_is_not_there_refuses(tmp_path, school):  # noqa: F811
    out = _enrol(tmp_path, "--campus", "Nowhere")
    assert out.exit_code != 0
    assert "no campus called Nowhere" in out.output_plain
