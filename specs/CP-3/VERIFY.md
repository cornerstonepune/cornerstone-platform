PASS. Items 1 to 7 pass. For item 8, the database half is met by the migration. The other half (the live site connecting as `app_web`) is a deployment step that is still to come and is not proven. Nothing of substance was built outside the scope. Some extra tests that design.md promised are not in the diff.

I re-ran `python3 .claude/athena/bin/athena done CP-3` in this session. Result: "CP-3: PASS". Items 1 to 7 passed; item 8 is box-only and was not run. This matches /tmp/cp3-done.txt.

**1. Criteria**
1. **MET.** Proof: `test_1_*` (4 tests) pass. The groups are stored as rows in `access_group`, `access_role_group` and `access_reach` (migration lines 13–59). The access rules call `my_reach()` and `my_ids()`, which read those rows at query time. The proofs show that one update or insert changes what a person sees.
2. **MET.** Proof: `test_2_every_role_belongs_to_exactly_one_group` passes. The primary key `(tenant_id, role_code)` stops a role being in two groups. The seeds place all 13 roles, including `special_educator` in `everything`, which is a choice Nimish has not made.
3. **MET.** Proofs: `test_3_*` pass. An educator of X sees 0 rows of class Y. A grant that starts tomorrow, one that ended today, and no grant all give nothing.
4. **MET.** Proofs: `test_4_*` pass. No identity, an empty identity, an unknown id, an entry with no matching staff row and a deactivated person all see 0 rows on the 8 tables.
5. **MET.** Proof: `test_5_everything_group_sees_every_row` passes.
6. **MET.** Proof: `test_6_staff_details_only_for_everything_and_self` passes. In the migration, staff-type tables use `key_column = signed_in_staff()`, so "own" means the person's own row.
7. **MET** as far as the repo can show. Proof: `test_browser_suite.py` (2 tests) passes. The only test file changed under apps/web/tests is `global-setup.ts` (17 lines), which gives the test user a staff row, a `pii.staff` row and a current coordinator grant. The real gate is the CI browser job, which runs the site as `app_web`.
8. **Database half MET; connection half not proven.** I read `specs/CP-3/proofs/live_rules.py` against the migration:
   - After the migration, `apply_conventions()` drops every policy except `service_role_all` on each of the 8 listed tables. It then creates `engine_all`, which applies to `app_engine` only, and `web_rule`, which applies to `app_web` with a real condition. That condition is not empty or true, so the live check counts 0 rules that allow everyone.
   - The 8 tables in `access_table` match the proof's list exactly.
   - All 5 helper functions exist. They are owned by the migration runner (Supabase `postgres`, which has bypassrls), so the owner check should pass.
   - The connection half will fail until Nimish sets the `app_web` password and points the site at it. Nothing in this diff can do that: the spec's Out-of-scope section excludes setting the password. `docs/notes/CP-3.md` says this. Item 8 only counts as done once `ATHENA_ON_BOX=1 athena done` passes on the box after that switch.

**2. Unasked work** (all small, none of substance)
- The redefined `apply_conventions()` adds `set search_path = public`. It was not asked for; it is harmless hardening. The rest of the function body matches 20261021090000 apart from the new branch.
- The `signed_in` group is seeded with reach `none` on all four kinds. Nothing uses it in CP-3. The scope names the group, so this is acceptable.
- These follow from the scope, the design or repo rules and are not creep: `docs/adr/0101-access-by-rows.md`, `docs/notes/CP-3.md`, the regenerated `rules.json`, the `test_roles.py` changes (`WEB_CALLS` and the new policy-set check), and `test_people.py` (expected enrolment count changed from 22 to 0 for the website login with no identity). The scope-creep tool marked some of these as likely creep, but its only reason was "no keyword overlap".

**3. Missing (promised in design.md; there is no plan.md)**
- `packages/engine/tests/test_access_rules.py` (design.md line 191) was not created. The behaviour is covered only by the spec's own proofs in `specs/CP-3/proofs/`.
- Tests design.md promised that I could not find in the diff or in the proofs:
  - a check that every table in `access_table` has a `tenant_id` column;
  - a count of helper calls per statement;
  - a check that each helper's owner is superuser or bypasses row security, run in CI (only the live check has it);
  - a check that a missing reach row means "none";
  - a second-tenant case.

  Execute grants may be covered by the existing `WEB_CALLS` test in `test_roles.py`; I did not confirm that.
- The switch-on report was promised as "read-only SQL in the notes". The notes describe it in prose only and contain no SQL.

**4. Risks**
- Permissions and row security: this whole change is about them. Two limits are documented: anyone holding the `app_web` password can claim any identity, and `pii.read_child` is unchanged (a child's id seen through another table still leads to a name, left for CP-4).
- Turning on `app_web` before the switch-on gate is clean would leave educators who have no class grant seeing nothing. The notes say only K2-A is ready today.
- There are no secrets and no real data. The CI password `ci-web` already existed in `ci.yml`. `global-setup.ts` writes only to the test copy (its existing guard is at line 19). No data is deleted; the migration only adds tables and replaces functions and policies.

**5. Requirements:** not given, so not answered.

VERDICT: PASS

I did not check how fast the policies run (the speed suite runs only in CI's browser job), or whether a policy written for `app_web` also applies to logins that are members of it. The risk to know: item 8's live proof will fail on the box until Nimish switches the site to `app_web`, so CP-3 is not done in production.
