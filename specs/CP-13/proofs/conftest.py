"""Shared helpers for CP-13's proofs (every item).

The database is a throwaway one built from this repository's migrations, never a live one (CP-4's pattern):
- TEST_DATABASE_URL when set (GitHub's athena job), on this machine only;
- otherwise a Postgres made here in a temp folder (initdb), with Supabase's three roles and every migration in
  supabase/migrations applied in filename order. Without Postgres's server binaries the proofs fail, they never skip.
DATABASE_URL (the live database) is never read; the one engine command run (item 4) is handed the throwaway URL.

Every proof makes its own fake school (a new tenant: its triggers give it grades, states, kinds and K2's rule), fake
children and fake staff ids. No names: the only text is placeholders. Every row is rolled back, except item 4's CLI
run, which must commit for a second process to see it and deletes what it wrote afterwards.
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
from psycopg import sql

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
SKILL = "NUM.OPS.01"  # a registry skill id, given to the fake school below
RUNG = "R1"
DAY0 = dt.datetime(2026, 9, 1, 4, 30, tzinfo=dt.UTC)  # 10:00 in Pune


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


def build(url: str, files: list[Path]) -> None:
    """Supabase's roles, then the given migrations in order (bin/testdb fresh, without the seed)."""
    with psycopg.connect(url, autocommit=True) as c:
        for r in SUPABASE_ROLES:
            c.execute(f"do $$ begin if not exists (select from pg_roles where rolname = '{r}') "
                      f"then create role {r} nologin; end if; end $$")
    for f in files:
        psql_file(url, f)


