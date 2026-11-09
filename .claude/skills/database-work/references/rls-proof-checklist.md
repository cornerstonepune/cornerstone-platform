# Row-level security and grants: proof checklist

Use before a rules change is locked. Each line is a question the proof must answer.

- **Denied and allowed rows, both asserted through the restricted login.** Denied rows are absent and allowed rows are present.
- **Closed set classified.** Every member of the closed set the rule classifies (each role code, group, kind) sits in exactly one group. A code left out blanks its holders silently.
- **Identity resolved the way the request carries it.** When two systems name the same person (the sign-in id and the table's key), the rule resolves the id the request actually carries. A mismatch shows everyone nothing.
- **Data the rule depends on exists first.** Class records, grants and enrolments must be in place before the rule goes live. Otherwise switching it on blanks those users' screens.
- **Views.** A view runs with its owner's rights and skips row rules unless it is created `with (security_invoker = true)`. Check `pg_class.reloptions` for each view that exposes restricted data. Never assert either way from memory.
- **Security-definer functions.** These always run as owner. List each one that takes an id of restricted data, then cover it or name it out of scope.
- **Which login the suites use.** Read the CI workflow and env file before saying which login a suite, the site or a test uses. A browser suite may already run as the restricted login, so a rules change turns it red on merge unless its test users hold the rows they read. Grep the test suite for the login's name: role tests that list grants or functions a login may hold also go red.
- **Unlisted tables default closed.** For the restricted role, an unlisted table is closed, and a test fails until someone classifies each new table.
