UI-3c: The teaching pages: activity, objective, skill

Part of #518 (UI-3, the K2 walk, split in three on 10 Nov 2026: UI-3a the notes loop, UI-3b children, UI-3c teaching pages).
Tier 2. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json (`activity`, `objective`, `skill`); wireframes: docs/frontend/wireframes/activity.html, objective.html, skill.html.

### In plain English

Three pages an educator opens from a period or from a child: the activity (what to do, the four levels, what you need, how the class did last time), the learning objective it builds toward, and the skill the objective builds. Each links to its neighbours; the trail brings you back. A coordinator also keeps, edits or sends back a part the system drafted. A child is never given a number on these pages, only where they stand on a skill.

### What

The three screens on the blocks of UI-2, in the frame of UI-13, at `/setup/activities/[code]`, `/setup/objectives/[code]`, `/setup/skills/[code]`. The old single-activity addresses answer 308 to the new one. No table, no migration, no config row.

### Done when

Each line is proved by a test in `apps/web/tests/u73-teaching-pages.spec.ts` (and the inventory run `SCREEN=activity,objective,skill`).

Activity
1. A drafted part carries the "drafted" badge until Keep, Edit or Send back; an educator sees the badge and none of the three buttons; a coordinator sees all three.
2. Every Keep, Edit and Send back writes a `change_log` row naming who.
3. The steps fold is open on load and the others are closed; the four levels are drawn in the school's words, Level 0 to Level 3.
4. A part with no text is shown empty and marked, never invented.
5. "Where the class sat last time" counts the children by level, and the bars' counts sum to the children given a level in that session's observations.
6. The objective the activity builds toward links to the objective screen (each material links to the materials list once that screen is built; until then it is plain text).

Objective
7. No number, percentage or state is shown for the objective itself (DOM scan of the headings, the purpose line and the cards).
8. Each skill it builds is a card with its name, a prerequisite chip drawn only for a confirmed link, and an "Open the skill" link; the activities that build toward it are table rows, each opening the activity.
9. An objective with no skill linked says so and invents nothing.

Skill
10. A prerequisite or next skill is shown only when its link is confirmed (a proposed link in the fixture does not appear).
11. The class grid's squares equal the class's enrolment in Sr. No. order, each with the Sr. No. and the name; the stack bar's counts equal the squares by state.
12. Grouping by state puts a heading and a count over each group and the counts sum to the squares.
13. Tapping a square opens UI-3b's ChildPeek with that child's recent history newest first, each entry with who and when; Escape closes it and focus returns; "Open the child" lands on the child page.
14. The spark draws only fortnights that were recorded; the nightly run records no class counts yet, so it shows its empty words and never a made-up line.
15. An educator is shown only the classes they hold; a coordinator picks a class with the class filter.
19. Clusters: a cluster's count equals the chips in it; clusters are computed by code from the same rows as the grid, never by a model; the not-seen cluster equals the grid's not-seen group.
20. Activity: no photo upload (the photo of a set-up is not stored); the capture bar links to Record.
21. A coordinator may change a level's sentence on the skill screen (the engine's CP-31 route) and reads each earlier sentence with who and when; an educator sees the sentences and no way to change them.
22. A change is logged with the staff id and the reason, and takes only that level out of approved.
23. An empty sentence is refused and nothing is written.
24. Skill set (`/setup/skill-sets/[code]`, keyed by the skill set's code): each registry skill it covers is a card that opens the skill screen; a set with none says so and invents nothing.
25. The six functions of the old skill-set page (a real question and its approval per level, a grade per level, approving a way of asking, editing English samples, more like this, stopping a kind) work at the new address as their own specs prove.
26. `/skill-sets/<code>` answers 308 to the new address with the query kept; `/skill-sets/approve`, `/skill-sets/levels` and `/skill-sets/<code>/edit` stay.

All three
16. While the educator screens are switched off an educator is shown "not found" on all three (a coordinator who reviews is not); the switch is the school's, the pages do not decide it.
17. The two old single-activity addresses (`/educator/activity/[code]`, `/curriculum/fill/[code]`) answer 308 to the new one, with the code kept.
18. (Pending, not in this PR: needs the checker's drivers from UI-4b and the backend rows named under Out of scope.) Every control listed for these screens in docs/frontend/screens.json behaves as its kind says, proved by the inventory run `SCREEN=activity,objective,skill`.

### Out of scope

Anything in supabase/, packages/engine, config rows. Storing a photo of an activity's set-up (no store on main: asked of the orchestrator). The cluster computation on the skill page (code does not exist yet: asked). Saving a changed level sentence (`skill_level_version` is not on main). `/curriculum/fill/walk` (the queue of drafted parts: the curriculum screen's) and `/skill-sets/[code]` (grades 1 to 4's worksheets, question bank, approval and editing, which the new skill screen does not carry) stay as they are and are not redirected: folding them now would delete features. Both are listed under `folds` in screens.json and are left for the slice that builds what they hold. The period, children and notes screens (UI-3a, UI-3b).
