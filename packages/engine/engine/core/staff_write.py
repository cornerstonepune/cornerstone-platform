"""The rows a staff import and a class educator write: a dated grant of a role, signed by a staff id."""

from datetime import date
from typing import Any

from engine.core import db, settings


def grant_all(conn: db.Conn, tenant: Any, grants: list[tuple[Any, str]], who: str) -> None:
    for staff_id, role in grants:
        grant(conn, tenant, staff_id, role, settings.school_today(conn), who)


def grant(
    conn: db.Conn,
    tenant: Any,
    staff_id: Any,
    role: str,
    since: date,
    by: str,
    class_id: Any = None,
    reason: str | None = None,
) -> None:
    conn.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by,"
        " override_reason) values (%s,%s,%s,%s,%s,%s,%s)",
        (tenant, staff_id, role, class_id, since, by, reason),
    )
