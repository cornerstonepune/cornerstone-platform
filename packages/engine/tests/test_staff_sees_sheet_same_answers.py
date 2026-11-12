"""CP-34 (#605): the cheaper `staff_sees_sheet` gives the same answer as the one it replaced, for every kind of person on
every kind of sheet. The old body is kept here, as a function of the test's own transaction, and the two are compared.

Placeholder rows only, inside a rolled-back transaction: no school data.
"""

import itertools
import os
import uuid

import pytest

from engine.core import db
from tests.rows import a_child, a_child_in, a_class, tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")

OLD = """
create function pg_temp.old_staff_sees_sheet(p_role text, p_classes text[], p_subjects text[], p_staff uuid,
                                             p_sheet uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select staff_sees(p_role, p_classes, p_subjects, p_staff, null, null, null)
    or exists (select 1 from capture c
               where c.sheet_instance_id = p_sheet and c.superseded_by is null
                 and staff_sees(p_role, p_classes, p_subjects, p_staff, null, null, c.uploaded_by))
    or coalesce((
      select case when staff_sees(p_role, p_classes, p_subjects, p_staff, coalesce(si.section, ch.section), null, null)
                  then staff_sees(p_role, p_classes, p_subjects, p_staff, coalesce(si.section, ch.section),
                                  sheet_subject(si.sheet_template_id), null)
                  else false end
      from sheet_instance si left join child_now ch on ch.id = si.child_id
      where si.id = p_sheet), false)
$$
"""


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _staff(conn, t):
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    return conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s, %s) returning id", (t, campus)
    ).fetchone()["id"]


def _world(conn):
    """Classes A, B, C; children in every state a sheet's class can come from; sheets of every kind; scans by two staff."""
    t = tenant(conn)
    tag = uuid.uuid4().hex[:5].upper()
    a, b, c = (f"{x}{tag}" for x in "ABC")
    for label in (a, b, c):
        a_class(conn, label)
    kids = {
        "open_a": a_child_in(conn, a, roll="1"),
        "open_b": a_child_in(conn, b, roll="1"),
        "moved_a_to_c": a_child_in(conn, a, roll="2"),
        "closed_only_b": a_child_in(conn, b, roll="2"),
        "none": a_child(conn, enrolled=False),
    }
    year_start = "2026-01-01"
    class_c = a_class(conn, c)
    # moved: the open enrolment in A closes, a new one opens in C
    conn.execute("update enrolment set to_date = '2026-06-01' where child_id = %s", (kids["moved_a_to_c"],))
    conn.execute(
        "insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
        " values (%s, %s, %s, '1', '2026-06-02', 'test')",
        (t, kids["moved_a_to_c"], class_c),
    )
    conn.execute("update enrolment set to_date = '2026-06-01' where child_id = %s", (kids["closed_only_b"],))
    # two subjects the registry knows, so a sheet can carry a subject
    subj = conn.execute(
        "select s.code, min(tp.subject_code) as subject from skill s join topic tp on tp.tenant_id = s.tenant_id"
        " and tp.code = s.topic_code where s.tenant_id = %s group by s.code order by 2, 1",
        (t,),
    ).fetchall()
    by_subject = {}
    for r in subj:
        by_subject.setdefault(r["subject"], r["code"])
    codes = list(by_subject.items())[:2]
    assert len(codes) == 2, "the seed should hold skills of two subjects"
    templates = [None] + [code for _, code in codes]
    tpl_ids = []
    for code in templates:
        tpl_ids.append(
            conn.execute(
                "insert into sheet_template (tenant_id, band, week, item_ids, source, skill_set_code)"
                " values (%s, 'G2', '2026-11-02', '{}', 'generated', %s) returning id",
                (t, code),
            ).fetchone()["id"]
        )
    s1, s2 = _staff(conn, t), _staff(conn, t)
    sheets = []
    n = 0
    for tpl in tpl_ids:
        for child, section in [(k, None) for k in kids.values()] + [(None, a), (None, c), (None, None)]:
            n += 1
            sid = conn.execute(
                "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, kind, week)"
                " values (%s, %s, %s, %s, %s, 'practice', '2026-11-02') returning id",
                (t, f"CT{tag}{n:03d}", tpl, child, section),
            ).fetchone()["id"]
            sheets.append(sid)
    # scans: s1 on every third sheet, s2 on every fifth (one of them replaced), one with no uploader
    for i, sid in enumerate(sheets):
        if i % 3 == 0:
            conn.execute(
                "insert into capture (tenant_id, path, sheet_instance_id, uploaded_by) values (%s, %s, %s, %s)",
                (t, f"p/{uuid.uuid4()}", sid, s1),
            )
        if i % 5 == 0:
            old = conn.execute(
                "insert into capture (tenant_id, path, sheet_instance_id, uploaded_by) values (%s, %s, %s, %s)"
                " returning id",
                (t, f"p/{uuid.uuid4()}", sid, s2),
            ).fetchone()["id"]
            if i % 10 == 0:  # s2's scan replaced by a newer one with no uploader: s2 no longer holds it
                new = conn.execute(
                    "insert into capture (tenant_id, path, sheet_instance_id) values (%s, %s, %s) returning id",
                    (t, f"p/{uuid.uuid4()}", sid),
                ).fetchone()["id"]
                conn.execute("update capture set superseded_by = %s where id = %s", (new, old))
    return {"classes": (a, b, c), "subjects": [s for s, _ in codes], "staff": (s1, s2), "sheets": sheets,
            "year_start": year_start}  # fmt: skip


