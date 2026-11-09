"""CP-3 item 8 (LIVE, box only, read-only): none of the four kinds of data has a rule that allows everyone, and the site
connects with the restricted login (app_web), not the owner login.

Reads the live database through DATABASE_URL in a read-only transaction. Prints counts, table names and role names only,
never a row.

- Tables: every row of public.access_table (when it exists) plus the floor the scope names: public.child, pii.child,
  public.enrolment, public.staff, public.staff_role_grant, pii.staff, pii.educator_note, pii.note_claim. Each must
  exist with row security on.
- "Allows everyone": a permissive policy that applies to app_web, public, authenticated or anon whose read condition
  (qual) or write condition (with_check, or qual when it has none) is empty or true. engine_all (to app_engine only) and
  service_role_all (to service_role only) apply to none of those roles, so they are not counted.
- The site's login: the live sessions in pg_stat_activity, counted by login name. At least one session is app_web's
  (only the website uses app_web, ADR 0046); app_web owns none of these tables and is neither superuser nor bypasses row
  security. Limit: this shows the site uses app_web, not that nothing of the site's still uses the owner (the engine
  still does, by design); the owner's session count is printed for the reader.
- The helpers the rules call (signed_in_staff, my_tenant, my_reach, my_ids, internal.resolve_staff) exist and their
  owner is superuser or bypasses row security, so the helpers can read what they decide on.
"""

import os
import sys

import psycopg

FLOOR = ["public.child", "pii.child", "public.enrolment", "public.staff", "public.staff_role_grant", "pii.staff",
         "pii.educator_note", "pii.note_claim"]
OPEN_TO = {"app_web", "public", "authenticated", "anon"}
HELPERS = ["public.signed_in_staff()", "public.my_tenant()", "public.my_reach(text)", "public.my_ids(text,text)",
           "internal.resolve_staff()"]


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    fails = []
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        tables = list(FLOOR)
        if conn.execute("select to_regclass('public.access_table') is not null").fetchone()[0]:
            for s, t in conn.execute("select schema_name, table_name from public.access_table").fetchall():
                if f"{s}.{t}" not in tables:
                    tables.append(f"{s}.{t}")
        else:
            fails.append("public.access_table does not exist")

        open_rules = 0
        for name in tables:
            s, t = name.split(".")
            row = conn.execute("select c.relrowsecurity, pg_get_userbyid(c.relowner) from pg_class c "
                               "join pg_namespace n on n.oid = c.relnamespace where n.nspname = %s and c.relname = %s",
                               (s, t)).fetchone()
            if row is None:
                fails.append(f"{name}: no such table")
                continue
            rls, owner = row
            if not rls:
                fails.append(f"{name}: row security is off")
            if owner == "app_web":
                fails.append(f"{name}: owned by app_web")
            pols = conn.execute(
                "select policyname, permissive, roles::text[], cmd, qual, with_check from pg_policies "
                "where schemaname = %s and tablename = %s", (s, t)).fetchall()
            bad = []
            for pname, permissive, roles, cmd, qual, check in pols:
                if permissive != "PERMISSIVE" or not OPEN_TO & set(roles):
                    continue
                read_open = cmd in ("ALL", "SELECT", "UPDATE", "DELETE") and (qual or "").strip() in ("", "true")
                write = check if check is not None else qual
                write_open = cmd in ("ALL", "INSERT", "UPDATE") and (write or "").strip() in ("", "true")
                if read_open or write_open:
                    bad.append(pname)
            open_rules += len(bad)
            print(f"{name}: {len(pols)} policies, {len(bad)} allow everyone {bad if bad else ''}".rstrip())
            if bad:
                fails.append(f"{name}: rules that allow everyone: {bad}")
        print(f"{len(tables)} tables of the four kinds; {open_rules} rules that allow everyone")

        sessions = dict(conn.execute("select usename, count(*) from pg_stat_activity where usename is not null "
                                     "and backend_type = 'client backend' group by usename").fetchall())
        owner = conn.execute("select pg_get_userbyid(relowner) from pg_class where oid = 'public.child'::regclass"
                             ).fetchone()[0]
        print(f"live sessions as app_web: {sessions.get('app_web', 0)}; as the tables' owner ({owner}): "
              f"{sessions.get(owner, 0)}")
        if not sessions.get("app_web"):
            fails.append("no live session uses app_web: the site does not connect with the restricted login")
        web = conn.execute("select rolsuper, rolbypassrls from pg_roles where rolname = 'app_web'").fetchone()
        if web is None or web[0] or web[1]:
            fails.append("app_web is missing, or is superuser, or bypasses row security")

        for h in HELPERS:
            row = conn.execute("select r.rolname, r.rolsuper or r.rolbypassrls from pg_proc p join pg_roles r "
                               "on r.oid = p.proowner where p.oid = to_regprocedure(%s)", (h,)).fetchone()
            if row is None:
                fails.append(f"helper {h} is not on the live database")
            elif not row[1]:
                fails.append(f"helper {h} is owned by {row[0]}, which neither is superuser nor bypasses row security")
            else:
                print(f"helper {h}: owner bypasses row security")
    for f in fails:
        print("FAIL:", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
