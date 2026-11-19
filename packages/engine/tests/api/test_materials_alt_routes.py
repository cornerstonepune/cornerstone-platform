"""CP-85, the route `POST /materials/list/swap` (engine/api/routes/materials.py): the educator who holds the class swaps a line of a group of
alternatives to another of them. The website's calls run on the test's own transaction, rolled back; the rows are placeholders."""

import os

import pytest

from tests import materials_rows as m
from tests.api import test_materials_routes as routes

engine, H, _flag, _build = (
    routes.engine,
    routes.H,
    routes._flag,
    routes._build,
)  # the educator routes' own fixture and calls
pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


def _plan(conn, s):
    """The first activity asks for pencils or crayons (one group) and paper; it is planned on Monday."""
    a = s["acts"][0]
    pencils, crayons, paper = (m.item(conn, s, w) for w in ("Pencils", "Crayons", "Paper"))
    m.needs(conn, s, a, pencils, 10, ord_=1, alt=1)
    m.needs(conn, s, a, crayons, 12, ord_=2, alt=1)
    m.needs(conn, s, a, paper, 3, ord_=3)
    m.planned(conn, s, m.MON, a)
    return pencils, crayons, paper


def _swap(client, s, line, code, actor=None):
    return client.post(
        "/materials/list/swap",
        headers=H,
        json={"actor": actor or s["email"], "line_id": str(line), "material_code": code},
    )


def _lines(built):
    return {ln["material_code"]: ln for g in built["groups"] for ln in g["lines"]}


def test_the_swap_route_swaps_a_line_to_its_alternative_and_the_list_then_reads_that_one(engine):
    client, conn, s = engine
    _flag(conn, s)
    pencils, crayons, paper = _plan(conn, s)
    built = _build(client, s).json()
    line = _lines(built)[pencils]
    assert [a["code"] for a in line["alternatives"]] == [crayons]
    got = _swap(client, s, line["line_id"], crayons)
    assert got.status_code == 200, got.text
    body = got.json()
    assert (body["line_id"], body["material_code"], body["item"]) == (
        line["line_id"],
        crayons,
        conn.execute("select name from material_item where code = %s", (crayons,)).fetchone()["name"],
    )
    assert [a["code"] for a in body["alternatives"]] == [pencils]
    after = client.post(
        "/materials/read",
        headers=H,
        json={"actor": s["email"], "list_id": built["list_id"], "group_by": "week"},
    ).json()
    assert set(_lines(after)) == {crayons, paper} and _lines(after)[crayons]["quantity"] == 12
    assert set(_lines(_build(client, s).json())) == {crayons, paper}, "a rebuild keeps her choice"


def test_the_swap_route_refuses_what_is_not_hers_not_an_alternative_a_removed_line_and_a_second_line(engine):
    client, conn, s = engine
    _flag(conn, s)
    pencils, crayons, paper = _plan(conn, s)
    line = _lines(_build(client, s).json())[pencils]["line_id"]
    other = conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (s["tenant"], s["campus"])
    ).fetchone()["id"]
    conn.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Placeholder Other', 'placeholder.other@example.test')",
        (s["tenant"], other),
    )
    assert _swap(client, s, line, crayons, "placeholder.other@example.test").status_code == 403
    assert _swap(client, s, "00000000-0000-0000-0000-000000000000", crayons).status_code == 404
    refused = _swap(client, s, line, paper)
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "That is not one of this line's alternatives.",
    )
    m.planned(
        conn, s, m.MON, s["acts"][1]
    )  # another activity asks for the crayons on their own: a line of their own exists
    m.needs(conn, s, s["acts"][1], crayons, 1)
    _build(client, s)
    again = _swap(client, s, line, crayons)
    assert (again.status_code, again.json()["detail"].startswith("The list has a line for that already")) == (
        409,
        True,
    )
    removed = client.post(
        "/materials/line/remove", headers=H, json={"actor": s["email"], "line_id": str(line)}
    )
    gone = _swap(client, s, line, crayons)
    assert (removed.status_code, gone.status_code, gone.json()["detail"]) == (
        200,
        409,
        "That line was removed: add it back first.",
    )
    _flag(conn, s, False)
    assert _swap(client, s, line, crayons).status_code == 403, (
        "off while the screens are off, like every route"
    )
