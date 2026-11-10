"""Rows a database test builds for itself, inside its own transaction, so it proves the same thing on a database
built from the repository (`bin/testdb fresh`, what CI runs) as on a copy of live — never "whatever live holds".
"""

import json
import re
import uuid

from engine.core import db


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


def a_child(conn, section=None):
    """A Grade 2 child in a section of its own, on the roster as every child is: `child` and its `pii` row."""
    t = tenant(conn)
    section = section or f"ROWS-{uuid.uuid4().hex[:6].upper()}"
    child = a_child_in(conn, section, "G2", "1", t)
    conn.execute(
        "insert into pii.child (tenant_id, child_id, first_name) values (%s, %s, 'Rowstest')", (t, child)
    )
    return child


WAITED = {
    "correct": "read as a right answer; a person checks every answer of this kind until the reader is trusted on it",
    "wrong": "read as a wrong answer; a person checks every wrong answer before it counts",
    "blank": "read as blank; a person checks every blank before it counts",
}


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
        (t, child, f"ROWS-{tag[:8]}", json.dumps({"code": paper}), paper),
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
# The people who sign in, as a test needs them (CP-27 group 4, step 4-prep): the one place that knows where the sign-in
# list is kept, so the step that moves it changes these bodies and no test. Today the list is the `config` row
# `app.staff` (a JSON list, an entry per person; the database gives each entry an `id`, the identity the website sets in
# `app.staff_id`). Group 4a keeps it on `staff` / `pii.staff` instead; a test never names either.
# Without `tenant`, every school's list (as the tests wrote it by hand); with it, that school's, made if it has none.


def _the_list(tenant):
    return "key = 'app.staff'" + (" and tenant_id = %s" if tenant else ""), ((tenant,) if tenant else ())


def _only(row):
    """The one column a row holds, whether the connection gives rows as dicts (the engine's) or tuples (some proofs')."""
    return None if row is None else (row[0] if isinstance(row, tuple) else next(iter(row.values())))


def signin_list(conn, tenant=None):
    """Everyone the sign-in knows, in the order they were put on, each as kept: email, name, role, password (the hash,
    if they have one), password_set_at, classes, subjects and the id the website signs them in as."""
    where, args = _the_list(tenant)
    found = _only(conn.execute(f"select value from config where {where}", args).fetchone())
    return found if found is not None else []


def signin_list_is(conn, people, tenant=None):
    """The sign-in knows exactly `people` (dicts as `signin_list` gives them), and no one else: for a test that sets the
    whole list it needs and puts back the one it found. The caller commits, if it must."""
    if tenant:
        conn.execute(
            "insert into config (tenant_id, key, value) values (%s, 'app.staff', %s)"
            " on conflict (tenant_id, key) do update set value = excluded.value",
            (tenant, json.dumps(people)),
        )
        return
    conn.execute("update config set value = %s where key = 'app.staff'", (json.dumps(people),))


def a_person(conn, email, name="Placeholder Person", role="educator", *, tenant=None, **kept):
    """A member of staff the sign-in knows, exactly as given: `email`, `name`, `role` and what else is `kept` of them
    (`password`, the hash; `password_set_at`, `classes`, `subjects`, an `id` to sign in as). An entry already there for
    the email is replaced, keeping the id it signs in as; a test that put the person on the staff tables first (same
    email) gets that person. → {"email", "ask_as"}: `ask_as` is what the website sets in `app.staff_id` when they sign
    in (`asking_as`). The caller commits, if it must."""
    had = next((p for p in signin_list(conn, tenant) if p.get("email") == email and p.get("id")), None)
    entry = {"email": email, "name": name, "role": role, **({"id": had["id"]} if had else {}), **kept}
    if had:
        forget_person(conn, email, tenant)
    if tenant:
        conn.execute(
            "insert into config (tenant_id, key, value) values (%s, 'app.staff', %s)"
            " on conflict (tenant_id, key) do update set value = config.value || excluded.value",
            (tenant, json.dumps([entry])),
        )
    else:
        conn.execute(
            "update config set value = value || %s::jsonb where key = 'app.staff'", (json.dumps([entry]),)
        )
    where, args = _the_list(tenant)
    me = conn.execute(
        f"select s ->> 'id' as id from config, jsonb_array_elements(value) s where {where} and s ->> 'email' = %s",
        (*args, email),
    ).fetchone()
    return {"email": email, "ask_as": _only(me)}


def forget_person(conn, email, tenant=None):
    """`email` is no longer someone the sign-in knows; everyone else is as they were. The caller commits, if it must."""
    where, args = _the_list(tenant)
    conn.execute(
        "update config set value = (select coalesce(jsonb_agg(s), '[]'::jsonb) from jsonb_array_elements(value) s"
        f" where s ->> 'email' <> %s) where {where}",
        (email, *args),
    )


def teaches(conn, email, classes, tenant=None):
    """`email` teaches `classes` (class labels) and nothing else of them changes, as the staff page saves a person."""
    where, args = _the_list(tenant)
    conn.execute(
        "update config set value = (select jsonb_agg(case when s ->> 'email' = %s"
        " then s || jsonb_build_object('classes', %s::jsonb) else s end order by n)"
        f" from jsonb_array_elements(value) with ordinality as e(s, n)) where {where}",
        (email, json.dumps(list(classes)), *args),
    )


def asking_as(conn, person):
    """The rest of this transaction asks as `person` (what `a_person` gave), as the website does for a signed-in
    request."""
    conn.execute("select set_config('app.staff_id', %s, true)", (person["ask_as"],))


# ---------------------------------------------------------------------------------------------------------------------
# A child in a class, as a test needs one (CP-27 group 4, step 4-prep): the one place that knows where a child's class
# and roll number are kept, so the step that moves them (group 4c: the class from the child's enrolment) changes this
# body and no test. Today they are `child.section` (the class's label) and `child.roll_no`.


def a_child_in(conn, section, band="G2", roll="1", school=None):
    """A child at roll number `roll` of the class labelled `section`, in grade `band`, of `school` (the tests' own school
    when none is given). → the child's id. Only the child row: a name, if the test needs one, is its own `pii.child`
    row."""
    return _only(
        conn.execute(
            "insert into child (tenant_id, roll_no, section, band) values (%s, %s, %s, %s) returning id",
            (school or tenant(conn), roll, section, band),
        ).fetchone()
    )
