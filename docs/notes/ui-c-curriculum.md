# ui-c-curriculum — the page charter's Part C line for Curriculum, and CP-48 Done when 10 (frontend)

Spec: `docs/frontend/page-charter.md` Part C, "Curriculum · Activity (editing) · Objective · Skill — keep for the coordinator under School,
Workspace: list left, detail right", with Part A (the shared frame, the detail panel, the colour scale) and §B4 (a teacher never lands on the
curriculum editor from a lesson); CP-48 (issue #736) Done when 10.

## Verified

- `/setup/curriculum` is a Workspace under School: the filter row is the one primary action (grade · subject · origin, topic and status
  behind More filters, search); on the left the list of activities and skills; on the right the DetailPanel: with nothing chosen four
  tiles counting every part by where its words came from (sheet · machine · person · not written), with a row chosen its item in tabs
  (`?open=activity:<code>`: Parts · Objectives · Skills · Taught; `objective:<code>`: Skills · Activities; `skillset:<code>`: Levels).
  The panels are `components/curriculum-panel.tsx`; `/setup/activities/[code]` and `/setup/objectives/[code]` are those panels opened
  full page. The offers (Yes / No a row) and the engine's questions stay below the list (`offers-asks.tsx`).
- CP-48 Done when 10: one machine symbol (`components/origin.tsx` `MachineMark`, the Lucide `from-draft` icon) on Curriculum's rows and
  panels, an activity's page, the lesson panel (beside its title when the lesson's activity link is the machine's, on each part the machine
  made) and the timetable's blocks; one origin filter (`originFilter`, a dropdown of the shared FilterBar) on Curriculum and on an
  activity's and an objective's page, every list there following it. Origins are read with SQL as stored and named in `lib/origin.ts`
  (school | exact_name → sheet, machine | drafted | model → machine, person → person); a lesson's link is a person's when
  `session.activity_code` is set, else its plan line's `link_rule`.
- No queue: the "Drafted, to check" board, the "Check the drafted parts" action, the "n drafted to check" chip, the "Drafts to check"
  card and the Setup page's "drafted parts to check" are gone, with Keep and Send back; a part the machine made has Edit in place for
  whoever the curriculum's gate lets in, and becomes a person's (`lib/curriculum-board.ts` and `waiting()` deleted).
- §B4: the lesson page's "Open the activity" link is the coordinator's only.
- Proofs: `apps/web/tests/u94-curriculum-workspace.spec.ts` (the charter line, one test each part, B4 included) and
  `apps/web/tests/u94-machine-origin.spec.ts` (one test per clause of Done when 10). Moved, not deleted: `m1-13-curriculum-fill`,
  `m1-13c-page-part`, `m1-09-activity`, `u73-teaching-pages` (tests 1–6, 20) and `u74-setup-content` (find an activity).
- `docs/frontend/screens.json` (curriculum, activity, objective, period's Open the activity) and the wireframes `curriculum.html`,
  `activity.html`, `objective.html`, `setup.html` redrawn together; `node docs/frontend/wireframes/check.mjs`: all clear.
- `bin/check`: 60 passed, 4 skipped. `npx tsc --noEmit -p .`, `npx eslint --max-warnings 0 .`: clean.

## Handoff

- The engine edits only a part the machine made (`k2_review.change` refuses the school's words): so Edit is offered on machine parts only.
  Editing the school's own words, and editing a link (an objective or skill of an activity) by hand, need an engine route first.
- Access is unchanged: the curriculum's gate (`/curriculum/page/gate`) still decides who reads the K2 activities and who edits; the menu
  shows School to everyone, read-only, as lib/menu.ts says.
