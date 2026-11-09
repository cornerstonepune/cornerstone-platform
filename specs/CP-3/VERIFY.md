VERDICT: PASS
# CP-3 amendment: proof 7 applies only to CP-3's own change (PR #531, a569d468 against main e7b0c2e1)
Read-only review through git refs plus proofs run in a throwaway clone. Not run: proof 8 (box only), the real GitHub Actions run (merge-ref layout simulated), the browser and speed suites.
Integrity: spec.md and every other proof and test are byte-identical to main; only test_browser_suite.py (test_7 became check_existing_tests_unchanged(root), one new self-check test) and checks.sh (check 7 also runs the new test) changed; the LOCK digest was recomputed with athena's method and equals specs/CP-3/LOCK (01f8440c...435dfe).
Rule: 'CP-3's own change' = the migration 20270120100000_access_groups_and_rules.sql or any file under specs/CP-3/ except VERIFY.md, RUN.json and status.json (the CP-5 precedent, plus status.json as a record). When it is CP-3's own change the OLD rule applies word for word (any existing file under apps/web/tests or playwright.config.ts modified/deleted/renamed/retyped fails, except global-setup.ts); otherwise the check passes with one line. Simulated CI layouts: an unrelated web PR editing a spec passes; the same plus a file added under specs/CP-3 fails naming the file; a PR editing the CP-3 migration plus a test fails; records-only plus a test edit passes; a push to main (merge-base equals HEAD) passes.
Self-check: 10 deliberate breakages were tried; the 8 that touch the 'does it apply' logic were all caught; 2 only touch the old rule (removing playwright.config.ts from the checked paths; narrowing the diff filter to MD), which had no self-test before. Not blocking.
Limits noted, not blocking: a PR that renames the CP-3 migration file and also edits a test would pass because default rename detection lists only the new name (renaming an applied numbered migration is not a realistic change); a follow-up unlock could add --no-renames at test_browser_suite.py:53 and a self-check case for playwright.config.ts.
Unasked, small: merge_base() now tries origin/main, then main, then master (needed for the self-check's scratch repos); one docstring sentence; the notes paragraph. status.json reads 'locked' as athena wrote it (athena finish is refused repo-wide by the ATH-20 web-readiness gate).
VERDICT: PASS

## Earlier verification of CP-3 (kept from main, unchanged)
VERDICT: PASS

PASS. Items 1 to 7 are met. Item 8 holds when I read it against the migration, but it can only actually pass on the box after Nimish switches the site to the restricted login.

**Criteria**
- **Items 1 to 6: MET.** `athena done CP-3` (/tmp/cp3-done2.txt) passes all of them. The rows are in supabase/migrations/20270120100000_access_groups_and_rules.sql at 13-72 and 96-151. The rules are built at 344-401: lines 372-378 make `web_rule` for app_web only, and lines 362-365 drop every other policy except `service_role_all`.
- **Item 7: MET.** The locked proof test_browser_suite.py passes. Under apps/web/tests the only existing file changed is `global-setup.ts`; `access-fixture.sql` is new. The browser half rests on your local run (3 shards on a fresh database as app_web, 194 passed each). CI's browser job on this head still has to go green before merge, because it is the real gate for this item.
- **Item 8: met by reading, box only.** Every listed table gets `web_rule`, which is limited to app_web with a condition that is never "true". `engine_all` goes to app_engine and `service_role_all` to service_role. live_rules.py skips both of those, so 0 rules allow everyone. The helpers are security definer and owned by the migration owner. The "site connects as app_web" part fails until Nimish sets the password and the connection setting. The scope puts that outside this change, and docs/notes/CP-3.md:13-15 says the same.

**Unasked work**
None of substance. Each addition is needed:
- **Needed for the reworded item 7:** `access-fixture.sql`, the `global-setup.ts` grant, and the uploader clause in `my_ids` (migration:257-260). The "papers he has uploaded" line is now in the scope.
- **Speed fixes:** `staff.signin_id` (160-197), `class_band` as security definer (295-303) and `staff_sees_sheet` as security definer (309).
- **Correctness under the new rule:** `grade_is_wholly` (316-321) plus the levels query in queries-calibration.ts:37, which would otherwise wrongly report a grade as wholly an educator's.
- **Required plumbing:** the data_register.json entry, the rules.json snapshot, and the changes to test_roles.py and test_people.py (22 becomes 0 enrolments for app_web with no identity, which follows directly from the rule).

**Missing**
- Nothing promised is left out.
- Small text slip: the comment in global-setup.ts and docs/notes/CP-3.md:9 say "coordinator grant", but the code grants `deputy_coordinator`. Both are in the everything group. (Fixed after this review.)

**Risks**
- **Search paths.** The new definer functions pin `public, pg_temp`. `class_band` (295-297) and `staff_sees_sheet` (pinned earlier in 20270110090000:42) use `public` only, without `pg_temp` last. A caller who can make temporary tables could shadow `child`, `capture` or `sheet_instance`, but only to change their own yes/no or grade answer. That is low risk, but adding `pg_temp` is the textbook fix. (Done after this review: both now pin `public, pg_temp`.)
- **Execute grants.** Default privileges (20261019090000:31) take execute away from public. app_web was already granted `class_band` and `staff_sees_sheet`, and the migration grants `grade_is_wholly`, `my_*`, `signed_in_staff` and `my_tenant` to app_web and app_engine only; `resolve_staff` gets no grant. The new `internal.*` definers carry no grants.
- **Can app_web learn more than before?** `staff_sees_sheet` accepts the role and classes as arguments, so a direct app_web caller could ask "is this sheet's child in section S?" for a child outside its reach. ADR 0101 already accepts that whoever holds the app_web login can claim any identity, so this adds nothing new. The website passes the session's own values. `grade_is_wholly` and `class_band` return one yes/no or one grade, and class and section information is already readable (`school_class` and `sheet_instance` stay open until CP-4).
- **Uploader clause.** It is limited to the person's school and to readings that have not been replaced. It covers the children kind only, not enrolment or notes, which matches "see a child".

Not checked: CI's run on this head (I could not see it), and the design.md details beyond the scope.

Round 2: PASS
Independent verifier (orchestrator 4), head d298cf0: items 1-7 met; item 8 pending on the box until the site connects as app_web. Unasked-but-justified: staff.signin_id column + 3 sync triggers (design.md had rejected a trigger-synced copy; ADR 0101 records the 0.33 ms vs 0.05 ms measurement), class_band and staff_sees_sheet as SECURITY DEFINER, grade_is_wholly. Risks noted: owner-run yes/no functions can be called with any arguments by the website login (no rows, names or counts); capture and sheet_instance stay open until CP-4; internal.access_vocabulary and its trigger function lack pg_temp last in search_path (added in the push after this review: a search_path change only). Process: spec change (UNLOCK CP-3 + scope-change label) to be confirmed by Nimish on #451.
