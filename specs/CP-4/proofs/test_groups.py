"""CP-4 item 3: run as an educator of one class, a query for another class's children, answers and evidence on any
child-data table returns 0 rows; the "everything" group sees all; no identity sees none. One test per group.

How it runs, on the throwaway database (never a live one), in one transaction that is rolled back:
- as the superuser: a new fake school (tenant), its time zone and sign-in list, three classes X, Y and Z, a person of
  the own-classes group holding a current grant on each, a person of the everything group, and in X and in Y one chain
  child -> pii.child -> enrolment -> paper (sheet_instance) -> scan (capture) -> answer (item_result) -> evidence
  (evidence_event) -> observation (activity_observation) -> note (pii.educator_note, pii.note_claim). The role codes
  come from access_role_group, one per group, never a list here. Foreign keys are not what is tested, so the chain is
  written with session_replication_role = replica (fake ids where a parent is not part of the chain). No real names.
- as a throwaway login that is a member of app_web (with a test-only select grant where app_web holds none), each
  identity set the way the website sets it: select set_config('app.staff_id', '<sign-in entry id>', true).
- for EVERY child_data row of access_table: no identity sees 0 rows; the everything person sees every row of the
  school; the educator of class Z (which holds nothing) sees 0 rows; on the seeded tables the educator of X sees X's rows
  (where the own-classes group reaches that kind) and none of Y's, and the educator of Y the reverse. Staff-keyed tables
  (a person's own record) show a person only their own rows. Every child_data table also carries a rule for the website
  that is not "allow everyone" and that tests the table's key column.
"""

import uuid

import psycopg
import pytest
from psycopg import sql

from conftest import opening_policies

FAKE = {"uuid": "gen_random_uuid()", "text": "'cp4'", "character varying": "'cp4'", "integer": "0",
        "smallint": "0", "bigint": "0", "numeric": "0", "real": "0", "double precision": "0", "boolean": "false",
        "date": "current_date", "timestamp with time zone": "now()", "timestamp without time zone": "now()",
        "jsonb": "'{}'", "json": "'{}'", "ARRAY": "'{}'"}


def ins(c, table: str, **vals) -> uuid.UUID:
    """Insert one row, given values plus a fake for every other required column; returns its id."""
    schema, name = table.split(".")
    for col, typ in c.execute(
            "select column_name::text, data_type::text from information_schema.columns where table_schema = %s "
            "and table_name = %s and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER'",
            (schema, name)).fetchall():
        if col not in vals:
            assert typ in FAKE, f"{table}.{col}: no fake for {typ}"
            vals[col] = sql.SQL(FAKE[typ])
    cols = list(vals)
    q = sql.SQL("insert into {} ({}) values ({}) returning id").format(
        sql.Identifier(schema, name), sql.SQL(", ").join(map(sql.Identifier, cols)),
        sql.SQL(", ").join(v if isinstance(v, sql.Composable) else sql.Literal(v) for v in vals.values()))
    return c.execute(q).fetchone()[0]


def _role_of(c, tenant, group: str, scope: str) -> str:
    row = c.execute(
        "select g.role_code from public.access_role_group g join role r on r.tenant_id = g.tenant_id "
        "and r.code = g.role_code where g.tenant_id = %s and g.group_code = %s and r.scope = %s "
        "order by r.ord, r.code limit 1", (tenant, group, scope)).fetchone()
    assert row, f"no {scope}-scoped role is in the {group} group"
    return row[0]


def _chain(c, tenant, cls, section, staff_id, template, seeded):
    def put(table, **v):
        rid = ins(c, table, tenant_id=tenant, **v)
        seeded.setdefault(table, {"X": set(), "Y": set()})[cls["tag"]].add(rid)
        return rid

    child = put("public.child", roll_no="1", band="G1", section=section, active=True)
    put("pii.child", child_id=child, first_name="Proof")
    put("public.enrolment", child_id=child, class_id=cls["id"], roll_no="1",
        from_date=sql.SQL("current_date - 30"), recorded_by="cp4 proof")
    sheet = put("public.sheet_instance", qr_code="CS" + uuid.uuid4().hex[:6], sheet_template_id=template,
                child_id=child, section=section)
    capture = put("public.capture", path=f"cp4/{section}.pdf", sheet_instance_id=sheet)
    result = put("public.item_result", capture_id=capture, item_id=uuid.uuid4(), rid="q1", status="blank")
    observation = put("public.activity_observation", child_id=child, class_id=cls["id"], observed_by=staff_id,
                      confirmed_by=staff_id)
    put("public.evidence_event", child_id=child, skill_code="NUM.OPS.01", rung_code="R1", channel="item",
        observed_at=sql.SQL("now()"), item_result_id=result, observation_id=observation)
    note = put("pii.educator_note", staff_id=staff_id, class_id=cls["id"], audio_key=f"cp4/{section}")
    put("pii.note_claim", note_id=note, decided_by=staff_id)


