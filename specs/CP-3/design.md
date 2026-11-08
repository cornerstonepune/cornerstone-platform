# CP-3 design: role rules on children, enrolment, staff and notes

Status: REVISED after goldfish review (zoom-out, design, implementation-readiness, codebase-details; dispositions in
`specs/CP-3/design-review/summary.md`). Scope: `specs/CP-3/spec.md` (locked by Nimish, 8 Nov 2026, issue #451). Waits for
CP-1 and CP-2. (R) marks a change forced by a review finding.

## What exists (verified in the repository)
- `internal.apply_conventions()` (20261021090000) ends every migration: row security on and forced on every table in
  `public` and `pii`; `service_role_all`; `app_all for all to app_web, app_engine using (true)`; the `touch_updated_at`
  trigger; revoke of update/delete/truncate on `forbid_change` ledgers. "Every rule says allow everyone" is `app_all`.
- `role` (13 codes), `staff_role_grant` (`staff_id`, `role_code`, `school_class_id`, `subject_code`, `child_id`,
  `valid_from`, `valid_to`; never deleted, ends by `valid_to`, which is the first day it no longer holds), `enrolment`
  (open row: `to_date` null), `school_class`, `staff` (`active`), `pii.staff` (email unique per tenant), `child`,
  `pii.child`, `pii.educator_note` (`class_id`, `staff_id`), `pii.note_claim` (`note_id`).
- Neither app login can use schema `internal`; helpers go in `public` (`20261225090000:316`).
- **The browser suite in CI already runs the website as `app_web`** (`ci.yml:320-330` sets `TEST_WEB_DATABASE_URL`;
  `playwright.config.ts` starts the site on it) (R). Its signed-in test user is added only to the sign-in list
  (`apps/web/tests/global-setup.ts`): no `staff` row, no grant. Without a fix, the day CP-3 merges every page that reads
  the four kinds goes empty and item 7 fails. So `global-setup.ts` is modified (below) and item 7 is a real gate.
- Every view is `security_invoker = true` (30 statements, 21 migrations) (R): the rules apply through views. The ones that
  read the four kinds (for example `level_calibration`, `child_level_state`, `class_band`) change what an own-classes
  person sees; the builder lists them from `pg_depend` and the browser suite covers the pages that use them.
- `pii.staff`: neither app login holds any privilege on it (`20261225090000:338`) (R). Notes tables: `app_web` none;
  `app_engine` select/insert/update (claims select/insert). The sign-in list (config `app.staff`) is the website's master of
  identity; `staff_have_ids` gives each entry an id; the website sets that id.
- `public.current_staff()` arrives with CP-2: the id the website set, null if none or not a uuid.
- `internal.school_day(p_tenant, p_at)` exists (20261206090000:55) and reads `school.time_zone`.
- Both services still connect as the owner on the live site; the passwords of `app_web` and `app_engine` are not set.

## Threat model (R)
The rules are a backstop against a mistake in the website (a page that forgets a filter, an id that leaks) and make "no
identity means nothing". They do not stop someone who holds the `app_web` password: that person can claim any identity.
Write paths through security-definer functions (`move_child`, `confirm_results`, `resolve_result`) are not governed here.

## Goal
With an identity on the request, the database returns for the four kinds only what the person's group allows, and nothing
with no identity. Nothing the engine does changes. Nothing changes on the live site until it connects as `app_web`.

## Who is asking: one id space (R)
The website's identity is the sign-in list's entry id; grants hang on `staff.id`. `internal.resolve_staff()` (definer,
stable) returns `(staff_id, tenant_id)`: the config row `app.staff` whose entry has `id = current_staff()`; that entry's
email as `lower(btrim(email))`; the one `staff` row, with `active`, whose `pii.staff.email` equals it in the same tenant.
Null unless exactly one. The first draft also accepted a `staff.id` directly; dropped, because nothing sets one (R).
`public.signed_in_staff()` and `public.my_tenant()` return its two fields. It reads the email only as a key, returns ids,
and writes no `access_log` (one write per row check would flood it; this is why `staff_of_email` is not reused).
Rejected: a `staff.signin_id` column filled once at import (needs CP-1's locked import changed, and a backfill of the three
live rows; revisit if resolution proves slow); a trigger-synced copy. Known limit: a sign-in email edited without
`pii.staff` being re-synced makes that person see nothing (fail closed); the switch-on gate checks it.

## The groups are rows (R: full definition)
All in `public`, with `created_at`/`updated_at` and the `touch_updated_at` trigger from `apply_conventions`. Privileges:
`app_web` select; `app_engine` select, insert, update, no delete (precedent `20261225090000:343`); explicit
`revoke ... from public, anon, authenticated`.
- `access_group(tenant_id, code, label, by_role boolean, ord)`, pk (tenant_id, code), unique (tenant_id, code, by_role).
  Rows: `everything` (0, true), `own_classes` (1, true), `signed_in` (2, false: everyone signed in; used by nothing in CP-3
  and kept because the scope names three groups).
- `access_kind(tenant_id, code, label, ord)`, pk (tenant_id, code). Rows: `children`, `enrolment`, `staff`, `notes`.
- `access_role_group(tenant_id, role_code, group_code, by_role boolean not null default true check (by_role))`,
  pk (tenant_id, role_code) so a role is in at most one group; fk (tenant_id, role_code) to `role`; fk (tenant_id,
  group_code, by_role) to `access_group` so only role groups can be mapped. A test requires a row for every `role`.
- `access_reach(tenant_id, group_code, kind_code, reach text check (reach in ('all','own','none')))`, pk (tenant_id,
  group_code, kind_code), foreign keys to both. A missing row means `none` (tested). `own` = the classes the person holds
  a current grant for; for `staff`, the person's own row.
  everything: all four `all`. own_classes: all four `own`. signed_in: all four `none`.
- Seeds by `internal.access_vocabulary(tenant)`, idempotent (`on conflict do nothing`). It is called from a trigger on
  `tenant` named `people_vocabulary_then_access` (R): Postgres fires same-event triggers in name order, so the name must
  sort after `people_vocabulary`, which makes the `role` rows the foreign key needs. A test inserts a tenant on a database
  built from the files and expects every row. Run once over existing tenants at the end of the migration.
- Seeds, Nimish 8 Nov: everything = coordinator, deputy_coordinator, mentor, head, curriculum_team, ops. own_classes =
  educator, class_teacher, subject_educator, cover_educator, specialist, assistant.
- **special_educator is in neither list** and item 2 needs it in one group. Recommendation: `everything`, as `mentor`
  (also child-scoped) already is, because the other choice needs a second route (a named child, reached through enrolment
  and notes keyed by class) that would be half-built (R). If Nimish wants it narrower, that route is a follow-up. Seeded as
  `everything` until he answers; a one-row update changes it.
- A person's reach for a kind = the best of the groups of the roles on their current grants (all > own > none), no current
  grant = none. A grant is current when `valid_from <= today` and (`valid_to` is null or after today); today is
  `internal.school_day(my_tenant(), now())` (R, reuse); no config = no grant current (fail closed). `my_class_ids` counts
  only grants whose role's group gives `own` for that kind (R, groups can differ per kind later).
- Subjects: for these kinds the class alone decides. A subject educator's subject narrows only tables with a subject.

## Which tables
`access_table(schema_name, table_name, kind_code, key_column, key_type)`, pk (schema_name, table_name),
`key_type in ('class','child','note','staff')`. Same privileges as above. Every listed table has a `tenant_id`
(a test checks it).
- children: `public.child` (id, child), `pii.child` (child_id, child).
- enrolment: `public.enrolment` (class_id, class).
- staff: `public.staff` (id, staff), `public.staff_role_grant` (staff_id, staff), `pii.staff` (staff_id, staff).
- notes: `pii.educator_note` (class_id, class), `pii.note_claim` (note_id, note).
No author-sees-own clause on notes (R): item 3 says another class's notes return 0 rows, so a cover educator of Y who wrote
a note for X sees it only while holding X. `activity_observation`, `child_move` and the rest are CP-4's.

## The rule, generated
Helpers, all in `public`, `language sql` or `plpgsql` as the builder finds necessary, stable, `security definer`,
`set search_path = public, pg_temp`, `revoke execute from public, anon, authenticated`, execute for `app_web` and
`app_engine` (a test reads `proacl` back) (R):
- `my_reach(kind text) returns text`: `all`, `own` or `none`; `none` for no identity, no grant, unknown kind.
- `my_ids(kind text, key_type text) returns uuid[]`: `class` = `school_class_id` of current class/class_subject grants
  whose role gives `own` for that kind; `child` = children with an open enrolment (same date rule) in those classes;
  `note` = `pii.educator_note` ids in those classes; else `{}`.
- `signed_in_staff()`, `my_tenant()` as above.
`internal.apply_conventions()` is redefined (it runs at the end of every later migration, so this keeps the rules in place).
It keeps today's body verbatim (row security, `service_role_all`, `touch_updated_at`, ledger revoke) and guards `app_web`
as well as `app_engine` (R). For a table in `access_table` it drops every policy except `service_role_all` and creates
- `engine_all for all to app_engine using (true) with check (true)`, and
- `web_rule as permissive for all to app_web using (E) with check (E)`, with
  `E = tenant_id = (select public.my_tenant()) and ((select public.my_reach(K)) = 'all' or ((select public.my_reach(K))
  = 'own' and T))`, `T` = `col = any ((select public.my_ids(K, 'class'|'child'|'note'))::uuid[])` or, for staff,
  `col = (select public.signed_in_staff())`. `K` and names are quoted with `%L`/`%I`.
Dropping every foreign policy on a listed table is the guard (a stray permissive policy would otherwise widen the rule)
(R, with a CI test that the policy set per listed table is exactly {service_role_all, engine_all, web_rule}).
Tables not listed keep `app_all` until CP-4. A row added to `access_table` takes effect at the next run of
`apply_conventions()`, in the migration that adds it (the claim "an insert is enough" was wrong) (R).
"Allows everyone" means: a policy that applies to `app_web`, `public`, `authenticated` or `anon` and whose `qual` or
`with_check` is true or empty. `engine_all` (one trusted service login) and `service_role_all` are not that; this reading is
put to Nimish.
Cost: `E` has two scalar initplans per policy, so about two identity resolutions per listed table per statement; the speed
suite, which now runs as `app_web`, is the gate. A test counts helper calls per statement.

## Staff details (item 6)
By the row rule on `pii.staff`, `staff`, `staff_role_grant`: the `everything` group and the person themselves. No new
function (R). `app_web` still holds no privilege on `pii.staff`; the proof grants it to a test login. The engine keeps
`pii.read_staff` unchanged.

## Names (R)
`pii.read_child` is not changed here: both services use the owner login today, so any "is this the engine" test would
return no names to the engine and the site on deploy. Recorded as a known gap (an id seen through another table is still a
way to a name); the right fix is a test applied only when `session_user = 'app_web'`, after CP-4 closes the other tables.

## Existing tests and fixtures this changes (R)
- `packages/engine/tests/test_roles.py`: the `app_all`-on-every-table test (`:171-181`) accepts `engine_all` +
  `web_rule` for listed tables; `WEB_CALLS` (`:52-79`) gains `my_reach`, `my_ids`, `signed_in_staff`, `my_tenant` (and
  CP-2's `current_staff` if absent).
- `packages/engine/tests/test_people.py:612`: counts enrolment as `app_web` with no identity (22); it sets the identity
  of a person in `everything`, or its expected count changes.
- `packages/engine/tests/test_voice_tables.py:202-211`: still expected to pass; checked, not assumed.
- `apps/web/tests/global-setup.ts`: the test user also gets a `staff` row, a `pii.staff` row with the same email, and a
  current grant of `coordinator` (the `everything` group), so the browser suite sees what it saw.
- `packages/engine/engine/checks/rules.json`: regenerate with `engine live rules --write` on a fresh test database.
- Not touched: `workflows.json` (the layout test names no tables); `supabase/seed/data_register.json` (its words say "your
  child's educators and the school's coordinator"; the `everything` group also holds head, deputy coordinator, mentor,
  curriculum team and ops: told to Nimish as a wording point).

## Risks and alternatives
- Generated vs hand-written policies: generated, because `apply_conventions` re-runs every migration and hand-written
  policies would be dropped by it, and CP-4 needs the same registry to list every table. Permissive vs restrictive:
  restrictive needs a permissive `using (true)` base, which is the very thing item 8 forbids.
- Definer helpers assume the function owner bypasses row security (Supabase `postgres`, the CI superuser). A test asserts
  `rolsuper or rolbypassrls` for the owner of every helper; the LIVE proof reads the same. Whether policies listed `to
  app_web` apply to a member role through inheritance is to be verified in the current Postgres docs; the proofs use such a
  member as the test login.
- If CP-2 falls back to the Data API, `session_user` no longer names the caller; CP-3 does not rely on it.
- New child tables are open until someone lists them: CP-4's check and the raise in `apply_conventions` close that.

## Switch-on gate (not a proof; in `docs/notes/CP-3.md` and the handoff)
Only K2-A has a `school_class` row and enrolments, and the `educator` role is campus-scoped, so it carries no class. The
specialist role was left ungranted by the import. Before Nimish points the site at `app_web`, a read-only report must
show, for every sign-in entry: it resolves to exactly one active staff row; the reach it gets per kind; the classes on the
list against classes granted (a list entry such as `K2` is matched to `school_class.grade_code`, the section `A`
ignored, which the report states); and per class its open-enrolment count. Any entry with a class and no grant, or
unresolved, blocks the switch.

## Decisions for Nimish (only what a user would see)
1. Special educator or counsellor: `everything` (recommended: simplest, as the mentor) or narrower (follow-up work).
2. Is it right that a mentor, who holds a role for one child, sees every child? (In your list; confirming.)
3. Switch-on waits for the gate above; today only K2-A is ready.
4. The database checks the class only; a subject educator's subject narrowing stays in the website.
5. "A rule that allows everyone" is read as a rule for the website login; the engine's own full access is not counted.
6. The parent-facing wording of "who sees it" is now narrower than the real list of groups.
7. He sets the two database passwords and the site's connection setting when the gate is green.

## Phases
1. Tables, seeds, trigger, role-coverage and new-tenant tests.
2. Helpers (`resolve_staff`, `signed_in_staff`, `my_tenant`, `my_reach`, `my_ids`) and their tests, including each as
   `app_web`, proacl, owner bypass.
3. `access_table` rows, `apply_conventions()` redefinition, `select internal.apply_conventions()` last; policy tests.
4. The existing-test and fixture changes above; `rules.json`; ADR `docs/adr/<next free number>-access-by-rows.md`; notes.
Order inside the migration: tables, vocabulary function and trigger, vocabulary run, `access_table` rows, helpers and
grants, `apply_conventions()` redefinition, final call. Re-run safe: `if not exists`, `on conflict do nothing`,
`drop trigger if exists`, `create or replace`. Timestamp: later than the newest file and CP-2's.

## Proofs (what the builder must make pass)
Items 1, 2, 6: tests on the rows, helpers and the rule. Items 3, 4, 5: a database test on the CP-20 throwaway database:
two classes, a child, enrolment and note in each, an educator of X, a person in each group, run as a member of `app_web`
with `set_config('app.staff_id', <sign-in id>, true)` as the website sets it; per group, not per role; cases: grant ending
today, starting tomorrow, no grant, no identity, an unmatched email, a deactivated person, `note_claim` following its
note, a second tenant. Item 7: the browser and speed suites, now as `app_web` in CI. Item 8: box only, read-only:
`pg_policies` for the listed tables, the connection role of the site, and `rolbypassrls`/`rolsuper` for helper owners;
counts and names, no rows.

## Implementation list
- Create `supabase/migrations/<ts>_access_groups_and_rules.sql`; `packages/engine/tests/test_access_rules.py`;
  `docs/adr/<n>-access-by-rows.md`; `docs/notes/CP-3.md`; the switch-on report (read-only SQL in the notes).
- Modify `packages/engine/tests/test_roles.py`, `test_people.py`, `packages/engine/engine/checks/rules.json`,
  `apps/web/tests/global-setup.ts`.
