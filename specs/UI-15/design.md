# UI-15 design: mechanical decisions

Tier 3 (security), lane `apps/web` only. Two independent fixes; no schema, no engine, no new screen.

## 1. Who may change the staff list

- **Where the check lives.** One helper in `apps/web/lib/auth.ts`, `requireEverything()`: signed in (else `/login`, as
  `requireStaff()` does) and in the coordinator ("everything") group, else a redirect to `/staff?refused=group`
  before anything is read or written. Each of the three actions in `app/(app)/staff/actions.ts` calls it first,
  in place of `requireStaff()`. Each action calls it itself (Next 16's auth guide: a page's or layout's check does
  not protect a server action, which is a public POST endpoint).
- **What "in the group" means.** The database's own access rows (CP-3, migration `20270120100000`):
  `staff_role_grant` → `access_role_group` → `access_reach`. The question is asked with the database function that
  already answers it, `public.my_reach('staff') = 'all'`: only the `everything` group has reach `all`, and it reads
  the signed-in id the site already sends with every query (`app.staff_id`, CP-2). No role name and no group name is
  written in the website's code; moving a role between groups is an update to a row.
  - Rejected: `staff_sees(role, …, null, null, null)` (what `lib/reach.ts` uses for "sees every class"). It reads
    the role string on the sign-in list and names `'coordinator'` inside the function; it is not the access groups.
    The two readings disagree on real people (a sign-in entry with role `coordinator` but no current everything-group
    grant passes the old rule and fails this one; an `educator` entry with a `deputy_coordinator` grant the reverse).
    Decided by the orchestrator, 9 Nov 2026: the access groups, `my_reach('staff') = 'all'`, the literal reading of
    Done-when 3 and the rule CP-3/CP-4 enforce once the site connects as `app_web`.
- **Refused means nothing happens.** The check runs before any read of the form, any query and any email; a refusal
  is a redirect, so no row changes and `sendFirstLink` is never reached.
- **Dev bypass.** `NEXT_PUBLIC_DEV_BYPASS` sessions carry no staff id, so `my_reach` answers `none` and they cannot
  change the staff list. Production never has the bypass; accepted.

## 2. Next.js

- Both advisories (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) name `16.4.1` as the first fixed 16.x version.
  Chosen: `16.4.5`, the newest 16.4 patch (published 3 Nov 2026) and the reviewer's suggestion, so later 16.4 fixes
  come with it. `eslint-config-next` moves with it (same version, as today). Recorded in `docs/notes/UI-15.md`.
- The lockfile is regenerated with npm (`apps/web/package-lock.json`), the repository's package manager.
