"""CP-85 (specs/CP-85/spec.md): materials that are alternatives ("Puppets or flashcards"), one test for each Done-when line, through the
engine's functions. Rows are placeholders made in the test's own transaction and rolled back (tests/materials_rows.py)."""

import datetime as dt
import os

import pytest

from engine.core import history
from engine.w1_bank import alt_groups, map_ledger
from engine.w1_bank import k2_draft as draft
from engine.w1_bank import k2_review as review
from engine.w2_print import materials_consolidate as school
from engine.w2_print import materials_list as ml
from engine.w2_print import materials_swap, stock_buy
from tests import materials_rows as m
from tests import test_k2_draft as base
from tests import test_stock as st

conn = base.conn  # the one database fixture the splitter's tests use: a placeholder tenant, staff and band
pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
D1, D2 = m.MON, m.MON + dt.timedelta(days=1)
END = m.MON + dt.timedelta(days=13)


@pytest.fixture
def s(conn):
    return m.school(conn)


def _name(conn, code):
    return conn.execute("select name from material_item where code = %s", (code,)).fetchone()["name"]


def _pencils_or_crayons(conn, s, quantities=(10, 12)):
    """The school's first activity needs pencils or crayons (one group), and paper besides."""
    a = s["acts"][0]
    pencils, crayons, paper = (m.item(conn, s, w) for w in ("Pencils", "Crayons", "Paper"))
    m.needs(conn, s, a, pencils, quantities[0], ord_=1, alt=1)
    m.needs(conn, s, a, crayons, quantities[1], ord_=2, alt=1)
    m.needs(conn, s, a, paper, 3, ord_=3)
    return a, pencils, crayons, paper


def _groups(conn, s, activity):
    return {
        r["material_code"]: r["alt_group"]
        for r in conn.execute(
            "select material_code, alt_group from activity_material where tenant_id = %s and activity_code = %s",
            (s["tenant"], activity),
        )
    }


# ---- Done-when 1: an activity's materials can group items as alternatives, kept on the link to its items


def test_items_of_an_activity_are_grouped_as_alternatives_and_a_persons_edit_of_other_lines_keeps_the_group(
    conn, s
):
    a, pencils, crayons, paper = _pencils_or_crayons(conn, s)
    assert _groups(conn, s, a) == {pencils: 1, crayons: 1, paper: None}
    here = (conn, s["tenant"], s["staff"], a)
    review.set_materials(
        *here, [(_name(conn, pencils), 10), (_name(conn, crayons), 12), (_name(conn, paper), 7), ("Glue", 1)]
    )
    got = _groups(conn, s, a)
    assert (got[pencils], got[crayons], got[paper]) == (
        1,
        1,
        None,
    )  # the edit of paper and glue left the group alone
    text = conn.execute(
        "select materials from activity where tenant_id = %s and code = %s", (s["tenant"], a)
    ).fetchone()
    assert (
        text["materials"]
        == f"{_name(conn, pencils)} × 10 or {_name(conn, crayons)} × 12, {_name(conn, paper)} × 7, Glue × 1"
    )
    review.set_materials(
        *here, [(_name(conn, pencils), 10), (_name(conn, paper), 7)]
    )  # one of the pair is taken out
    assert _groups(conn, s, a) == {pencils: None, paper: None}, (
        "an item left alone in a group is needed on its own"
    )


# ---- Done-when 2: a class's list shows one line for a group, the first alternative unless the educator picks another


def test_a_class_list_has_one_line_for_a_group_and_names_the_others_on_it(conn, s):
    a, pencils, crayons, paper = _pencils_or_crayons(conn, s)
    m.planned(conn, s, D1, a)
    lid = ml.build(conn, s["class"], "fortnight", m.MON, END)
    [day] = ml.read(conn, lid, "fortnight")["groups"]
    by = {ln["material_code"]: ln for ln in day["lines"]}
    assert set(by) == {pencils, paper}, "the first alternative by ord is the line, the other is not"
    assert by[pencils]["alternatives"] == [{"code": crayons, "name": _name(conn, crayons)}]
    assert by[paper]["alternatives"] == [] and by[pencils]["quantity"] == 10
    kept = conn.execute(
        "select sources from materials_line where list_id = %s and material_code = %s", (lid, pencils)
    ).fetchone()
    assert kept["sources"][0]["alternatives"] == [{"code": crayons, "name": _name(conn, crayons)}]


def test_the_educator_swaps_a_line_to_an_alternative_and_the_choice_is_kept_with_who_across_a_rebuild(
    conn, s
):
    a, pencils, crayons, paper = _pencils_or_crayons(conn, s)
    m.planned(conn, s, D1, a)
    lid = ml.build(conn, s["class"], "fortnight", m.MON, END)
    line = conn.execute(
        "select id from materials_line where list_id = %s and material_code = %s", (lid, pencils)
    ).fetchone()["id"]
    materials_swap.swap(conn, line, crayons, s["staff"])
    [swap] = [c for c in history.of(conn, "materials_line", str(line)) if c["op"] == "swap"]
    assert (swap["before"], swap["after"], swap["staff_id"]) == (
        {"material_code": pencils},
        {"material_code": crayons},
        s["staff"],
    )

    def lines():
        [day] = ml.read(conn, ml.build(conn, s["class"], "fortnight", m.MON, END), "fortnight")["groups"]
        return {ln["material_code"]: ln for ln in day["lines"]}

    got = lines()
    assert set(got) == {crayons, paper}, "still one line for the group, the one she chose"
    assert (got[crayons]["quantity"], got[crayons]["line_id"]) == (12, line)
    assert got[crayons]["alternatives"] == [{"code": pencils, "name": _name(conn, pencils)}]
    m.planned(
        conn, s, D2, a
    )  # a second lesson of the activity: the rebuild adds it to her choice, never to the other
    assert (set(lines()), lines()[crayons]["quantity"]) == ({crayons, paper}, 24)
    with pytest.raises(materials_swap.NotAnAlternative):
        materials_swap.swap(conn, line, paper, s["staff"])
    materials_swap.swap(conn, line, pencils, s["staff"])  # and back
    assert set(lines()) == {pencils, paper}


