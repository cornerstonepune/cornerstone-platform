# CP-24 design: the backend audit's Core fixes

Unattended build (orchestrator 4, 9 Nov 2026): the EGM draft and review were not run; this file records the mechanical
choices so the proofs, the build and the verifier agree on names. No choice here is one a user would see.

## 1. One clock

- **SQL.** `internal.school_day(tenant, at)` (20261206090000) is the one date function. The migration
  `20270125170000_one_clock.sql` replaces `move_child` so every `current_date` becomes `internal.school_day(c.tenant_id, p_at)`,
  with a new trailing parameter `p_at timestamptz default now()` (so a test can move a child at 01:00 IST); the old
  signature is dropped first, since `create or replace` with a new parameter would add an overload. `hand_check.checked_on`
  loses its `default current_date`; a `before insert` trigger fills a null `checked_on` with `internal.school_day(new.tenant_id, now())`.
- **Python.** `engine.core.settings` gains `time_zone(conn)` (the `school.time_zone` row, raised as `MissingSetting`-style
  error when absent, no default) and `school_day(conn, at)`. `voice_intake.school_day` delegates to it (rule 10). Every
  `settings.config(conn, "school.time_zone", "Asia/Kolkata")` and every `at time zone 'Asia/Kolkata'` in the engine reads
  the setting instead.
- **Web.** `apps/web/lib/school-clock.ts` reads the `school.time_zone` config row once per process (`schoolZone()`);
  `schoolToday()` and `nowAtSchool()` become async and take it; SQL in the website formats `at time zone (select value #>> '{}' from config where key = 'school.time_zone')`.
  `SCHOOL_ZONE` goes.
- **The test** (packages/engine/tests/test_one_clock.py): no `current_date` in a migration numbered after 20270125090000;
  no `Asia/Kolkata` in `packages/engine/engine`, `apps/web/lib`, `apps/web/app`. n8n's cron timezone and the server's
  `GENERIC_TIMEZONE` stay: n8n never thinks and cannot read a setting.

## 2. The routes (one file, `engine/api/routes/plan.py`, keyed, `actor` = the signed-in email → staff)

| Route | Body | Calls |
|---|---|---|
| `POST /fortnight/state` | `actor, fortnight_id` | the `fortnight_cycle` row (state, `<step>_at`, `<step>_by`) and the four `step_date`s |
| `POST /fortnight/move` | `actor, fortnight_id, to_state` | `fortnight_cycle.move` |
| `POST /timetable/generate` | `actor, grade, section, year, fortnight` | `tt_generate.generate` then `keep` |
| `POST /timetable/link` | `actor, fortnight?, band?, apply` | `plan_link_apply` and the per-fortnight counts (CP-8, after #505 merges) |
| `POST /timetable/unmatched` | `actor, fortnight?, band?` | the `plan_unmatched` rows (CP-8) |

A `CycleError`, `NoSuchFortnight` or `MissingSetting` answers 409/404 in words. `bin/engine contract` regenerates
`apps/web/lib/engine-routes.ts`.

## 3. The order check

`fortnight_cycle.step_date` reads all four `fortnight.<step>` settings and raises `CycleError` unless
`freeze > align > approve > list_sent` in `days_before_start`.

## 4. The stale nightly

`watch.nightly_stale(conn, tenant_id) -> str | None`: the newest `graph_run` row with `ok` for the tenant; none, or one older
than `graph.nightly_stale_hours` (a `config` row, already seeded), is one line that names the nightly rebuild and the
hours. `watch.problems` appends it for the configured tenant.

## 5. Documents

`docs/backup.md` states only what was read: the live project's `pg_settings` (archive mode, WAL-G push, archive timeout),
what could not be read from here and who reads it, the restore drill on the test database with its date, and the
48-hour voice promise beside the longest retention. `docs/backend-plan.md` gains rule 6 under "Rules that keep us inside
Core".
