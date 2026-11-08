# CP-3 design: role rules on children, enrolment, staff and notes

Status: DRAFT for goldfish review. Scope: `specs/CP-3/spec.md` (locked by Nimish, 8 Nov 2026). Waits for CP-1 and CP-2.
(R) will mark a change forced by a review finding. "Open" marks a question the reviewers should attack.

## What exists (verified in the repository, 8 Nov)
- `internal.apply_conventions()` (20261021090000) ends every migration. For every table in `public` and `pii` it turns
  row security on and forces it, then gives `app_web` and `app_engine` one policy `app_all ... using (true)`. That is
  "every rule says allow everyone". `service_role` gets the same.
- `role` (13 codes per school: subject_educator, class_teacher, mentor, assistant, coordinator, deputy_coordinator,
  curriculum_team, head, ops, cover_educator, special_educator, specialist, educator), each with a scope
  (campus, class, class_subject, child). `staff_role_grant` holds one person, one role, optional class/subject/child, and
  `valid_from` / `valid_to`; a grant is never deleted, it ends. `enrolment` links child and class; an open row has
  `to_date` null. `school_class`, `staff`, `pii.staff`, `child`, `pii.child`, `pii.educator_note` (class_id, staff_id),
  `pii.note_claim` (note_id).
- Neither app login can use schema `internal` (20261225090000 header), so every helper goes in `public`.
- The website's present rule is `public.staff_sees` (20261222090000), fed by the sign-in list's classes and subjects
  (config `app.staff`), and it stays: it is the first line; this scope is the backstop under it.
- `public.current_staff()` arrives with CP-2: the id the website put on the request, null when none or not a uuid.
- The site connects as the owner login today (skips every rule). `app_web` and `app_engine` exist without passwords.
- `pii.read_child(uuid, actor)` is granted to `app_web` and called by 20+ website query files: it returns any child's
  name for any child id, logged. `pii.staff`, `pii.educator_note`, `pii.note_claim`: no privilege for `app_web` at all
  (the engine only).
- ~30 views over child data exist in 21 migrations. A view runs with its owner's rights, so it skips row rules.
- `config` key `school.time_zone` = Asia/Kolkata.

## Goal
With a person's identity on the request, the database itself returns, for the four kinds, only what the person's group
allows, and nothing with no identity. Nothing the engine does changes. Nothing changes on the live site until the site
connects as `app_web` (Nimish sets the password); the rules are built and proved before that.

