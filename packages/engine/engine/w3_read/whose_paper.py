"""N9 — whose paper is it: the proof, beside an answer's photograph, that the page belongs to the child its answer is
filed under (goals/chk_whose_paper.yaml). Nimish, 2026-10-23: "this paper is for this child. Otherwise it's very hard for
me to even understand whether you are capturing the right image."

Code decides, never a model: which copy of which scan file the page is, how many pages that copy has, the code printed on
the page, and two checks. A page whose picture is the same, byte for byte, as a page of another child's copy cut from the
same scan file is a repeated photograph; a page whose printed code is another child's copy is on the wrong child.
Either puts a notice on the answer, and a person chooses (`choose`) before it can be confirmed. The choice that stands is
the capture's own, page by page (`capture.page_choices`); a changed mind replaces it there, and every choice is kept in
the one history log (CP-27 3C).
"""

import json
import re
from pathlib import Path

import pymupdf

from engine.core import history
from engine.w3_read import render_pdf, same_page, sorting

COPY = re.compile(r"^copy(\d+)-")
OURS = re.compile(r"^CS[0-9A-F]{6}$")  # a code this school prints on a child's own paper
SAME = "same_picture"
WRONG = "wrong_code"


def copy_of(path: str) -> tuple[str, int | None]:
    """(the scan file's folder, the copy's number in it): `copies._cut` names a cut `copy06-p1-CS1A2B3C.pdf` inside
    a folder named for the scan."""
    p = Path(path)
    m = COPY.match(p.name)
    return str(p.parent), int(m.group(1)) if m else None


def _told(path, page_no: int) -> tuple[str, str | None] | None:
    """(the page's picture as `same_page.fingerprint` gives it, the code printed on it as `sorting.qr_of` reads it), from
    one drawing of the photograph; None where the file or page is not there, or cannot be drawn. The same photograph put
    in two copies gives the same fingerprint; two photographs of one paper never do."""
    full = Path(path).expanduser()
    if not full.exists():
        return None
    try:
        with pymupdf.open(full) as doc:
            if not 1 <= page_no <= len(doc):
                return None
    except pymupdf.FileDataError:
        return None
    img = render_pdf.photo(full, page_no)[0]
    return None if img is None else (same_page.fingerprint(img), sorting.qr_of(img))


def record(conn, capture_id) -> int:
    """Every page of a capture not told yet drawn once, told and kept, as its file is read (`legacy.import_scan`), so
    its cards read whose paper it is from rows. A page once told is never changed (the database refuses it). Returns
    how many pages it told."""
    cap = conn.execute("select path, pages from capture where id = %s", (capture_id,)).fetchone()
    if not cap:
        return 0
    told, n = same_page.told(conn, [capture_id]), 0
    for page in range(1, (cap["pages"] or 0) + 1):
        if (str(capture_id), page) in told or (fact := _told(cap["path"], page)) is None:
            continue
        conn.execute(
            "update capture set page_prints = page_prints || jsonb_build_object(%s::text,"
            " jsonb_build_object('print', %s::text, 'code', %s::text)) where id = %s and not page_prints ? %s::text",
            (page, *fact, capture_id, str(page)),
        )
        n += 1
    return n


def tell_untold(conn, ids: list | None = None) -> int:
    """Every live capture (or those named) with a page not told yet, told (`record`): the files read before every read
    told its pages, once (`engine read tell-pages`, run by each engine deploy). Returns how many pages it told."""
    named = "" if ids is None else " and c.id = any(%s::uuid[])"
    rows = conn.execute(
        "select id from capture c where c.superseded_by is null"
        " and (select count(*) from jsonb_object_keys(c.page_prints)) < coalesce(c.pages, 0)" + named,
        () if ids is None else ([str(i) for i in ids],),
    ).fetchall()
    return sum(record(conn, r["id"]) for r in rows)


