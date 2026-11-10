"""Rows a database test builds for itself, inside its own transaction, so it proves the same thing on a database
built from the repository (`bin/testdb fresh`, what CI runs) as on a copy of live — never "whatever live holds".
"""

import json
import re
import uuid

from engine.core import db
from engine.w1_bank import review
from engine.w3_read import gold


def drawn(make):
    """A question drawn as the bank draws one: a maker's "draw again" (numbers no story of its shape holds, a fact
    family 7 × 7 cannot make) is drawn again, as `draw._paired` and `bank.fill` always have."""
    for _ in range(200):
        try:
            return make()
        except RuntimeError:
            continue
    raise AssertionError("nothing drawn in 200 tries")


def tenant(conn):
    return conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]


def a_registry_skill(conn, tenant, code="NUM.OPS.01"):
    """The school's registry skill `code` given to a school a test made for itself: a question names one (C1)."""
    conn.execute(
        "insert into registry_skill (tenant_id, code, domain, strand, name)"
        " select %s, code, domain, strand, name from registry_skill where code = %s limit 1"
        " on conflict do nothing",
        (tenant, code),
    )
    return code


def a_child(conn, section=None, enrolled=True):
    """A Grade 2 child in a section of its own, on the roster as every child is: `child` and its `pii` row. With
    `enrolled=False`, in no class yet: for a test that enrols the child in a class of its own."""
    t = tenant(conn)
    section = section or f"ROWS-{uuid.uuid4().hex[:6].upper()}"
    child = (
        a_child_in(conn, section, "G2", "1", t)
        if enrolled
        else _only(
            conn.execute(
                "insert into child (tenant_id, band) values (%s, 'G2') returning id", (t,)
            ).fetchone()
        )
    )
    conn.execute(
        "insert into pii.child (tenant_id, child_id, first_name) values (%s, %s, 'Rowstest')", (t, child)
    )
    return child


def a_member_of_staff(conn, email=None, active=True):
    """A member of staff of the school with a sign-in email (a placeholder, never a person's): (their id, the email).
    What a person's decision names is the id the engine finds from the email the website sends (`signer.lookup`)."""
    t = tenant(conn)
    email = email or f"staff-{uuid.uuid4().hex[:8]}@school.invalid"
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    sid = conn.execute(
        "insert into staff (tenant_id, campus_id, active) values (%s, %s, %s) returning id",
        (t, campus, active),
    ).fetchone()["id"]
    conn.execute(
        "insert into pii.staff (tenant_id, staff_id, name, email) values (%s, %s, 'A placeholder', %s)",
        (t, sid, email),
    )
    return sid, email


def a_bank_proposal(conn, kind, subject, direction="easier", evidence=None):
    """A proposal of the question bank as `learn` makes one (a question far off its level, `mislevelled`; a mistake
    learned from children's answers, `new_mistake`): a row of the one proposal list, waiting for a person. Its id."""
    return conn.execute(
        "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, proposer, machine)"
        " values (%s, gen_random_uuid(), %s, %s, jsonb_build_object('direction', %s::text, 'evidence', %s::jsonb),"
        " 'needs_person', 'code', 'code:' || %s) returning id",
        (tenant(conn), kind, subject, direction, json.dumps(evidence or {}), kind),
    ).fetchone()["id"]


def a_question_review(
    conn, ref, skill="SUB.2D2D", level="Advance", reviewer="language_review", verdict="pass"
):
    """A reviewer model's verdict on a question (`ref` its key) or on a level's rule (`template:<skill>:<level>`),
    stored as `review` stores one."""
    review.record(conn, reviewer, skill, level, [{"ref": ref, "verdict": verdict}], {})


def a_report_finding(conn, child, ref, skill="NUM.OPS.02", verdict="faulty", words="a test finding"):
    """A finding transcribed from an educator's report for one child, about the question `ref`, stored as `gold.load`
    stores one: not yet confirmed."""
    gold.record(
        conn, tenant(conn), child, {"verdict": verdict, "skill": skill, "item": ref, "words": words}, "test"
    )


WAITED = {
    "correct": "read as a right answer; a person checks every answer of this kind until the reader is trusted on it",
    "wrong": "read as a wrong answer; a person checks every wrong answer before it counts",
    "blank": "read as blank; a person checks every blank before it counts",
}


ROWS_WEEK = "2090-01-02"  # the Monday of the week a made-up paper is for (weeks are dates since CP-27)


