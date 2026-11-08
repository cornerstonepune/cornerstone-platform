"""Shared helpers for CP-19's proofs (items 1 to 7).

The database is a throwaway one built from this repository's migrations, never a live one (CP-13's and CP-20's
pattern): TEST_DATABASE_URL when set (GitHub's athena job, on this machine only), otherwise a Postgres made here in a
temp folder with Supabase's three roles and every migration in supabase/migrations applied in filename order. Without
Postgres's server binaries the proofs fail, they never skip. DATABASE_URL (the live database) is never read here.

Every proof makes its own fake school (a new tenant), fake children and fake staff ids; the only text is placeholders,
never a name. Every row is rolled back. No proof sends a message or calls a model: "sent" is only `parent_note.sent_at`.

The website's way in is reproduced exactly: `set local role app_web`, then `set_config('app.staff_id', <id>, true)` in
the same transaction (CP-2). The engine's way in is `set local role app_engine`.
"""

import datetime as dt
import glob
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg import errors, sql

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
SKILL = "NUM.OPS.01"  # a registry skill id, given to the fake school below
RUNG = "R1"
FIRST_APPROVERS = ["class_teacher", "cover_educator"]  # design: report.first_approver_roles
COORDINATORS = ["coordinator", "deputy_coordinator", "head"]  # k2.reads.coordinator_roles, as seeded

# A missing table, function or column is the feature not being there yet: never a refusal.
NOT_A_REFUSAL = (errors.UndefinedTable, errors.UndefinedFunction, errors.UndefinedColumn, errors.UndefinedObject,
                 errors.SyntaxError, errors.InvalidSchemaName)


def _pg_bin() -> Path:
    for d in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True):
        if (Path(d) / "initdb").exists():
            return Path(d)
    found = shutil.which("initdb")
    if found:
        return Path(found).parent
    pytest.fail("TEST_DATABASE_URL is not set and this machine has no Postgres server binaries (initdb)")


def _as_pg_user(cmd: list[str]) -> list[str]:
    # initdb refuses to run as root; GitHub's runner is not root, a sandbox may be.
    return ["runuser", "-u", "postgres", "--", *cmd] if os.geteuid() == 0 else cmd


def psql_file(url: str, path: Path) -> None:
    out = subprocess.run(["psql", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(path)],
                         capture_output=True, text=True)
    assert out.returncode == 0, f"{path.name}: {out.stderr.strip()[-800:]}"


@pytest.fixture(scope="session")
def server():
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp19-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    port = "54359"
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8",
                                "--locale=C"]), check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {port}"]), check=True, capture_output=True)
    url = f"postgresql://postgres@/postgres?host={sock}&port={port}"
    try:
        with psycopg.connect(url, autocommit=True) as c:
            for r in SUPABASE_ROLES:
                c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                          f"then create role {r} nologin; end if; end $$")
        for f in MIGRATIONS:
            psql_file(url, f)
        yield url
    finally:
        subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"]),
                       capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def conn(server):
    """One transaction on the built database, always rolled back: nothing a proof does is kept."""
    with psycopg.connect(server) as c:
        try:
            yield c
        finally:
            c.rollback()


# ---- what the scope names must exist (else the proof fails for that reason, never passes by accident) -----------

def need(c, *names: str) -> None:
    """Each name is a table/view (`report_line`) or a function signature (`public.f(uuid,text)`)."""
    for n in names:
        if "(" in n:
            ok = c.execute("select to_regprocedure(%s) is not null", (n,)).fetchone()[0]
        else:
            ok = c.execute("select to_regclass(%s) is not null", (n,)).fetchone()[0]
        assert ok, f"{n} does not exist: CP-19 has not built it yet"


DECIDE = "public.report_line_decide(uuid,text,text)"
MARK_SENT = "public.report_mark_sent(uuid,text)"
COUNTS = "public.coordinator_counts(uuid)"


# ---- acting as the website or the engine ------------------------------------------------------------------------

def act(c, role: str, staff, query: str, params=()):
    """Run one statement as `role` with `app.staff_id` set as the website sets it (or not set, when staff is None),
    inside a savepoint. Returns its rows; on an error the savepoint is rolled back (role and identity with it)."""
    with c.transaction():
        c.execute(sql.SQL("set local role {}").format(sql.Identifier(role)))
        if staff is not None:
            c.execute("select set_config('app.staff_id', %s, true)", (str(staff),))
        cur = c.execute(query, params)
        rows = cur.fetchall() if cur.description else []
        c.execute("reset role")
        c.execute("select set_config('app.staff_id', '', true)")
    return rows


