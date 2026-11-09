"""What the locked CP-7 proofs cannot see (the verifier's findings of 9 Nov): who is asking is the SIGN-IN entry, which
is not the staff id (CP-3), a grant ends on `valid_to` without holding on it, and a holiday has no lessons. The proofs'
fake school and helpers (specs/CP-7/proofs/cp7_world.py) are reused as they are."""

import sys
import uuid
from pathlib import Path

from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "specs" / "CP-7" / "proofs"))
import cp7_world  # noqa: E402
from cp7_world import LINES, NOT_APPROVER, real_date, refused  # noqa: E402

conn, world = cp7_world.conn, cp7_world.world  # the proofs' fixtures, under the names pytest looks up


def waiting(world):
    """Class A's timetable; Fortnight 9 frozen and drafted: it waits for a yes (nothing was settled before it)."""
    world.timetable(world.a)
    world.freeze(9)
    return world.draft(world.a, 9)


def new_signin_id(world, who: str) -> str:
    """Give `who` a sign-in list entry id that is not their staff id; CP-3's trigger moves `staff.signin_id` to it."""
    entries = world.setting("app.staff")
    fresh = str(uuid.uuid4())
    for e in entries:
        if e["id"] == world.staff[who]:
            e["id"] = fresh
    world.c.execute(
        "update config set value = %s where tenant_id = %s and key = 'app.staff'", (Jsonb(entries), world.t)
    )
    return fresh


def test_the_sign_in_entry_not_the_staff_id_decides_who_approves(world):
    plan = waiting(world)
    coordinator, teacher = new_signin_id(world, "approver"), new_signin_id(world, "other")
    refused(
        world.approve, plan, who=world.staff["approver"], stem=NOT_APPROVER, code="42501"
    )  # a staff id is no identity
    refused(world.approve, plan, who=teacher, stem=NOT_APPROVER, code="42501")
    world.approve(plan, who=coordinator)
    assert world.plan(plan)["state"] == "approved"


def test_a_grant_ending_today_does_not_approve_and_one_ending_later_does(world):
    """`valid_to` is the first day the grant no longer holds (CP-3), so a grant from today to today holds on no day."""
    plan = waiting(world)
    grant = "update staff_role_grant set valid_to = current_date + %s where staff_id = %s"
    world.c.execute(grant, (0, world.staff["approver"]))
    refused(world.approve, plan, stem=NOT_APPROVER, code="42501")
    # an ended grant is never reopened (CP-1): a new one, from today, ending the day after tomorrow
    world.c.execute(
        "insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, valid_to, granted_by)"
        " values (%s, %s, 'coordinator', current_date, current_date + 2, 'cp7 test')",
        (world.t, world.staff["approver"]),
    )
    world.approve(plan)
    assert world.plan(plan)["state"] == "approved"


def test_a_holiday_has_no_lines(world):
    world.timetable(world.a)
    day = real_date(world.start[9], "A", 3)
    campus = world.c.execute("select campus_id from school_class where id = %s", (world.a,)).fetchone()[
        "campus_id"
    ]
    world.c.execute(
        "insert into school_day (tenant_id, campus_id, on_date, kind) values (%s, %s, %s, 'holiday')",
        (world.t, campus, day),
    )
    world.freeze(9)
    lines = world.lines(world.draft(world.a, 9))
    assert len(lines) == LINES - 3, "a holiday kept its periods"  # three periods a day
    assert day not in {r["on_date"] for r in lines}