@pytest.fixture(scope="module")
def school(server):
    with psycopg.connect(server) as c:
        try:
            yield _build_school(c)  # never committed: the school exists only inside this transaction
        finally:
            c.rollback()


def _build_school(c):
    tag = uuid.uuid4().hex[:8]
    tenant = c.execute("insert into tenant (slug, name) values (%s, 'CP-4 proof school') returning id",
                       (f"cp4-proof-{tag}",)).fetchone()[0]
    own_role = _role_of(c, tenant, "own_classes", "class")
    all_role = _role_of(c, tenant, "everything", "campus")
    c.execute("set local session_replication_role = replica")
    campus = ins(c, "public.campus", tenant_id=tenant, name=f"CP-4 proof campus {tag}")
    year = ins(c, "public.academic_year", tenant_id=tenant, label="2026-27",
               starts_on=sql.SQL("current_date - 100"), ends_on=sql.SQL("current_date + 200"))
    classes = {t: {"tag": t, "id": ins(c, "public.school_class", tenant_id=tenant, campus_id=campus,
                                       academic_year_id=year, grade_code="K9", section=s)}
               for t, s in (("X", "P"), ("Y", "Q"), ("Z", "R"))}
    people, entries = {}, []
    for who in ("X", "Y", "Z", "all"):
        staff = ins(c, "public.staff", tenant_id=tenant, campus_id=campus, active=True)
        email = f"cp4-{who.lower()}-{tag}@example.test"
        ins(c, "pii.staff", tenant_id=tenant, staff_id=staff, name=f"Proof person {who}", email=email)
        ins(c, "public.staff_role_grant", tenant_id=tenant, staff_id=staff,
            role_code=all_role if who == "all" else own_role,
            school_class_id=None if who == "all" else classes[who]["id"],
            valid_from=sql.SQL("current_date - 30"), granted_by="cp4 proof")
        entry = str(uuid.uuid4())
        entries.append({"id": entry, "email": email, "name": f"Proof person {who}",
                        "role": "coordinator" if who == "all" else "educator"})
        people[who] = {"staff": staff, "entry": entry}
    for key, value in (("school.time_zone", "Asia/Kolkata"), ("app.staff", entries)):
        c.execute("insert into config (tenant_id, key, value) values (%s, %s, %s) "
                  "on conflict (tenant_id, key) do update set value = excluded.value",
                  (tenant, key, psycopg.types.json.Jsonb(value)))
    template = ins(c, "public.sheet_template", tenant_id=tenant, band="G1", source="generated", week="2026-W45")
    seeded = {}
    for t, s in (("X", "P"), ("Y", "Q")):
        _chain(c, tenant, classes[t], s, people[t]["staff"], template, seeded)
    c.execute("set local session_replication_role = origin")

    login = f"cp4_web_{tag}"
    c.execute(sql.SQL("create role {} login in role app_web").format(sql.Identifier(login)))
    rows = c.execute("select schema_name, table_name, kind_code, key_column, key_type from public.access_table "
                     "where data_class = 'child_data' order by 1, 2").fetchall()
    assert rows, "access_table lists no child_data table"
    c.execute(sql.SQL("grant usage on schema pii to {}").format(sql.Identifier(login)))
    for s, t, *_ in rows:
        if not c.execute("select has_table_privilege('app_web', %s, 'select')", (f"{s}.{t}",)).fetchone()[0]:
            c.execute(sql.SQL("grant select on {} to {}").format(sql.Identifier(s, t), sql.Identifier(login)))
    reach = dict(c.execute("select kind_code, reach from public.access_reach where tenant_id = %s "
                           "and group_code = 'own_classes'", (tenant,)).fetchall())
    return {"c": c, "tenant": tenant, "login": login, "people": people, "seeded": seeded, "rows": rows,
            "reach": reach}


