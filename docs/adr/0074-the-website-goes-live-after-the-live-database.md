# ADR 0074 — The website goes live after the live database has the merge's migrations

**Status:** accepted (2026-10-15).
Goal: goals/l4-the-website-waits-for-the-database.yaml

## What happened

On 2026-10-15 Vercel put #205 live at 03:00 UTC, as it puts every merge to main. `migrate live` runs only once CI has
passed on main (goals/p0-live-changes-wait-for-ci.yaml), and applied #205's migration, 20261110090000, at 03:26. For those 26 minutes every page that read the new rule failed. The engine was never at risk: `deploy engine`
already waits until live has every migration its commit carries. Only the website raced. And Vercel put a merge live
whether or not CI passed on it.

## Decision

1. **Vercel keeps building every merge at once, and holds the build back from the live address** until the commit's
   `live database` status is green. This is Vercel's own Deployment Checks, set once in the project (Settings → Build
   and Deployment → Deployment Checks → GitHub → `live database`).
2. **Only `migrate live` sets that status**, as its last step, on the commit it migrated: green after `supabase db
   push` succeeded, red when the run failed. A red CI never starts it, so a red merge never goes live either.
3. **A commit main has moved on from gets no status.** Its build waits for ever; the newer merge's run releases the
   newer build, which carries the older one's code. The website never steps back to older code.
4. **Force Promote** in Vercel stays the way round it, by hand, when the database is not the problem.

5. **A commit main has moved on from is released when live already has all its migrations** (CP-73, 17 Nov 2026).
   Point 3 left built work waiting for hours whenever merges landed faster than CI (~12 min): every one was
   superseded before its own run ended, and only the newest got the status. Now the run of a green commit X that is
   no longer main's newest asks live which migrations it holds. If live has every migration X carries (the newer run
   applied them, or X has none live lacks) and no newer commit has already been released, X gets the status and its
   build goes live; the log says which commit is released and why. If live lacks one of X's migrations, nothing
   changes: X gets no status and pushes nothing, and the newer commit's run applies it and releases the newer build.
   `db push` still runs only from main's newest commit, and a red CI starts nothing, whatever main holds.

6. **The website also waits for the engine** (CP-73b, 17 Nov 2026). My day went live at 15:04 UTC while `deploy engine`
   for the same commit ran until about 15:06, and every lesson on the page read "Not Found": the page called a route
   the engine did not have yet. The `live database` status is now set by a `release` job after the push job, once live
   has the commit's migrations and the engine server runs the commit's code or a later one (the commit it records in
   `~/cornerstone/engine-commit` at the end of a successful deploy, read over ssh). A commit whose difference from
   what the server runs touches nothing the engine runs is released at once; an engine-changing commit waits, up to
   90 minutes, with a log line saying so (a long `curriculum run` holds the engine's queue and so holds it). If the
   recorded commit cannot be read, a commit whose own change touches the engine is held and any other is released. A
   failed engine deploy sets no status. The push job alone holds the `migrate-live` queue, so a waiting release never
   delays the next merge's migrations.

## Rejected

- **A deploy hook, with Vercel's automatic deploys of main turned off** (`git.deploymentEnabled`). It needs a secret
  URL in GitHub. It deploys whatever main holds when called, not the commit migrated. Vercel's documentation does not
  say whether a hook still deploys a branch whose automatic deploys are off; it says hooks stop when `github.enabled`
  is false. And the build would start only after the migration, adding the build's time to every release.
- **Vercel's CLI deploying from GitHub Actions** (`vercel deploy --prod`). It needs an account token, a credential far
  wider than the job needs, and builds the website a second way beside Vercel's own.
- **The website tolerating a missing column or rule.** Every page would carry two versions of the database. The race
  is in the order of the deploys; it is fixed there.

## What is not settled

Vercel's plan for this team was not readable from here (the connector has no access to its scope). If Deployment
Checks are not offered on it, the deploy hook above is the fallback, and this ADR is superseded.
