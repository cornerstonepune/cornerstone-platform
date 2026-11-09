"""The keys CP-4 added to the access rules, each read the way the website reads it (the role app_web, one sign-in entry
set as the person asking): a paper blueprint made for one child, a run of the reader, and the reason a parent report was
sent back. Two classes, X and Y, an educator of each, and a coordinator; all rows are fake and rolled back."""

import os
import uuid

import psycopg
import pytest

from engine.core import db

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")


@pytest.fixture
def school():
    with db.connect() as c:
        yield _build(c)
        c.rollback()


def _one(c, sql, *args):
    return c.execute(sql, args).fetchone()["id"]


def _build(c):
    tag = uuid.uuid4().hex[:8]
    t = _one(c, "insert into tenant (slug, name) values (%s, 'CP-4 keys') returning id", f"cp4k-{tag}")
    camp = _one(c, "insert into campus (tenant_id, name) values (%s, 'c') returning id", t)
    year = _one(
        c,
        "insert into academic_year (tenant_id, label, starts_on, ends_on)"
        " values (%s, '2026-27', current_date - 100, current_date + 200) returning id",
        t,
    )
    s = {"tenant": t, "entry": {}, "child": {}, "cls": {}}
    entries = []
    for who, section in (("X", "P"), ("Y", "Q"), ("all", None)):
        if section:
            cls = _one(
                c,
                "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
                " values (%s, %s, %s, 'K2', %s) returning id",
                t, camp, year, section,
            )  # fmt: skip
            s["cls"][who] = cls
            s["child"][who] = _one(
                c,
                "insert into child (tenant_id, roll_no, band, section, active) values (%s, '1', 'K2', %s, true)"
                " returning id",
                t, section,
            )  # fmt: skip
            c.execute(
                "insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
                " values (%s, %s, %s, '1', current_date - 30, 'cp4 keys')",
                (t, s["child"][who], cls),
            )
        staff = _one(
            c, "insert into staff (tenant_id, campus_id, active) values (%s, %s, true) returning id", t, camp
        )
        email = f"cp4k-{who.lower()}-{tag}@example.test"
        c.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'Keys person', %s)",
            (t, staff, email),
        )
        c.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)"
            " values (%s, %s, %s, %s, current_date - 30, 'cp4 keys')",
            (t, staff, "coordinator" if who == "all" else "class_teacher", s["cls"].get(who)),
        )
        s["entry"][who] = str(uuid.uuid4())
        entries.append({"id": s["entry"][who], "email": email, "name": "Keys person", "role": "educator"})
    c.execute(
        "insert into config (tenant_id, key, value) values (%s, 'app.staff', %s)",
        (t, psycopg.types.json.Jsonb(entries)),
    )
    return {"c": c, **s}


def _seen(s, who, table, where="true"):
    """How many rows of the table the person sees as the website, inside a savepoint that is rolled back."""
    c = s["c"]
    with c.transaction(force_rollback=True):
        c.execute("set local role app_web")
        if who:
            c.execute("select set_config('app.staff_id', %s, true)", (s["entry"][who],))
        return c.execute(f"select count(*) as n from {table} where {where}").fetchone()["n"]


def test_a_blueprint_made_for_one_child_is_seen_through_that_childs_class_and_a_spare_one_by_all(school):
    s, c = school, school["c"]
    for child in (s["child"]["X"], s["child"]["Y"], None):
        c.execute(
            "insert into sheet_template (tenant_id, band, variant, week, item_ids, key, source, child_id)"
            " values (%s, 'G1', 1, '2026-W45', '{}', '{}', 'generated', %s)",
            (s["tenant"], child),
        )
    mine = f"tenant_id = '{s['tenant']}'"
    assert _seen(s, "X", "sheet_template", mine + f" and child_id = '{s['child']['X']}'") == 1
    assert _seen(s, "X", "sheet_template", mine + f" and child_id = '{s['child']['Y']}'") == 0
    assert _seen(s, "Y", "sheet_template", mine + f" and child_id = '{s['child']['X']}'") == 0
    assert _seen(s, "X", "sheet_template", mine + " and child_id is null") == 1  # a spare one is open
    assert _seen(s, "all", "sheet_template", mine) == 3
    assert _seen(s, None, "sheet_template", mine) == 0


def test_a_run_of_the_reader_is_seen_by_whoever_put_the_file_in_whoever_sees_a_paper_read_from_it_and_everything(
    school,
):
    s, c = school, school["c"]
    for who in ("X", "Y", None):
        c.execute(
            "insert into flow_run (tenant_id, flow, trigger, uploaded_by) values (%s, 'cp4-keys', 'test', %s)",
            (s["tenant"], s["entry"].get(who)),
        )
    # a file Y's educator put in, with a copy that is a paper of X's child: X's educator sees that run too
    tpl = _one(
        c,
        "insert into sheet_template (tenant_id, band, variant, week, item_ids, key, source) values"
        " (%s, 'K2', 1, '2026-W45', '{}', '{}', 'generated') returning id",
        s["tenant"],
    )
    sheet = _one(
        c,
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status, section, week,"
        " approved_by, approved_at) values (%s, 'CS' || substr(md5(random()::text), 1, 6), %s, %s, 'printed', 'P',"
        " 'W1', 'cp4', now()) returning id",
        s["tenant"], tpl, s["child"]["X"],
    )  # fmt: skip
    cap = _one(
        c,
        "insert into capture (tenant_id, path, sheet_instance_id, status) values (%s, 'cp4/k.pdf', %s, 'processed')"
        " returning id",
        s["tenant"], sheet,
    )  # fmt: skip
    c.execute(
        "insert into flow_run (tenant_id, flow, trigger, uploaded_by, result) values (%s, 'cp4-keys', 'test', %s, %s)",
        (s["tenant"], s["entry"]["Y"], psycopg.types.json.Jsonb({"copies": [{"capture_id": str(cap)}]})),
    )
    mine = f"tenant_id = '{s['tenant']}' and flow = 'cp4-keys'"
    assert _seen(s, "X", "flow_run", mine) == 2  # its own, and the one holding a paper of its child
    assert _seen(s, "Y", "flow_run", mine) == 2  # its own, and the one it put in with the copy
    assert _seen(s, "all", "flow_run", mine) == 4
    assert _seen(s, None, "flow_run", mine) == 0


def test_the_reason_a_parent_report_was_sent_back_is_seen_by_that_childs_class_and_a_skill_approval_by_all(
    school,
):
    s, c = school, school["c"]
    for who in ("X", "Y"):
        note = _one(
            c,
            "insert into parent_note (tenant_id, child_id, week, body) values (%s, %s, '2026-W45', 'x') returning id",
            s["tenant"], s["child"][who],
        )  # fmt: skip
        c.execute(
            "insert into approval (tenant_id, kind, target, decision, by, reason)"
            " values (%s, 'parent_note', %s, 'sent_back', 'cp4 keys', 'reason')",
            (s["tenant"], str(note)),
        )
    c.execute(
        "insert into approval (tenant_id, kind, target, decision, by, reason)"
        " values (%s, 'skill_level', 'NUM.OPS.01 Easy', 'sent_back', 'cp4 keys', 'reason')",
        (s["tenant"],),
    )
    mine = f"tenant_id = '{s['tenant']}'"
    assert _seen(s, "X", "approval", mine + " and kind = 'parent_note'") == 1
    assert _seen(s, "X", "approval", mine + " and kind = 'skill_level'") == 1
    assert _seen(s, "all", "approval", mine) == 3
    assert _seen(s, None, "approval", mine) == 0
