# Access rules: checklist before a rules change is locked

A rule is proven only by a check that connects as the role the rule restricts and sets identity the way the app does.

- Denied rows are absent and allowed rows are present, both asserted through the restricted login.
- Every member of the closed set the rule classifies (each role code, group or kind) sits in exactly one group. A code left out blanks its holders silently.
- When two systems name the same person (the sign-in id and the table's key), the rule resolves the id the request actually carries. A mismatch shows everyone nothing.
- Before the rule goes live, the data its users depend on exists (class records, grants, enrolments). Otherwise switching the rule on blanks those users' screens.
- A view runs with its owner's rights and skips row rules unless it is created `with (security_invoker = true)`. Check `pg_class.reloptions` for each view that exposes restricted data; never assert either way from memory.
- Security-definer functions always run as owner. List each one that takes an id of restricted data, then cover it or name it out of scope.
- Before naming which login a suite, the site or a test uses, read its CI workflow and env file. A browser suite may already run as the restricted login, so grep the test suite for that login's name: role tests that list grants or functions a login may hold also go red.
- Unlisted tables default to closed for the restricted role, and a test fails until each new table is classified.
