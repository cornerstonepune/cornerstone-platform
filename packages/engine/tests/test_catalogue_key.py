"""One thing, one item (CP-84, Done-when 3): the key a catalogue item's name is known by. It needs no database. The same words
are one key whatever their case, spacing, plural or order; names that only share a word are two keys."""

import pytest

from engine.core import catalogue_key as k


def test_the_same_words_are_one_key_in_any_case_spacing_plural_order_or_repeat():
    same = ["pencils", "Pencils ", "pencil", "PENCIL pencils", "  PENCIL   Pencils  ", "pencil, pencils"]
    assert {k.key(n) for n in same} == {"pencil"}
    assert k.key("colour pencils") == k.key("Pencils  COLOUR") == k.key("pencil colour")


def test_names_that_only_share_words_are_different_keys():
    assert k.key("colour pencils") != k.key("pencils")
    assert k.key("pencil case") != k.key("pencil")
    assert k.words("colour pencils") == ["colour", "pencil"]


@pytest.mark.parametrize(
    ("plural", "singular"),
    [
        ("crayons", "crayon"),
        ("boxes", "box"),
        ("brushes", "brush"),
        ("sandwiches", "sandwich"),
        ("glasses", "glass"),
        ("berries", "berry"),
        ("leaves", "leaf"),
        ("potatoes", "potato"),
        ("scissors", "scissor"),
        ("toys", "toy"),
        ("ties", "tie"),
        ("shoes", "shoe"),
    ],
)
def test_a_plural_is_read_as_its_singular_by_one_simple_rule(plural, singular):
    assert k.singular(plural) == singular == k.singular(singular)


@pytest.mark.parametrize("word", ["glass", "bus", "class", "dice", "cactus", "gas", "a4"])
def test_a_word_that_is_not_a_plural_is_left_as_it_is(word):
    assert k.singular(word) == word


def test_an_apostrophe_is_dropped_and_punctuation_separates_words():
    assert k.key("Child's  toys") == k.key("childs toy") == "child toy"
    assert k.key("paper-plates/cups") == "cup paper plate"


def test_a_name_with_no_word_has_no_key():
    assert k.key(" , - ") == "" and k.words("") == []


REAL_PAIRS = [
    ("Big bowl", "Bigbowl"),
    ("black board", "Blackboard"),
    ("Dust bin", "Dustbin"),
    ("flash card", "flashcard"),
    ("Note Book", "Notebook"),
    ("rubber band", "rubberband"),
    ("Sketch pen", "sketchpen"),
    ("T-Shirt", "tshirt"),
]


def test_squash_is_the_singular_words_joined_with_no_space_in_the_order_written():
    assert k.squash("flash cards") == "flashcard" == k.squash("Flashcard")
    assert k.squash("T-Shirt") == "tshirt"
    assert k.squash("colour pencils") == "colourpencil" != k.squash("pencil colour"), "the order written stays"
    assert k.squash(" , - ") == ""


@pytest.mark.parametrize(("spaced", "joined"), REAL_PAIRS)
def test_a_name_written_with_or_without_a_space_is_one_name(spaced, joined):
    assert k.key(spaced) != k.key(joined), "the word-set key alone cannot see it: that was the defect"
    assert k.same_name(spaced, joined) and k.same_name(joined, spaced)
    assert k.same_name(spaced.upper() + "s", joined), "in any case, and a plural as its singular"


def test_the_same_words_in_any_order_are_still_one_name_and_names_that_only_share_a_word_are_not():
    assert k.same_name("pencil colour", "Colour pencils") and k.same_name("PENCIL pencils", "pencil")
    assert not k.same_name("colour pencils", "pencils") and not k.same_name("pencil case", "pencil")
    assert not k.same_name("flash card", "card") and not k.same_name("note book", "book")


def test_a_name_with_no_word_is_nobodys_name():
    assert not k.same_name("", "") and not k.same_name(" - ", "-") and not k.same_name("pencil", ",")
