**In plain words (for Nimish):** today a lesson on the timetable has a "head" (story, maths, clay…) and an activity has its own "group" (Story Telling, Maths, Clay…), and nothing says which is which. A lesson reaches an activity only through a line of planner text matched by name, so 89% of lessons reach no activity, and so no objective, materials or rubric. This fixes the cause: one list of heads that both the timetable and the activities use, and a lesson that holds its activity directly (the coordinator picks it on the lesson block; it moves with the block). From the activity come its objectives, skills, materials and four rubric levels, and the observation you log on it feeds the child graph. Approve with a comment "approved".

Nimish, 12 Nov 2026: "Every activity is essentially at least mapped to a certain topic type, which is a part of the timetable... The coordinator can essentially map the activity to a certain day of the week in the timetable, and then the teacher goes and opens that. The whole system should flow... modifiable... movable." And: "Learning objective maps to an activity... every part of the timetable needs to be mapped to a learning objective." He chose the proper fix over a side mapping ("yes").

## What
1. **One list of heads**, held as the setting `timetable.heads` (a word list a school may change lives in `config`, `docs/data-model.md`). Each head: its code, its words, its look, and the activity groups it takes. It names every head the timetable uses (21 codes today) and every K2 activity group (18 today).
2. **`activity.head`** (a column): each activity's head, set from its group through the list.
3. **`session.activity_code`** (a column, linked to `activity`): the activity a lesson holds. The coordinator sets or clears it through the lesson-edit route of CP-35 and is offered only activities of the lesson's head.
4. **The teacher's lesson view** returns that activity first, else the plan line's activity: its steps, objectives, skills, materials and the four rubric levels.
5. **Observations** logged from a lesson carry the lesson and its activity, so the child graph is fed from the activity's skills.

## Why not a new table
None is added. The list is a setting (the data model's home for a word list a school may change); the two links are one column each. The table budget stays 81. The list cannot be a database foreign key (settings are not tables), so the engine's write paths check it and a test holds every lesson head and every activity head to it.

## Done when
1. `timetable.heads` names every head code any lesson uses and every activity group K2 has; a test fails when a lesson's head or an activity's head is not in it.
2. Every K2 activity has a head: 871 of 871 on live (the one with a blank group is placed by a person's decision recorded in this issue, never guessed); derived from its group through the list.
3. A coordinator in the go-live group sets or clears a lesson's activity through `POST /timetable/lesson/edit` (`activity_code`), with CP-35's rules (not a past day, not a holiday, not a fixed or marked lesson, a reason past planning) and one `change_log` row with the old and new activity; an activity of another head is refused.
4. `POST /timetable/lesson/offers {session_id}` lists the activities of the lesson's head with, for each, its objectives and skills counts, so the coordinator can choose; nothing is offered that is not of the head.
5. The educator's lesson view (day, week, period) returns the lesson's own activity, else the plan line's, with name, steps, objective titles, skill names, materials (text, and the structured list when one exists) and rubric levels 0 to 3; a lesson with a head and no activity returns `activity: null` and its head, so the screen can say what is missing.
6. A lesson moved or swapped keeps its activity (CP-12's tests pass and one new test proves it).
7. An observation logged on a lesson records the lesson and its activity; one test runs the whole flow in a rolled-back transaction: a voice note naming a child, confirmed on the lesson's activity, becomes evidence on the activity's skills and shows in the child's history (this flow has no row on live today: 0 observations).
8. The 6 lessons of fortnight 10 whose plan line already has an activity get it on the lesson (a guarded, one-time data step on live; Nimish's own word when it runs).
9. No new table; functions do not rise above 121; one migration (the two columns), no data written by it.

## Out of scope
- Objectives and skills for the activities that have none (Story Telling: 4 of 164 mapped; Rhymes & Songs: 19 of 128): a separate spec (CP-40, a model proposes through `curriculum_proposal`, a person approves).
- Structuring the 646 activities' free-text materials; linking more plan lines by looser name matching; grades other than K2.
- Drawing the grid, the click-through and the Edit/Choose buttons (the frontend's, against these routes).
- Deciding whether circle time, routines and fixed lessons carry default objectives by head: Nimish's call, asked in this issue.

## Open questions for Nimish
1. A lesson with a head but no single objective (circle time, routines, fixed lessons): should the head carry default objectives, or may such a lesson have none?
2. The one K2 activity with a blank group: which head?


---
_Generated by [Claude Code](https://claude.ai/code)_
