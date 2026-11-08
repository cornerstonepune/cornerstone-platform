# CP-2: a request says who is asking

Decision: ADR 0100 (identity and query in one transaction per query, variant A1; alternatives and reasons there).

Built: `public.current_staff()` (migration 20270112090000); `apps/web/lib/db.ts` now exports `rawSql` (anonymous pool) and
`sql` (same tagged-template shape; with a signed-in person each query runs begin / set identity / query / commit on one
reserved connection); `lib/auth.ts` registers the resolver; `staffList` uses `rawSql` (asking "who" through `sql` would
wait on itself); `scripts/check-pooler.ts` carries the alternation proof (needs `CHECK_POOLER_URL`).

Open, said plainly:
- Proof 4 (real Supabase pooler) and proof 6 (live, read-only) are box-only and NOT run. A1 is unproven on the real pooler;
  if it fails, A2 then (c) — (c) is Nimish's decision. The migration must be deployed before either box proof can pass.
- Cost: a signed-in query is now 4 round trips instead of 1. The browser and speed suites are the gate; I could not run them
  against the real database here.
- Nothing calls `current_staff()` yet and the site still connects as an owner-class login: no rule is on, nothing fails closed
  (CP-3).
- `tsc` shows two `LayoutProps` errors in `app/layout.tsx` files; neither is touched by CP-2.
