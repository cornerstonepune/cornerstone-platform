"""N8 — a page of a paper that is another page again (goals/img_page_one_and_two_same_photo.yaml).

2026-10-23: the check screen drew a copy's page 1 and page 2 as the same photograph. Two things let it: the placing
laid a second photograph of page 1 on the page the paper had left (`placing.place` now refuses it), and the image
server answers a page the file does not have with the file's last page (`legacy.page_crop`, a single photograph IS its
paper's page however the paper numbers it). A page is told for what it is here, by its pixels (`fingerprint`), so a
reading made before the placing could refuse it is told too: `pages_of` says, for each page a capture has answers on,
whether the page is found, and in words why not. Each page's fingerprint is taken once, as its file is read, and kept
(`capture.page_prints`); the screen only reads it.
"""

import hashlib


def _cause(again: int | None) -> str:
    return (
        f"the photograph in its place is page {again} again"
        if again
        else "no photograph of it is in the file"
    )


def words(page: int, again: int | None = None) -> str:
    """Why a page is not found, said for the person who scanned it: the photograph in its place is another page again,
    or (`again` None) the file holds no photograph of it."""
    return f"page {page} not found: {_cause(again)}"


def sentence(page: int, again: int | None = None) -> str:
    """`words`, for the screen: whole sentences."""
    cause = _cause(again)
    return f"Page {page} not found. {cause[0].upper()}{cause[1:]}."


def fingerprint(image) -> str:
    """What a page image is, by its bytes: two pages with one fingerprint are one photograph."""
    return hashlib.sha256(str(image.shape).encode() + image.tobytes()).hexdigest()


def repeats(prints: dict[int, str]) -> dict[int, int]:
    """{page: the earlier page it is the same photograph as}, from each page's fingerprint."""
    first, out = {}, {}
    for page in sorted(prints):
        if prints[page] in first:
            out[page] = first[prints[page]]
        else:
            first[prints[page]] = page
    return out


def told(conn, ids: list) -> dict[tuple[str, int], tuple[str, str | None]]:
    """{(capture id, file page): (fingerprint, printed code)} for every page of the captures named that is told, read
    from the scan's `page_prints` ({file page: {print, code}}) and nothing else. A page is told as its file is read
    (`whose_paper.record`), never on a screen: a page photograph takes 0.4 to 0.5 s to decode, and the paper screen,
    which drew them on a GET, took 3.6 s on CI (p6, 13 Nov 2026)."""
    rows = conn.execute(
        "select c.id::text as capture_id, p.key::int as file_page, p.value ->> 'print' as print,"
        " p.value ->> 'code' as code from capture c cross join jsonb_each(c.page_prints) p"
        " where c.id = any(%s::uuid[])",
        ([str(c) for c in ids],),
    ).fetchall()
    return {(r["capture_id"], r["file_page"]): (r["print"], r["code"]) for r in rows}


def pages_of(conn, capture_id) -> list[dict]:
    """Every paper page a capture has answers on → {page, file_page, found, why, said}. Not found: a page whose answers say so
    (read after `placing.place` refused the photograph in its place), or a page drawn from the very same photograph as an
    earlier page of the copy (a reading made before), by the fingerprints its read kept (`told`). A page not told (the
    scan was not on this machine): found."""
    rows = conn.execute(
        "select coalesce((r.raw_read::jsonb ->> 'page')::int, (i.spec ->> 'page')::int, 1) as page,"
        " coalesce((r.raw_read::jsonb ->> 'file_page')::int, (r.raw_read::jsonb ->> 'page')::int,"
        "          (i.spec ->> 'page')::int, 1) as file_page,"
        " bool_or(r.raw_read::jsonb ->> 'page_found' = 'false') as lost"
        " from item_result r join item i on i.id = r.item_id"
        " where r.capture_id = %s and r.raw_read is not null group by 1, 2 order by 1, 2",
        (capture_id,),
    ).fetchall()
    drawn, lost = {}, set()
    for r in rows:
        drawn.setdefault(r["page"], r["file_page"])
        if r["lost"]:
            lost.add(r["page"])
    prints = {f: fp for (_, f), (fp, _) in told(conn, [capture_id]).items()}
    # a page past the file's end is drawn as its last, as the image server draws it
    last = max(prints, default=0)
    again = repeats(
        {p: fp for p, f in drawn.items() if p not in lost and (fp := prints.get(min(max(f, 1), last)))}
    )
    return [
        {
            "page": p,
            "file_page": None if p in lost else f,
            "found": p not in lost and p not in again,
            "why": words(p) if p in lost else words(p, again[p]) if p in again else None,
            "said": sentence(p) if p in lost else sentence(p, again[p]) if p in again else None,
        }
        for p, f in sorted(drawn.items())
    ]
