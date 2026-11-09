VERDICT: PASS
# CP-3 amendment: independent check (rides in PR #514 / CP-24, 1cadb96 against main fd777c84)
Read-only review. Not run by the reviewer: athena done CP-3, the browser suite, anything needing a database (the branch RUN.json records CP-3's 7 proofs passing at 09:24:56).
What changed: only proofs/test_browser_suite.py (test_7). spec.md, checks.sh and every other proof are byte-identical to main; the LOCK digest was recomputed and matches (c8f0a219...eaeaf). The amendment lets apps/web/tests/u70-feedback-rules.spec.ts differ from main by exactly one `const ZONE = "<literal>";` line plus `, ZONE` as the second argument of issueBody(...) calls, compared byte for byte; every other existing file under apps/web/tests (except global-setup.ts) stays forbidden. Nimish unlocked CP-3 for this on 9 Nov 2026.
Strictness: tested against 12 hand-made changes to u70. Changing '14:05 IST', removing an assertion, skipping a test, a second or non-literal or `let` ZONE, any extra line, and any change to another existing spec all FAIL. Three changes still pass (dropping one `, ZONE`; adding `, ZONE` to a one-argument call; ZONE set to another literal); they are type errors or fail the '14:05 IST' assertion, and CI's web job runs tsc --noEmit and the browser suite, so they are covered.
The u70 diff is only the ZONE line and the extra argument in four calls; every assertion and expected value is kept. Only u70 (modified) and u72 (new) differ from main under apps/web/tests. The week at Monday 01:00 IST resolves to 2026-W46.
One finding of the reviewer's, NOT fixed here and accepted by the orchestrator: specs/CP-3/status.json reads 'locked' after the re-lock, not 'built', so the nightly re-proof will skip CP-3 until `athena finish CP-3` is run. athena finish is refused for every spec by the ATH-20 web-readiness gate (needs @axe-core/playwright in apps/web, which the frontend UI-1 slice adds); the same applies to CP-0, CP-6, CP-7, CP-8, CP-11 and CP-22 on main. The orchestrator will run finish for all of them after UI-1 merges. The reviewer's raw verdict was FAIL on this bookkeeping point alone; the amendment itself was found correct and strict.

## Earlier verification of CP-3 (kept from main, unchanged)
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

VERDICT: PASS
