"""Who sees the K2 educator's screens (D-076): everyone they are for once `educator.timetable_enabled` is on; before
that, only the staff preview, a member of staff whose open grant is in a role `educator.preview_roles` names (a config
row; head and coordinator; a missing row previews nobody). A previewer who holds no class sees every class with
lessons on the day asked: a timetable carries no child. A preview only looks: it changes and sends
nothing. The one rule for the timetable and the materials routes, and the one reading of the switch."""

import datetime as dt
import uuid
from typing import Any

from engine.core import db, settings

SWITCH = "educator.timetable_enabled"
PREVIEW = "educator.preview_roles"
COORDINATORS = "k2.reads"  # its `coordinator_roles`: the school's coordinator list


def switched_on(conn: db.Conn) -> bool:
    return settings.config(conn, SWITCH, False) is True


def school_today(conn: db.Conn) -> dt.date:
    return db.one(conn, "select (now() at time zone %s)::date as d", (settings.time_zone(conn),))["d"]


def holds(conn: db.Conn, staff: Any, key: str) -> bool:
    """Whether `staff` holds an open grant today, by the school's clock, in a role the config row `key` names (a list; a
    missing row names nobody)."""
    return _holds_any(conn, staff, list(settings.config(conn, key, [])))


def _holds_any(conn: db.Conn, staff: Any, roles: list[str]) -> bool:
    today = school_today(conn)
    return bool(roles) and bool(
        conn.execute(
            "select 1 from staff_role_grant where staff_id = %s and role_code = any(%s)"
            " and valid_from <= %s and (valid_to is null or valid_to >= %s)",
            (staff, roles, today, today),
        ).fetchone()
    )


def sees_all(conn: db.Conn, staff: Any) -> bool:
    """Whether `staff` reads every class's timetable, read-only, whether the switch is on or off: an open grant in a role
    the school's coordinator list names (config `k2.reads`, its `coordinator_roles`: coordinator, deputy coordinator, head).
    Nimish, 12 Nov 2026 (issue #691): "coordinators, deputy coordinators and the head can read every class's timetable"."""
    roles = (settings.config(conn, COORDINATORS, {}) or {}).get("coordinator_roles", [])
    return _holds_any(conn, staff, list(roles))


def a_class(conn: db.Conn, staff: Any, class_id: str) -> dict | None:
    """One class of the person's own school by its id, as `k2_day.my_classes` gives a class; None when there is none."""
    try:
        uuid.UUID(class_id)
    except ValueError:
        return None
    return conn.execute(
        "select c.id::text as id, c.grade_code as grade, c.section, c.academic_year_id, c.campus_id, c.tenant_id from school_class c"
        " where c.id = %s and c.tenant_id = (select tenant_id from staff where id = %s)",
        (class_id, staff),
    ).fetchone()


def previews(conn: db.Conn, staff: Any) -> bool:
    """Whether `staff` is the staff preview today, by the school's clock."""
    return holds(conn, staff, PREVIEW)


def open_to(conn: db.Conn, staff: Any) -> bool:
    return switched_on(conn) or previews(conn, staff)


def previewing(conn: db.Conn, staff: Any) -> bool:
    """Switched off, and she is the staff preview: she may look, not change."""
    return not switched_on(conn) and previews(conn, staff)


def timetabled_classes(conn: db.Conn, day: dt.date) -> list[dict]:
    """Every class with lessons on `day` (the timetable of a date is its sessions), as `k2_day.my_classes` gives a class."""
    return conn.execute(
        "select distinct c.id::text as id, c.grade_code as grade, c.section, c.academic_year_id, c.campus_id"
        " from school_class c where exists (select 1 from session s join school_day d on d.id = s.school_day_id"
        " where s.school_class_id = c.id and d.on_date = %s) order by c.grade_code, c.section",
        (day,),
    ).fetchall()
