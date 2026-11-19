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
