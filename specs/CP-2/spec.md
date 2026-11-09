# CP-2: A request says who is asking

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/449 (locked by Nimish, 8 Nov 2026)

## What

Today the database cannot tell which person is asking, so no rule about who may see which child can work. This scope makes the website tell the database who is asking, on every request made for a signed-in person, and proves the identity cannot leak from one person's request to the next on the real shared connection. It switches no access rule on (that is CP-3 and CP-4) and it does not by itself make data fail closed: that needs the rules (CP-3) and the site connecting with the restricted login.

Three ways are on the table: (a) send identity and query together in one transaction, (b) a long-running server, (c) Supabase's own interface with a signed token. The first work is a short test on the real connection: (a) is tried first (two variants), (c) is the fallback. Only if (c) is needed does the cost become a decision for Nimish.

## Done when

1. The chosen option and the options rejected, with the reason, are recorded as a decision before any code, and amended with the test result on the real connection.
2. A function `public.current_staff()` (in `public`, because the app logins cannot use the `internal` schema) returns the signed-in person's id from the request, and returns nothing when no identity is set, when it is empty, or when it is not a valid id. (Test.)
3. The identity is taken only from the verified sign-in cookie, set in one place in the website's database layer, never from anything the browser sends freely; a test fails if the identity setting appears anywhere else. (Test.)
4. On the real shared connection, with one connection shared: person A then person B then nobody, repeated at least 200 times in alternation; also A and B at the same time; also after a failed query and after a query that times out. Each request sees only its own identity. (Test against the real pooler, run in CI or on the box.)
5. The existing website pages behave as before: the full browser test suite and the speed tests pass unchanged.
6. No rule is switched on and no row becomes invisible to anyone as a result of this scope. (LIVE: policy count and definitions unchanged.)

## Out of scope

The access rules themselves (CP-3, CP-4). The access grid. Moving sign-in to Supabase Auth. Any screen. Switching the site to the restricted database login (a prerequisite named in CP-3).
