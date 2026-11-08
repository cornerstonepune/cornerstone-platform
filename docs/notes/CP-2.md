# CP-2: a request says who is asking

Decision: ADR 0100 (identity and query in one transaction per query, variant A1; alternatives and reasons there).

Built: `public.current_staff()` (migration 20270112090000); `apps/web/lib/db.ts` now exports `rawSql` (anonymous pool) and
`sql` (same tagged-template shape; with a signed-in person each query runs begin / set identity / query / commit on one
reserved connection); `lib/auth.ts` registers the resolver; `staffList` uses `rawSql` (asking "who" through `sql` would
wait on itself); `scripts/check-pooler.ts` carries the alternation proof (needs `CHECK_POOLER_URL`).

## What Nimish types (before merging; read-only, no password on screen)
```
git -C ~/cornerstone/assessment-engine fetch origin cp-2-build && git -C ~/cornerstone/assessment-engine checkout cp-2-build
~/cornerstone/assessment-engine/bin/check-pooler
git -C ~/cornerstone/assessment-engine checkout main
```
Success ends with "every request saw only its own identity". The check reads the setting itself, so it does not need the
migration; once the migration is deployed it also prints "public.current_staff() agrees". Needs Node 22.18+ and
`npm ci --prefix ~/cornerstone/assessment-engine/apps/web` done once; it says so in a sentence if not.

Open, said plainly:
- Proof 4 (real Supabase pooler) is box-only and NOT run yet: run the three lines above, then ADR 0100's Result is amended.
  Proof 6 (live, read-only) needs the migration deployed. A1 is unproven on the real pooler until then;
  if it fails, A2 then (c) — (c) is Nimish's decision.
- Cost: a signed-in query is now 4 round trips instead of 1. The browser and speed suites are the gate; I could not run them
  against the real database here.
- Nothing calls `current_staff()` yet and the site still connects as an owner-class login: no rule is on, nothing fails closed
  (CP-3).
- `tsc` shows two `LayoutProps` errors in `app/layout.tsx` files; neither is touched by CP-2.
