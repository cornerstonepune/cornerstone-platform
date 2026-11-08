# M1-12s: why a head sees a 404 on the curriculum screens

## Verified (from code)
- The routes exist on main (`apps/web/app/(app)/curriculum/{browse,fill,offers}`) and Vercel deployed main's latest commits (commit status "Vercel: Deployment has completed" on each of the last merges, 8 Nov).
- A 404 there is the site's answer to a refusal: `mustBeOn` (apps/web/lib/curriculum-screens.ts) asks the engine's `POST /curriculum/page/gate`; a 403 or 404 becomes `notFound()`.
- The gate (engine/api/deps.py `curriculum_staff`) refuses unless (a) the signed-in email is one member of staff in the people tables (`pii.staff`, found by `staff_of_email`), AND (b) that person holds TODAY an open grant (`staff_role_grant`) in a role named by the config row `curriculum.review_roles` (head, coordinator), or by `educator.preview_roles`, or the educator switch is on. It does NOT read the sign-in list (`config.app.staff`) the person signed in from. A head who is on the sign-in list but was never copied into the people tables (`engine staff import`), or has no open grant of head, or whose config rows were never loaded, is refused and sees a 404. 'head' is a role code the people tables know (`internal.people_vocabulary`).
- `engine curriculum gate-check` (run choice `gate_check`, free) asks the gate itself about each sign-in entry and prints, by role, counts only: entries, in the people tables, grant in the same role today, gate open, may review; and the config rows.

## Handoff
- Dispatch `gate_check` after merge. Which count is zero says the fix: not in the people tables or no grant is data (`engine staff import`, a grant), not code; a config row null needs `load_settings`.
