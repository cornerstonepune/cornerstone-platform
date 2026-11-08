---
name: database-access-rules
description: Use when proving Postgres row-level security or grants.
category: security
---

# Database access rules: prove them as the restricted role

A rule is proven only by a check that connects as the role the rule restricts and sets identity the way the app does. A check run as the owner, service or admin login skips row-level security and passes whether or not the rule works. Reject any such proof.

Before a rules change is locked, confirm:

- Denied rows are absent and allowed rows are present, both asserted through the restricted login.
- Every member of the closed set the rule classifies (each role code, group, kind) sits in exactly one group. A code left out blanks its holders silently.
- When two systems name the same person (the sign-in id and the table's key), the rule resolves the id the request actually carries. A mismatch shows everyone nothing.
- Before a rule goes live, the data its users depend on exists (class records, grants, enrolments). Otherwise switching the rule on blanks those users' screens.
- A view runs with its owner's rights and skips row rules only when it is not created `with (security_invoker = true)`. Check `pg_class.reloptions` for each view that exposes restricted data, and never assert either way from memory. Security-definer functions always run as owner: list each one that takes an id of restricted data, then cover it or name it out of scope.
- Before saying which login a suite, the site or a test uses, read its CI workflow and env file. A browser suite may already run as the restricted login, so a rules change turns it red on merge unless its test users hold the rows they read. Grep the test suite for the login's name: role tests that list the grants or functions a login may hold also go red.
- Unlisted tables default to closed for the restricted role, and a test fails until someone classifies each new table.
- A helper a policy calls runs once per row. Make it a key lookup or a yes/no, not a scan, and check the cost with `explain analyze` before and after. A `security definer` helper must pin `set search_path = public, pg_temp` with `pg_temp` last, and be granted execute only to the login that calls it.
- A rule's test fixture creates the full chain a real user has (staff row, class record, enrolment, current grant) in one shared fixture file. A bare label passes nothing.
