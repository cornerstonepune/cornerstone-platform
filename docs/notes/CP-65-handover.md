# CP-65 handover (track D, 17 Nov 2026)

**Spec:** issue #811 "CP-65: one design system, one navigation". One PR, order A → B → C → D.
A white page, boxed cards, one spacing scale, ≤3 font sizes, even table columns, plus a regression test.
B menu = Today · Timetable · Children · Assessments · Curriculum · Setup (Notes leaves the menu; Timetable one page with
day/week/fortnight, planner, move/edit, holiday/event day with a "needs a new slot" list, by-hand placement through the rules,
"Let the solver place them", time-by-subject as a view; Curriculum one flow grade→subject→topic→objective→activity with an
appendix, Objectives and Skills to approve fold in; Setup = Staff, Classes, Timetable rules, How it works).
C Today = lesson strip (desktop), then collapsible Teach today / Papers to assess / Notes to confirm / anything else; each link once.
D Children table: even columns, Last seen + Absences noted agree, reads `attendance`.

## Done on the branch
Nothing is built. Only the issue and this note exist. Branch is from main 0fb5a2698. No merge: orchestrator's hold stands.

## One trap found already
`apps/web/design-system/tokens.json` is a COPY. The source is `docs/frontend/tokens.json`; `node apps/web/scripts/tokens.mjs`
overwrites the copy (my first edit vanished that way). Edit the docs file, then run the script (it also writes tokens.css, help.json).

## Where things live
- Tokens: `docs/frontend/tokens.json` → `apps/web/design-system/{tokens.json,tokens.css,help.json}`; sizes today: 32/24/20/18/16/14/14/12
  (`--text-title-page|section|small|lead|body|label|eyebrow|caption`). Plan: title 24, body 16, small 14; weights 400/600 only
  (drop 500 in `app/layout.tsx` Source Sans load and `font-medium`); ground `#fbfbfa` → `#ffffff` (reverses his 13–14 Nov remarks; say so in the PR).
- Hard-coded sizes to fold into the three: ~54 files with `text-[12.5px|13.5px|16px|…]` in `apps/web/app`, `components`; `font-size: 16px/14px/12px`
  in `components/blocks.css`; card gaps in `blocks.css` (`.b-cards`, `.b-strip`, `.b-prow`, `.b-card-*`), `app/globals.css`.
- Menu: `apps/web/lib/menu.ts` (SECTIONS, `locate`), sidebar `components/app-frame.tsx`.
- Today: `app/(app)/today/{educator-today,school-today,blocks}.tsx`, `lib/today-school.ts`.
- Timetable: `app/(app)/timetable/*` (+ `/time`, `/rules`); Curriculum: `app/(app)/setup/curriculum/*`, `setup/skills/approve`.
- Children table: `components/children/children-table.tsx` (columns `seen` 9rem, `absences` 20rem), `lib/children-view.ts`.
- Attendance: table from `20270128100000_cp42_attendance.sql`, `engine/core/attendance.py`, routes `/attendance/load|child|class`.
  The supplied 6–9 month data is NOT in the repo (names; loaded live). Ask the orchestrator to confirm it is loaded.

## Regression test plan (`apps/web/tests/u90-design-system.spec.ts`, name must match `[sumpe]\d+-…spec.ts`)
Walk the menu routes signed in at 1440 and 400: (1) computed `font-size` of every text node ∈ {24,16,14}px and `font-weight` ∈ {400,600};
(2) body background rgb(255,255,255); (3) sibling cards/sections (`.b-card`, `.b-sq`, `.b-prow`, panels) have gap ≥ 12 and on the
scale {12,20,32,48,64}; (4) every `table` has explicit `col` widths from the shared DataTable. Add a static source scan to `bin/check`
for raw `font-size: Npx` / `text-[Npx]` outside tokens.

