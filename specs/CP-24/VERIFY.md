# CP-24: what is on the branch now (for the independent check)

Written by the builder, 9 Nov 2026, for the head of `cp-24-build` after the shrink and the backup-doc rewrite. It carries no verdict: the independent verifier adds its own. Earlier verdicts (on 8d5cde36 and e2861b1e) are superseded and removed.

**The change, against main.**
1. One clock. Migration `20270125190000_one_clock.sql` only replaces `public.move_child` (new trailing `p_at timestamptz default now()`, dated by `internal.school_day`). It adds no function, table or column; `supabase/table-budget.json` equals main's. The engine and website read the school's date from `school.time_zone` (`engine.core.settings`, `apps/web/lib/school-clock.ts`); the engine's `nightly.hand_check` passes the school's day itself. The `hand_check.checked_on` column default is left to CP-27. The daily-spend and class-lookup queries compare the school's dates inside their one query.
2. A move at 01:00 IST is dated that IST day: `specs/CP-24/proofs/db/test_school_day.py`, `tests/test_child_move.py`, `apps/web/tests/u72-the-week-is-the-schools.spec.ts`.
3. Five keyed engine routes (`/fortnight/state`, `/fortnight/move`, `/timetable/generate`, `/timetable/link`, `/timetable/unmatched`) in `api/routes/plan.py` and the generated route list; `tests/api/test_plan_routes.py` checks all five for 401 without the key and 403 for a non-staff actor.
4. `engine live watch` reports step settings not in the order freeze > align > approve > list_sent; `step_date` still answers whatever is set.
5. `engine live watch` reports a nightly run older than `graph.nightly_stale_hours` (the LIVE half is box-only).
6. `docs/backup.md`: every retention length is marked **not confirmed** (Supabase daily backups, point-in-time days, Lightsail snapshot days) and the gap against 48 hours is said to be unknown. Only the `pg_settings` facts read from the live project on 2026-11-09 are stated. The restore drill was re-run on 2026-11-09 in the cloud sandbox (Postgres 16.15, throwaway databases built by `bin/testdb fresh`, no child): 8,003,172 bytes, 170 tables, 100,429 rows, every count equal.
7. `docs/backend-plan.md` has the keyed-route rule.

**Edits outside the scope's own files, and why.** `u70-feedback-rules.spec.ts` (the zone argument), `test_child_move.py` (one argument), `test_fortnight_cycle.py`. `specs/CP-8/proofs/tests_unchanged.sh` and `specs/CP-8/checks.sh` (proof 6 judges CP-8's own change only, with a self-check). CP-3, CP-1, CP-5, CP-6, CP-7 and CP-12 files are as on main.

**Run by the builder** on a fresh database built from every migration (CP-24's proofs and the neighbouring specs' via `bin/specs`; the engine suite whole once, then the two tests that failed re-run after their fix; the website's `tsc`, `eslint --max-warnings 0`, `next build`; `u70` and `u72` in Playwright). Not run: the box-only checks; CP-22's proofs; the CI browser shards. Two spine-provenance tests fail in the sandbox on an SSL certificate error and touch no file of this change.

**Known and left.** `queries-week-note.ts` still uses the server's week; `isoWeek()` and `heardAt` still accept no zone; the zone SQL is not filtered by school (one school today). See `docs/notes/CP-24.md`. `specs/CP-24/checks.sh` still sources the removed Athena checks library; CI's `bin/specs` default list does not run CP-24.
