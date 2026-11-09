"""8: docs/athena/learnings.md has a card: a new migration is numbered just after origin/main's newest, never from a
hand-picked or clock date that sorts before it, and is checked with `bin/check --db` before pushing."""

import re
import sys
from pathlib import Path

text = Path("docs/athena/learnings.md").read_text()
cards = [c for c in re.split(r"\n(?=- )|\n\s*\n", text) if c.strip()]
want = {
    "names origin/main's newest migration": lambda c: "origin/main" in c and "newest" in c,
    "says just after it": lambda c: re.search(r"\b(after|later)\b", c),
    "rules out a hand-picked or clock date": lambda c: re.search(r"\b(clock|hand-picked|hand picked|by hand)\b", c),
    "says to run bin/check --db before pushing": lambda c: "bin/check --db" in c and re.search(r"\bpush", c),
    "is about migrations": lambda c: "migration" in c,
}
cards = [c.lower() for c in cards]
hits = [c for c in cards if all(t(c) for t in want.values())]
if not hits:
    best = max(cards, key=lambda c: sum(bool(t(c)) for t in want.values()))
    print("no card in docs/athena/learnings.md says all of:", *want, sep="\n  ")
    print("closest card misses:", [k for k, t in want.items() if not t(best)])
    sys.exit(1)
print(hits[0])
