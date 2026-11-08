"""CP-17 item 3: for any item (the default), a record can be made of stock received, issued to a class, returned to the
store, counted or written off; each keeps the item, the number, the place (the store or a class), who and when; stock
on hand in each place is worked out from the records (`stock_on_hand`); records cannot be changed or deleted, and a
correction is a new record. Rows are fake and rolled back."""

import psycopg
import pytest

from cp17_world import conn, get_config, item, move, on_hand, refused, school, set_config, staff  # noqa: F401


@pytest.fixture
def recorder(conn, school):
    set_config(conn, school["t"], "inventory.record_roles", ["ops"])
    return staff(conn, school, "ops")


def test_3_by_default_every_item_may_have_records(conn, school):
    missing = conn.execute(
        "select count(*) as n from tenant t where not exists (select 1 from config c where c.tenant_id = t.id"
        " and c.key = 'inventory.record_items')"
    ).fetchone()["n"]
    assert missing == 0, f"{missing} schools have no inventory.record_items setting"
    assert get_config(conn, school["t"], "inventory.record_items") == "all"


def test_3_each_kind_moves_stock_between_store_and_class(conn, school, recorder):
    t, a = school["t"], school["class"]
    code = item(conn, school)  # no rupee value: not tracked, and still recorded by default
    move(conn, school, code, "received", recorder, quantity=10)
    assert on_hand(conn, t, code) == {None: 10}
    move(conn, school, code, "issued", recorder, quantity=4, klass=a)
    assert on_hand(conn, t, code) == {None: 6, a: 4}
    move(conn, school, code, "returned", recorder, quantity=1, klass=a)
    assert on_hand(conn, t, code) == {None: 7, a: 3}
    move(conn, school, code, "written_off", recorder, quantity=2, klass=a, reason="broken in class")
    assert on_hand(conn, t, code) == {None: 7, a: 1}
    counted = move(conn, school, code, "counted", recorder, counted=5, reason="store count found two fewer")
    assert counted["counted_change"] == -2 and counted["quantity"] is None
    assert on_hand(conn, t, code) == {None: 5, a: 1}
    move(conn, school, code, "received", recorder, quantity=2, klass=a)
    assert on_hand(conn, t, code) == {None: 5, a: 3}


def test_3_a_record_keeps_item_number_place_who_and_when(conn, school, recorder):
    code = item(conn, school)
    move(conn, school, code, "received", recorder, quantity=3)
    row = move(conn, school, code, "issued", recorder, quantity=2, klass=school["class"])
    assert (row["material_code"], row["kind"], row["quantity"], row["class_id"], row["who"]) == \
        (code, "issued", 2, school["class"], recorder)
    assert row["at"] is not None and row["tenant_id"] == school["t"]


def test_3_records_cannot_be_changed_or_deleted_and_a_correction_is_a_new_record(conn, school, recorder):
    t = school["t"]
    code = item(conn, school)
    row = move(conn, school, code, "received", recorder, quantity=8)
    refused(conn, "update stock_move set quantity = 5 where id = %s", (row["id"],))
    refused(conn, "delete from stock_move where id = %s", (row["id"],))
    assert on_hand(conn, t, code) == {None: 8}
    move(conn, school, code, "counted", recorder, counted=5, reason="received 5, not 8: entered wrongly")
    assert on_hand(conn, t, code) == {None: 5}
    n = conn.execute("select count(*) as n from stock_move where tenant_id = %s and material_code = %s",
                     (t, code)).fetchone()["n"]
    assert n == 2, "the wrong record and its correction are both kept"


def test_3_the_services_cannot_empty_the_records(conn, school, recorder):
    code = item(conn, school)
    move(conn, school, code, "received", recorder, quantity=1)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with conn.transaction():
            conn.execute("set local role app_engine")
            conn.execute("truncate stock_move")