def verdict(code, filed_code, same_as: list[int]) -> dict | None:
    """The problem on a page, in plain words, or None. `same_as`: the other copies (numbers) whose page has this
    picture. A code that is not one of this school's child codes (a library worksheet's) proves nothing either way."""
    if same_as:
        which = ", ".join(map(str, same_as))
        return {
            "kind": SAME,
            "text": f"This page is the same picture as a page of copy {which} in this file, which is filed under another child.",
        }
    if code and OURS.match(code) and filed_code and OURS.match(filed_code) and code != filed_code:
        return {
            "kind": WRONG,
            "text": f"The code printed on this page is {code}, which is not this child's paper ({filed_code}).",
        }
    return None


def _siblings(conn, folder: str, capture_id) -> list[dict]:
    return conn.execute(
        "select c.id, c.path, c.pages, si.child_id from capture c join sheet_instance si on si.id = c.sheet_instance_id"
        " where c.superseded_by is null and c.id <> %s and c.path like %s",
        (capture_id, folder.replace("%", r"\%").replace("_", r"\_") + "/%"),
    ).fetchall()


def proof(conn, capture_id, file_page: int) -> dict | None:
    """What a card prints beside the photograph: the scan file, the copy and its place in the file, the page of the copy,
    the code read off the page, the code the child's paper was printed with, the notice if any, and a person's latest
    choice on it. None where there is no such capture."""
    cap = conn.execute(
        "select c.path, c.pages, c.qr_read, c.page_choices -> %s::text as chose, si.qr_code, si.child_id from capture c"
        " join sheet_instance si on si.id = c.sheet_instance_id where c.id = %s",
        (file_page, capture_id),
    ).fetchone()
    if not cap:
        return None
    folder, k = copy_of(cap["path"])
    sibs = _siblings(conn, folder, capture_id)
    nums = [n for s in sibs if (n := copy_of(s["path"])[1])] + ([k] if k else [])
    others = [s for s in sibs if s["child_id"] != cap["child_id"] and copy_of(s["path"])[1]]
    told = same_page.told(conn, [capture_id, *(s["id"] for s in others)])  # rows only: a card never draws
    mine, code = told.get((str(capture_id), file_page), (None, None))
    same_as = sorted({
        n for s in others if (n := copy_of(s["path"])[1])
        and any(told.get((str(s["id"]), q), (None,))[0] == mine for q in range(1, (s["pages"] or 0) + 1))
    }) if mine else []  # fmt: skip
    problem = verdict(code, cap["qr_code"], same_as)
    chose = cap["chose"]
    return {"scan": Path(folder).name, "copy": k, "copies": max(nums) if nums else None, "page": file_page,
            "pages": cap["pages"], "code": code, "printed_with": cap["qr_code"], "problem": problem,
            "choice": chose["choice"] if chose else None, "chosen_by": chose["by"] if chose else None}  # fmt: skip


def may_confirm(p: dict | None) -> bool:
    """A person may say Yes to an answer on this page unless it has a notice and nobody has said it is the child's."""
    return not p or not p["problem"] or p["choice"] == "theirs"


def choose(conn, capture_id, file_page: int, choice: str, by: str) -> dict:
    """A person's choice on a page with a notice: the page's choice on its capture, the change kept. Refused where the
    page has no notice."""
    if choice not in ("theirs", "not_theirs"):
        raise ValueError("the choice is 'theirs' or 'not_theirs'")
    p = proof(conn, capture_id, file_page)
    if not p or not p["problem"]:
        raise ValueError("this page has no notice to choose on")
    page = str(file_page)
    now = {"problem": p["problem"]["kind"], "choice": choice, "by": by}
    row = conn.execute(
        "update capture c set page_choices = coalesce(c.page_choices, '{}') || jsonb_build_object(%s::text,"
        " %s::jsonb || jsonb_build_object('at', clock_timestamp())), updated_at = now() from capture was"
        " where c.id = %s and was.id = c.id returning c.tenant_id, was.page_choices -> %s::text as was,"
        " c.page_choices -> %s::text as now",
        (page, json.dumps(now), capture_id, page, page),
    ).fetchone()
    history.keep(
        conn,
        row["tenant_id"],
        ("capture", str(capture_id), "choose_page"),
        {page: row["was"]} if row["was"] else None,
        {page: row["now"]},
        by,
    )
    after = proof(conn, capture_id, file_page)
    if after is None:
        raise ValueError("no such capture")
    return after
