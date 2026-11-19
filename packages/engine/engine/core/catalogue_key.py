"""The key a catalogue item's name is known by (CP-84): one thing, one item.

Two names with the same key are the same item: the same words, in any case, spacing or order, a plural read as its singular, a word
said twice counted once ("PENCIL pencils", "Pencils " and "pencil" are all "pencil"). Two names that only share a word ("colour
pencils" and "pencils") have different keys: they are `close`, never merged. Pure; no database."""

import re
from functools import lru_cache

_PART = re.compile(r"[^\W_]+")
_IRREGULAR = {
    "leaves": "leaf",
    "shelves": "shelf",
    "loaves": "loaf",
    "halves": "half",
    "knives": "knife",
    "scarves": "scarf",
    "mice": "mouse",
    "children": "child",
    "feet": "foot",
    "teeth": "tooth",
}
_OES_AS_IS = {"shoes", "canoes"}  # "-oes" that is not a plural of "-o"
_ES = ("sses", "shes", "ches", "xes")  # glasses, brushes, matches, boxes: drop "es"
_NOT_PLURAL = ("ss", "us", "is")  # glass, bus, tennis
_SHORT = 3  # a word this short is left alone: gas, bus, yes


def singular(word: str) -> str:
    """A plural word as its singular, by a few simple rules (and a short list of irregular ones); any other word as it is."""
    if word in _IRREGULAR:
        return _IRREGULAR[word]
    if len(word) <= _SHORT or not word.endswith("s") or word.endswith(_NOT_PLURAL):
        return word
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("oes") and len(word) > 4 and word not in _OES_AS_IS:
        return word[:-2]
    if word.endswith(_ES):
        return word[:-2]
    return word[:-1]


def spoken(name: str) -> list[str]:
    """The words of a name as written, in order and lower case: letters and digits make a word; anything else separates
    words, and an apostrophe is dropped ("child's" is "childs")."""
    return _PART.findall(name.lower().replace("'", "").replace("\u2019", ""))


def words(name: str) -> list[str]:
    """The words of a name in the order written, each as a singular."""
    return [singular(w) for w in spoken(name)]


@lru_cache(maxsize=1 << 16)
def key(name: str) -> str:
    """The name's key: its words, each once, in alphabetical order, one space between; empty when the name has no word."""
    return " ".join(sorted(set(words(name))))
