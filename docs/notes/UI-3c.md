# UI-3c: the teaching pages (activity, objective, skill)

Branch `ui-3c-teaching-pages`, part of #518 (UI-3a #571 and UI-3b #570 were not merged when this was written). Scope: `specs/UI-3c/spec.md`.
Tests: `apps/web/tests/u73-teaching-pages.spec.ts` (one per Done-when line that a browser can check now).

## State (10 Nov 2026)

Three screens at `/setup/activities/[code]`, `/setup/objectives/[code]`, `/setup/skills/[code]`, reading rows directly (`lib/teaching.ts`).
`/educator/activity/[code]` and `/curriculum/fill/[code]` answer 308 to the first. `/curriculum/fill/walk` (the drafts queue) and
`/skill-sets/[code]` (grades 1 to 4: worksheets, bank, approval, editing) are not moved: folding them would delete features.
17 of 17 U73 tests pass locally on a database built from the repository's migrations and seed (no question bank or library).

## Choices

| Choice | Reason |
|---|---|
| The educator switch (`educator.timetable_enabled`) is still asked (`openTo`) on all three pages. | The old activity page asked it and `m1-09-activity` locks it; UI-3b dropped it for its pages. Flagged to the orchestrator: one of the two is wrong. |
| An activity's parts are read from rows (`activityPage`), not the engine's `/curriculum/page/read`. Keep, Edit and Send back still go through the engine. | The engine read repeats the switch's gate and adds nothing. |
| `lib/built.ts` treats the screens named in `SCREEN=` as built. | A pull request's run covers screens that link to each other (activity, objective, skill) before their slice is in `merged_slices`; unset in production. |
| A skill's code is the `registry_skill` code. | `child_skill_state`, `learning_objective_skill`, `activity_skill` and `skill_link_confirmed` all use it. |
| The skill screen is built on UI-3b's `pictureOf`, `PictureGrid` and `PeekProvider`: squares, counts and the tap-to-open peek are theirs. | Reuse before write; one picture of a class. |
| The spark is always empty. | The nightly run records no class counts yet. |

## Not done, and why

Decision (orchestrator, 10 Nov): activity, objective and skill stay on the u70 pending list (their slice is not in `merged_slices`) with these reasons: *needs checker drivers* (added once, in UI-4b, not here), *needs backend* (photo store, `skill_level_version`, clusters). Nothing is loosened; the three controls are added when the routes land. The educator-switch gate stays.

- **Inventory run `SCREEN=activity,objective,skill` fails.** What is left: elements need `text`/`data` fields in screens.json so the
  checker matches "each objective", "each activity row", "rail: each skill"; titles need the `{…}` form; the checker has no driver for the
  effects of Keep, Edit, Send back and "Change a level's sentence"; the skill screen took 3 minutes to time out at 1440 (not yet found).
- **Missing on main (asked of the orchestrator):** a store for an activity's photo; `skill_level_version`; the cluster computation.
- **Group by class** on the skill screen is dropped: one class is on show at a time, so it would be a single group (the grouping by state stays, with counts).
- Kinds of question and mistakes folds on the skill screen (grades 1 to 4 data keyed by `skill.code`).

---

# Carry-across list for retiring `/skill-sets/[code]` and `/curriculum/fill/walk` (issue #599, step 2)

