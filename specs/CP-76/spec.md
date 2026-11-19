# CP-76: Money MM-0 — two campuses, every class on one, and an operations lead for each

Issue #891. Money & Materials task MM-0 (`docs/notes/money-and-materials.md` §5), decided by D-077 and D-078. Waits for
Nimish's approval comment on the issue.

## What

Money and stock belong to a campus, so the school becomes what it is: two campuses, **Gurukul** and **Neev**, every
class on one of them, and one operations lead on each who will later approve that campus's claims (MM-3). This is the
ground the claim, rules and approval screens stand on. Nothing here touches a rupee.

What live holds today (read 2026-11-19, SELECT only): 1 campus ("Cornerstone School, Pune"); 4 classes (K2, G1, G2, G3),
all on it; the `ops` role exists with 0 grants; a role held "per campus" cannot say which campus (`staff_role_grant` has
no campus column), so with two campuses an operations lead would see both. No storage bucket. The `materials_consolidated*`
tables are gone (dropped by the CP-27 clean-up); `material_item`, `activity_material`, `materials_list`, `materials_line`
and `materials_line_source` are there.

## Done when

1. There are two campuses, Gurukul and Neev. Gurukul is today's campus row renamed (same id, so nothing that points at it
   moves); Neev is new. Running the change twice leaves two.
2. Every class of 2026-27 is on one campus, and a class without a campus is refused. New classes: PG, Nursery and K1 on
   Neev; Grade 4 on Gurukul. K2 and Grades 1–3 stay on Gurukul.
3. A role held per campus can name its campus: a grant of `ops` without a campus is refused in words (`needs_campus`);
   the head's and coordinators' existing grants, which name none, still mean every campus.
4. `campuses_of(staff)` gives the campuses a person acts for: an operations lead's is their campus; a head or coordinator
   with no campus named gets both; an educator gets the campus of their classes.
5. The Staff page and `engine staff add` can give the `ops` role for one campus, and the grant is a `change_log` row
   naming who gave it. (Separate small PR for the page, per the standing orders.)

After merge, live check (SELECT, reported as counts): campuses 2; classes per campus; `ops` grants 1 per campus once
the coordinator has added the two operations leads on the Staff page.

## Out of scope (moved, with the reason)

- **Receipts bucket** → MM-2. Nothing uploads until claims exist, and the access rule ("an educator sees only their own
  receipts") cannot be a storage policy: the site signs people in as a `staff_id`, not as a Supabase user, so the bucket
  is private with no policies and the engine route enforces ownership (as lesson photos are kept today). One seam, tested
  where the upload is built.
- **Historic import (1,301 lines)** → its own task after MM-2. It needs the `expense` table, which MM-2 designs with the
  claim flow; building it here would design that table twice. The import reads the `expense_lines` tab exported as a CSV,
  by path, outside the repository (the `engine curriculum k2` and `engine staff load` pattern), not a new Drive adapter:
  there are no Google credentials on the server, and a one-off import does not justify one.
- **"Every educator can submit"** → MM-2, where there is something to submit.
- **Day care.** Not a class: it has no grade and no curriculum. Its spending is a cost stream on a claim (MM-2).
- Any rupee, rule, claim or screen beyond the Staff page's campus choice.

## Schema

One migration: `staff_role_grant.campus_id` (a column, nullable; required when the role is `ops`); `school_class.campus_id`
made not null; the campus rename and Neev; the four classes. No new table (`supabase/table-budget.json` unchanged).

## To settle in the approval comment (assumptions; build goes ahead on them)

- **Which grades are at which campus.** Assumed: Gurukul runs K2–Grade 4, Neev runs PG, Nursery and K1. This session could
  not open D-077 (the private `teacher-os` repository was not attached), so the split is inferred from the brief, not
  read. Nimish confirms or corrects it in one line.
- **Renaming the campus row to "Gurukul".** The school's full name stays in the `school.context` setting, which prompts
  read; the campus name is only what the site shows.
