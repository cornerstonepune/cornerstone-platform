#!/usr/bin/env python3
"""Imports Cambridge Primary curriculum frameworks as statements for the curriculum crosswalk (ADR 0041): each
learning objective with its code, stage, strand, sub-strand, page and text, word for word.

The copies read are recorded in docs/crosswalk/sources.json with their address and fingerprint, and a copy whose
fingerprint differs is refused. Until the school's own copies come from the Cambridge School Support Hub, these are
copies of Cambridge's publications hosted by other schools (Nimish, 28 Sep: "start building ... even if they are not
from the Cambridge official website ... we can just compare once I have the real documents"). Every statement is
found again, word for word, on its page before anything is written. No model is called.

python3 research/crosswalk_cambridge.py      # exit 1 if a copy differs or a statement is not on its page
"""

import json
import re
import sys
from pathlib import Path

R = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(R / "packages/engine"))
from engine.core import (
    cambridge,
)
from engine.core.cambridge import (  # noqa: F401 — the other research files import these from here
    fingerprint,
    index,
    norm,
    whole,
)

DATA = R / "data/crosswalk_sources"
SOURCES = R / "docs/crosswalk/sources.json"
# Cambridge's words stay out of this public repository: they are copied for the school's own use only ("Registered
# centres are permitted to copy material from this booklet for their own internal use"). The tracked index keeps each
# statement's code, place and a fingerprint of its words; the words are rebuilt here from the recorded copy.
OUT = R / "docs/crosswalk/statements"
WORDS = R / "data/crosswalk_statements"


def fetch(source):
    """The copy the import read, downloaded if missing; refused if its fingerprint is not the recorded one."""
    return cambridge.fetch(source, DATA)


def read(source, path=None):
    """Every learning objective in one framework (engine/core/cambridge.py), in the recorded copy, or in another file of
    the same framework (the official copy, to compare)."""
    return cambridge.read(source, path or fetch(source))


def words(framework):
    """The statements of one framework with their words, as the importer read them into data/."""
    path = WORDS / f"{framework.lower()}.json"
    if not path.exists():
        raise SystemExit(
            f"{path.relative_to(R)} is missing: run python3 research/crosswalk_cambridge.py first"
        )
    return json.loads(path.read_text())


def main():
    sources = json.loads(SOURCES.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    WORDS.mkdir(parents=True, exist_ok=True)
    bad = False
    for source in sources:
        if source.get("reader") != "cambridge_primary":
            continue
        rows, notes, missing, orphans = read(source)
        codes = [r["code"] for r in rows]
        dupes = sorted({c for c in codes if codes.count(c) > 1})
        unnamed = sorted({r["code"] for r in rows if not r["substrand"]})
        unended = [
            r["code"]
            for r in rows
            if r["stage"] and not re.search(r"[.?!)”’\"…]$", whole(r))
        ]
        # a stem that introduces a list ("Understand addition as:") must have brought its list with it
        cut = [r["code"] for r in rows if r["text"].endswith(":") and not r["items"]]
        names = {}
        for r in rows:
            if r["stage"]:
                names.setdefault((r["strand"], r["substrand_letter"]), set()).add(
                    r["substrand"]
                )
        renamed = sorted(
            f"{k[0]} {k[1]}: {sorted(v)}" for k, v in names.items() if len(v) > 1
        )
        out = OUT / f"{source['framework'].lower()}.json"
        book = {
            "framework": source["framework"],
            "sha256": source["sha256"],
            "objectives": rows,
            "notes": notes,
        }
        (WORDS / out.name).write_text(
            json.dumps(book, ensure_ascii=False, indent=1) + "\n"
        )
        public = dict(
            book, objectives=[index(r) for r in rows], notes=[index(n) for n in notes]
        )
        out.write_text(json.dumps(public, ensure_ascii=False, indent=1) + "\n")
        stages = sorted({r["stage"] for r in rows if r["stage"]})
        print(
            f"{source['framework']}: {len(rows)} objectives, stages {stages}, "
            f"{len(rows) - len(missing)}/{len(rows)} found word for word on their page, {len(notes)} notes "
            f"-> {out.relative_to(R)}"
        )
        checks = (
            ("not on their page", missing),
            ("twice", dupes),
            ("no sub-strand", unnamed),
            ("a sub-strand letter with two names", renamed),
            ("a list introduced but not found", cut),
            ("text on an objectives page that follows no objective", orphans),
            ("not ending a sentence", unended),
        )
        for label, items in checks:
            if items:
                print(f"  {label}: {len(items)}, e.g. {items[:6]}")
        bad = bad or bool(missing or dupes or unnamed or renamed or cut or orphans)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
