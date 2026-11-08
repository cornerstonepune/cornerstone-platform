# CP-3: role rules on children, enrolment, staff and notes

Branch `cp-3-build`, stacked on `cp-2-build` (PR #476). Must not merge before it.

## Verified
- `specs/CP-3/proofs/test_access_rules.py`: 12 passed on a Postgres built from every migration (items 1-6).
- `packages/engine/tests/test_roles.py`, `test_people.py`, `test_voice_tables.py`, `test_layout.py`, `test_rules.py`
  pass on a `bin/testdb fresh` database.
- Item 7: `apps/web/tests/global-setup.ts` now gives the suite's user a staff row, a `pii.staff` row and a current
  coordinator grant; no other browser/speed file changed. The browser job in CI is the gate.
- Item 8 (LIVE, box only): `specs/CP-3/proofs/live_rules.py`. Fails until the site connects as `app_web`.

## Handoff
- Not live: both services still connect as the owner, so nothing changes on the live site until Nimish sets the
  `app_web` and `app_engine` passwords and the site's connection setting (his step; not done here).
- Switch-on gate, run read-only before that, counts only, no names: for every entry of `config` key `app.staff`:
  does `internal.resolve_staff()` give exactly one active staff row; the reach it gets per kind (`my_reach`); entries
  with a class but no grant; open enrolments per class. Only K2-A had a class and enrolments when scoped; the
  `educator` role is campus-scoped, so an educator with no class grant sees nothing. Any unresolved entry blocks.
- For Nimish: special educator is in `everything` (one update to change); the head-of-class wording in
  `data_register.json` is narrower than the real groups; the database checks the class, not the subject.
