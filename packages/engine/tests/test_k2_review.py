"""M1-11, D-073: a drafted part can be kept, changed or rejected by a person (goals/m1-11-k2-complete-v1.yaml).

These are the engine's three actions behind the screens' buttons. Each is tested for the 'drafted' mark it starts from
and the mark it ends with. A part the school wrote, or that is not marked drafted, is refused: the school's text is never
changed through here.
"""

import os

import pytest

from engine.core import history, settings
from engine.w1_bank import k2_review as review
from engine.w1_bank import map_ledger
from tests import test_k2_draft as base

conn = base.conn  # the same database fixture, one place
AGREE, FULL, Scripted, _act, _marks, drafted, run = (
    base.AGREE,
    base.FULL,
    base.Scripted,
    base._act,
    base._marks,
    base.drafted,
    base.run,
)

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def page(conn):
    """A page whose objective is the school's and whose other parts are drafts, one of them doubted."""
    _act(conn, "KX-1", "A", objective="the school's own words")
    run(
        conn,
        Scripted(
            {
                ("k2_page_draft", "KX-1"): [drafted()],
                ("k2_page_check", "KX-1"): [base.FAULT],
            }
        ),
    )
    map_ledger.apply(conn, conn.t, conn.staff, True)
    return conn


def _text(conn, part):
    return conn.execute(f"select {part} as t from activity where code = 'KX-1'").fetchone()["t"]  # noqa: S608


def test_keeping_a_draft_leaves_its_words_clears_the_doubt_and_makes_it_the_persons(page):
    assert _marks(page, "KX-1")["steps"] == ("drafted", True)
    review.keep(page, page.t, page.staff, "KX-1", "steps")
    assert _text(page, "steps") == "\u2022 s"
    assert _marks(page, "KX-1")["steps"] == ("person", False)
    assert _marks(page, "KX-1")["thinking"] == ("drafted", True), "the other parts are untouched"


def test_changing_a_draft_writes_the_new_words_as_the_persons_and_the_history_says_who(page):
    review.change(
        page, page.t, page.staff, "KX-1", "steps", "Sit in a circle; show the blocks one at a time."
    )
    assert _text(page, "steps") == "Sit in a circle; show the blocks one at a time."
    assert _marks(page, "KX-1")["steps"] == ("person", False)
    seen = [c for c in history.of(page, "activity", "KX-1") if "steps" in (c["after"] or {})]
    assert (seen[-1]["before"]["steps"], seen[-1]["origin"]) == ("\u2022 s", f"staff:{page.staff}"), (
        "ids, never a name"
    )
    assert str(seen[-1]["staff_id"]) == str(page.staff), "the person is a member of staff, by id"
    assert seen[-1]["after"]["steps"].startswith("Sit in a circle")


def test_changing_a_draft_to_nothing_is_refused_use_reject_for_that(page):
    with pytest.raises(ValueError, match="reject"):
        review.change(page, page.t, page.staff, "KX-1", "steps", "   ")
    assert _text(page, "steps") == "\u2022 s"


def test_rejecting_a_draft_empties_the_part_and_takes_its_mark_away(page):
    review.reject(page, page.t, page.staff, "KX-1", "thinking")
    assert _text(page, "thinking") == "" and "thinking" not in _marks(page, "KX-1")
    assert _marks(page, "KX-1")["steps"] == ("drafted", True)


def test_the_schools_words_cannot_be_kept_or_rejected_as_a_draft(page):
    for act in (
        lambda p: review.keep(page, page.t, page.staff, "KX-1", p),
        lambda p: review.reject(page, page.t, page.staff, "KX-1", p),
    ):
        with pytest.raises(ValueError, match="not a drafted part"):
            act("objective")  # the school's own words: no mark
    assert _text(page, "objective") == "the school's own words"
    for act in (
        lambda: review.keep(page, page.t, page.staff, "KX-1", "name; drop table activity"),
        lambda: review.change(page, page.t, page.staff, "KX-1", "name; drop table activity", "x"),
    ):
        with pytest.raises(ValueError, match="not a part"):
            act()


