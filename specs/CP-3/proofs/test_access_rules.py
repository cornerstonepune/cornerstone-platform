"""CP-3 items 1-6: the access rules on children, enrolment, staff and notes, exercised on a real Postgres built from this
repository's migrations, as the website's login (a member of app_web) with the identity set as the website sets it.
Fixtures (conftest.py) are fake and rolled back. Table names of the groups come from specs/CP-3/design.md."""

import uuid

from conftest import CHILDREN, ENROLMENT, FOUR_KINDS, NOTES, STAFF, one

EVERYTHING = {"coordinator", "deputy_coordinator", "mentor", "head", "curriculum_team", "ops"}
OWN_CLASSES = {"educator", "class_teacher", "subject_educator", "cover_educator", "specialist", "assistant"}
KINDS = {"children", "enrolment", "staff", "notes"}


def of_class(s, k):
    """The queries of item 3, for one class: its children (both tables), its enrolment, its notes and their claims."""
    kids = s.kids[k]
    return {
        "public.child": ("select 1 from public.child where id = any(%s)", (kids,)),
        "pii.child": ("select 1 from pii.child where child_id = any(%s)", (kids,)),
        "public.enrolment": ("select 1 from public.enrolment where class_id = %s", (k,)),
        "pii.educator_note": ("select 1 from pii.educator_note where class_id = %s", (k,)),
        "pii.note_claim": ("select 1 from pii.note_claim where note_id = %s", (s.note[k],)),
    }


def counts(s, who, queries):
    return {name: s.seen(who, sql, params) for name, (sql, params) in queries.items()}


# ---- 1 ----------------------------------------------------------------------------------------------------------

def test_1_groups_are_rows_as_the_scope_lists_them(school):
    c, t = school.c, school.t
    rows = dict(c.execute("select role_code, group_code from access_role_group where tenant_id = %s", (t,)).fetchall())
    assert {r for r, g in rows.items() if g == "everything"} >= EVERYTHING, "the everything group's roles are not rows"
    assert {r for r, g in rows.items() if g == "own_classes"} >= OWN_CLASSES, "the own-classes group's roles are not rows"
    reach = dict(c.execute("select kind_code, reach from access_reach where tenant_id = %s and group_code = 'everything'",
                           (t,)).fetchall())
    assert set(one(c, "select array_agg(code) from access_kind where tenant_id = %s", (t,))) >= KINDS
    assert {k: reach.get(k) for k in KINDS} == {k: "all" for k in KINDS}, "group to kinds is not stored as rows"


def test_1_changing_a_roles_group_is_one_update(school):
    s = school
    y_kids = of_class(s, s.y)["public.child"]
    assert s.seen("edx", *y_kids) == 0
    s.c.execute("update access_role_group set group_code = 'everything' where tenant_id = %s and role_code = 'assistant'",
                (s.t,))
    assert s.seen("edx", *y_kids) == len(s.kids[s.y]), "moving the role to everything did not change what its holder sees"


def test_1_adding_a_role_to_a_group_is_one_insert(school):
    s = school
    x_kids = of_class(s, s.x)["public.child"]
    s.c.execute("delete from access_role_group where tenant_id = %s and role_code = 'assistant'", (s.t,))
    assert s.seen("edx", *x_kids) == 0, "a role in no group still sees its class"
    s.c.execute("insert into access_role_group (tenant_id, role_code, group_code) values (%s, 'assistant', 'own_classes')",
                (s.t,))
    assert s.seen("edx", *x_kids) == len(s.kids[s.x]), "adding the role to own_classes did not let its holder see the class"


def test_1_changing_what_a_group_sees_is_one_update(school):
    s = school
    q = of_class(s, s.x)
    assert s.seen("edx", *q["pii.educator_note"]) == 1
    s.c.execute("update access_reach set reach = 'none' where tenant_id = %s and group_code = 'own_classes' "
                "and kind_code = 'notes'", (s.t,))
    assert s.seen("edx", *q["pii.educator_note"]) == 0, "taking notes from the group did not hide them"
    assert s.seen("edx", *q["public.child"]) == len(s.kids[s.x]), "taking notes away changed another kind"


# ---- 2 ----------------------------------------------------------------------------------------------------------

def test_2_every_role_belongs_to_exactly_one_group(school):
    # school: a tenant made just now, so the seeding of a new school is covered as well as every existing one
    c = school.c
    assert one(c, "select count(*) from role where tenant_id = %s", (school.t,)) > 0
    bad = one(c, """select count(*) from role r
                    where (select count(*) from access_role_group g join access_group a
                             on a.tenant_id = g.tenant_id and a.code = g.group_code
                           where g.tenant_id = r.tenant_id and g.role_code = r.code) <> 1""")
    assert bad == 0, f"{bad} role code(s) are in no group or in more than one"


# ---- 3 ----------------------------------------------------------------------------------------------------------

def test_3_educator_of_x_sees_x(school):
    s = school
    seen = counts(s, "edx", of_class(s, s.x))
    want = {"public.child": 2, "pii.child": 2, "public.enrolment": 2, "pii.educator_note": 1, "pii.note_claim": 1}
    assert seen == want, f"as the educator of X, X's rows: {seen}"


