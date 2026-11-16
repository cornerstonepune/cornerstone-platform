"""Reads a Cambridge Primary curriculum framework's PDF into its statements, word for word (ADR 0041, CP-54).

The one reader: research/crosswalk_cambridge.py (the import that builds docs/crosswalk) and `engine frameworks
cambridge-words` (which puts the words in the private database) both use it. Cambridge's words are for the school's
own use, not this public repository, so nothing here writes them to a file in git or prints them; a statement's
`fingerprint` is what the tracked index and the database keep to prove a reading is the same words. No model is called.
"""

import hashlib
import http.client
import re
import time
import urllib.request
from pathlib import Path
from typing import Any

import pymupdf

Row = dict[str, Any]
Block = tuple[int, float, str, str]  # column, y, kind, text
WAITS = (2, 4, 8, 16)  # seconds before each repeated request: a public server drops a connection now and then


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(source: Row, folder: Path) -> Path:
    """The copy the import read, downloaded into `folder` if missing; refused if its fingerprint is not the recorded one."""
    path = folder / source["file"]
    if not path.exists():
        folder.mkdir(parents=True, exist_ok=True)
        for n, wait in enumerate((*WAITS, None), 1):
            try:
                req = urllib.request.Request(source["url"], headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    path.write_bytes(r.read())
                break
            except (OSError, http.client.HTTPException) as e:
                if wait is None:
                    raise SystemExit(f"{source['url']} could not be downloaded in {n} attempts: {e}") from e
                time.sleep(wait)
    if (got := sha256(path)) != source["sha256"]:
        raise SystemExit(
            f"{source['url']} is not the copy the import read (sha256 {got}): re-import and compare"
        )
    return path


# a learning objective's code as printed: *3Rw.01 is stage 3, strand R, sub-strand w, objective 1; the asterisk marks
# "the same learning objective" appearing "in more than one stage" (English 0058, page 15). Science in Context has no
# sub-strand: 1SIC.01.
CODE = re.compile(r"(?:^|(?<=\s))•?\s*(\*?)(\d)([A-Z]+)([a-z]{0,2})\.(\d{2})\s+")
# page furniture, and the per-stage list of the ways of working (TWM.01 Specialising), recorded once from their own page
# a code as a plain reading of any page shows it, followed by its objective; not an example ("e.g. 5Bs.01")
PRINTED = re.compile(r"(?<!e\.g\.)[\s•*](\d[A-Z]+[a-z]{0,2}\.\d{2})(?=\s)")
FURNITURE = re.compile(
    r"Back to contents page|Curriculum Framework|^\d+$|www\.cambridgeinternational\.org|^Stage \d$|^•?\s*[A-Z]+\.\d{2}\s"
)


def joined(text: str) -> str:
    """A hyphen at the end of a line is the word's own ("non-fiction", "multi-clause"): keep it, drop the break."""
    return re.sub(r"-[ \t]*\n\s*", "-", text)


def norm(text: str) -> str:
    """Whitespace-insensitive text; Word's space before a comma or full stop after a fraction dropped."""
    return re.sub(r" ([,.;])", r"\1", " ".join(joined(text).split()))


def on(text: str, page_text: str) -> bool:
    """Found word for word in a plain reading of the page, where a stacked fraction 1/2 reads as its two numbers."""
    return norm(text) in page_text or norm(re.sub(r"(\d+)/(\d+)", r"\1 \2", text)) in page_text


def bold(span: Row) -> bool:
    return bool(span["flags"] & 16) or "Bold" in span["font"]


def stacked(a: Row, b: Row) -> bool:
    """A fraction as Word sets it: a small numerator, then a small denominator straight below it."""
    small = [s["size"] < 9.5 and s["text"].strip().isdigit() for s in (a, b)]
    return all(small) and abs(a["bbox"][0] - b["bbox"][0]) < 2 and b["bbox"][1] > a["bbox"][1] + 4


def spans_text(block: Row) -> str:
    """A block's text, line by line, with a stacked fraction written 1/2 and a sub-list's "o" bullet written ◦."""
    # (span, whether it opens a line after the first)
    spans = [
        (s, j > 0 and i == 0) for j, line in enumerate(block["lines"]) for i, s in enumerate(line["spans"])
    ]
    out: list[str] = []
    i = 0
    while i < len(spans):
        (s, new_line), nxt = spans[i], spans[i + 1][0] if i + 1 < len(spans) else None
        out.append("\n" if new_line else "")
        if nxt and stacked(s, nxt):
            out.append(f" {s['text'].strip()}/{nxt['text'].strip()} ")
            i += 2
            continue
        bullet = s["text"].strip() == "o" and "Courier" in s["font"]
        out.append("◦ " if bullet else s["text"])
        i += 1
    return "".join(out)


def titles(text: str, strands: dict[str, str]) -> bool:
    """True for a strand's own title, or the titles of both columns in one line ("Reading Writing"): not a sub-strand."""
    for name in sorted(strands.values(), key=len, reverse=True):
        text = text.replace(name, "")
    return not text.strip()


def blocks(page: Any) -> list[Block]:
    """(column, y, kind, text) for every block of a page: objectives (they start with a code), headings (all bold),
    and the rest, which continue the objective above them (a wrapped line, a sub-list)."""
    mid = page.rect.width / 2
    out: list[Block] = []
    for block in page.get_text("dict")["blocks"]:
        spans = [s for line in block.get("lines", []) for s in line["spans"] if s["text"].strip()]
        flat = " " + norm(spans_text(block)) if spans else ""
        if not flat.strip() or FURNITURE.search(flat.strip()):
            continue
        x0, y0, *_ = block["bbox"]
        kind = "objective" if CODE.search(flat) else "heading" if all(map(bold, spans)) else "more"
        out.append((int(x0 > mid), y0, kind, flat))
    return out


def _starts(found: list[Block], number: int, strands: dict[str, str]) -> list[Row]:
    """The objectives that begin in the page's blocks, each under the nearest heading above it in its column."""
    rows: list[Row] = []
    for column, y0, kind, flat in found:
        if kind != "objective":
            continue
        above = [
            f
            for f in found
            if f[0] == column and f[1] < y0 and f[2] == "heading" and not titles(f[3], strands)
        ]
        marks = list(CODE.finditer(flat))
        for m, nxt in zip(marks, marks[1:] + [None], strict=True):
            star, stage, strand, sub, n = m.groups()
            stem, *items = flat[m.end() : nxt.start() if nxt else len(flat)].removeprefix("•").split("◦")
            rows.append(
                {
                    "code": f"{stage}{strand}{sub}.{n}",
                    "repeats_across_stages": bool(star),
                    "stage": int(stage),
                    "strand": strands[strand],
                    "substrand_letter": sub,
                    "substrand": (max(above, key=lambda h: h[1])[3].strip() if above else None)
                    if sub
                    else strands[strand],
                    "text": stem.strip().removeprefix("•").strip(),
                    "items": [i.strip() for i in items],
                    "pdf_page": number,
                    "_at": (column, y0),
                }
            )
    return rows


def _carry_on(row: Row, flat: str) -> None:
    """A block that continues the objective above it: more of its list, the rest of its last item, or more of its stem."""
    if flat.strip().startswith("◦"):
        row["items"] += [i.strip() for i in flat.split("◦")[1:]]
    elif row["items"]:
        row["items"][-1] += " " + flat.strip()
    else:
        row["text"] += " " + flat.strip()


def _alone(
    found: list[Block], column: int, y0: float, flat: str, number: int
) -> tuple[Row | None, str | None]:
    """A block with no objective above it in its column: a note set straight under a heading, else text that follows none."""
    above = [f for f in found if f[0] == column and f[1] < y0]
    head = max(above, key=lambda f: f[1]) if above else None
    if head and head[2] == "heading":
        return {"substrand": head[3].strip(), "text": flat.strip(), "pdf_page": number}, None
    return None, flat.strip()


def objectives(page: Any, number: int, strands: dict[str, str]) -> tuple[list[Row], list[Row], list[str]]:
    """The learning objectives on one page, each under the nearest heading above it in its column, each with the
    wrapped lines and sub-list below it. Returns the rows, the notes set straight under a heading ("By end of Stage 4
    learners should have a secure understanding of phonics."), and any other text that follows no objective."""
    found = blocks(page)
    rows = _starts(found, number, strands)
    notes: list[Row] = []
    orphans: list[str] = []
    for column, y0, kind, flat in found:
        if kind != "more":
            continue
        before = [r for r in rows if r["_at"][0] == column and r["_at"][1] < y0]
        if not before:
            note, orphan = _alone(found, column, y0, flat, number)
            notes += [note] if note else []
            orphans += [orphan] if orphan else []
            continue
        row = max(
            before, key=lambda r: r["_at"][1]
        )  # the last objective above: max keeps the first of equals
        _carry_on([r for r in before if r["_at"] == row["_at"]][-1], flat)
    stages = {r["stage"] for r in rows}
    for n in notes:
        n["stage"] = stages.pop() if len(stages) == 1 else None
    for r in rows:
        del r["_at"]
    return rows, notes, orphans


def characteristics(doc: Any, spec: Row, strands: dict[str, str]) -> list[Row]:
    """Ways of working that "apply to all of the primary stages" (maths: Thinking and Working Mathematically), each
    named and described once on one page; a statement with no stage."""
    flat = norm(doc[spec["pdf_page"] - 1].get_text())
    at = sorted((flat.index(name + " "), code, name) for code, name in spec["names"].items())
    ends = [a for a, *_ in at[1:]] + [flat.index(spec["ends"])]
    return [
        {
            "code": code,
            "repeats_across_stages": True,
            "stage": None,
            "strand": strands[spec["strand"]],
            "substrand_letter": "",
            "substrand": name,
            "text": flat[a + len(name) : end].strip(),
            "items": [],
            "pdf_page": spec["pdf_page"],
        }
        for (a, code, name), end in zip(at, ends, strict=True)
    ]


def read(source: Row, path: Path) -> tuple[list[Row], list[Row], list[str], list[str]]:
    """Every learning objective in one framework, checked word for word on its page, from the copy at `path`."""
    doc: Any = pymupdf.open(path)
    spec = source.get("characteristics")
    rows = characteristics(doc, spec, source["strands"]) if spec else []
    missing = [r["code"] for r in rows if not on(r["text"], norm(doc[r["pdf_page"] - 1].get_text()))]
    orphans: list[str] = []
    notes: list[Row] = []
    unread: list[str] = []
    for i, page in enumerate(doc, 1):
        found, said, loose = objectives(page, i, source["strands"])
        # a note among the objectives, not the front matter
        notes += said if found else []
        on_page = norm(page.get_text())
        # every code a plain reading of the page shows, read by the parser: nothing on a page is skipped
        unread += sorted(set(PRINTED.findall(on_page)) - {r["code"] for r in found})
        missing += [r["code"] for r in found if not all(on(t, on_page) for t in [r["text"], *r["items"]])]
        orphans += [f"p{i}: {t[:60]}" for t in loose] if found else []
        rows += found
    # a sub-strand keeps one name across stages; fill a gap from the same strand and letter elsewhere
    names: dict[tuple[str, str], str] = {}
    for r in rows:
        if r["substrand"]:
            names.setdefault((r["strand"], r["substrand_letter"]), r["substrand"])
    for r in rows:
        r["substrand"] = r["substrand"] or names.get((r["strand"], r["substrand_letter"]))
    return rows, notes, missing, orphans + [f"not read: {c}" for c in unread]


def whole(row: Row) -> str:
    """An objective as one sentence: its stem and, when it has one, its list."""
    return " ".join([row["text"], *row["items"]])


def fingerprint(row: Row) -> str:
    """sha256 of a statement's words (stem and list), whitespace-insensitive: what the tracked index keeps."""
    words = " ".join([row["text"], *row.get("items", [])])  # a note has no list
    return hashlib.sha256(norm(words).encode()).hexdigest()


def index(row: Row) -> Row:
    """A statement as the public repository keeps it: everything but the words, and their fingerprint."""
    kept = {k: v for k, v in row.items() if k not in ("text", "items")}
    return {**kept, "items": len(row.get("items", [])), "text_sha256": fingerprint(row)}
