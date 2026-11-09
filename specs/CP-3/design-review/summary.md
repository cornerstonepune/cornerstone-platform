EGM artifact directory: specs/CP-3/design-review

# CP-3 design review: what each reviewer found and what was done

Reviewers (fresh, no conversation history): zoom-out, design critic, implementation readiness, codebase details.
All four returned NOT READY on the first draft. Full reports were returned in the session; this file keeps the dispositions.

| Finding (reviewer) | Disposition |
|---|---|
| `read_child` change breaks engine and site on deploy: both use the owner login (all four) | Accepted. Dropped; recorded as a known gap and a follow-up. |
| Browser suite in CI already runs as `app_web`; test user has no staff row or grant (codebase) | Verified in ci.yml and playwright.config.ts. Accepted: `global-setup.ts` changed; item 7 is a real gate. |
| Views claimed to skip rules; all are `security_invoker` (zoom-out, design, codebase) | Verified. Claim removed; views listed as item-7 blast radius. |
| `test_roles.py` (`app_all`, `WEB_CALLS`) and `test_people.py:612` go red (readiness, codebase) | Accepted; added to the modify list with the new assertions. |
| Trigger order breaks a new school (readiness, design) | Accepted: trigger named to sort after `people_vocabulary`; test inserts a tenant. |
| Two id spaces: step 1 dead, tenant-blind, ignores `active`, cost (design, zoom-out) | Accepted: one path, tenant and `active` required. Alternative `signed_in` column considered, rejected with reason. |
| No DDL / function signatures / policy text / order / re-run (readiness) | Accepted: DDL, signatures, policy text, statement order, idempotence, phases written. |
| `note_claim` key undefined and errors without a grant (design, readiness) | Accepted: `note` key type with `my_ids`. |
| `read_staff_details`, `owner_column` unasked (zoom-out) | Accepted: both dropped. |
| Generated permissive policy fragile (design) | Partly: foreign policies on listed tables are dropped and a CI test fixes the set. RESTRICTIVE rejected: it needs a `using (true)` base that item 8 forbids. |
| Metadata tables writable by engine (design) | Partly: engine select/insert/update, no delete (precedent); web select only. `regclass` rejected (dump/restore). |
| Function grants to public/anon/authenticated (design) | Accepted: explicit revoke and a `proacl` test. |
| Bypass-RLS owner assumption unproved (design) | Accepted: test and LIVE assertion for `rolsuper`/`rolbypassrls`. |
| `access_table` generator not asked for; hand-write 7 policies (zoom-out) | Rejected: CP-4 needs the registry for items 1 and 4, and a generator keeps later migrations from re-opening tables. Claim "an insert is enough" corrected. |
| special_educator child route half-built (design, zoom-out) | Accepted: recommend `everything`; narrower route is a follow-up. |
| `school_today` reinvents `internal.school_day` (zoom-out, codebase) | Accepted: reused. |
| Speculative `signed_in` group (zoom-out) | Kept as a row only: the scope names three groups. |
| Fix is in CP-1 (make `staff.id` the sign-in id) (zoom-out) | Not taken: needs a remap of live ids and a change to CP-1's locked import. Recorded as rejected. |
