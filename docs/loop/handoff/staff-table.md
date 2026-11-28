# Staff table at /setup/staff — notes, 28 Nov 2026 (nothing built)

## The ask (Nimish)
1. Show each person's sign-in email. 2. A few more details: check what is stored, suggest, confirm with him before building.
3. Owner-only "Set new password": temporary password shown once, must be changed at next sign-in.
Rules: no readable passwords anywhere; emails, personal details and the action are owner-only, enforced on the server.
Also check sign-in / site address settings use https://console.cornerstoneschool.in (the old cornerstone-assessment.vercel.app
now 307-redirects there since 28 Nov; check no job, webhook or callback still calls it).
Done = columns show for him, another staff account cannot see or use them (tested), checks pass, ask before merge/release.

## Decided 28 Nov
Owner = all co-founders: `docs/adr/0118-staff-emails-and-passwords-are-for-co-founders.md`. Columns confirmed: Email, Password status, Last sign-in, Phone (if filled). No open product question.

## Found in code (read, not run)
- Sign-in is the site's own, not Supabase Auth: `apps/web/lib/auth.ts` (scrypt hash in `pii.staff.password_hash`,
  signed cookie `cs_staff`, 30 days; a newer `password_set_at` ends older sessions). Emailed link: `lib/password-links.ts`,
  `lib/password-actions.ts`. Password writes go through SQL function `public.staff_set_password`. Rules: `lib/password.ts`.
- Page: `app/(app)/setup/staff/{page,person-panel,actions}.tsx|ts`; data `lib/queries-coordinator.ts` `staffLines`
  (already carries email, used by search, not shown). `staff_list` returns active staff only.
- Page gate is `namesMayShow()` = `my_reach('staff')='all'`: every role in access group `everything`
  (coordinator, deputy, mentor, head, curriculum team, ops, special educator, founder). So "owner only" is a new, narrower rule.
- No "owner" concept found. Do NOT use role `founder` alone: Add a person offers held roles (`lib/queries-staff.ts`),
  so a coordinator could likely create a new founder account (unverified). Name the owner in a seeded row, checked on the server.
- Stored per person: name, email, phone (column exists, fill unverified), role, campus, active, added date, password set date.
  Last sign-in not seen in the staff tables (failures only, `sign_in_failure`): likely needs a new column.
- Temporary password needs a migration (must-change flag) and enforcement in `requireStaff`/sign-in, covering API routes
  and server actions too; `staff_list` must expose the flag. Wireframe S50-staff changes, so Nimish must approve it afresh.
- Cookie is host-only: people signed in on the old address must sign in once on the new one.

## Site address, checked 28 Nov ~10:35 UTC
- Old `/login` answers 307 to the new `/login`; new answers 200.
- Repo: the one job calling the old address was `watch-live.yml`; fixed with `docs/deploy.md` in PR #961 (CI green, not reviewed, not merged).
  Other mentions are dated notes. No Google client id is set and no Supabase Auth calls were found in `apps/web`.
- Hosting: Vercel project `cornerstone-assessment` is now in team `cornerstone-school` (use `--scope cornerstone-school`).
- Production `NEXT_PUBLIC_SITE_URL` still holds the OLD address. Changing it (and redeploying) needs Nimish's yes. Old links redirect.
- No `SMTP_*` name in the project's or team's Vercel settings: the site likely cannot send set-password emails (not tried).

## Not checked
Engine server `.env`, runtime logs for non-browser callers, live data, whether any set-password email has ever been sent.

## Unrelated, noticed
`sendFirstLink` (`lib/password-actions.ts`) only requires a signed-in user: any staff member could trigger that email to any address.
