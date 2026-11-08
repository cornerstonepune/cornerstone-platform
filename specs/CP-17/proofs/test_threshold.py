"""CP-17 item 1: each school has a rupee threshold setting; an item is tracked when its rupee value is entered and at or
above it; an item with no value is never tracked; changing the setting changes which items are tracked, no code
change. The one rule is `public.material_is_tracked(tenant_id, material_code)` (design, "Data")."""

import uuid

from cp17_world import conn, get_config, item, refused, school, set_config  # noqa: F401  (fixtures)

KEY = "inventory.track_from_rupees"


def tracked(conn, t, code) -> bool:
    return conn.execute("select public.material_is_tracked(%s, %s) as v", (t, code)).fetchone()["v"]


def test_1_every_school_has_the_threshold_setting(conn):
    missing = conn.execute(
        "select count(*) as n from tenant t where not exists (select 1 from config c where c.tenant_id = t.id"
        " and c.key = %s and jsonb_typeof(c.value) = 'number' and (c.value)::text::numeric >= 0)",
        (KEY,),
    ).fetchone()["n"]
    assert missing == 0, f"{missing} schools have no numeric {KEY} setting"


def test_1_at_or_above_the_threshold_is_tracked_and_no_value_never(conn, school):
    t = school["t"]
    set_config(conn, t, KEY, 500)
    cheap, exact, dear, blank = item(conn, school, 499), item(conn, school, 500), item(conn, school, 501), item(conn, school)
    assert [tracked(conn, t, c) for c in (cheap, exact, dear, blank)] == [False, True, True, False]


def test_1_changing_the_setting_changes_which_items_are_tracked(conn, school):
    t = school["t"]
    set_config(conn, t, KEY, 500)
    cheap, blank = item(conn, school, 300), item(conn, school)
    assert tracked(conn, t, cheap) is False
    set_config(conn, t, KEY, 250)
    assert tracked(conn, t, cheap) is True
    set_config(conn, t, KEY, 0)
    assert tracked(conn, t, blank) is False, "an item with no rupee value entered is never tracked, whatever the setting"
    set_config(conn, t, KEY, 1000)
    assert tracked(conn, t, cheap) is False


def test_1_the_setting_is_per_school(conn, school):
    t = school["t"]
    other = conn.execute(
        "insert into tenant (slug, name) values (%s, 'Proof School') returning id", (f"cp17-{uuid.uuid4().hex[:8]}",)
    ).fetchone()["id"]
    set_config(conn, t, KEY, 500)
    set_config(conn, other, KEY, 100)
    here, there = item(conn, school, 200), item(conn, school, 200, t=other)
    assert (tracked(conn, t, here), tracked(conn, other, there)) == (False, True)


def test_1_a_missing_or_negative_setting_is_an_error_not_a_guess(conn, school):
    t = school["t"]
    code = item(conn, school, 700)
    set_config(conn, t, KEY, 500)
    assert tracked(conn, t, code) is True  # the rule exists and answers; only then is a refusal meaningful
    conn.execute("delete from config where tenant_id = %s and key = %s", (t, KEY))
    refused(conn, "select public.material_is_tracked(%s, %s)", (t, code))
    set_config(conn, t, KEY, -1)
    refused(conn, "select public.material_is_tracked(%s, %s)", (t, code))
    assert get_config(conn, t, KEY) == -1
