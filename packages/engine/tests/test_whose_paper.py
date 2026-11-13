"""Whose paper is it (`w3_read/whose_paper.py`, goals/chk_whose_paper.yaml): beside an answer's photograph, the copy and
page it is and the code printed on it; and a notice, worked out by code, where the same picture sits on two children's
copies of one scan file or a page carries another child's code — Yes is not allowed on it until a person chooses.
Nimish, 2026-10-23: "I think we should have a very clear mechanism for marking this per child.\""""

import io

import pymupdf
import pytest
import segno

from engine.core import db, history
from engine.w3_read import whose_paper as W
from tests import rows


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _png(text, size=300):
    buf = io.BytesIO()
    segno.make(text, error="h").save(buf, kind="png", scale=max(4, size // 33), border=4)
    return buf.getvalue()


def _pdf(path, pages):
    """A scan: one photograph per page, each a QR of the text given for it."""
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_image(page.rect, stream=_png(text))
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)
    return path


def _copy(conn, folder, k, code, pages, texts, section="TESTWHOSE", told=True):
    """A child, their paper printed with `code`, and the copy `k` of the scan cut from `texts`: read, so its pages are
    told as a read tells them (`legacy.import_scan`), unless `told` is False (a file read before pages were told)."""
    tenant = conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]
    child = rows.a_child_in(conn, section, "G1", str(k), tenant)
    template = conn.execute(
        "insert into sheet_template (tenant_id, band, week) values (%s,'G1','2026-09-28') returning id",
        (tenant,),
    ).fetchone()["id"]
    sheet = conn.execute(
        "insert into sheet_instance (tenant_id, sheet_template_id, child_id, qr_code) values (%s,%s,%s,%s) returning id",
        (tenant, template, child, code),
    ).fetchone()["id"]
    path = _pdf(folder / f"copy{k:02d}-p1-{code}.pdf", texts)
    capture = conn.execute(
        "insert into capture (tenant_id, path, pages, sheet_instance_id, qr_read) values (%s,%s,%s,%s,%s) returning id",
        (tenant, str(path), pages, sheet, code),
    ).fetchone()["id"]
    if told:
        W.record(conn, capture)
    return capture


def test_a_page_says_which_copy_of_the_file_and_which_page_of_the_copy_it_is(conn, tmp_path):
    folder = tmp_path / "scan-a"
    a = _copy(conn, folder, 1, "CS1A2B3C", 2, ["CS1A2B3C", "page two of one"])
    _copy(conn, folder, 6, "CS4D5E6F", 1, ["CS4D5E6F"])
    p = W.proof(conn, a, 2)
    assert (p["scan"], p["copy"], p["copies"], p["page"], p["pages"]) == ("scan-a", 1, 6, 2, 2)
    assert p["printed_with"] == "CS1A2B3C" and p["problem"] is None and W.may_confirm(p)


def test_the_code_is_read_off_the_page_itself(conn, tmp_path):
    a = _copy(conn, tmp_path / "scan-b", 3, "CS000003", 1, ["CS000003"])
    assert W.proof(conn, a, 1)["code"] == "CS000003"


def test_the_same_picture_on_two_childrens_copies_is_a_notice_and_yes_waits_for_a_person(conn, tmp_path):
    folder = tmp_path / "scan-c"
    a = _copy(conn, folder, 1, "CS00000A", 1, ["CS00000A"])
    b = _copy(conn, folder, 2, "CS00000B", 1, ["CS00000A"])  # copy 2 holds copy 1's photograph
    p = W.proof(conn, b, 1)
    assert p["problem"]["kind"] == W.SAME and "copy 1" in p["problem"]["text"]
    assert not W.may_confirm(p)
    assert W.proof(conn, a, 1)["problem"]["kind"] == W.SAME  # and copy 1 says so of copy 2
    assert W.may_confirm(W.choose(conn, b, 1, "theirs", "Aseem"))
    assert not W.may_confirm(
        W.choose(conn, b, 1, "not_theirs", "Aseem")
    )  # a changed mind stands in its place, and the first choice is kept in the history log
    kept = history.of(conn, "capture", str(b))
    assert [(h["op"], h["origin"]) for h in kept] == [("choose_page", "Aseem")] * 2
    assert [h["after"]["1"]["choice"] for h in kept] == ["theirs", "not_theirs"]
    assert kept[0]["before"] is None and kept[1]["before"]["1"]["choice"] == "theirs"


def test_a_choice_is_the_pages_own_and_another_page_of_the_copy_still_waits(conn, tmp_path):
    folder = tmp_path / "scan-e"
    _copy(conn, folder, 1, "CS00000A", 2, ["CS00000A", "page two of copy one"])
    b = _copy(
        conn, folder, 2, "CS00000B", 2, ["CS00000A", "page two of copy one"]
    )  # both pages copy 1's photographs
    assert not W.may_confirm(W.proof(conn, b, 1)) and not W.may_confirm(W.proof(conn, b, 2))
    chosen = W.choose(conn, b, 2, "theirs", "Aseem")
    assert W.may_confirm(chosen) and chosen["chosen_by"] == "Aseem"
    assert not W.may_confirm(W.proof(conn, b, 1)), "page 1 has no choice yet"
    assert W.proof(conn, b, 1)["choice"] is None