def _as(school, who, query, args=()):
    """Run a query as the website login with the identity of `who` (None: no identity set), inside a savepoint that
    is always rolled back, so one identity never leaks into the next."""
    c = school["c"]
    with c.transaction(force_rollback=True):
        c.execute(sql.SQL("set local role {}").format(sql.Identifier(school["login"])))
        if who is not None:
            c.execute("select set_config('app.staff_id', %s, true)", (school["people"][who]["entry"],))
        return c.execute(query, args).fetchone()[0]


def _count(school, who, s, t, where=sql.SQL("true"), args=()):
    return _as(school, who, sql.SQL("select count(*) from {} where ").format(sql.Identifier(s, t)) + where, args)


def _check_all(school, fn):
    failures = []
    for row in school["rows"]:
        try:
            msg = fn(*row)
        except psycopg.Error as e:
            msg = f"error: {str(e).strip().splitlines()[0]}"
        if msg:
            failures.append(f"{row[0]}.{row[1]}: {msg}")
    assert not failures, f"{len(failures)} of {len(school['rows'])} child_data tables:\n" + "\n".join(failures)


def test_3_seeded_chain_is_all_child_data(school):
    listed = {f"{s}.{t}" for s, t, *_ in school["rows"]}
    missing = sorted(set(school["seeded"]) - listed)
    assert not missing, f"tables of the seeded chain not listed as child_data: {missing}"


def test_3_no_identity_sees_none(school):
    def fn(s, t, *_):
        n = _count(school, None, s, t)
        return f"{n} rows seen with no identity" if n else None
    _check_all(school, fn)


def test_3_everything_group_sees_all(school):
    c = school["c"]

    def fn(s, t, *_):
        has_tenant = c.execute("select exists (select from information_schema.columns where table_schema = %s "
                               "and table_name = %s and column_name = 'tenant_id')", (s, t)).fetchone()[0]
        where = sql.SQL("tenant_id = %s") if has_tenant else sql.SQL("true")
        args = (school["tenant"],) if has_tenant else ()
        expected = c.execute(sql.SQL("select count(*) from {} where ").format(sql.Identifier(s, t)) + where,
                             args).fetchone()[0]
        seen = _count(school, "all", s, t, where, args)
        return f"everything sees {seen} of {expected}" if seen != expected else None
    _check_all(school, fn)


def test_3_own_classes_group_sees_its_class_and_not_another(school):
    seeded, reach = school["seeded"], school["reach"]

    def fn(s, t, kind, key_column, key_type):
        problems = []
        if key_type == "staff":
            for who in ("X", "Z"):
                other = _count(school, who, s, t, sql.SQL("{}::text <> %s").format(sql.Identifier(key_column)),
                               (str(school["people"][who]["staff"]),))
                if other:
                    problems.append(f"educator of {who} sees {other} rows of other people")
            return "; ".join(problems) or None
        # a spare paper blueprint (child_open key, no child named) is read by all; the rest of the table is not
        spare = sql.SQL("{} is not null").format(sql.Identifier(key_column)) if key_type == "child_open" else sql.SQL("true")
        z = _count(school, "Z", s, t, spare)
        if z:
            problems.append(f"educator of class Z (which holds nothing) sees {z} rows")
        ids = seeded.get(f"{s}.{t}")
        if ids:
            for me, other in (("X", "Y"), ("Y", "X")):
                leak = _count(school, me, s, t, sql.SQL("id = any(%s)"), (list(ids[other]),))
                if leak:
                    problems.append(f"educator of {me} sees {leak} of class {other}'s rows")
                mine = _count(school, me, s, t, sql.SQL("id = any(%s)"), (list(ids[me]),))
                want = len(ids[me]) if reach.get(kind) == "own" else 0
                if mine != want:
                    problems.append(f"educator of {me} sees {mine} of own class's {len(ids[me])} rows "
                                    f"(own_classes reach for {kind}: {reach.get(kind, 'none')})")
        return "; ".join(problems) or None
    _check_all(school, fn)


def test_3_every_child_data_table_has_a_rule_that_is_not_allow_everyone(school):
    c = school["c"]

    def fn(s, t, kind, key_column, key_type):
        opening = opening_policies(c, "schemaname = %s and tablename = %s", (s, t))
        if opening:
            return f"rules that allow everyone: {[p[2] for p in opening]}"
        rules = c.execute("select policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') "
                          "from pg_policies where schemaname = %s and tablename = %s "
                          "and roles && array['app_web']::name[]", (s, t)).fetchall()
        if not rules:
            return "no rule for the website login"
        if not key_column or not all(key_column in text for _, text in rules):
            return f"a website rule does not test the key column {key_column!r}"
        return None
    _check_all(school, fn)