def test_3_educator_of_x_gets_0_rows_of_y(school):
    s = school
    seen = counts(s, "edx", of_class(s, s.y))
    assert seen == {k: 0 for k in seen}, f"as the educator of X, rows of class Y: {seen}"
    # and nothing else anywhere: every row they see is X's
    whole = {t: s.seen("edx", f"select 1 from {t}") for t in CHILDREN + ENROLMENT + NOTES}
    assert whole == {"public.child": 2, "pii.child": 2, "public.enrolment": 2, "pii.educator_note": 1,
                     "pii.note_claim": 1}, f"as the educator of X, whole tables: {whole}"


def test_3_a_grant_not_current_gives_nothing(school):
    s = school
    for who in ("late", "ended", "nogrant"):  # starts tomorrow, ended today, never granted
        seen = counts(s, who, of_class(s, s.x))
        assert seen == {k: 0 for k in seen}, f"{who}: rows of class X with no current grant: {seen}"


def test_3_the_uploader_of_a_class_y_paper_sees_that_child_only(school):
    # Own classes also see a child whose paper they uploaded (Nimish, 27 Oct 2026); nothing else of class Y.
    s, c = school, school.c
    other = one(c, "insert into child (tenant_id, roll_no, band, section) values (%s, 'P4', 'G1', 'PY') returning id",
                (s.t,))
    c.execute("insert into pii.child (tenant_id, child_id, first_name) values (%s, %s, 'Fake')", (s.t, other))
    c.execute("insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by) "
              "values (%s, %s, %s, 'P4', %s::date - 30, 'cp3 proof')", (s.t, other, s.y, s.today))
    paper_kid = s.kids[s.y][0]
    tpl = one(c, "insert into sheet_template (tenant_id, band, level, week) values (%s, 'G1', 'L0', '2099-W01') "
                 "returning id", (s.t,))
    sheet = one(c, "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id) "
                   "values (%s, 'CSC0FFEE', %s, %s) returning id", (s.t, tpl, paper_kid))
    c.execute("insert into capture (tenant_id, path, sheet_instance_id, uploaded_by) values (%s, 'proof/scan.jpg', %s, %s)",
              (s.t, sheet, s.entry["edx"]))  # uploaded_by holds the sign-in list entry id, as the website sets it
    s.grant("nogrant", "assistant", s.x)  # a second educator of X, who uploaded nothing

    def sees(who, kid):
        return {t: s.seen(who, f"select 1 from {t} where {col} = %s", (kid,))
                for t, col in (("public.child", "id"), ("pii.child", "child_id"))}

    assert sees("edx", paper_kid) == {"public.child": 1, "pii.child": 1}, "the uploader does not see the paper's child"
    assert sees("edx", other) == {"public.child": 0, "pii.child": 0}, "the uploader sees another class-Y child"
    assert s.seen("edx", "select 1 from public.enrolment where class_id = %s", (s.y,)) == 0, \
        "the uploader sees class Y's enrolment"
    assert sees("nogrant", paper_kid) == {"public.child": 0, "pii.child": 0}, "an educator who did not upload sees the child"


# ---- 4 ----------------------------------------------------------------------------------------------------------

def test_4_no_identity_sees_nothing(school):
    s = school
    seen = {t: s.seen(None, f"select 1 from {t}") for t in FOUR_KINDS}
    assert seen == {t: 0 for t in FOUR_KINDS}, f"with no identity set: {seen}"


def test_4_an_identity_that_is_no_one_sees_nothing(school):
    s = school
    for who in ("", str(uuid.uuid4()), "unmatched", "gone"):  # empty, unknown id, entry with no staff, deactivated
        seen = {t: s.seen(who, f"select 1 from {t}") for t in FOUR_KINDS}
        assert seen == {t: 0 for t in FOUR_KINDS}, f"identity {who or 'empty'!r}: {seen}"


# ---- 5 ----------------------------------------------------------------------------------------------------------

def test_5_everything_group_sees_every_row(school):
    s = school
    for t in FOUR_KINDS:
        full = s.all_rows(t)
        assert full > 0
        q = (f"select 1 from {t} where tenant_id = %s", (s.t,))
        assert s.seen(None, *q) == 0, f"{t}: no rule is on (no identity still sees rows)"
        assert s.seen("coord", *q) == full, f"{t}: the everything group does not see every row"
    seen = counts(s, "coord", of_class(s, s.y))
    assert seen == {"public.child": 1, "pii.child": 1, "public.enrolment": 1, "pii.educator_note": 1,
                    "pii.note_claim": 1}, f"as the coordinator, class Y: {seen}"


# ---- 6 ----------------------------------------------------------------------------------------------------------

def test_6_staff_details_only_for_everything_and_self(school):
    s = school
    me, colleague = s.staff["edx"], s.staff["edy"]
    tables = {"pii.staff": "staff_id", "public.staff": "id", "public.staff_role_grant": "staff_id"}
    for t, col in tables.items():
        assert s.seen("edx", f"select 1 from {t} where {col} = %s", (me,)) >= 1, f"{t}: a person cannot read their own"
        assert s.seen("edx", f"select 1 from {t} where {col} = %s", (colleague,)) == 0, \
            f"{t}: an educator can read a colleague's"
        assert s.seen("edx", f"select 1 from {t} where {col} <> %s", (me,)) == 0, f"{t}: an educator reads others'"
        assert s.seen("coord", f"select 1 from {t} where tenant_id = %s", (s.t,)) == s.all_rows(t), \
            f"{t}: the everything group cannot read every person's"
    assert set(STAFF) == set(tables)
