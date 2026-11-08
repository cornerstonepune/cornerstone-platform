"""CP-17 item 5: a class's fortnight list can be approved only by an educator of that class, or a coordinator, whose
role the school allows (`materials.approve_roles`); only once the fortnight's plan is frozen (CP-6's cycle); and only
for the lines the approver was shown (`lines_digest` = `materials_list_digest` of what she saw). The approval keeps who
and when, cannot be changed or deleted, and appears on the school's one approvals list (`approval_list`, kind
`materials_list`). Needs CP-6 (`fortnight_cycle`): until it is merged these proofs fail saying so."""

import datetime as dt

from cp17_world import (  # noqa: F401  (fixtures)
    APPROVE, approval_row, approvable, approve, conn, digest, fortnight_list, freeze, item, refused, school,
    school_line, set_config, staff, teaching_fortnight,
)


def test_5_an_educator_of_the_class_approves_after_the_freeze_and_it_keeps_who_and_when(conn, school):
    w = approvable(conn, school)
    row = approve(conn, w["list"], w["educator"])
    assert row["approved_by"] == w["educator"] and row["approved_at"] is not None
    assert (row["tenant_id"], row["class_id"]) == (school["t"], school["class"])


def test_5_not_before_the_fortnight_is_frozen(conn, school):
    f = teaching_fortnight(conn, school)  # still planning
    set_config(conn, school["t"], "materials.approve_roles", ["class_teacher", "coordinator"])
    lid = fortnight_list(conn, school, lo=f["starts_on"], hi=f["ends_on"])
    school_line(conn, school, lid, item(conn, school))
    who = staff(conn, school, "class_teacher", school["class"])
    refused(conn, APPROVE, (lid, who, digest(conn, lid)))
    freeze(conn, f["id"])
    approve(conn, lid, who)


def test_5_only_an_educator_of_that_class_or_a_coordinator_whose_role_is_allowed(conn, school):
    w = approvable(conn, school)  # approve_roles = class_teacher, coordinator
    lid, d = w["list"], digest(conn, w["list"])
    refused(conn, APPROVE, (lid, staff(conn, school, "class_teacher", school["other_class"]), d))  # another class
    refused(conn, APPROVE, (lid, staff(conn, school, "assistant", school["class"]), d))  # role not allowed
    refused(conn, APPROVE, (lid, staff(conn, school, None), d))  # no grant
    ended = staff(conn, school, "coordinator", valid_to=dt.date.today() - dt.timedelta(days=400))
    refused(conn, APPROVE, (lid, ended, d))
    coordinator = staff(conn, school, "coordinator")  # a grant on no class covers every class
    set_config(conn, school["t"], "materials.approve_roles", ["class_teacher"])
    refused(conn, APPROVE, (lid, coordinator, d))  # the setting, not code, decides
    set_config(conn, school["t"], "materials.approve_roles", ["class_teacher", "coordinator"])
    approve(conn, lid, coordinator)
    approve(conn, lid, w["educator"])


def test_5_only_for_the_lines_the_approver_was_shown(conn, school):
    w = approvable(conn, school)
    shown = digest(conn, w["list"])
    school_line(conn, school, w["list"], item(conn, school))  # the list changes after she looked
    refused(conn, APPROVE, (w["list"], w["educator"], shown))
    refused(conn, APPROVE, (w["list"], w["educator"], "not a digest"))
    approve(conn, w["list"], w["educator"], digest(conn, w["list"]))


def test_5_a_list_that_is_not_one_teaching_fortnight_cannot_be_approved(conn, school):
    w = approvable(conn, school)
    f = w["fortnight"]
    off = fortnight_list(conn, school, lo=f["starts_on"] + dt.timedelta(days=1), hi=f["ends_on"])
    school_line(conn, school, off, item(conn, school))
    refused(conn, APPROVE, (off, w["educator"], digest(conn, off)))
    week = fortnight_list(conn, school, period="week", lo=f["starts_on"], hi=f["starts_on"] + dt.timedelta(days=4))
    school_line(conn, school, week, item(conn, school))
    refused(conn, APPROVE, (week, w["educator"], digest(conn, week)))
    approve(conn, w["list"], w["educator"])


def test_5_an_approval_cannot_be_changed_or_deleted(conn, school):
    w = approvable(conn, school)
    row = approve(conn, w["list"], w["educator"])
    refused(conn, "update materials_list_approval set approved_at = now() - interval '1 day' where id = %s", (row["id"],))
    refused(conn, "delete from materials_list_approval where id = %s", (row["id"],))
    assert conn.execute("select count(*) as n from materials_list_approval where id = %s", (row["id"],)).fetchone()["n"] == 1


def test_5_it_appears_on_the_one_approvals_list(conn, school):
    w = approvable(conn, school)
    before = approval_row(conn, school, w["list"])
    assert before is not None, "a fortnight list is not on the approvals list"
    assert before["first_by"] is None and before["state"] == "draft"
    row = approve(conn, w["list"], w["educator"])
    after = approval_row(conn, school, w["list"])
    assert (after["first_by"], after["first_at"], after["state"]) == (str(w["educator"]), row["approved_at"], "approved")
    kinds = {r["kind"] for r in conn.execute("select distinct kind from approval_list where tenant_id = %s", (school["t"],))}
    assert "materials_list" in kinds and len(kinds) > 1, "fortnight lists sit beside every other approval"