def a_read_paper(conn, answers, path="scan.pdf", paper="TEST-P1", fmt="column"):
    """One child's paper, read: a child, the worksheet it was printed from, its copy, the scan and one answer per
    entry of `answers`. Each entry is a dict of `status` (correct / wrong / blank / needs_teacher), `read` (what
    the reader took the child to have written), and optionally `state` (candidate / confirmed), `typed` (a
    person's correction of the reading) and `why` (the reason it waited; a confirmed answer's is marking's hold). → {"child", "capture", "results": [item_result ids, in order]}."""
    t = tenant(conn)
    tag = uuid.uuid4().hex.upper()  # all of it: six digits of it collided on a unique column (M0-04)
    child = a_child(conn, f"ROWS-{tag[:8]}")
    tpl = conn.execute(
        "insert into sheet_template (tenant_id, band, child_id, week, key, batch_id) values (%s, 'G2', %s, %s, %s, %s)"
        " returning id",
        (t, child, ROWS_WEEK, json.dumps({"code": paper}), paper),
    ).fetchone()["id"]
    inst = conn.execute(
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status)"
        " values (%s, %s, %s, %s, 'returned') returning id",
        (t, f"CS{tag}", tpl, child),
    ).fetchone()["id"]
    cap = conn.execute(
        "insert into capture (tenant_id, path, pages, sheet_instance_id, status) values (%s, %s, 1, %s, 'processed')"
        " returning id",
        (t, str(path), inst),
    ).fetchone()["id"]
    results = []
    for n, a in enumerate(answers, start=1):
        item = conn.execute(
            "insert into item (tenant_id, item_key, template, rung_code, skill_codes, signal, fmt, spec, responses)"
            " values (%s, %s, 'rows', 'R24', '{NUM.OPS.02}', 'Procedural', %s, %s, %s) returning id",
            (
                t,
                f"rows/{tag}/{n}",
                fmt,
                json.dumps({"op": "-", "a": 62, "b": 27, "page": 1}),
                json.dumps([{"rid": "a", "answer": 35}]),
            ),
        ).fetchone()["id"]
        state = "blank" if a["status"] == "blank" else "written"
        # an answer a person signed off had waited for them, as marking holds every answer until its kind is trusted
        why = a.get("why", WAITED.get(a["status"], "") if a.get("state") == "confirmed" else "")
        raw = {"child_answer": a["read"], "answer_state": state, "confidence": 95.0, "why": why}
        res = conn.execute(
            "insert into item_result (tenant_id, capture_id, item_id, rid, raw_read, status, state)"
            " values (%s, %s, %s, 'a', %s, %s, %s) returning id",
            (t, cap, item, json.dumps(raw), a["status"], a.get("state", "candidate")),
        ).fetchone()["id"]
        if "typed" in a:
            conn.execute(
                "insert into read_correction (tenant_id, child_id, capture_id, item_result_id, model_read, human_read, by)"
                " values (%s, %s, %s, %s, %s, %s, 'tester@example.org')",
                (t, child, cap, res, a["read"], a["typed"]),
            )
        results.append(res)
    return {"child": child, "capture": cap, "results": results}


def data_steps(migration):
    """A migration's data steps (its `do $$ … end $$;` blocks and its top-level update, insert and delete statements),
    to run again on today's schema and functions. A later migration can make an earlier one's DDL impossible to repeat
    (B4 dropped the `rung` table B1 and B3 put triggers on; B4b made `skill_set` a view, which C1 dropped, so a step
    naming it names today's `skill`); what those tests prove — running the migration's rows again changes nothing — is
    these steps, in their order."""
    step = r"^do \$\$.*?^end \$\$;|^(?:update|insert into|delete from)\b.*?;[ \t]*$"
    steps = "\n".join(
        m.group(0)
        for m in re.finditer(step, migration.read_text(), re.S | re.M)
        if not _grants_only(m.group(0))
    )
    return re.sub(r"\bskill_set\b", "skill", steps)


def _grants_only(block):
    """A `do` block that only grants or revokes (when a role exists) moves no row, so it is no data step; it can also name
    a table a later migration retired (CP-27 moved `question_type_approval` into `approval`)."""
    inner = re.sub(r"^do \$\$\s*begin|end \$\$;$", "", block.strip(), flags=re.S)
    guard = r"^(?:if exists \(select from pg_roles where rolname = '\w+'\) then|end if)\s*"
    said = [re.sub(guard, "", x.strip()) for x in inner.split(";") if x.strip()]
    return all(not x or re.match(r"(?:grant|revoke)\b", x) for x in said)


