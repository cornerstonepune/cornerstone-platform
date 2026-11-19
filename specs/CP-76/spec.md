# CP-76: Money MM-0 — two campuses, every class on one, and an operations lead for each

Issue #891. Money & Materials task MM-0 (`docs/notes/money-and-materials.md` §5), decided by D-077 and D-078. Waits for
Nimish's approval comment on the issue.

## What

Money and stock belong to a campus, so the school becomes what it is: two campuses, **Gurukul** and **Neev**, each class on the one that
runs its grade, and an operations lead on each who will later approve that campus's claims (MM-3). Nothing here touches a rupee.

What live holds today (read 2026-11-19, SELECT only): 1 campus ("Cornerstone School, Pune"); 4 classes (K2, G1, G2, G3), all on it; 7 staff,
all on it; the `ops` role exists with 0 holders; no storage bucket. A person already has one campus (`staff.campus_id`, not null) and a class
already has one (`school_class.campus_id`, not null), so **no column is added**. What breaks with a second campus is that the class-list
import refuses ("expected one campus"), and `engine staff add` puts everyone on the first campus. The `materials_consolidated*` tables are
gone (dropped by the CP-27 clean-up); `material_item`, `activity_material`, `materials_list`, `materials_line` are there.

## Done when

1. There are two campuses, Gurukul and Neev. Gurukul is today's campus row renamed (same id, so nothing that points at it moves); Neev is
   new. Running the change twice leaves two.
2. Every class is on one campus (it cannot be on none), and a class the class-list import makes goes to the campus that runs its grade
   (setting `school.campus_grades`): PG on Neev, Grade 4 on Gurukul. A grade no campus runs is refused in words.
3. `engine staff add --role ops` without `--campus` is refused in words; with `--campus` the person is on that campus, and a campus that is
   none is refused. Which roles are held for one campus is the setting `people.campus_roles` (starts as `ops`).
4. `campuses_of(staff)` gives the campuses a person acts for: a role in `people.campus_roles` has its own campus alone; anyone else has the
   campuses of the classes they teach, and every campus when they teach none (a coordinator).
5. Giving a person a campus is a `change_log` row naming the role and the campus. (The row names the origin, not the person who ran it:
   the command has no signed-in person. The Staff page's own PR can name them.)

After merge, live check (SELECT, reported as counts): campuses 2; classes per campus; `ops` holders 1 per campus once the coordinator has
added the two operations leads.

## Out of scope (moved, with the reason)

- **Receipts bucket** -> MM-2. Nothing uploads until claims exist, and "an educator sees only their own receipts" cannot be a storage
  policy: the site signs people in as a `staff_id`, not as a Supabase user, so the bucket is private with no policies and the engine route
  enforces ownership (as lesson photos are kept today).
- **Historic import (1,301 lines)** -> its own task after MM-2: it needs the `expense` table, which MM-2 designs with the claim flow. It
  reads the `expense_lines` tab as a CSV by path, outside the repository (as `engine curriculum k2` and `engine staff load` do): there are
  no Google credentials on the server.
- **"Every educator can submit"** -> MM-2, where there is something to submit.
- **PG, Nursery, K1 and Grade 4 as classes.** They arrive with their children through the class-list import, which now places them. Empty
  classes made here would be classes no child is in, which `engine staff` refuses.
- **Day care.** Not a class: no grade, no curriculum. Its spending is a cost stream on a claim (MM-2).
- **The Staff page choosing a campus** -> its own small PR (standing orders: one page, one PR).

## Schema

One migration, data only (`20270206090000_two_campuses.sql`): the rename and Neev. No table, column or function; `supabase/table-budget.json`
is unchanged. Two settings rows (`people.campus_roles`, `school.campus_grades`) in the seed. The role `ops` is allowed by naming it in
`people.campus_roles`, not by adding it to `people.decides` (that list is the kinds of work that wait on a person).

## Corrected after reading the code (the first draft was wrong on two points)

The first draft added `staff_role_grant.campus_id` and a SQL `campuses_of`. Both are dropped: a person's campus already exists
(`staff.campus_id`), and a new SQL function would raise the function budget the schema may only lower (CP-27).

## To settle in the approval comment (assumptions; the build goes ahead on them)

- **Which grades are at which campus**: assumed Gurukul K2 to Grade 4, Neev PG, Nursery and K1. The session could not open D-077 (the private
  `teacher-os` repository was not attached), so this is inferred from the brief. It is one row (`school.campus_grades`) to change.
- **Renaming the campus row to "Gurukul"**: the school's full name stays in the `school.context` setting, which prompts read.
