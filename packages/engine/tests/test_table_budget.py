"""The schema may only shrink (CP-27, Done when 20): the tables in `public` and `pii` and the functions in `public`,
`internal` and `pii` equal the counts in supabase/table-budget.json. A change that removes some lowers the numbers; a
change that adds one raises them only with a `raised_by` line naming its spec and why it cannot be a column, a row in
a shared table, a rule on a column, or a view."""

import json
import os
from pathlib import Path

import pytest

from engine.core import db

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

BUDGET = Path(__file__).resolve().parents[3] / "supabase" / "table-budget.json"


def _counts() -> tuple[int, int]:
    with db.connect() as c:
        row = c.execute(
            "select (select count(*) from pg_class k join pg_namespace n on n.oid = k.relnamespace"
            "        where k.relkind in ('r', 'p') and n.nspname in ('public', 'pii')) as tables,"
            "       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
            "        where n.nspname in ('public', 'internal', 'pii')) as functions"
        ).fetchone()
    return row["tables"], row["functions"]


def test_the_schema_matches_its_budget():
    budget = json.loads(BUDGET.read_text())
    tables, functions = _counts()
    assert tables <= budget["tables"] or budget["raised_by"], (
        f"{tables} tables, budget {budget['tables']}: say why in table-budget.json raised_by, or reuse a shared table"
    )
    assert (tables, functions) == (budget["tables"], budget["functions"]), (
        f"the database has {tables} tables and {functions} functions; set table-budget.json to these numbers"
        " (lower: you removed some; higher: add a raised_by line first)"
    )


def test_a_raise_names_its_spec_and_reason():
    for line in json.loads(BUDGET.read_text())["raised_by"]:
        spec, _, reason = line.partition(":")
        assert spec.strip().startswith("CP-") and len(reason.strip()) > 20, (
            f"raised_by needs 'CP-n: why', got {line!r}"
        )
