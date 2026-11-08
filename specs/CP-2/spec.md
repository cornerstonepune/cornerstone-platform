# CP-2: A request says who is asking

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/449 (DRAFT, not locked)

### What

Today the database cannot tell which person is asking, so no rule about who may see which child can work. This scope makes the website tell the database who is asking, on every request, and proves it cannot leak from one person's request to the next on the real shared connection. It switches no access rule on; that is CP-3 and CP-4.

Three ways to do it are on the table (people-and-access.md): (a) send the identity and the query together as one transaction, (b) move to a long-running server, (c) read child data through Supabase's own interface with a short-lived signed token. Recommendation: try (a) first; the first proof of this scope tests it on the real connection. If it fails, (c) is the fallback. This is a technical choice; Nimish decides only if the cost differs enough to matter.

### Done when

1. The chosen option and the options rejected, with the reason, are recorded as a decision before any code.
2. A function `internal.current_staff()` returns the signed-in person's id from the request, and returns nothing when no identity is set (fail closed). (Test.)
3. The identity is taken only from the verified sign-in cookie, in one place in the website's database layer, never from anything the browser sends freely. (Test.)
4. On the real shared connection, two requests run back to back as person A then person B: B's request never sees A's identity, and a request with no identity sees none. Repeated at least 200 times in alternation. (Test against the real pooler.)
5. The existing website pages behave as before: the full browser test suite and the speed tests pass unchanged.
6. No rule is switched on and no row becomes invisible to anyone as a result of this scope. (LIVE: policy count and definitions unchanged.)

### Out of scope

The access rules themselves (CP-3, CP-4). The access grid. Moving sign-in to Supabase Auth. Any screen.