def refused(c, role: str, staff, query: str, params=()) -> psycopg.Error:
    """The statement is refused by the database (a raise, a check, a missing privilege), not by being absent."""
    try:
        act(c, role, staff, query, params)
    except NOT_A_REFUSAL as e:
        pytest.fail(f"not a refusal: what the scope names is missing: {e}")
    except psycopg.Error as e:
        return e
    pytest.fail(f"accepted, should have been refused: {role} staff={staff}: {query}")


def refused_insert_guard(c, write) -> psycopg.Error:
    """`write()` (rows written as the migrations' owner) is refused by the database's own rule, inside a savepoint."""
    try:
        with c.transaction():
            write()
    except NOT_A_REFUSAL as e:
        pytest.fail(f"not a refusal: what the scope names is missing: {e}")
    except psycopg.Error as e:
        return e
    pytest.fail("accepted, should have been refused")


def decide(c, line, staff, decision="approved", reason=None, role="app_web"):
    return act(c, role, staff, "select public.report_line_decide(%s, %s, %s)", (line, decision, reason))


def mark_sent(c, note, staff, channel="whatsapp", role="app_web"):
    return act(c, role, staff, "select public.report_mark_sent(%s, %s)", (note, channel))


# ---- fake rows ---------------------------------------------------------------------------------------------------

FAKE = {"uuid": "gen_random_uuid()", "text": "'cp19'", "character varying": "'cp19'", "integer": "0",
        "smallint": "0", "bigint": "0", "numeric": "0", "boolean": "false", "date": "current_date",
        "timestamp with time zone": "now()", "time without time zone": "'09:00'", "jsonb": "'{}'", "ARRAY": "'{}'"}


def ins(c, table: str, **vals):
    """Insert one row, given values plus a fake for every other required column; returns its id."""
    schema, name = table.split(".") if "." in table else ("public", table)
    for col, typ in c.execute(
            "select column_name::text, data_type::text from information_schema.columns where table_schema = %s "
            "and table_name = %s and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER'",
            (schema, name)).fetchall():
        if col not in vals:
            assert typ in FAKE, f"{table}.{col}: no fake for {typ}"
            vals[col] = sql.SQL(FAKE[typ])
    q = sql.SQL("insert into {} ({}) values ({}) returning id").format(
        sql.Identifier(schema, name), sql.SQL(", ").join(map(sql.Identifier, vals)),
        sql.SQL(", ").join(v if isinstance(v, sql.Composable) else sql.Literal(v) for v in vals.values()))
    return c.execute(q).fetchone()[0]


def setting(c, t, key: str, value) -> None:
    c.execute("insert into config (tenant_id, key, value) values (%s, %s, %s) "
              "on conflict (tenant_id, key) do update set value = excluded.value", (t, key, json.dumps(value)))


def min_events(c, t, n: int) -> None:
    """The school's "seen enough" setting, `threshold` state.min_events, for the fake school."""
    c.execute("insert into threshold (tenant_id, key, value) values (%s, 'state.min_events', %s) "
              "on conflict (tenant_id, key) do update set value = excluded.value", (t, n))


def school(c) -> dict:
    """A new fake school (its tenant triggers give it grades, roles, one campus, approval kinds and vocabularies), a
    year, the registry skill, and the two settings the approval and counting rules read."""
    t = c.execute("insert into tenant (slug, name) values (%s, 'Proof School') returning id",
                  (f"cp19-{uuid.uuid4().hex[:8]}",)).fetchone()[0]
    c.execute("insert into registry_skill (tenant_id, code, domain, strand, name) "
              "values (%s, %s, 'Proof', 'Proof', 'Proof skill')", (t, SKILL))
    campus = c.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()[0]
    year = ins(c, "academic_year", tenant_id=t, label="2026-27", starts_on="2026-04-01", ends_on="2027-03-31")
    setting(c, t, "report.first_approver_roles", FIRST_APPROVERS)
    setting(c, t, "k2.reads", {"coordinator_roles": COORDINATORS, "grades": ["K2"], "row_days": 14,
                               "week_starts_on": 0})
    zone = c.execute("select value #>> '{}' from config where tenant_id = %s and key = 'school.time_zone'",
                     (t,)).fetchone()
    return {"tenant": t, "campus": campus, "year": year, "zone": zone[0] if zone else "Asia/Kolkata"}


def klass(c, s, grade="K2"):
    return ins(c, "school_class", tenant_id=s["tenant"], campus_id=s["campus"], academic_year_id=s["year"],
               grade_code=grade, section=f"T{uuid.uuid4().hex[:5]}")


def child(c, s, cls, grade="K2"):
    kid = c.execute("insert into child (tenant_id, roll_no, section, band) values (%s, '1', %s, %s) returning id",
                    (s["tenant"], f"P-{uuid.uuid4().hex[:6]}", grade)).fetchone()[0]
    c.execute("insert into enrolment (tenant_id, child_id, class_id, roll_no, from_date, recorded_by) "
              "values (%s, %s, %s, %s, '2026-04-01', 'proof')", (s["tenant"], kid, cls, uuid.uuid4().hex[:6]))
    return kid


