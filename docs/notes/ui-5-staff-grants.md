# UI-5: staff grants (give and end a class grant)

No schema change (81 tables / 121 functions). Part of issue 590 (grants are the one rule); stands alone, but the new Staff
screen's edits reach site scope only once PR 615 (the sign-in reads grants) has migrated.

Routes (`engine/api/routes/staff.py`, rules in `engine/w3_read/staff_grants.py`; website asks with `actor` = signed-in email):
- `POST /staff/grants` `{actor}` → `{today, roles, classes, subjects, staff: [{id, role}], grants: [{id, staff_id, role, class, subject, from, to, open}]}`. Coordinators only. Ids, codes and dates only: the site joins staff ids to its own list for names.
- `POST /staff/grants/give` `{actor, staff_id, role, class_label, subject?, reason?}` → `{grant_id}`; from today.
- `POST /staff/grants/end` `{actor, grant_id}` → `{ended_on}`; `valid_to` = today, the row stays.
Errors: 403 not a coordinator; 404 no such person/class/grant on the coordinator's campus; 422 a role this page does not give, or
the grant table's `needs_class / needs_subject / wrong_scope`; 409 `one_per_class`, `core_teacher` (stand only with a `reason`)
and `already_holds`, `already ended`. The messages are the database's own plain words.

Decisions
- Roles given here are the role table's own-classes group held for a class or class-and-subject (`assistant`,
  `class_teacher`, `cover_educator`, `specialist`, `subject_educator`), read from the table, not listed in code. Never a
  campus role (coordinator, head, deputy, curriculum team): nobody grants beyond their own reach.
- Every give and end is a `change_log` row (table `staff_role_grant`, op `give` / `end`, who = the coordinator's staff id).
- Not built: ending or giving a campus-wide role; a grant starting on a future date; ending on a past date.

Known loose end (not mine to change here): `valid_to` is exclusive in `my_ids`, `staff_list` and the site (a grant ended
today gives no access today) but inclusive in some engine checks (`k2_reads.require_coordinator`, `voice_intake.may_record`:
`valid_to >= today`), so for the day it is ended the engine still lets that person record. Settle by one reading of
`valid_to` across the engine; flagged for backend cleanup #603.

Verified: `tests/test_staff_grants.py` (9), layout, table-budget, data-register, rules, contract, api tests and `bin/check` on
a from-scratch Postgres 16. Not verified: CI's full suite; the rehearsal; live.