def test_the_cheaper_function_answers_as_the_old_one_for_every_role_on_every_sheet(conn):
    w = _world(conn)
    conn.execute(OLD)
    a, b, c = w["classes"]
    s1, s2 = w["staff"]
    class_sets = [[], [a], [a, b], [c], [a, b, c], ["NOSUCH"]]
    subject_sets = [[], [w["subjects"][0]], w["subjects"], ["NOSUCHSUBJECT"]]
    people = [("coordinator", [], [], None)]
    for role, cls, sub, who in itertools.product(
        ["educator", "class_teacher"], class_sets, subject_sets, [s1, s2, None]
    ):
        people.append((role, cls, sub, who))
    people.append(("educator", None, None, s1))  # null lists, as a missing staff entry gives
    seen = {True: 0, False: 0}
    for role, cls, sub, who in people:
        rows = conn.execute(
            "select id, public.staff_sees_sheet(%(r)s, %(c)s, %(s)s, %(w)s, id) as new,"
            " pg_temp.old_staff_sees_sheet(%(r)s, %(c)s, %(s)s, %(w)s, id) as old"
            " from sheet_instance where id = any(%(ids)s)",
            {"r": role, "c": cls, "s": sub, "w": who, "ids": w["sheets"]},
        ).fetchall()
        assert len(rows) == len(w["sheets"])
        for r in rows:
            assert r["new"] == r["old"], (role, cls, sub, who, r["id"])
            seen[bool(r["new"])] += 1
    assert seen[True] > 50 and seen[False] > 50, "the comparison must cover both answers"


def test_an_educator_sees_2000_sheets_within_a_second_of_the_coordinator(conn):
    """The Papers page asks the function of every sheet: with 2,000 sheets an educator must not wait much longer than a
    coordinator does (before CP-34: about nine times as long on a copy)."""
    import time

    t = tenant(conn)
    tag = uuid.uuid4().hex[:5].upper()
    for i in range(1, 41):
        a_class(conn, f"P{i:02d}{tag}")
    tpl = conn.execute(
        "insert into sheet_template (tenant_id, band, week, item_ids, source) values (%s, 'G2', '2026-11-02', '{}',"
        " 'generated') returning id",
        (t,),
    ).fetchone()["id"]
    conn.execute(
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, section, kind, week)"
        " select %s, %s || lpad(to_hex(g), 6, '0'), %s, 'P' || lpad(((g %% 40) + 1)::text, 2, '0') || %s,"
        " 'practice', '2026-11-02' from generate_series(1, 2000) g",
        (t, f"Q{tag}", tpl, tag),
    )
    who = _staff(conn, t)
    conn.execute("analyze sheet_instance")

    def took(role, classes):
        start = time.perf_counter()
        n = conn.execute(
            "select count(*) n from sheet_instance where tenant_id = %s and public.staff_sees_sheet(%s, %s, %s, %s, id)",
            (t, role, classes, ["Maths"], who),
        ).fetchone()["n"]
        return time.perf_counter() - start, n

    coordinator, n_all = took("coordinator", [])
    educator, n_own = took("educator", [f"P01{tag}"])
    assert n_all >= 2000 and 0 < n_own < n_all
    assert educator < coordinator + 1.0, (educator, coordinator)
