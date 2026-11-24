"""#934 (ADR 0108 ticket 3): `engine enrol class --grade K1` loads any grade's class. The grade is a row of `grade`, never
a code written in the command, and there is no default: a forgotten `--grade` refuses, it never loads K2.

Every child here is a PLACEHOLDER; runs only on the local test database."""

import re

import pytest

from engine.core import db, settings
from tests.test_cli import run
from tests.test_grades import _python_code
from tests.test_people import (  # noqa: F401  (school is a fixture)
    FROM,
    SIGNER,
    listing,
    needs_db,
    rows,
    school,
)

pytestmark = pytest.mark.usefixtures("forgets_what_it_commits")

CODES = [g["code"] for g in settings.seed("vocabulary.json", "grades")]


def test_the_enrol_command_names_no_grade():
    """test_grades reads a grade's code as written ("K2"); the command once held it lower case ("k2"), so this reads
    the command in any case."""
    text = (db.REPO_ROOT / "packages/engine/engine/core/cli_people.py").read_text()
    pattern = re.compile(rf"""["'`](?:{"|".join(CODES)})["'`]""", re.I)
    found = [line.strip() for line in _python_code(text).split("\n") if pattern.search(line)]
    assert found == []


def test_enrol_without_a_grade_refuses(tmp_path):
    out = run("enrol", "class", listing(tmp_path), "--from", FROM)
    assert out.exit_code != 0
    assert "--grade" in out.output_plain


@needs_db
def test_a_k1_class_and_its_children_are_enrolled(tmp_path, school):  # noqa: F811
    assert run("staff", "import", "--apply", "--by", SIGNER).exit_code == 0
    done = run(
        "enrol",
        "class",
        listing(tmp_path),
        "--grade",
        "K1",
        "--campus",
        "Gurukul",
        "--apply",
        "--by",
        SIGNER,
        "--from",
        FROM,
    )  # K1 is at both campuses (ADR 0109): the pilot class is Gurukul's
    assert done.exit_code == 0, done.output_plain
    classes = rows(
        "select c.grade_code, c.section, p.name as campus from school_class c join campus p on p.id = c.campus_id"
    )
    assert [(c["grade_code"], c["section"], c["campus"]) for c in classes] == [("K1", "A", "Gurukul")]
    kids = rows(
        "select e.roll_no from enrolment e join school_class c on c.id = e.class_id"
        " where c.grade_code = 'K1' and e.to_date is null"
    )
    assert sorted(int(k["roll_no"]) for k in kids) == list(range(1, 23))
