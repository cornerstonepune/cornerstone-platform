"""CP-4 item 6: the engine's own jobs still run; the engine's full test suite passes unchanged.

The suite itself is CI's main job (and runs as the database owner, so it cannot show a rule problem). This proves the
mechanism directly, on the throwaway database:
- every table keeps one rule that lets the engine's login through for everything (`engine_all`, to app_engine, all
  commands, using and check true), and no `app_all` is left;
- the engine login's privileges are exactly what they were before the CP-4 migration (a database built from the
  migrations before it, snapshotted, then the CP-4 migration applied and snapshotted again);
- every view applies the caller's rules (security_invoker);
- the engine's tests were not deleted or weakened; the one assertion CP-4 rewrites (app_all on every table,
  test_roles.py) now asserts engine_all and web_rule / web_all.
"""

import re
import subprocess

import psycopg
import pytest

from conftest import MIGRATIONS, ROOT, base_tables, build, psql_file, scratch_database

TESTS = ROOT / "packages" / "engine" / "tests"
PRIVS = ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")


def test_6_every_table_lets_the_engine_through(conn):
    tables = base_tables(conn)
    ok = {r[0] for r in conn.execute(
        "select schemaname || '.' || tablename from pg_policies where policyname = 'engine_all' "
        "and permissive = 'PERMISSIVE' and roles = '{app_engine}'::name[] and cmd = 'ALL' "
        "and btrim(qual, ' ()') = 'true' and btrim(with_check, ' ()') = 'true'")}
    assert not tables - ok, f"tables without engine_all (to app_engine, all, true/true): {sorted(tables - ok)}"


def test_6_no_app_all_policy_remains(conn):
    left = conn.execute("select schemaname || '.' || tablename from pg_policies where policyname = 'app_all'").fetchall()
    assert not left, f"{len(left)} tables still carry app_all: {[r[0] for r in left][:20]}"


def test_6_every_view_is_security_invoker(conn):
    bad = conn.execute(
        "select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname in ('public', 'pii') and c.relkind = 'v' "
        "and not coalesce('security_invoker=true' = any(c.reloptions) or 'security_invoker=on' = any(c.reloptions), "
        "false)").fetchall()
    assert not bad, f"views that skip the caller's rules: {[r[0] for r in bad]}"


def _cp4_migration():
    found = [f for f in MIGRATIONS if re.search(r"\bdata_class\b", f.read_text())]
    assert found, "no migration in supabase/migrations adds access_table.data_class (the CP-4 migration)"
    return found[0]


def _engine_privileges(url: str) -> set[tuple]:
    with psycopg.connect(url) as c:
        tables = sorted(base_tables(c))
        got = {(t, "", p) for t in tables for p in PRIVS
               if c.execute("select has_table_privilege('app_engine', %s, %s)", (t, p)).fetchone()[0]}
        got |= {(f"{s}.{t}", col, p) for s, t, col, p in c.execute(
            "select table_schema, table_name, column_name, privilege_type from information_schema.column_privileges "
            "where grantee = 'app_engine' and table_schema in ('public', 'pii')")}
        return got


def test_6_engine_privileges_unchanged_by_the_cp4_migration(server):
    cp4 = _cp4_migration()
    before = [f for f in MIGRATIONS if f.name < cp4.name]
    with scratch_database(server) as url:
        build(url, before)
        pre = _engine_privileges(url)
        psql_file(url, cp4)
        post = _engine_privileges(url)
    existed = {t for t, _, _ in pre}
    had = {(t, c) for t, c, _ in pre if c}
    # a table or a column CP-4 itself adds has no "before"; every privilege that had one is compared exactly
    post = {x for x in post if x[0] in existed and (not x[1] or (x[0], x[1]) in had)}
    assert pre, "the engine login holds no privilege before CP-4: the snapshot is wrong"
    assert post == pre, f"gained: {sorted(post - pre)[:20]}; lost: {sorted(pre - post)[:20]}"


# ---- the engine's tests --------------------------------------------------------------------------------------------

def git(*args: str) -> str:
    out = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    if out.returncode != 0:
        pytest.fail(f"git {' '.join(args)} failed: {out.stderr.strip() or 'not a git checkout'}")
    return out.stdout


def merge_base() -> str:
    for ref in ("origin/main", "origin/master"):
        if subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", "-q", ref],
                          capture_output=True).returncode == 0:
            return git("merge-base", ref, "HEAD").strip()
    pytest.fail("no origin/main to compare with: this proof needs the repository's history (fetch-depth 0)")


SKIPPING = re.compile(r"pytest\.mark\.(skip|skipif|xfail)\b|pytest\.(skip|xfail)\(")


def _counts(text: str) -> tuple[int, int, int]:
    return (len(re.findall(r"^\s*def test_", text, re.M)), len(re.findall(r"\bassert\b", text)),
            len(SKIPPING.findall(text)))


def test_6_no_engine_test_deleted_or_weakened():
    base = merge_base()
    deleted = git("diff", "--name-only", "--diff-filter=DR", base, "--", "packages/engine/tests").split()
    assert not deleted, f"engine tests deleted or renamed: {deleted}"
    weakened = []
    for path in git("diff", "--name-only", "--diff-filter=M", base, "--", "packages/engine/tests").split():
        if not path.endswith(".py") or path.endswith("test_roles.py"):
            continue
        old = _counts(git("show", f"{base}:{path}"))
        new = _counts((ROOT / path).read_text())
        if new[0] < old[0] or new[1] < old[1] or new[2] > old[2]:
            weakened.append(f"{path}: tests/asserts/skips {old} -> {new}")
    assert not weakened, weakened


def test_6_roles_test_asserts_the_new_rules_not_app_all():
    src = (TESTS / "test_roles.py").read_text()
    assert "'app_all'" not in src and '"app_all"' not in src, "test_roles.py still asserts app_all"
    for name in ("engine_all", "web_rule", "web_all"):
        assert name in src, f"test_roles.py does not assert {name}"
    base_src = git("show", f"{merge_base()}:packages/engine/tests/test_roles.py")
    old, new = _counts(base_src), _counts(src)
    assert new[0] >= old[0] and new[2] <= old[2], f"test_roles.py lost tests or gained skips: {old} -> {new}"

