# Handoff — 14 Nov 2026 (frontend + backend orchestrator session, archived)

Plain-English state for Nimish and for whoever picks this up next.

## Live now (https://cornerstone-assessment.vercel.app)

- **#756 Part C batch 1 and 2**: every Workspace page (Notes, Fortnight, Materials, Staff, Classes, Skills to approve, Question bank,
  Curriculum, Across classes, Parent reports); Record moved onto the lesson page; "What needs doing" folded into Today.
- **#757 Design PR 1** (live 13 Nov, website by Force Promote, engine by hand deploy): the approved "more spacing" (issue #546) at last on
  the site; warm page with white cards; sand menu with a colour per section; one slim filter bar (44 px chips with a focus ring); no empty
  right panel (the panel opens only for a chosen thing; a page's numbers sit beside its main action, its other facts at its foot); one
  compact number pill everywhere; no text under 12/14/16; the site opens on Today (`/` redirects to `/today`); the old skill list lives at
  `/setup/curriculum/skills`. Bug fixed: "Open everything" on that list looped for ever when a skill had no topic.
- **#758 CI**: browser tests in four shards, not three. Shard 2 hit the 30-minute limit three times on 13 Nov with every test passing,
  which blocked the automatic deploy each time. From #758 on, a green main deploys by itself again (check the first run: it is the
  first run with four shards).

## Not live: Design PR 2 (on branch `claude/eager-pasteur-hvq6p9`, draft PR)

Built, local tests not finished, **not yet shown to Nimish**. Rule: screenshots to Nimish before marking ready.

- **Timetable** (`components/fortnight-grid.tsx`, `blocks.css`): a fortnight is two stacked weeks of five day columns; calendar heads
  ("MON" small, "23" large, text still "Mon 23"); time ruler shows the start bold and "–end" muted (text still "09:40–10:00"); lesson
  name cut at two lines with the whole name on hover; a row with no lesson that week is left out of that week.
- **Assessments board** (`kanban-board.tsx`, `children/assessments/page.tsx`): card title is what it assesses; class, day and papers back
  on one muted line; each card one white box with its action inside; lane heads in small caps sans.
- **Question bank** (`setup/question-bank/page.tsx`, `lib/queries-bank.ts`): Topic filter (narrows the skills); "Topic and skill" column
  (the skill's learning objective as its hover title); four filters in the row; Status column only when removed questions are shown.
  Inventory (`screens.json`) and wireframe `bank.html` carry the Topic filter.
- **Curriculum** (`setup/curriculum/page.tsx`, `offers-asks.tsx`): three tabs (`?view=` list / offers / asks) instead of three stacked
  tables; each question's draft and reason fold under it. Tests updated to `?view=offers` / `?view=asks`; `lib/todo.ts` links to
  `?view=asks`.

**To finish PR 2:** run its specs locally (m1-13, u74-setup-content, u24, u13, u94-curriculum-workspace, s5, u94-question-bank-workspace,
u42, u33, u87-assessments-board, u75-assessments-list, u75-timetable-b, m1-09-calendar, u81, u74-timetable, u70-inventory). Known: u70
inventory needs the Curriculum tabs (and anything else new) added to `docs/frontend/screens.json` + the wireframes, then
`node docs/frontend/build-spec.mjs`, `node apps/web/scripts/tokens.mjs`, `node docs/frontend/wireframes/check.mjs`. Then screenshots at
1440 and 390 to Nimish, then mark ready, full CI, merge on green. Expect u71 FilterBar/blocks baselines to need redrawing from the CI
artifact (`gh api .../actions/artifacts/<id>/zip`, copy `*-actual.png`).

Still on the design list after PR 2 (Nimish's 13 Nov screenshots): the question's own page has empty space; the left menu could carry
counts (rule 5 says only Today has one — that rule is Nimish's to change); merge `/setup/curriculum/skills` into Curriculum and delete it
(its features: "Say it is taught", the bank's counts behind details); the page eyebrows ("GRADES 1 TO 4 · …") are banned by impeccable
but approved in DESIGN.md — Nimish's call.

## Decisions waiting on Nimish

1. A class-level voice note with no lesson is gone (default stays) — confirm.
2. Parent reports "Save words" shows to coordinators but the engine refuses (403): hide it or let coordinators save?
3. The page eyebrows (above).
4. Voice notes that speak levels (CP-49) — paused by Nimish on 13 Nov.

## Backend (not blocking the site)

- **Marking safety rule**: activities the machine matched must not feed rubric evidence. Until it exists, educators should not start rubric
  marking.
- Approving a fortnight with an unsettled class returns 500 (engine).
- Today's coordinator "in session now" count needs an engine read.
- Data gaps (need Nimish's word before any live write): 250 objectives with no skill, 371 lessons with no activity, 5 children missing from
  attendance.

## Access

Akanksha and Nimish are both active coordinators with reach "everything" (Nimish also holds Head, same reach). Each has their own email and
password; neither has changed the first password. Logins are never shared: every approval carries the name of who made it.

## Lessons from this session

- Run the affected browser specs locally before the first push; CI found 21 issues on #757 that a local pass on the touched specs would
  have caught (focus ring, tap size, contrast, tests pinned to the old home address).
- The local test database collects rows across runs: a count off by a little locally (m1-09, u74 approve, u12 worksheets) is checked on
  CI's fresh database before it is called a bug.
- Only one Playwright run at a time per machine: the test ports (3100, 8932–8934) are shared.

## Addendum, 14 Nov 04:40 UTC — main is red; fixing it comes first

#759 (Design PR 2) was merged by Nimish before its local tests or screenshots. Before that, main's first run with four browser shards
(on #758, 4b2a3834) was red: the shard that kept timing out had never reported, and once it did, 15 specs failed, all from #757/#759's
design changes, none from data. So nothing after #757 has deployed by itself (#757 is live by hand). Fix these in one PR, test them
locally first, then let main deploy:

- u66-levels-to-review :112, u68-who-sees-answers :185
- u78-timetable-fit :43, u79-timetable-wireframes :26, u80-timetable-all-fortnights :136, u81-full-width :50 and :35, u74-timetable :47,
  u75-timetable-b :33 (the timetable band and filter row)
- u70-inventory today-coordinator 1440; u71-blocks 2. (four screenshot baselines: redraw from the CI artifact), 9., 12.

Then main's run on #759 (18dfa707) adds PR 2's own failures (expected: u70 inventory for the Curriculum tabs; see above).