# ---- Done-when 3: the school's list and the buy list count one alternative per group


def test_the_schools_list_and_the_buy_list_count_one_alternative_per_group(conn):
    s, campus, _ = st._campus_with_a_plan(conn)
    lead = st._person(conn, "ops", campus)
    a, pencils, crayons, _ = _pencils_or_crayons(conn, s)
    second = m.another_class(conn, s, "T-two")
    m.planned(conn, s, D1, a)
    m.planned(conn, s, D2, a, klass=second)
    for klass in (s["class"], second):
        ml.build(conn, klass, "fortnight", m.MON, END)
    lines = {
        x["material_code"]: x for x in school.read(conn, school.build(conn, s["tenant"], m.MON, END))["lines"]
    }
    assert lines[pencils]["quantity"] == 20 and crayons not in lines, (
        "two classes, one pencil line each, no crayons"
    )
    bought = {ln["code"]: ln for ln in stock_buy.buy_list(conn, lead, campus, "2031-11")["lines"]}
    assert bought[pencils]["need"] == 20 and crayons not in bought


# ---- Done-when 4: the split marks alternatives where the note says "or" between two of its items, in code


@pytest.mark.parametrize(
    ("text", "names", "want"),
    [
        ("Puppets or flashcards", ["puppets", "flashcards"], [1, 1]),
        ("PENCILS OR CRAYONS, 2 sheets of paper", ["pencils", "crayons", "paper"], [1, 1, None]),
        ("Pencils and/or crayons", ["pencils", "crayons"], [1, 1]),
        ("Pencils, or crayons", ["pencils", "crayons"], [1, 1]),
        ("Pencils or 10 crayons", ["pencils", "crayons"], [1, 1]),
        ("Beads or buttons or stones, string", ["beads", "buttons", "stones", "string"], [1, 1, 1, None]),
        ("Chalk or markers; a duster or cloth", ["chalk", "markers", "duster", "cloth"], [1, 1, 2, 2]),
        ("Pencils, crayons", ["pencils", "crayons"], [None, None]),
        ("Glue, paper and pencils or crayons", ["glue", "paper", "pencils", "crayons"], [None] * 4),
        ("Paper or card, paper plates", ["paper", "card", "paper plates"], [None] * 3),
        ("Crayons (red or blue)", ["crayons"], [None]),
        ("Pencils or something else", ["pencils", "scissors"], [None, None]),
    ],
)
def test_the_note_that_says_or_between_two_of_its_items_makes_them_one_group_and_what_is_unclear_is_left_alone(
    text, names, want
):
    assert alt_groups.groups(text, names) == want


def test_the_catalogue_fill_marks_the_alternatives_with_its_existing_checks_and_leaves_the_unclear_as_it_is(
    conn,
):
    base._act(conn, "KX-1", "Puppets", materials="Puppets or flashcards, 2 sheets of paper")
    base._act(conn, "KX-2", "Unclear", materials="Glue, paper and pencils or crayons")
    base._act(conn, "KX-3", "Not in the text", materials="Pencils or crayons")
    one = lambda name, q=None: {"name": name, "quantity": q, "unit": "piece"}  # noqa: E731
    ask = base.Scripted(
        {
            ("k2_materials_split", "KX-1"): [
                {"items": [one("puppets"), one("flashcards"), one("paper", 2)], "reason": ""}
            ],
            ("k2_materials_split", "KX-2"): [
                {"items": [one("glue"), one("paper"), one("pencils"), one("crayons")], "reason": ""}
            ],
            ("k2_materials_split", "KX-3"): [{"items": [one("pencils"), one("scissors")], "reason": ""}] * 3,
        }
    )
    draft.materials(conn, conn.t, conn.staff, base.BAND, "draft", ask, write=True, say=lambda _: None)
    map_ledger.apply(conn, conn.t, conn.staff, True)

    def marks(code):
        return {
            r["name"]: r["alt_group"]
            for r in conn.execute(
                "select i.name, m.alt_group from activity_material m join material_item i on i.tenant_id = m.tenant_id"
                " and i.code = m.material_code where m.tenant_id = %s and m.activity_code = %s",
                (conn.t, code),
            )
        }

    assert marks("KX-1") == {"puppets": 1, "flashcards": 1, "paper": None}
    assert set(marks("KX-2").values()) == {None}, (
        "an 'and' beside the pair: it cannot tell, so both are needed as before"
    )
    assert marks("KX-3") == {}, "a line that is not in the school's text is a person's, as it was"