def test_a_reviewer_changes_the_schools_words_and_the_part_becomes_theirs(page):
    """CP-53 (Nimish, 14 Nov): every part is edited in place, the school's included; the part is then the person's, so a
    reload of the sheet leaves it (k2_upload.mark_school keeps a person's part)."""
    review.change(page, page.t, page.staff, "KX-1", "objective", "The child listens and retells the story.")
    assert _text(page, "objective") == "The child listens and retells the story."
    assert _marks(page, "KX-1")["objective"] == ("person", False)


def test_a_persons_part_can_be_changed_again(page):
    review.change(page, page.t, page.staff, "KX-1", "steps", "First words.")
    review.change(page, page.t, page.staff, "KX-1", "steps", "Second words.")
    assert _text(page, "steps") == "Second words." and _marks(page, "KX-1")["steps"] == ("person", False)


def test_a_part_a_person_already_made_theirs_cannot_be_kept_changed_or_rejected_again_as_a_draft(page):
    review.keep(page, page.t, page.staff, "KX-1", "steps")
    with pytest.raises(ValueError, match="not a drafted part"):
        review.reject(page, page.t, page.staff, "KX-1", "steps")
    assert _text(page, "steps") == "\u2022 s"


def test_reverting_the_draft_afterwards_leaves_the_persons_part_alone(page):
    review.change(page, page.t, page.staff, "KX-1", "steps", "A person's own steps.")
    (p,) = map_ledger.standing(page, page.t, "applied")
    map_ledger.revert(page, page.t, p["id"], page.staff, "test")
    assert _text(page, "steps") == "A person's own steps."
    assert _marks(page, "KX-1") == {"steps": ("person", False)}, (
        "the draft's other marks go, the person's stays"
    )


def test_the_review_list_loses_a_page_once_every_doubt_on_it_is_cleared(page):
    settings.put(page, "map.audit_share", 0)
    assert [r["code"] for r in review.review_list(page, page.t)] == ["KX-1"]
    for part in ("thinking", "steps", "level_0", "level_1", "level_2", "level_3"):
        review.keep(page, page.t, page.staff, "KX-1", part)
    assert review.review_list(page, page.t) == []


def test_reverting_the_draft_never_wipes_a_part_a_person_kept_with_its_words_unchanged(page):
    review.keep(page, page.t, page.staff, "KX-1", "steps")  # same words, now the person's
    (p,) = map_ledger.standing(page, page.t, "applied")
    map_ledger.revert(page, page.t, p["id"], page.staff, "test")
    assert _text(page, "steps") == "\u2022 s", (
        "a person's approval is not undone by a revert of the machine's proposal"
    )
    assert _marks(page, "KX-1")["steps"] == ("person", False)
    assert _text(page, "thinking") == "" and "thinking" not in _marks(page, "KX-1"), (
        "the parts still drafted do go"
    )


def _items(conn):
    return [
        (r["name"], r["quantity"], r["source"])
        for r in conn.execute(
            "select i.name, m.quantity::float8 as quantity, m.source from activity_material m"
            " join material_item i on i.tenant_id = m.tenant_id and i.code = m.material_code"
            " where m.tenant_id = %s and m.activity_code = 'KX-1' order by m.ord",
            (conn.t,),
        ).fetchall()
    ]


def test_a_reviewer_sets_the_materials_as_items_and_they_are_the_persons(page):
    """CP-53: the materials are items with a count, edited as a list; a new name joins the catalogue, one already there (in
    any case or spacing) is that item; a dropped line goes; the part is the person's."""
    review.set_materials(page, page.t, page.staff, "KX-1", [("Story book", 1), ("Picture  flashcards", None)])
    assert _items(page) == [("Story book", 1.0, "person"), ("Picture flashcards", None, "person")]
    review.set_materials(page, page.t, page.staff, "KX-1", [("picture flashcards", 2), ("Chart paper", 3)])
    assert _items(page) == [("Picture flashcards", 2.0, "person"), ("Chart paper", 3.0, "person")]
    assert _marks(page, "KX-1")["materials"] == ("person", False)
    assert _text(page, "materials") == "Picture flashcards × 2, Chart paper × 3"


def test_a_material_with_no_name_or_a_count_below_one_is_refused(page):
    for bad in ([("  ", 1)], [("Glue", 0)], [("Glue", -2)]):
        with pytest.raises(ValueError):
            review.set_materials(page, page.t, page.staff, "KX-1", bad)