## The linchpin problem: two id spaces (open)
The website's identity is the id on the sign-in list entry (config `app.staff`, `staff_have_ids`). `staff`,
`staff_role_grant` and the new rules use `staff.id`, a different uuid made by `engine staff import`, which matches people
by email (engine/core/people.py). `current_staff()` returns whatever the site sets. If the site sets the sign-in id,
no grant ever matches and everyone silently sees nothing.
Decision: the database resolves it. `public.signed_in_staff()` = (1) `current_staff()` if that id is a `staff.id`;
else (2) the sign-in list entry with that id, its email, matched in lower case to `pii.staff.email`, giving the
`staff.id` (null if no entry, no match, or two matches). It works whichever id the site sets, so CP-2's build need not
change. Stable, security definer. It reads `pii.staff.email` only as a lookup key, returns an id, and does not write
`access_log` (one write per row-rule check would flood it).
Rejected: a `staff.signin_id` column with two sync triggers (more moving parts, same result); making the site resolve
the id (CP-2 is locked and its build is another session's).

## The groups are rows
Created by the migration and given to every school by `internal.access_vocabulary(tenant)` plus a trigger on `tenant`,
as `people_vocabulary` does (a database built from the files alone has them).
- `access_group(tenant_id, code, label, by_role, ord)`: `everything`, `own_classes`, `signed_in` (by_role false: everyone
  signed in belongs to it; it is the school-wide kind, used by CP-4).
- `access_role_group(tenant_id, role_code, group_code)`, primary key (tenant_id, role_code): one group per role, by
  construction. Foreign keys to `role` and `access_group`. A test requires every `role` row to have one.
- `access_kind(tenant_id, code, label)`: `children`, `enrolment`, `staff`, `notes` (CP-4 adds more by insert).
- `access_reach(tenant_id, group_code, kind_code, reach)`, reach in `all`, `own`, `none`. `own` means: the classes
  (and single children) the person holds a current grant for; for the `staff` kind it means the person's own row.
  everything: all four kinds `all`. own_classes: `children`, `enrolment`, `notes` `own`; `staff` `own`.
- Seeds (Nimish, 8 Nov): everything = coordinator, deputy_coordinator, mentor, head, curriculum_team, ops.
  own_classes = educator, class_teacher, subject_educator, cover_educator, specialist, assistant.
- **special_educator is in neither list** and item 2 needs it in exactly one group. Recommendation (needs Nimish):
  own_classes, and `own` also covers a child named in a child-scope grant (that is how a counsellor reaches one child).
  Rejected: everything (counsellors would see every child), a fourth group (Nimish said three).
- A person's reach for a kind = the strongest of the groups of the roles on their current grants (all > own > none). No
  current grant = none, even if a `staff` row exists. A grant is current when `valid_from <= today` and
  `valid_to` is null or after today; today is the school's date (config `school.time_zone`), as the grant check already
  treats `valid_to` as the first day it no longer holds.
- Subjects: for these four kinds the class alone decides (as `staff_sees` says for a child). A `subject_educator`'s
  subject narrows only tables that have a subject (CP-4's question).

## Which tables (the CP-3 list, an explicit floor)
`access_table(schema_name, table_name, kind_code, key_column, key_type, owner_column)`, primary key (schema, table).
- children: `public.child` (id, child), `pii.child` (child_id, child).
- enrolment: `public.enrolment` (class_id, class).
- staff: `public.staff` (id, staff), `public.staff_role_grant` (staff_id, staff), `pii.staff` (staff_id, staff).
- notes: `pii.educator_note` (class_id, class; owner_column staff_id: an author always sees their own note),
  `pii.note_claim` (note_id; reached through its note: `note_id in (select id from pii.educator_note)`).
`public.activity_observation`, `child_move` and the rest are child data for CP-4 (they are evidence, not notes).

## The rule, generated, not hand-written per table
`internal.apply_conventions()` is redefined (it runs at the end of every later migration, so the redefinition is what
keeps the rules in place). For a table listed in `access_table`: no `app_all`; instead
- `engine_all for all to app_engine using (true) with check (true)` (the engine is one trusted service login, not
  "everyone"), and
- `web_rule for all to app_web using (E) with check (E)` where, with `R = (select public.my_reach('<kind>'))`:
  `E = R = 'all' or (R = 'own' and <key test>)` and the key test is
  class: `col in (select public.my_class_ids())`; child: `col in (select public.my_child_ids())`;
  staff: `col = (select public.signed_in_staff())`; plus `or owner_col = (select public.signed_in_staff())` when set.
  The scalar `(select ...)` form makes Postgres evaluate each helper once per statement, not once per row.
Every table not listed keeps today's `app_all` until CP-4. `service_role_all` stays (Supabase's backend key).
"Allows everyone" means: a policy that applies to `app_web`, `public`, `authenticated` or `anon` and whose test is
true or empty. The engine's and `service_role`'s own policies are not that; the LIVE proof says so.
Helpers, all in `public`, stable, security definer, `search_path` fixed, execute for `app_web` and `app_engine` only:
`school_today()`, `signed_in_staff()`, `my_reach(kind)`, `my_class_ids()` (classes of current class or class_subject
grants), `my_child_ids()` (children with an open enrolment in those classes, plus children named in current child
grants). The definer owner bypasses row security (Supabase `postgres` and the CI image's superuser do); a test calls
every helper as `app_web` to prove no recursion.

## Staff details (item 6)
`pii.staff` has no privilege for `app_web` and keeps none (least privilege). The way to the details is a new
`public.read_staff_details(p_staff uuid)` (definer, returns name, email, phone) that returns a row only when
`my_reach('staff') = 'all'` or `p_staff = signed_in_staff()`, logs the read to `access_log` with the signed-in id as
the actor, and is granted to `app_web`. The engine keeps `pii.read_staff` unchanged. The policy on `pii.staff` is the
same rule, so a future direct grant cannot open it.

## Names (children kind, a gap found in review of the current code)
`pii.read_child` would hand any child's name to any signed-in person who has the id (ids appear in rows they can still
read, e.g. through CP-4's tables before it lands). It gains the same test, unless the caller is a service login
(`session_user` is `app_engine`): no row for a child the person does not see. `session_user`, not `current_user`,
because inside a definer function `current_user` is the owner; tests therefore use `set session authorization`, which
`set role` does not change. (Open: is changing `read_child` in this scope right, or CP-4's?)

## What this scope does not do (stated so nobody assumes)
- It turns nothing on for the live site until the site connects as `app_web`. Item 8's second half waits for Nimish: set
  the two passwords, point the site's `DATABASE_URL` at `app_web`.
- Item 7 can only prove nothing broke in the schema: the website's browser and speed suites connect as the owner and
  skip every rule. The real check of the site under the rules is the switch-on (below).
- Views over child data skip the rules (owner's rights). Setting `security_invoker` on them is CP-4's.

## Switch-on gate (not a proof; goes in `docs/notes/CP-3.md` and the handoff)
Only the K2-A class has a `school_class` row, enrolments and (per CP-1) campus-wide grants; the `educator` role is
campus-scoped, so it carries no class. On switch-on an educator with no class grant sees no children. Before Nimish
points the site at `app_web`: a read-only report of, per educator, the classes on the sign-in list against classes
granted, and per class its open-enrolment count, must show no educator with a class and no grant. If it cannot, the
switch waits.

## Decisions for Nimish (only what a user would see)
1. Special educator or counsellor: own classes plus the children named for them (recommended), or everything.
2. Switch-on waits until every educator's classes have a row, enrolments and a grant (today only K2-A does).
3. The database checks the class only; a subject educator's subject stays narrowed by the website (as now).
4. He sets the two database passwords and the site's connection setting when the gate above is green.

## Mechanical decisions (recorded)
- Rules are rows plus one generator, not a policy per table by hand: adding a table to a kind is an insert.
- Policies are `for all` so the same test guards any write privilege a login later gets.
- The notes tables stay unreadable by `app_web` (no grant); their policy is proved with a test login that has the grant.
- Migration name `<timestamp later than the newest file>_access_groups_and_rules.sql`. Rule 9 holds. The proofs use the
  CP-20 throwaway database (`TEST_DATABASE_URL`).

## Proofs (what the builder must make pass; the proof-writer writes the checks)
Items 1, 2, 6: tests reading the rows and the functions. Items 3, 4, 5: a database test builds two classes, a child and
a note in each, an educator of X, a person in each group, and runs the four kinds as `app_web` with the identity set the
way the website sets it (`set_config('app.staff_id', ..., true)`), per group not per role. Item 7: the existing suites.
Item 8: box only, read-only counts from `pg_policies` and `pg_stat_activity`/the connection role.

## Implementation list
- Create `supabase/migrations/<ts>_access_groups_and_rules.sql`: the tables, `access_vocabulary`, the helpers,
  `read_staff_details`, the `read_child` change, the redefined `internal.apply_conventions()`.
- Modify `packages/engine/engine/checks/rules.json` (regenerate: new constraints) and the map `workflows.json` if
  `test_layout` requires new tables to be named.
- Create `packages/engine/tests/test_access_rules.py`; `docs/adr/<n>-access-groups-as-rows.md`; `docs/notes/CP-3.md`.