## CI traps (from #802)
- u70 inventory: pages need `docs/frontend/screens.json` elements + `docs/frontend/wireframes/<screen>.html` (both frames) + `help.json`;
  `node docs/frontend/wireframes/check.mjs` and `node apps/web/scripts/tokens.mjs --check` run in `bin/check`.
- u71 blocks baselines are made on CI's fonts; cannot be generated locally. Changing sizes/colours changes them all.
- u13 route walk: 3-click reachability, NOT_BY_CLICK exemptions; a menu change updates it. u60 lists the School menu links.
- u43 grade is one word everywhere; u31 counts six maths topics. Five browser shards, 45-min limit; u70 split is track C's.
- Pushes cancel running CI; merge only when every check is green on that head.

## Next 5 steps
1. Edit `docs/frontend/tokens.json` (three sizes, two weights, white ground), run tokens.mjs, fold the hard-coded sizes.
2. Shared blocks: one gap scale, boxed cards, DataTable even column widths; write u90 test red first.
3. Menu + Setup/Curriculum pages (B), update u13/u60/inventory/wireframes.
4. Timetable one page with holiday re-placement list + solver action; Today strip and collapsibles (C).
5. Children table (D); 2x screenshots at 400 and 1440 of every changed page in the PR body; note the `design:design-system` skill was not available.

## Update, end of A+B+C (17 Nov, later)
Done and pushed: A (tokens: 24/16/14, weights 400/600, white ground, `@utility text-*` — the `text-label|body|…` classes were
defined nowhere before, root cause of the uneven sizes), `u90-design-system.spec.ts` (white page, sizes, card gaps, table widths at
1440 and 400 on the six menu routes) and `tests/test_design_scale.py` (static scan, in `bin/check`); B (six-line menu, Setup page holds
Staff/Classes/Timetable rules/How it works; `u75` rewritten, `tests/menu.ts` constant updated); C (educator Today: lesson strip, then
collapsible Teach today / Papers to assess / Notes to confirm / Anything else waiting; stat tiles removed as duplicates).
Screenshots (2x): `docs/notes/img/cp65-today-{1440,400}.png`, `cp65-menu-{1440,400}.png` (fake educator, fake data).
NOT done: ~25 older specs still name the old menu ("My day", "School", "Class picture" lines, "Papers to check", `Week`/`Time by subject`
links, `getByRole("list",{name:"School"})`): u13-frame, u13-route-walk, u53-the-menu, u60, u62, u64, u73, u74-timetable, u80, u81,
u93, u94, u96*, u101, m1-09-calendar, screens, p63-today-in-blocks, u15, u1-today, u65, u50, e2e. Fix before CI. u71 baselines will change.
Local test DB: Postgres 16 under /tmp (port 5433), `bin/testdb fresh`; `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/cs_test`.

