# Access-rule proof checklist

Use before locking any rules change. A rule is proven only by a check that connects as the restricted role and sets identity the way the app does.

- Denied rows absent, allowed rows present, both asserted through the restricted login.
- Closed set: every member the rule classifies (each role code, group, kind) sits in exactly one group. A code left out blanks its holders silently.
- Identity: when two systems name one person (the sign-in id and the table's key), the rule resolves the id the request actually carries. A mismatch shows everyone nothing.
- Data first: before a rule goes live, the data its users depend on exists (class records, grants, enrolments). Otherwise switching the rule on blanks their screens.
- Views: a view runs with its owner's rights and skips row rules unless it is created `with (security_invoker = true)`. Check `pg_class.reloptions` for each view that exposes restricted data.
- Security-definer functions always run as owner. List each one that takes an id of restricted data, then cover it or name it out of scope.
- Test suites: before naming the login a suite, site or test uses, read its CI workflow and env file. A browser suite may already run as the restricted login, so a rules change turns it red on merge unless its test users hold the rows they read. Grep the test suite for the login's name: role tests that list the grants or functions a login may hold also go red.
- Unlisted tables default closed for the restricted role; a test fails until each new table is classified.
