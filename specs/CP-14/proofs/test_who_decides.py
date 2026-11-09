"""CP-14 item 4: only a coordinator or an educator can confirm or withdraw a link, and the person who loaded a list cannot
confirm its links. Which roles count is a settings row, not code.

Design §1 (decided by Nimish, 8 Nov): the decider holds an open role grant in a role the settings row
`skill_link.decider_roles` names (seeded with the coordinator and educator roles); otherwise `not a decider`. The
person who loaded the list (`skill_link.proposed_by`, from `load --by`) gets `same person` when confirming, and may
withdraw. Proven through `confirm_skill_link_pair` / `withdraw_skill_link` (the database's words) and
`skill_links.confirm_file` (the command's refusal). "A settings row, not code": changing the row in the database moves
the answer (behaviour), the seed holds the row, and no role code is written in the link code or the link functions
(a static search beside it, because the criterion is about where the text lives).
"""

import json
import re

import pytest

from conftest import DECIDERS, ROOT, csv_of, person, school, status_of

PAIRS = [("A", "C"), ("B", "E"), ("A", "F"), ("B", "G")]


def _scene(conn, monkeypatch, tmp_path):
    from engine.w3_read import skill_links

    s = school(conn, monkeypatch)
    sk = s["sk"]
    people = {
        "loader": person(conn, s, "educator"),
        "coordinator": person(conn, s, "coordinator"),
        "class_teacher": person(conn, s, "class_teacher"),
        "assistant": person(conn, s, "assistant"),
        "specialist": person(conn, s, "specialist"),
        "ended": person(conn, s, "coordinator", ended=True),
        "no_role": person(conn, s),
    }
    f = csv_of(tmp_path, *[(sk[a], sk[b]) for a, b in PAIRS])
    skill_links.load(conn, f, people["loader"][1])
    return s, people, f, skill_links


def _confirm(conn, s, a, b, staff):
    return conn.execute("select public.confirm_skill_link_pair(%s, %s, %s, %s) as w",
                        (s["tenant"], s["sk"][a], s["sk"][b], staff)).fetchone()["w"]


def _withdraw(conn, s, a, b, staff, reason="A proof reason"):
    return conn.execute("select public.withdraw_skill_link(%s, %s, %s, %s, %s) as w",
                        (s["tenant"], s["sk"][a], s["sk"][b], staff, reason)).fetchone()["w"]


def test_only_a_coordinator_or_educator_decides_and_the_loader_cannot_confirm(conn, monkeypatch, tmp_path):
    s, p, f, skill_links = _scene(conn, monkeypatch, tmp_path)
    assert status_of(conn, s, "A", "C")["proposed_by"] == p["loader"][0], "load --by is not recorded"
    for who in ("assistant", "specialist", "ended", "no_role"):
        assert _confirm(conn, s, "A", "C", p[who][0]) == "not a decider", who
        assert _withdraw(conn, s, "A", "C", p[who][0]) == "not a decider", who
    assert _confirm(conn, s, "A", "C", p["loader"][0]) == "same person"
    assert status_of(conn, s, "A", "C")["status"] == "proposed", "a refused decision changed the link"
    with pytest.raises(skill_links.Refused):
        with conn.transaction():
            skill_links.confirm_file(conn, f, p["assistant"][1])
    with pytest.raises(skill_links.Refused):
        with conn.transaction():
            skill_links.confirm_file(conn, f, p["loader"][1])
    assert {status_of(conn, s, a, b)["status"] for a, b in PAIRS} == {"proposed"}

    assert _confirm(conn, s, "A", "C", p["coordinator"][0]) == "confirmed"
    assert _confirm(conn, s, "B", "E", p["class_teacher"][0]) == "confirmed"
    assert _withdraw(conn, s, "A", "F", p["loader"][0]) == "withdrawn", "the loader may say no"


def test_which_roles_decide_is_the_settings_row(conn, monkeypatch, tmp_path):
    s, p, _, _ = _scene(conn, monkeypatch, tmp_path)
    changed = conn.execute("update config set value = %s::jsonb where tenant_id = %s and key = 'skill_link.decider_roles'",
                           (json.dumps(["assistant"]), s["tenant"])).rowcount
    assert changed == 1, "the school has no settings row skill_link.decider_roles"
    assert _confirm(conn, s, "B", "G", p["coordinator"][0]) == "not a decider"
    assert _confirm(conn, s, "B", "G", p["assistant"][0]) == "confirmed"
    assert _withdraw(conn, s, "A", "C", p["class_teacher"][0]) == "not a decider"


def test_the_seed_holds_the_row_and_no_role_code_is_written_in_the_link_code():
    rows = {r["key"]: r["value"] for r in json.loads((ROOT / "supabase/seed/config.json").read_text())["config"]}
    assert "skill_link.decider_roles" in rows, "supabase/seed/config.json has no skill_link.decider_roles row"
    assert set(rows["skill_link.decider_roles"]) == DECIDERS
    quoted = re.compile(r"""['"](%s)['"]""" % "|".join(sorted(DECIDERS)))
    for path in ("packages/engine/engine/w3_read/skill_links.py", "packages/engine/engine/w3_read/cli_skill_links.py"):
        assert not quoted.search((ROOT / path).read_text()), f"{path} names a role"


def test_the_link_functions_name_no_role(conn):
    found = conn.execute(
        "select p.proname, pg_get_functiondef(p.oid) as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
        " where n.nspname = 'public' and p.proname in ('confirm_skill_link', 'confirm_skill_link_pair',"
        " 'withdraw_skill_link')").fetchall()
    assert {f["proname"] for f in found} == {"confirm_skill_link", "confirm_skill_link_pair", "withdraw_skill_link"}
    quoted = re.compile(r"'(%s)'" % "|".join(sorted(DECIDERS)))
    for f in found:
        assert not quoted.search(f["src"]), f"{f['proname']} names a role in code"