## FINAL HANDOVER (17 Nov, frontend session stopped at its 55% rule; head = see `git log`, PR #815 draft)
DONE and pushed (A, B, C + the orchestrator's rounds 1-2):
- Tokens (docs/frontend/tokens.json → `node apps/web/scripts/tokens.mjs`; kit.css via `node docs/frontend/wireframes/kit.mjs`): 24/16/14, weights 400/600,
  white page, basalt menu tokens (`menu`, `menu-ink`, `menu-ink-muted`, `menu-hover`), no tracked capitals anywhere (no `uppercase`, no letter-spacing).
- `@utility text-*` in app/globals.css (these classes did nothing before). `[data-column] > * { margin-block: 0 !important }` + the Screen's grid gap = one gap.
- `u90-design-system.spec.ts`: white page, sizes, card gaps, block gaps, table widths, word budget (purpose <= 10 words, loose paragraph <= 14) on the six menu routes at 1440 and 400. `test_design_scale.py` static scan in bin/check.
- Menu: six lines (lib/menu.ts, components/frame/sidebar.tsx; label in `[data-section-label]`). Setup page holds Staff/Classes/Timetable rules/How it works. Curriculum page links Objectives and Skills to approve.
- Today: wrapping lesson strip, then `TodayBlock` sections (details/summary, `data-today-block`, count in `[data-today-count=<id>]`, empty ones shut with "none", `data-todo` on the Anything-else block). Stat tiles, CountLine and the 'See all assessments' link are gone. No `next` link on Today.
- Children: one card (Needing attention), no explainer line, Absences cell is "none" or the days strip + chip, width 16rem.
- About 40 older specs updated to the new names. The last broad run (Today, Children, menu, route walk, u60, u74, u80...) was green except two specs fixed in the last commit.
NOT DONE (in this order): D Timetable one page; E Curriculum one flow; F Children with attendance (Last seen and Absences agree, from the `attendance` table: engine/core/attendance.py, routes /attendance/class|child). Also: Assessments board column widths; fewer-words pass on Timetable/Curriculum/Setup beyond the purpose line; the u71 baselines (CI only); the menu column height in full-page screenshots (sticky, fine in a window).
HOW TO RUN SPECS HERE (the sandbox kills background processes between turns): Postgres 16 under /tmp/claude-0/pg (port 5433), built by `bin/testdb fresh postgresql://postgres@127.0.0.1:5433/cs_test`.
`/tmp/claude-0/scratch/run.sh <log> <spec files>` restarts it if down and runs `npx playwright test --project=steps`; if /tmp was cleared, rebuild with initdb + testdb fresh and set
`TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/cs_test`. Run it in the FOREGROUND (timeout up to 590000 ms); a run left in the background dies with the DB. A spec that fails once with
ECONNREFUSED or "This page could not load" is the DB: re-run it alone before trusting it.
Skills: impeccable and emil-* come from origin/skills/design, apple-design was cloned from github.com/dickwu/apple-design-skill; all are excluded in .git/info/exclude and were never committed. Ask for them again in a new checkout.
CI: pushes cancel the running CI (the 'engine' job then shows red with `checks: cancelled`: not a failure). A draft runs only quick checks; mark it ready for the full suite and wait for green on that head before any merge (Nimish has not yet approved).

## D done, E and F not started (17 Nov, second frontend session, stopped at its 55% rule)
DONE and pushed (head = `git log`): **D, Timetable as one page.**
- Views Day / Week / Fortnight / **Time by subject** on `/timetable` (`?view=time`, its class choice is `scope`; `/timetable/time` redirects in next.config). The old page's body is `timetable/time-view.tsx`.
- **Planner** (`timetable/plan-panel.tsx`, a fold named Plan, open when something needs a slot): mark a day Holiday / Event day / Teaching day again (engine `/timetable/day/mark`, `w2_print/tt_day.py`); lessons on such a day are listed as needing a new slot (`/timetable/day/needs-slot`, same rows); each is placed by hand through the existing `tt_delayed.move_delayed` (free place, fixed period, materials already sent, clashes of a settled fortnight; one refusal moves none); "Let the solver place them" posts the existing `/timetable/generate` for the fortnight.
- Decisions to confirm with Nimish: an **event day is stored as a holiday day** (`school_day.kind = 'holiday'`, note `Event: <name>`), because every existing query treats `kind <> 'holiday'` as teaching; a real third kind would need a migration and changes to those views. The solver makes a **draft for the whole fortnight** (the engine has no one-lesson solver); the coordinator then goes live as before. Moving or editing one lesson in the grid already existed (lesson panel Move / edit); not rebuilt.
- Tests: `tests/test_tt_day.py` (engine), `apps/web/tests/u95-timetable-plan.spec.ts`, `u93` follows the new address. `bin/check` green. Screenshots: `docs/notes/img/cp65/timetable-{week,fortnight-plan,time}-1440.png` (`CP65_SHOTS=<folder>` makes them from u95).
- Not green and not mine: `u74-timetable.spec.ts` "while a lesson is chosen every free slot offers itself" times out on the branch without these changes too (the slot link is never stable); look at it before the full CI.
NOT DONE: **E** Curriculum one flow; **F** Children from `attendance` and the Assessments board columns; the fewer-words pass on Timetable's older blocks; the u71 baselines.
LOCAL RECIPE changed (no /tmp/claude-0/pg): Postgres 16 under `/var/tmp/cs-pg`, port 5433, run as the `postgres` user: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/cs-pg -o '-p 5433 -k /var/tmp' -w start"`; build with `bin/testdb fresh postgresql://postgres@127.0.0.1:5433/cs_test` (drop and recreate the database first if it is not empty). Engine: `cd packages/engine && uv sync --all-extras`, then `uv run python -m pytest` with `DATABASE_URL` and `TEST_DATABASE_URL` both set to that URL. Web: `npm ci` in apps/web, then `TEST_DATABASE_URL=… npx playwright test --project=steps <spec> --trace off`. `tsc` shows two `LayoutProps` errors that are Next's generated types, not ours.

## PR #815 CI repair, 17 Nov (third session; stopped at the 55% rule). Head before this push: 8f73025
DONE (root causes): Guide follows the six-line menu (pages folded into `setup.json` and `assessments.json`, links updated); `test_design_scale`
message no longer names `docs/frontend/`; no spec skips itself (CP65_SHOTS screenshot blocks removed from u104/u95/u72); Skills links go straight to
`/setup/curriculum?approve=1`; the Curriculum page's To review row has "Check this week" again (the rebuild had left `/setup/curriculum/check` with no link).
s2-skill-map and u13-route-walk pass locally. All 12 engine shards were green on 8f73025.
STILL RED on 8f73025 (browser shards; fix, run only the named specs locally, push once):
- shard 5: u49-one-role `/` (the Today block summaries carry live counts, so educator and coordinator labels differ: compare the heading text only,
  and decide whether an educator whose notes read is down should still see the Notes block; `link: /notes` is coordinator-only today);
  u70-inventory-today x3 (docs/frontend/screens.json elements + wireframes for the collapsible blocks, a trail, Tab order, and gaps of 7 px under 8 between the
  "Anything else waiting" summary and the filters at 400); u76-children-wireframe x4 (the spec still expects `[data-notes-count]`, "Grouped by how they are
  doing.", the "The whole class, all skills" card with an img, and an "Absences noted" column: rewrite it to the Children page F built, keeping each rule it proves).
- shard 4: u12-outside-the-bar "?" (INVENTORY has no screen owning the route: Setup/Curriculum routes changed); u70-inventory-school x2 (`setup` screen: inventory
  lists "Open the curriculum", "Open Question bank", "Open Skills to approve", "Open Classes and children"; page has "Open Classes", "Open Timetable rules", "Open How it works").
- shard 3: u51-ux-rules x2 (`/today: shell`, `/: shell` break a rule: read which one in the log), u70-inventory "the bar, driven once" (apps/web/tests/inventory/bar.ts line 21 still
  clicks the old menu: [Timetable/Week], [Children/Class picture], [School/Curriculum], [My day/Today]).
- shard 2: u71-blocks screenshots (AttentionStrip-dark-400 is 379 px tall, expected 403; tinted-chips-light 330 vs 323; the AppFrame/other -dark-1440 baselines too). Take the
  `*-actual.png` from the shard's `playwright-report`/test-results artifact and commit them over `apps/web/tests/u71-blocks.spec.ts-snapshots/*`. Shard 2 had 9 failures in all: only
  two names were read; read the rest from the log. Shard 1 was still running when this was written.
LOCAL RECIPE worked: `/var/tmp/cs-pg` (initdb as postgres, port 5433), `bin/testdb fresh` takes 7 minutes, `npm ci` in apps/web, then
`TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/cs_test npx playwright test --project=steps <spec> --trace off --reporter=line` (the sandbox forgets /var/tmp/cs-pg if the container restarts).
Not done: Job 2 (top navigation). The design skills could not be installed (the permission classifier refused editing `.git/info/exclude` and cloning apple-design); ask Nimish or the orchestrator.