@pytest.fixture(scope="session")
def server():
    """The url of the built throwaway database."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
        assert host in ("127.0.0.1", "localhost", "") or host.startswith("/"), \
            "TEST_DATABASE_URL must be a throwaway database on this machine"
        yield url
        return
    pg = _pg_bin()
    tmp = Path(tempfile.mkdtemp(prefix="cp13-pg-"))
    os.chmod(tmp, 0o777)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    os.chmod(sock, 0o777)
    port = "54353"
    subprocess.run(_as_pg_user([str(pg / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"]),
                   check=True, capture_output=True)
    subprocess.run(_as_pg_user([str(pg / "pg_ctl"), "-D", str(data), "-w", "-l", str(tmp / "log"), "start",
                                "-o", f"-c listen_addresses='' -k {sock} -p {port}"]), check=True, capture_output=True)
    url = f"postgresql://postgres@/postgres?host={sock}&port={port}"
    try:
        build(url, MIGRATIONS)
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


# ---- fake rows ---------------------------------------------------------------------------------------------------

FAKE = {"uuid": "gen_random_uuid()", "text": "'cp13'", "character varying": "'cp13'", "integer": "0",
        "smallint": "0", "bigint": "0", "numeric": "0", "boolean": "false", "date": "current_date",
        "timestamp with time zone": "now()", "jsonb": "'{}'", "ARRAY": "'{}'"}


def ins(c, table: str, **vals):
    """Insert one row, given values plus a fake for every other required column; returns its id (CP-4's helper)."""
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


def school(c) -> uuid.UUID:
    """A new fake school: its tenant triggers make its grades, states, evidence kinds and K2's observed rule."""
    t = c.execute("insert into tenant (slug, name) values (%s, 'Proof School') returning id",
                  (f"cp13-{uuid.uuid4().hex[:8]}",)).fetchone()[0]
    c.execute("insert into registry_skill (tenant_id, code, domain, strand, name) "
              "values (%s, %s, 'Proof', 'Proof', 'Proof skill')", (t, SKILL))
    # the skill a question's rung names (item.rung_code references skill)
    ins(c, "skill", tenant_id=t, code="P.SKILL", rung_code=RUNG, name="Proof skill", learning_objective="proof",
        difficulty=json.dumps({}), grade="G2", descriptor="proof")
    return t


def child(c, t, band="G2") -> uuid.UUID:
    return c.execute("insert into child (tenant_id, roll_no, section, band) values (%s, '1', %s, %s) returning id",
                     (t, f"P-{uuid.uuid4().hex[:6]}", band)).fetchone()[0]


def at(day: int) -> dt.datetime:
    return DAY0 + dt.timedelta(days=day)


def written(c, t, kid, day, marks, seen_by=None, confirmed=True, minute=0):
    """Signed-off written answers on one school day, as evidence rows on the fake skill's rung, one per mark:
    'R' right, 'W' wrong with no mistake named, 'W:M_CODE' wrong with a named mistake, 'B' blank. `seen_by` is the
    adult (a staff id as text) the row names; a written answer names none by default."""
    for n, mark in enumerate(marks.split()):
        sign, _, code = mark.partition(":")
        correct = {"R": True, "W": False, "B": None}[sign]
        c.execute(
            "insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes,"
            " channel, observed_at, confirmed_by, seen_by) values (%s, %s, %s, %s, %s, %s, 'item', %s, %s, %s)",
            (t, kid, SKILL, RUNG, correct, [code] if code else [], at(day) + dt.timedelta(minutes=minute + n),
             "proof@example.org" if confirmed else None, seen_by))


def rebuild(c, kid) -> list[dict]:
    """`rebuild_child_skill_state`, then the child's rows (every column but the clock's)."""
    c.execute("select public.rebuild_child_skill_state(%s)", (kid,))
    return skill_rows(c, kid)


def skill_rows(c, kid) -> list[dict]:
    cur = c.execute("select * from child_skill_state where child_id = %s order by skill_code, rung_code", (kid,))
    names = [d.name for d in cur.description]
    drop = {"id", "computed_at", "created_at", "updated_at"}
    return [{k: v for k, v in zip(names, r) if k not in drop} for r in cur.fetchall()]


def one_state(c, kid):
    rows = rebuild(c, kid)
    assert len(rows) == 1, rows
    return rows[0]


def paper(c, t, kid, day, statuses, signed_off=True):
    """A real paper, read and signed off the school's way: a sheet for the child, its scan, one question per status
    and a candidate answer each, then `confirm_results`, which writes evidence through `answer_evidence`.
    `statuses` like 'correct blank wrong wrong:M_ALIGN_LEFT'. Returns the item_result ids in order."""
    tag = uuid.uuid4().hex[:6].upper()
    tpl = ins(c, "sheet_template", tenant_id=t, band="G2", child_id=kid, week=f"P-{tag}",
              key=json.dumps({"code": tag, "date": at(day).isoformat()}))
    inst = ins(c, "sheet_instance", tenant_id=t, qr_code=f"CS{tag}", sheet_template_id=tpl, child_id=kid,
               print_status="returned")
    cap = ins(c, "capture", tenant_id=t, path="proof.pdf", pages=1, sheet_instance_id=inst, status="processed")
    ids = []
    for n, s in enumerate(statuses.split()):
        status, _, code = s.partition(":")
        item = ins(c, "item", tenant_id=t, item_key=f"cp13/{tag}/{n}", template="cp13", rung_code=RUNG,
                   skill_codes=[SKILL], signal="Procedural", fmt="column",
                   spec=json.dumps({"op": "+", "a": 34, "b": 25, "page": 1}),
                   responses=json.dumps([{"rid": "a", "answer": 59}]))
        ids.append(ins(c, "item_result", tenant_id=t, capture_id=cap, item_id=item, rid="a", status=status,
                       misconception_codes=[code] if code else [], state="candidate"))
    if signed_off:
        c.execute("select public.confirm_results(%s, 'proof@example.org', %s)", (kid, cap))
    return ids


# ---- the K2 observed path (test_k2_picture.py's `k2` and `seen`, on the fake school) ----------------------------

def k2_class(c, t, grade="K2"):
    campus = ins(c, "campus", tenant_id=t, name="Proof campus")
    year = ins(c, "academic_year", tenant_id=t, label="2026-27", starts_on="2026-04-01", ends_on="2027-03-31")
    klass = ins(c, "school_class", tenant_id=t, campus_id=campus, academic_year_id=year, grade_code=grade,
                section=f"T{uuid.uuid4().hex[:5]}")
    activity = ins(c, "activity", tenant_id=t, code=f"ACT-{uuid.uuid4().hex[:5]}", name="Proof activity",
                   band=grade, strand="Proof")
    code = c.execute("select code from activity where id = %s", (activity,)).fetchone()[0]
    return {"tenant": t, "campus": campus, "class": klass, "activity": code}


def staff(c, s) -> uuid.UUID:
    return ins(c, "staff", tenant_id=s["tenant"], campus_id=s["campus"])


def seen(c, s, kid, day, by, reached=3, expected=2, mode="individual"):
    """One confirmed observation by staff `by` (named, level `reached`) and its evidence on the fake skill."""
    mark = {0: "not_yet", 1: "not_yet", 2: "sometimes", 3: "yes"}[reached]
    outcome = "above" if reached > expected else "below" if reached < expected else "as_expected"
    obs = c.execute(
        "insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome,"
        " entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)"
        " values (%s, %s, %s, %s, %s, %s, %s, 'form', %s, %s, %s, %s, %s) returning id",
        (s["tenant"], uuid.uuid4(), s["activity"], kid, s["class"], outcome, mode, expected, reached, at(day), by,
         by)).fetchone()[0]
    c.execute(
        "insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind,"
        " mark, seen_by, place, source, observation_id)"
        " values (%s, %s, %s, 'educator', %s, %s, 'observed', %s, %s, 'class', 'voice note', %s)",
        (s["tenant"], kid, SKILL, at(day), str(by), mark, str(by), obs))
    return obs


def observed(c, kid):
    """`rebuild_child_observed_state`, then the child's observed picture: [(skill, grade, state, adults)]."""
    c.execute("select public.rebuild_child_observed_state(%s)", (kid,))
    return c.execute("select skill_code, grade_code, state, adults from child_observed_state where child_id = %s"
                     " order by 1, 2", (kid,)).fetchall()
