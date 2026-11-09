# CP-3: role rules on children, enrolment, staff and notes

Branch `cp-3-build`, stacked on `cp-2-build` (PR #476). Must not merge before it.

## Verified
- `specs/CP-3/proofs/test_access_rules.py`: 12 passed on a Postgres built from every migration (items 1-6).
- `packages/engine/tests/test_roles.py`, `test_people.py`, `test_voice_tables.py`, `test_layout.py`, `test_rules.py`
  pass on a `bin/testdb fresh` database.
- Item 7: `apps/web/tests/global-setup.ts` now gives the suite's user a staff row, a `pii.staff` row and a current
  deputy_coordinator grant; no other browser/speed file changed. The browser job in CI is the gate.
- Item 8 (LIVE, box only): `specs/CP-3/proofs/live_rules.py`. Fails until the site connects as `app_web`.

## Handoff
- Not live: both services still connect as the owner, so nothing changes on the live site until Nimish sets the
  `app_web` and `app_engine` passwords and the site's connection setting (his step; not done here).
- Switch-on gate, run read-only before that, counts only, no names: for every entry of `config` key `app.staff`:
  does `internal.resolve_staff()` give exactly one active staff row; the reach it gets per kind (`my_reach`); entries
  with a class but no grant; open enrolments per class. Only K2-A had a class and enrolments when scoped; the
  `educator` role is campus-scoped, so an educator with no class grant sees nothing. Any unresolved entry blocks.
- Gate SQL (read-only; counts and codes, no names; run as the owner):
  `select e->>'id' as entry, (select count(*) from pii.staff p join staff s on s.id=p.staff_id and s.active where p.email=lower(btrim(e->>'email'))) as active_staff_rows, (select string_agg(distinct g.role_code,',') from pii.staff p join staff_role_grant g on g.staff_id=p.staff_id and g.valid_from<=current_date and (g.valid_to is null or g.valid_to>current_date) where p.email=lower(btrim(e->>'email'))) as current_roles, (select count(*) from pii.staff p join staff_role_grant g on g.staff_id=p.staff_id and g.school_class_id is not null and g.valid_to is null where p.email=lower(btrim(e->>'email'))) as class_grants from config c, jsonb_array_elements(c.value) e where c.key='app.staff'`
  and, per class, `select school_class_id, count(*) from enrolment where to_date is null group by 1`.
- For Nimish: special educator is in `everything` (one update to change); the head-of-class wording in
  `data_register.json` is narrower than the real groups; the database checks the class, not the subject.

## School-wide facts under an educator's identity (for CP-4)
Queries in `apps/web` that derive a fact about the whole school from the `child` table. With the rule on, an educator
sees only their own classes' children, so each answers about their classes only. Verdict per site:
1. `lib/queries-calibration.ts` `levelRows` ("is this grade wholly the educator's"): WRONG under the rule (showed an
   educator a grade whose other classes they cannot see; `u66:148`). Fix: a counts-only function (see below).
2. `lib/taught.ts:35` (every class, for the taught tables): an educator now lists their own classes. Intended; no change.
3. `lib/choices.ts:20` (class and grade choices): same. Intended; no change.
4. `lib/queries-staff.ts:36` (staff page class list): the coordinator's page, who is in "everything". No change.
5. `lib/reach.ts:48` (a person's classes): staff page, the coordinator's. No change.
6. `app/(app)/staff/actions.ts:31` (sections for a staff action): the coordinator's. No change.

## The uploader exception stays (decision log)
An educator sees a child whose paper they uploaded, whatever the child's class: Nimish's own words of 27 Oct 2026 ("Achal
should only see the papers he has uploaded", `u68-who-sees-answers.spec.ts`). `public.my_ids('children','child')` adds those
children (one `capture.uploaded_by` lookup; `uploaded_by` is the sign-in entry id, as `current_staff()` is). Orchestrator 3's
first call ("no exception, edit the u68 assertions") was reversed by orchestrator 4 to follow his words: no u68 edit.

## Speed (what the rule cost and what was done)
Functions the pages call once per row re-ran the row rule on every call (a new statement each): `class_band` (the Skill Map,
about 6,000 calls in one statement: 4,350 ms to 155 ms) and `staff_sees_sheet` (the papers lists, about 4,000 calls: 22 s). Both
now read as the owner; they return one grade and a yes or no. "Who is asking" is `staff.signin_id` (0.40 ms to 0.05 ms).
`grade_is_wholly` replaces counting other classes' children on the levels page. A test that fixes rows for the educators the
specs invent is `apps/web/tests/access-fixture.sql` (local copy only).