def person(c, s, role=None, cls=None, override=None):
    """A fake member of staff (an id, no name), holding `role` on class `cls` (or campus-wide) from April."""
    me = ins(c, "staff", tenant_id=s["tenant"], campus_id=s["campus"])
    if role:
        grant(c, s, me, role, cls, override)
    return me


def grant(c, s, me, role, cls=None, override=None):
    c.execute("insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by,"
              " override_reason) values (%s, %s, %s, %s, '2026-04-01', 'proof', %s)",
              (s["tenant"], me, role, cls, override))


def evidence(c, s, kid, at: dt.datetime, confirmed=True):
    """One written answer as an evidence row (confirmed or not), dated `at`."""
    return c.execute(
        "insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, channel, observed_at,"
        " confirmed_by) values (%s, %s, %s, %s, true, 'item', %s, %s) returning id",
        (s["tenant"], kid, SKILL, RUNG, at, "proof@example.org" if confirmed else None)).fetchone()[0]


def note(c, s, kid, period_from, period_to):
    """A parent report (one parent_note) for the period, with no lines yet."""
    return ins(c, "parent_note", tenant_id=s["tenant"], child_id=kid, week="P",
               body=json.dumps({"facts": {}}), period_from=period_from, period_to=period_to)


def line(c, s, kid, pnote, evidence_ids, section="can_do"):
    """One report line: what it says (a placeholder), its section, its skill and the evidence it rests on."""
    typ = c.execute("select data_type from information_schema.columns where table_schema = 'public' "
                    "and table_name = 'report_line' and column_name = 'skill_id'").fetchone()
    skill = SKILL
    if typ and typ[0] == "uuid":
        skill = c.execute("select id from registry_skill where tenant_id = %s and code = %s",
                          (s["tenant"], SKILL)).fetchone()[0]
    return ins(c, "report_line", tenant_id=s["tenant"], child_id=kid, parent_note_id=pnote, section=section,
               skill_id=skill, text="proof line", evidence_ids=[str(e) for e in evidence_ids])


def consent(c, s, kid, decision="given"):
    """A parent's answer recorded for the child (the register must exist first; it is fingerprinted)."""
    if not c.execute("select exists (select 1 from data_register where tenant_id = %s)", (s["tenant"],)).fetchone()[0]:
        register_entry(c, s)
    c.execute("insert into consent (tenant_id, child_id, decision, given_by, how, recorded_by) "
              "values (%s, %s, %s, 'parent', 'signed form', 'proof')", (s["tenant"], kid, decision))


def register_entry(c, s):
    c.execute("insert into data_register (tenant_id, code, ord, what, why, how_long, who_sees, tables) "
              "values (%s, %s, (select coalesce(max(ord), 0) + 1 from data_register where tenant_id = %s),"
              " 'proof', 'proof', 'proof', 'proof', '{report_line}')",
              (s["tenant"], f"proof_{uuid.uuid4().hex[:6]}", s["tenant"]))


def approvals(c, target) -> int:
    return c.execute("select count(*) from approval where kind = 'report_line' and target = %s "
                     "and decision = 'approved'", (str(target),)).fetchone()[0]


def ready_line(c, s, kid, pnote, at):
    """A line resting on two confirmed pieces of the child's evidence dated `at`."""
    return line(c, s, kid, pnote, [evidence(c, s, kid, at), evidence(c, s, kid, at + dt.timedelta(minutes=1))])


@pytest.fixture
def people(conn):
    """A fake school with one K2 class, one child in it, the class's educator, the coordinator, a second coordinator,
    an educator of another class, and a person who is both the class's cover educator and a coordinator."""
    c = conn
    s = school(c)
    cls, other = klass(c, s), klass(c, s)
    kid = child(c, s, cls)
    both = person(c, s, "cover_educator", cls)
    grant(c, s, both, "coordinator")
    return {
        "s": s, "class": cls, "kid": kid,
        "educator": person(c, s, "class_teacher", cls),
        "coordinator": person(c, s, "coordinator"),
        "coordinator2": person(c, s, "deputy_coordinator"),
        "elsewhere": person(c, s, "class_teacher", other),
        "both": both,
    }


PERIOD = ("2026-09-01", "2026-09-30")
INSIDE = dt.datetime(2026, 9, 10, 4, 30, tzinfo=dt.UTC)  # 10:00 in Pune, inside the period
AFTER = dt.datetime(2026, 10, 15, 4, 30, tzinfo=dt.UTC)  # two weeks after the period ends