def forget_paper(conn, paper):
    """Take away what `a_read_paper` wrote and what reading it wrote after, for a test that had to commit it (a second
    connection reads it) and so must put the database back as it found it (M0-04c). `paper` is what `a_read_paper`
    returned. Some of what a reading writes is append-only by trigger, so the triggers are off for this transaction
    (`session_replication_role`, the tests' own role may), and every row that names the paper's capture, child, copy or
    items is deleted by that name, whatever table it is in. The caller commits."""
    items = [
        r["item_id"]
        for r in conn.execute("select item_id from item_result where capture_id = %s", (paper["capture"],))
    ]
    sheet = conn.execute(
        "select c.sheet_instance_id as i, s.sheet_template_id as t from capture c"
        " join sheet_instance s on s.id = c.sheet_instance_id where c.id = %s",
        (paper["capture"],),
    ).fetchone()
    conn.execute("set local session_replication_role = replica")
    named = {
        "capture_id": [paper["capture"]],
        "item_id": items,
        "sheet_instance_id": [sheet["i"]],
        "child_id": [paper["child"]],
    }
    for column, ids in named.items():
        for r in conn.execute(
            "select table_schema as s, table_name as t from information_schema.columns c"
            " where column_name = %s and table_schema in ('public', 'pii')"
            " and (select table_type from information_schema.tables x where x.table_schema = c.table_schema"
            "      and x.table_name = c.table_name) = 'BASE TABLE'",
            (column,),
        ).fetchall():
            conn.execute(f'delete from {r["s"]}."{r["t"]}" where {column} = any(%s)', (ids,))
    conn.execute("delete from capture where id = %s", (paper["capture"],))
    conn.execute("delete from sheet_instance where id = %s", (sheet["i"],))
    conn.execute("delete from sheet_template where id = %s", (sheet["t"],))
    conn.execute("delete from item where id = any(%s)", (items,))
    conn.execute("delete from child where id = %s", (paper["child"],))
    conn.execute("set local session_replication_role = origin")


# Approvals as a test needs them (CP-27 group 3): the one place that knows where a question type's approval and a
# question's retirement are kept, so a later step that moves them changes these and no test. Both are rows of the one
# approval list (`approval`, never edited): a type taken back is a `withdrawn` row, rolled back with the test.


def a_waiting_type(conn, code):
    """The question type `code` as a new one is: not approved. Rolled back with the test."""
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by) select tenant_id, kind, target, 'withdrawn',"
        " 'a test' from approval_list where kind = 'question_type' and target = %s and first_by is not null",
        (code,),
    )


def an_approved_type(conn, code, by):
    """The question type `code` approved by `by`, unless it already is."""
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by) select tenant_id, kind, target, 'approved', %s"
        " from approval_list where kind = 'question_type' and target = %s and first_by is null",
        (by, code),
    )


def a_retired_question(conn, item, by, note=""):
    """The question `item` flagged to retire by `by`, with `note`: the database retires it, as a person's flag does."""
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, reason)"
        " select tenant_id, 'item', id::text, 'retire', %s, nullif(btrim(%s), '') from item where id = %s",
        (by, note, item),
    )


def approvals_so_far(conn):
    """Where the one approval list stands: pass it to `forget_approvals` to take back what a committed test added."""
    return conn.execute("select coalesce(max(seq), 0) as n from approval").fetchone()["n"]


def forget_approvals(conn, since):
    """Take out the approval rows written since `approvals_so_far` gave `since`, for a test that had to commit a level's
    or a report's approval and then cleared it (each writes a row of the list, which is never edited, so its rule is off
    for this transaction, as `forget_paper` does). The caller commits."""
    conn.execute("set local session_replication_role = replica")
    conn.execute("delete from approval where seq > %s", (since,))
    conn.execute("set local session_replication_role = origin")


def a_level_looked_at(conn, skill, level, scope_kind, scope, assessed, secure, by):
    """ "I've looked at this" on a level suggested for review, for a grade or a class, on the counts it was looked at
    on: as the website records it (`recordLookedAt`), a row of the one approval list."""
    conn.execute(
        "insert into approval (tenant_id, kind, target, decision, by, detail)"
        " values (%s, 'calibration', concat_ws(' ', %s::text, %s::text, %s::text, %s::text), 'looked_at', %s,"
        " (select to_jsonb(c) from (select %s::int as assessed, %s::int as secure) c))",
        (tenant(conn), skill, level, scope_kind, scope, by, assessed, secure),
    )


