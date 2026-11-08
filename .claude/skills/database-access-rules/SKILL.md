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
- Views and security-definer functions run with the owner's rights and skip row rules. List each one that exposes restricted data, then cover it or name it out of scope.
- Unlisted tables default to closed for the restricted role, and a test fails until someone classifies each new table.
