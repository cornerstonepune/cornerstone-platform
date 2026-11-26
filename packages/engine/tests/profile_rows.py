"""Rows for the ADR 0115/0116 tests: objectives of a band of their own, scoped as profile.skill_bands, their skills, a
skill's approved group and skill_group proposals. Every helper writes inside the caller's transaction; placeholders only."""

import uuid

from psycopg.types.json import Jsonb

from tests.rows import a_registry_skill

BAND = "T9"  # a band no seeded objective has: the counts see only the test's own objectives
GROUP = {  # a group of each kind the tests need, with the words profile.json gives it
    "number": "v2-deep-knowledge.number-and-measure",  # capable
    "team": "v2-communicating-together.work-in-a-team",  # kind, capable
    "care": "v2-self-and-others.care-for-others",  # kind
    "nature": "v2-society-and-planet.care-for-nature",  # kind
}
SKILLS = ("ART.CLAY.01", "ART.CLAY.02", "ART.CRAFT.01")


def scope_to_test_band(conn, t):
    """profile.skill_bands becomes the test's band alone, for this transaction."""
    conn.execute(
        "update config set value = %s where tenant_id = %s and key = 'profile.skill_bands'", (Jsonb([BAND]), t)
    )


def objective(conn, t, code, group=None, source="machine", skills=(), kind="academic", band=BAND):
    """A live objective of `band`, on `group` (its own counts_toward row, as the subject default is) and using `skills`."""
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, kind)"
        " values (%s,%s,%s,'s','u','The child …','','school',%s)",
        (t, code, band, kind),
    )
    if group:
        conn.execute(
            "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
            " values (%s,%s,'CS-PROFILE',%s,'counts_toward',%s)",
            (t, code, group, source),
        )
    for s in skills:
        a_registry_skill(conn, t, s)
        conn.execute(
            "insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (%s,%s,%s,'school')",
            (t, code, s),
        )


def a_staff(conn, t, email=None, roles=()):
    """A member of staff, signing in as `email` when given, holding `roles` from today."""
    campus = conn.execute("select id from campus where tenant_id = %s limit 1", (t,)).fetchone()["id"]
    staff = conn.execute(
        "insert into staff (tenant_id, campus_id) values (%s,%s) returning id", (t, campus)
    ).fetchone()["id"]
    if email:
        conn.execute(
            "insert into pii.staff (tenant_id, staff_id, name, email) values (%s,%s,'Placeholder Staff',%s)",
            (t, staff, email),
        )
    for r in roles:
        conn.execute(
            "insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)"
            " values (%s,%s,%s,'2000-01-01','test')",
            (t, staff, r),
        )
    return staff


def approved(conn, t, skill, group, staff):
    """`skill`'s group as a person approved it."""
    a_registry_skill(conn, t, skill)
    conn.execute(
        "insert into skill_profile_group (tenant_id, skill_code, statement_code, staff_id) values (%s,%s,%s,%s)",
        (t, skill, group, staff),
    )


def proposal(conn, t, skill, group, options=None):
    """An undecided skill_group proposal in the shape ADR 0116 fixes; → its id."""
    a_registry_skill(conn, t, skill)
    return conn.execute(
        "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, reason, proposer,"
        " machine) values (%s,%s,'skill_group',%s,%s,'needs_person','the skill''s words','skill.skill-group v1',"
        " 'proposer:skill.skill-group') returning id",
        (t, uuid.uuid4(), skill, Jsonb({"group": group, "confidence": "high", "options": options or [group]})),
    ).fetchone()["id"]