Docs only: nothing is retired or changed here. Written 11 Nov 2026 after #577 merged. "Home" is where the function would live on the new
screens (`docs/frontend/screens.json`); a function with no home is a function the school has today and would lose, so it is **raised, not
dropped** (#599 guard rail). Spec names below come from the file names and a count of their address mentions; each is to be read when it
is moved, and moved at equal assertions.

## Decisions (11 Nov 2026, relayed by the frontend orchestrator): no function is lost

1. **A skill set keeps its own screen** on the new frame, keyed by the skill-set code, linking to registry skills where one exists. It is added to
   `screens.json` and the wireframes as "Skill set". No alias route, no schema change.
2. **All six no-home functions are carried** onto the skill and skill-set screens (real-question example per level, grade per level, approve a way of
   asking, edit English samples, "more like this", stop a kind), each with a drive and its spec moved at equal assertions; coordinator-only where the
   old page was.
3. **The walk queue gets its own element** on the curriculum side. This is coordinated with UI-11 (#582) first; #582 merges before this work starts.
4. **Order:** separate draft PRs, one at a time, starting after #582 merges. This note is the plan; the first PR is the "Skill set" screen entry
   (inventory and wireframe), because every later PR hangs on its key.

## First: the two skill pages are not the same thing

The old page, `/skill-sets/[code]`, is keyed by `skill.code`: a grade 1 to 4 **skill set** (ADD.2D1D, ...). The new screen,
`/setup/skills/[code]`, is keyed by a **registry skill** (the K2 and school-wide list). The two lists meet only through
`skill.registry_codes`. In the repository's seed (live may differ):

| Skill sets (`skill`) | 155 |
|---|---|
| with no registry skill | 109 |
| with exactly one | 32 |
| with several (at most 3) | 14 |

So the new screen **cannot open most grade 1 to 4 skill sets at all**, and 14 would be ambiguous (which of up to three?). Nine links in eight files go to
the old page by skill-set code (worksheets library and sheets, the taxonomy page, a child's focus panel, the question-bank item page, the
assessment card, `lib/queries-curriculum.ts`, `lib/todo.ts`). **Decision needed (Nimish / orchestrator), before any retiring:** does the new
skill screen also stand for a grade 1 to 4 skill set (an alias route or a second key), or does a skill set keep its own screen? This note
assumes nothing; the table below says what each choice must carry.

## `/skill-sets/[code]` (and its `/edit`)

| Function today | Who | Home on the new screens | Status | Specs to move |
|---|---|---|---|---|
| Read what the skill is, and each level in a sentence | all | `skill`: "Each level in a sentence" fold | **Built** (only for a registry skill that has `skill_level` rows) | u53 |
| A real question from the bank as the example of each level | all | `skill`: not listed | **No home**: the new fold shows the sentence only | u53, u54 |
| Kinds of question a level asks, with what each kind looks like | all | `skill`: "Kinds of question" fold | **Not built** (data is keyed by `skill.code`, see above) | u53, u55 |
| Mistakes the skill watches for | all | `skill`: "Mistakes it watches for" fold | **Not built** (same key problem) | u53 |
| Worksheets of the skill, by level, each opening its worksheet | all | `bank` (UI-11), folds `/worksheets` | **Planned in UI-11** | s3, u53 |
| Approve the skill as read (named person, refuses if it changed since the page was drawn) | coordinator | `skills-approve` (UI-11): "Approve (a row)" | **Planned in UI-11** (the page-opened-at guard is not in its element list: confirm) | u23, u49, u27, u32, u68 |
| Approve one level's questions (`approveLevel`) | coordinator | `skills-approve`: "Skills / Levels to review" | **Planned in UI-11** | u28, u66 |
| Change the skill's name, description and each level's sentence (`saveWords`; the new words wait for approval) | whoever may change the skill | `skill`: "Change a level's sentence" | **Needs backend**: `skill_level_version` is not on main; today's save writes through the old flow | s2, u53, u54 |
| Say which grade teaches each level (`saveGrades`) | coordinator | none | **No home** | u34 |
| Approve one way of asking, once for every skill and level (`approveWay`) | coordinator | none named (`skills-approve` lists "What a wrong answer counts against", a different thing) | **No home**: confirm with UI-11 | u27, u49 |
| English skills: sample questions shown, a sample changed, added, removed; a kind added with its three samples (`saveSample`, `removeSample`, `addKind`) | whoever may change the skill | none | **No home**: the faults are checked by the engine and shown beside the fields | u54, u55, e0-english |
| "More questions like this sample" (English and Maths; the engine makes and checks them and says how many were made or thrown away) | whoever may change the skill | none | **No home** | u65 (more-like-this) |
| Stop a kind at a level or at every level, or use it again (the levels that wait for approval, the approved papers pulled back) | whoever may change the skill | none | **No home** | u64 |
| Levels page: "I've looked at this" (`lookedAt`, `/skill-sets/levels`) | coordinator | `skills-approve` | **Planned in UI-11** (a different route, listed only because specs mix them) | u66 |
| Notices: Saved / Nothing approved because it changed / Approved as written | all | none | Part of the above | u53, u23 |

Functions with **no home today** (the school has them now and would lose them): the real-question examples, the grade for each level,
approving a way of asking, English samples editing, "more like this", and stopping a kind. Each needs either a home on a new screen
(probably `skill` or `skills-approve`, which means a UI-11 or UI-3d element list) or an explicit decision to drop it. Per #599 these are raised
before anything is deleted.

## `/curriculum/fill/walk` (and the single-activity page it linked to)

| Function today | Home on the new screens | Status | Specs to move |
|---|---|---|---|
| The queue of drafted parts across every activity, the one a checker doubted first (`check_me`), then a share of the rest | `curriculum` (UI-11): "Drafts to check" is one link, rail "Drafts to check" | **Partly planned**: the queue itself, one draft at a time, has no element | m1-13-curriculum-fill |
| "N of M waiting for a check", filter to one part (`?part=`), "Skip for now" (wraps round) | none | **No home** | m1-13-curriculum-fill |
| Keep / Edit (in place) / Send back on the part shown, a coordinator only; the preview role only looks | `activity` (built, #577), per activity | **Built** for one activity; moving to the next draft is the missing step | m1-09-activity, m1-13c-page-part |
| Empty state "Nothing is waiting for a check" | none | **No home** | m1-13-curriculum-fill |
| The card style of a part (`PartCard`, `.pp-card`) | the `activity` page draws parts in folds, not cards | The style test `m1-13c-page-part` is on the walk page and moves with it | m1-13c-page-part |

The walk page, `/curriculum/fill`, `/curriculum/browse` and `/curriculum/offers` share `Chrome`, `PartCard` and `parts.tsx`: they retire together
with UI-11's `curriculum` screen, not before.

## What this means for the order

1. **Decide the key question above** (skill set vs registry skill). Everything under `/skill-sets/[code]` depends on it.
2. **Name homes** (or drops) for the six no-home functions; a builder cannot choose a drop.
3. **Then** build what has a home and is not yet built (kinds of question, mistakes, level examples, the queue's next-draft step), move the specs at equal
   assertions, repoint the nine inbound links, and only then redirect and delete.
4. Retire in two parts that do not need each other: the **single-activity** side is already done (308 since #577); the **walk** waits for UI-11.

Not checked here (read when moving, not assumed): the exact assertions of each spec; whether live data matches the seed counts above;
which of the nine inbound links carry a level (`?level=`) that a new route would also need.

## Skill set screen entry (ui-3c-skillset-entry)
Per #599: `/skill-sets/[code]` is a skill SET (keyed by `skill.code`), not a registry skill, so it gets its own screen
`skillset` at `/setup/skill-sets/[code]` (screens.json, UI-3, wireframes/skillset.html). It lists the registry skills the
set points at (cards to the skill screen) and the level sentences in a fold. No page yet; the six functions (#599) come as
later PRs and add their elements here.