def an_approved_paper(conn, template, child, by, status="printed"):
    """A child's copy of `template`, approved by `by` and at `status`; its id."""
    return conn.execute(
        "insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status, approved_by)"
        " select tenant_id, %s, id, %s, %s, %s from sheet_template where id = %s returning id",
        ("CS" + uuid.uuid4().hex.upper(), child, status, by, template),
    ).fetchone()["id"]


# ---------------------------------------------------------------------------------------------------------------------
# The people who sign in, as a test needs them (CP-27 group 4): the one place that knows where the sign-in list is kept.
# Since group 4 it is the staff tables: `staff` (active, role, classes, subjects) and `pii.staff` (name, email, the
# password hash and when it was set); the website signs a person in as their `staff.id`. A test never names either.
# Without `tenant`, the tests' own school.

PERSON = (
    "select s.id, p.email, p.name, s.role_code as role, p.password_hash as password, p.password_set_at,"
    " s.classes, s.subjects from staff s join pii.staff p on p.staff_id = s.id"
)


def _school(conn, tenant):
    return tenant or _only(
        conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()
    )


def _as_dict(row, cols=("id", "email", "name", "role", "password", "password_set_at", "classes", "subjects")):
    """A person as plain values (as the old list's JSON held them): the id and the time as text."""
    d = dict(row) if isinstance(row, dict) else dict(zip(cols, row, strict=True))
    return {
        **d,
        "id": str(d["id"]),
        "password_set_at": d["password_set_at"] and d["password_set_at"].isoformat(),
    }


def _only(row):
    """The one column a row holds, whether the connection gives rows as dicts (the engine's) or tuples (some proofs')."""
    return None if row is None else (row[0] if isinstance(row, tuple) else next(iter(row.values())))


def signin_list(conn, tenant=None):
    """Everyone the sign-in knows, in the order they were put on, each as kept: id (what the website signs them in as),
    email, name, role, password (the hash, if they have one), password_set_at, classes, subjects."""
    found = conn.execute(
        f"{PERSON} where s.tenant_id = %s and s.active and s.role_code is not null order by s.created_at, s.id",
        (_school(conn, tenant),),
    ).fetchall()
    return [_as_dict(r) for r in found]


def signin_list_is(conn, people, tenant=None):
    """The sign-in knows exactly `people` (dicts as `signin_list` gives them), and no one else: for a test that sets the
    whole list it needs and puts back the one it found. The caller commits, if it must."""
    t = _school(conn, tenant)
    keep = {str(p["email"]).strip().lower() for p in people}
    for gone in [p for p in signin_list(conn, t) if p["email"] not in keep]:
        forget_person(conn, gone["email"], t)
    for p in people:  # put on in the order given, as the list is read (`created_at`)
        me = a_person(conn, **{k: v for k, v in p.items() if k != "id"}, tenant=t)
        conn.execute("update staff set created_at = clock_timestamp() where id = %s", (me["ask_as"],))


def a_person(conn, email, name="Placeholder Person", role="educator", *, tenant=None, **kept):
    """A member of staff the sign-in knows, exactly as given: `email`, `name`, `role` and what else is `kept` of them
    (`password`, the hash; `password_set_at`, `classes`, `subjects`, an `id` for someone new). Someone already there
    with the email (on the list or taken off it) is that person, put back as given. → {"email", "ask_as"}: `ask_as` is
    what the website sets in `app.staff_id` when they sign in (`asking_as`). The caller commits, if it must."""
    t = _school(conn, tenant)
    email = str(email).strip().lower()
    had = _only(
        conn.execute(
            "select staff_id from pii.staff where tenant_id = %s and email = %s", (t, email)
        ).fetchone()
    )
    values = (role, list(kept.get("classes") or []), list(kept.get("subjects") or []))
    if had is None:
        had = _only(
            conn.execute(
                "insert into staff (id, tenant_id, campus_id, role_code, classes, subjects)"
                " values (coalesce(%s::uuid, gen_random_uuid()), %s,"
                " (select id from campus where tenant_id = %s order by created_at limit 1), %s, %s, %s) returning id",
                (kept.get("id"), t, t, *values),
            ).fetchone()
        )
        conn.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email, password_hash, password_set_at)"
            " values (%s, %s, %s, %s, %s, %s)",
            (t, had, name, email, kept.get("password") or None, kept.get("password_set_at")),
        )
    else:
        conn.execute(  # someone taken off and put back is put on the list again, last
            "update staff set role_code = %s, classes = %s, subjects = %s,"
            " created_at = case when active then created_at else clock_timestamp() end, active = true where id = %s",
            (*values, had),
        )
        conn.execute(
            "update pii.staff set name = %s, password_hash = %s, password_set_at = %s where staff_id = %s",
            (name, kept.get("password") or None, kept.get("password_set_at"), had),
        )
    return {"email": email, "ask_as": str(had)}


