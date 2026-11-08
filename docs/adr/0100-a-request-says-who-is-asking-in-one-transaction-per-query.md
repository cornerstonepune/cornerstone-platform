# ADR 0100 — A request says who is asking, in one transaction per query (CP-2)

Status: chosen, pending proof on the real pooler (see "Result" below).

## Problem

No rule about who may see which child can work until the database knows who is asking. The website knows (the verified
`cs_staff` cookie); the database does not. The site connects through Supabase's transaction pooler, where a setting made
on one statement is not guaranteed to be there on the next, and where stacking queries on one connection hung the live
site (ADR 0024).

## Chosen: (a) identity and query in one transaction, variant A1

For a signed-in person, each query reserves one connection and runs, one awaited step at a time: `begin`,
`select set_config('app.staff_id', <id>, true)` (transaction-local), the query, `commit` (`rollback` on error), then
releases the connection. `public.current_staff()` reads the setting back and returns a uuid or null. With nobody signed
in, the query runs on the plain pool as before. The setting is made in `apps/web/lib/db.ts` only; the id comes from the
verified sign-in through a resolver `lib/auth.ts` registers, never from anything the browser sends freely.
The tagged-template shape of `sql` is unchanged, so the 66 files that use it do not change.

Why it should work: under transaction pooling `begin` pins one backend until `commit`, and nothing is stacked, so the
ADR 0024 hang does not apply. The `true` makes the setting end with the transaction, so it cannot reach the next request.

## Rejected

- **A2, a second pool allowing pipelining with `sql.begin`.** Rejected because it risks the ADR 0024 hang and adds a
  second pool to size; only tried if A1 fails.
- **A3, one simple-protocol message `begin; set_config; query; commit`.** Rejected because parameterised queries cannot
  be sent that way and hand-formatting values is an injection path.
- **(b) A long-running server holding a session per person.** Rejected because the site is serverless on Vercel, a
  session-level setting would outlive its request on a shared connection, and it adds a server to run and pay for.
- **(c) Supabase's own interface with a signed token.** Rejected as the first choice because it rewrites every query the
  site makes and moves sign-in to Supabase Auth (out of scope). It stays the fallback: if A1 fails on the real pooler it
  becomes a schedule and cost decision for Nimish.

## Result

On the real pooler: NOT YET RUN. The sandbox this was built in cannot reach Supabase, so the proof on Supabase's pooler
(`specs/CP-2/proofs/pooler_alternation.sh`, box only, needs `CHECK_POOLER_URL`) is outstanding. Until it passes, A1 is
unproven where it matters; if it fails, the next step is A2, then (c), and (c) goes to Nimish.

What was run: the same `apps/web/scripts/check-pooler.ts` against a throwaway Postgres 17 directly (no pooler in between),
with `lib/db.ts` as built: 600 requests in alternation (A, B, nobody x200), 60 concurrent, after a failed query, and
after a query that outlived its caller. Every request saw only its own identity, over 4 backend connections shared by
all three. That proves the code's logic and that the setting ends with the transaction; it says nothing about
Supabase's pooler pinning a backend between `begin` and `commit`.