def test_a_page_with_another_childs_code_is_a_notice(conn, tmp_path):
    a = _copy(conn, tmp_path / "scan-d", 1, "CS00000A", 1, ["CS00000F"])
    p = W.proof(conn, a, 1)
    assert p["problem"]["kind"] == W.WRONG and "CS00000F" in p["problem"]["text"]


def test_two_photographs_of_different_pages_are_no_notice(conn, tmp_path):
    folder = tmp_path / "scan-e"
    _copy(conn, folder, 1, "CS00000A", 1, ["CS00000A"])
    b = _copy(conn, folder, 2, "CS00000B", 1, ["CS00000B"])
    assert W.proof(conn, b, 1)["problem"] is None


def test_a_choice_needs_a_notice_and_a_known_word(conn, tmp_path):
    a = _copy(conn, tmp_path / "scan-f", 1, "CS00000A", 1, ["CS00000A"])
    with pytest.raises(ValueError, match="no notice"):
        W.choose(conn, a, 1, "theirs", "Aseem")
    with pytest.raises(ValueError, match="theirs"):
        W.choose(conn, a, 1, "maybe", "Aseem")


def test_a_worksheets_own_code_is_not_a_wrong_child():
    assert W.verdict("R8-H02", "CS00000A", []) is None
    assert W.verdict(None, "CS00000A", []) is None
    assert W.verdict("CS00000A", "CS00000A", []) is None


def test_a_page_is_told_once_and_the_card_never_draws_a_photograph_again(conn, tmp_path, monkeypatch):
    """Nimish, 2026-10-26: "Once I click what the child has written, it literally takes a few seconds to go to the next
    one." Every card drew the photograph of every page of every copy in its file to tell whose paper it is: about half a
    second a page. A page's picture and printed code are facts of a file that never changes, told once (`record`) and
    kept as rows; a card reads the rows."""
    folder = tmp_path / "scan-g"
    a = _copy(conn, folder, 1, "CS00000A", 2, ["CS00000A", "page two"])
    b = _copy(
        conn, folder, 2, "CS00000B", 2, ["CS00000A", "page two of b"]
    )  # copy 2's page 1 is copy 1's photograph
    W.record(conn, a)
    W.record(conn, b)
    told = conn.execute(
        "select count(*) n from capture c, jsonb_object_keys(c.page_prints) p where c.id in (%s, %s)", (a, b)
    ).fetchone()["n"]
    assert told == 4

    def drawn(*_args, **_kw):
        raise AssertionError("a card drew a photograph its rows already tell")

    monkeypatch.setattr(W.render_pdf, "photo", drawn)
    p = W.proof(conn, b, 1)
    assert p["problem"]["kind"] == W.SAME and p["code"] == "CS00000A"
    assert W.proof(conn, a, 2)["problem"] is None


def _never_drawn(monkeypatch):
    def drawn(*_args, **_kw):
        raise AssertionError("a card drew a photograph")

    monkeypatch.setattr(W.render_pdf, "photo", drawn)


def test_a_card_never_draws_a_photograph_even_of_a_page_not_yet_told(conn, tmp_path, monkeypatch):
    """The paper screen's GET took 3.6 s on CI (p6, 13 Nov 2026): a page not told yet was told on its first card, by
    drawing it and every page of every other copy in its file, during the request. A card reads rows and nothing else;
    a page not told is shown with no code and no notice until it is told (`record`, `tell_untold`)."""
    folder = tmp_path / "scan-h"
    a = _copy(conn, folder, 1, "CS00000A", 1, ["CS00000A"], told=False)
    _copy(conn, folder, 2, "CS00000B", 2, ["CS00000A", "page two of b"], told=False)
    _never_drawn(monkeypatch)
    p = W.proof(conn, a, 1)
    assert (p["code"], p["problem"], p["copies"]) == (None, None, 2)
    left = conn.execute("select page_prints from capture where id = %s", (a,)).fetchone()["page_prints"]
    assert left == {}, "a GET wrote nothing"


def test_the_pages_not_yet_told_are_told_once_by_the_engine_as_its_own_role(conn, tmp_path, monkeypatch):
    """Files read before every read told its pages are told once (`engine read tell-pages`, run by each engine deploy),
    as `app_engine`, which may add a page's telling and nothing more; told twice, nothing is drawn again."""
    folder = tmp_path / "scan-i"
    a = _copy(conn, folder, 1, "CS00000A", 1, ["CS00000A"], told=False)
    b = _copy(conn, folder, 2, "CS00000B", 2, ["CS00000A", "page two of b"], told=False)
    conn.execute("set role app_engine")
    try:
        assert W.tell_untold(conn, [a, b]) == 3
        _never_drawn(monkeypatch)
        assert W.tell_untold(conn, [a, b]) == 0
        p = W.proof(conn, b, 1)
    finally:
        conn.execute("reset role")
    assert p["code"] == "CS00000A" and p["problem"]["kind"] == W.SAME