def forget_person(conn, email, tenant=None):
    """`email` is no longer someone the sign-in knows (taken off as `engine staff remove` takes a person off: inactive,
    no password); everyone else is as they were. The caller commits, if it must."""
    conn.execute(
        "update pii.staff set password_hash = null, password_set_at = null where tenant_id = %s and email = %s",
        (_school(conn, tenant), str(email).strip().lower()),
    )
    conn.execute(
        "update staff set active = false where id in (select staff_id from pii.staff where tenant_id = %s and email = %s)",
        (_school(conn, tenant), str(email).strip().lower()),
    )


def teaches(conn, email, classes, tenant=None):
    """`email` teaches `classes` (class labels) and nothing else of them changes, as the staff page saves a person."""
    conn.execute(
        "update staff set classes = %s where id in (select staff_id from pii.staff where tenant_id = %s and email = %s)",
        (list(classes), _school(conn, tenant), str(email).strip().lower()),
    )


def asking_as(conn, person):
    """The rest of this transaction asks as `person` (what `a_person` gave), as the website does for a signed-in
    request."""
    conn.execute("select set_config('app.staff_id', %s, true)", (person["ask_as"],))


# ---------------------------------------------------------------------------------------------------------------------
# A child in a class, as a test needs one (CP-27 group 4): the one place that knows where a child's class and roll number
# are kept. Since group 4 they are the child's open `enrolment` in a `school_class` of this school year, the class found
# by its label (`school_class.label`, what pages call the section); `child_now` reads them back.


def this_year(conn, school=None):
    """The school year of today (April to March, as `engine enrol k2` makes one), made when there is none. → its id.
    Read first and made only when missing: a year is a row every test's classes share, and an upsert would hold it."""
    t = school or tenant(conn)
    day = "(select internal.school_day(%s, now()))"
    found = conn.execute(
        f"select id from academic_year where tenant_id = %s and {day} between starts_on and ends_on"
        " order by starts_on desc limit 1",
        (t, t),
    ).fetchone()
    if found:
        return _only(found)
    conn.execute(
        f"with s as (select make_date(extract(year from {day} - interval '3 months')::int, 4, 1) as s)"
        " insert into academic_year (tenant_id, label, starts_on, ends_on)"
        " select %s, to_char(s, 'YYYY') || '-' || to_char(s + interval '1 year', 'YY'), s,"
        " (s + interval '1 year' - interval '1 day')::date from s on conflict (tenant_id, label) do nothing",
        (t, t),
    )
    return this_year(conn, t)


def a_class(conn, label, band="G2", school=None):
    """The class labelled `label` in this school year (made as `engine enrol k2` makes one, with the year if there is
    none), of grade `band` when it is made. → its id."""
    t = school or tenant(conn)
    year = this_year(conn, t)
    found = conn.execute(
        "select id from school_class where tenant_id = %s and academic_year_id = %s and label = %s",
        (t, year, label),
    ).fetchone()
    if found:
        return _only(found)
    return _only(
        conn.execute(
            "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label)"
            " values (%s, (select id from campus where tenant_id = %s order by created_at limit 1), %s, %s, %s, %s)"
            " returning id",
            (t, t, year, band, label, label),
        ).fetchone()
    )


def a_child_in(conn, section, band="G2", roll="1", school=None):
    """A child at roll number `roll` of the class labelled `section`, in grade `band`, of `school` (the tests' own school
    when none is given): the child row and their open enrolment, from the year's start. → the child's id. A name, if
    the test needs one, is its own `pii.child` row. A roll already held in the class is refused (UniqueViolation)."""
    t = school or tenant(conn)
    cls = a_class(conn, section, band, t)
    child = _only(
        conn.execute("insert into child (tenant_id, band) values (%s, %s) returning id", (t, band)).fetchone()
    )
    conn.execute(
        "insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by)"
        " select %s, %s, %s, %s, y.starts_on, 'tests.rows' from school_class c join academic_year y"
        " on y.id = c.academic_year_id where c.id = %s",
        (t, child, cls, roll, cls),
    )
    return child
