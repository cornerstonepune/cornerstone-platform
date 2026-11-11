"""A coordinator gives and ends a class grant from the website (UI-5, issue 590). Who may see which class is a person's
open grants; this is the one door that changes them from the site.

- Coordinators only (`k2_reads.require_coordinator`: the roles named by the config row `k2.reads`).
- Only the roles the role table holds for a class (own-classes group, scope class or class subject): never a campus-wide
  role, so no one can grant beyond their own reach by making a coordinator.
- Only a person and a class of the coordinator's own campus.
- A grant is never deleted or edited: it ends (`valid_to` = today). Every give and end is a `change_log` row.
- The grant table's own rules (one class teacher to a class, D-039, a subject role needs a subject) answer in their own
  words; the two that warn stand only with a `reason`, which stays on the grant.

No name or email leaves: people are staff ids (the site joins them to its own list), classes are their labels."""

import datetime as dt

import psycopg

from engine.core import db, history, settings
from engine.w3_read import k2_reads
from engine.w3_read.voice_store import Refused

# the checks of the grant table that a person can answer (with a reason, or by changing what they asked): a clash
WARNS = {"one_per_class", "core_teacher", "already_holds"}
GRANTABLE = "ro.access_group = 'own_classes' and ro.scope in ('class', 'class_subject')"


def _roles(conn: db.Conn, tenant: str) -> list[dict]:
    return conn.execute(
        f"select ro.code, ro.label, ro.scope, ro.one_per_class from role ro where ro.tenant_id = %s and {GRANTABLE}"
        " order by ro.code",
        (tenant,),
    ).fetchall()


def _me(conn: db.Conn, actor: str) -> tuple[str, str, str]:
    """(her staff id, her campus, her school) once she is shown to hold a coordinator role."""
    staff, campus = k2_reads.require_coordinator(conn, actor)
    tenant = db.one(conn, "select tenant_id from staff where id = %s", (staff,))["tenant_id"]
    return staff, campus, str(tenant)


def listing(conn: db.Conn, actor: str) -> dict:
    """What the Staff screen needs: the roles this page gives, the classes and subjects of the campus, the campus's
    staff (ids and their role) and every class grant they hold or held, newest last. Ids, codes and dates only."""
    _, campus, tenant = _me(conn, actor)
    today = settings.school_today(conn)
    grants = conn.execute(
        "select g.id::text as id, g.staff_id::text as staff_id, g.role_code as role, sc.label as class,"
        ' g.subject_code as subject, g.valid_from::text as "from", g.valid_to::text as "to",'
        " (g.valid_from <= %s and (g.valid_to is null or g.valid_to > %s)) as open"
        " from staff_role_grant g join staff s on s.id = g.staff_id join role ro on ro.tenant_id = g.tenant_id"
        f" and ro.code = g.role_code and {GRANTABLE}"
        " join school_class sc on sc.id = g.school_class_id"
        " where s.campus_id = %s and s.tenant_id = %s order by g.valid_from, g.created_at, g.id",
        (today, today, campus, tenant),
    ).fetchall()
    return {
        "today": today.isoformat(),
        "roles": _roles(conn, tenant),
        "classes": [
            r["label"]
            for r in conn.execute(
                "select distinct sc.label from school_class sc join academic_year y on y.id = sc.academic_year_id"
                " where sc.campus_id = %s and %s between y.starts_on and y.ends_on order by 1",
                (campus, today),
            ).fetchall()
        ],
        "subjects": [
            r["code"]
            for r in conn.execute("select code from subject where tenant_id = %s order by 1", (tenant,))
        ],
        "staff": [
            {"id": r["id"], "role": r["role_code"]}
            for r in conn.execute(
                "select id::text as id, role_code from staff where campus_id = %s and tenant_id = %s and active"
                " order by created_at, id",
                (campus, tenant),
            ).fetchall()
        ],
        "grants": grants,
    }


def give(
    conn: db.Conn,
    actor: str,
    staff_id: str,
    role: str,
    class_label: str,
    subject: str | None = None,
    reason: str | None = None,
) -> dict:
    """Give `staff_id` the class role `role` on the class labelled `class_label` (and `subject`, for a subject role),
    from today. → {"grant_id"}."""
    me, campus, tenant = _me(conn, actor)
    if role not in {r["code"] for r in _roles(conn, tenant)}:
        raise Refused("That role is not given from this page.", 422)
    person = conn.execute(
        "select 1 from staff where id = %s and tenant_id = %s and campus_id = %s and active",
        (staff_id, tenant, campus),
    ).fetchone()
    today = settings.school_today(conn)
    klass = conn.execute(
        "select sc.id from school_class sc join academic_year y on y.id = sc.academic_year_id"
        " where sc.tenant_id = %s and sc.campus_id = %s and sc.label = %s and %s between y.starts_on and y.ends_on",
        (tenant, campus, class_label, today),
    ).fetchone()
    if not person or not klass:
        raise Refused("No such member of staff or class on your campus.", 404)
    try:
        with conn.transaction():
            got = db.one(
                conn,
                "insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code,"
                " valid_from, granted_by, override_reason) values (%s, %s, %s, %s, %s, %s, %s, %s) returning id::text as id",
                (tenant, staff_id, role, klass["id"], subject, today, me, (reason or "").strip() or None),
            )
    except psycopg.errors.RaiseException as no:
        words = str(no.diag.message_primary)
        raise Refused(words, 409 if words.split(":")[0] in WARNS else 422) from no
    history.keep(
        conn,
        tenant,
        ("staff_role_grant", got["id"], "give"),
        None,
        {
            "staff_id": staff_id,
            "role": role,
            "class": class_label,
            "subject": subject,
            "from": today.isoformat(),
        },
        f"staff:{me}",
        (reason or "").strip() or None,
        me,
    )
    return {"grant_id": got["id"]}


def end(conn: db.Conn, actor: str, grant_id: str) -> dict:
    """End a class grant today. The row stays, with its dates. → {"ended_on"}."""
    me, campus, tenant = _me(conn, actor)
    today = settings.school_today(conn)
    g = conn.execute(
        "select g.id::text as id, g.staff_id::text as staff_id, g.role_code, g.valid_to, g.valid_from, sc.label as class,"
        " g.subject_code from staff_role_grant g join staff s on s.id = g.staff_id"
        " left join school_class sc on sc.id = g.school_class_id"
        " where g.id::text = %s and s.campus_id = %s and s.tenant_id = %s",
        (grant_id, campus, tenant),
    ).fetchone()
    if not g:
        raise Refused("No such grant on your campus.", 404)
    if g["role_code"] not in {r["code"] for r in _roles(conn, tenant)}:
        raise Refused("That role is not ended from this page.", 422)
    if g["valid_to"] is not None and g["valid_to"] <= today:
        raise Refused("That grant has already ended.", 409)
    conn.execute("update staff_role_grant set valid_to = %s where id::text = %s", (today, grant_id))
    history.keep(
        conn,
        tenant,
        ("staff_role_grant", grant_id, "end"),
        {"valid_to": g["valid_to"].isoformat() if isinstance(g["valid_to"], dt.date) else None},
        {
            "valid_to": today.isoformat(),
            "staff_id": g["staff_id"],
            "role": g["role_code"],
            "class": g["class"],
            "subject": g["subject_code"],
        },
        f"staff:{me}",
        None,
        me,
    )
    return {"ended_on": today.isoformat()}
