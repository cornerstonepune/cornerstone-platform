# Curriculum detail pages redesigned (branch wt/ux, 19 Nov 2026)

What Nimish agreed after the usability review (`scratchpad/ux/analysis.md`, 18/40): one layout for an activity, a real path above every
detail page, plain words, nothing said twice. Built to be looked at, so tests were kept to a minimum.

## Done

- **Activity page** (`app/(app)/setup/activities/[code]`, `components/activity-page.tsx`, `components/activity/`): full path (Curriculum, grade,
  subject, unit, objective, activity; every part a link), title, one-line purpose, grade and subject chips, one status bar ("Drafted by the
  machine: 6 parts, 2 links", Approve, Approve & next (n) to the next activity of the grade that waits), "Activity 1 of 2 for this objective" with
  Previous and Next. Sections that read clean, each with one Edit that opens only that section as a form (`?edit=run|lay|watch|mark|connects`):
  Run it | Lay out, Watch for | How to mark (levels once, coloured), Connects to (links to the objective and skill pages, Remove link, a
  searchable Link box narrowed to the activity's grade and subject), Taught (one fold line), Details fold (code, What it is for, name, Also use in
  grade, change history with Undo). The machine is named once (the bar) and by a dot on a drafted section. Origin filter, "Source:" and "Made by:"
  lines gone. Plain words: Link / Remove link, Subject, Also use in grade, What it is for, Watch for, How to mark.
- **Objective page**: path, title, chips, bar (Approve, Edit for a reviewer; Edit opens the objective's form in place), two lists side by side
  (Skills it builds, Activities that build toward it with status and last taught, first 5 and Show all), "Where it sits" folded. The title
  panel, the duplicated chain and the Origin filter are gone.
- **Skill page**: What it is first (levels, editable as before, comes before / ready next), Used in this grade (a grade picker, objectives and
  activities de-duplicated by name, first 5 and Show all), How classes are doing last and folded (grid, peek, clusters in a second fold). The
  45-link side rail and the empty "fortnight" spark are gone.
- **Skill group page** (`setup/skill-sets/[code]`): it holds a grade's levels with sample questions, the kinds of question, the mistakes it
  watches for and worksheets, and covers one or more registry skills, so the UI now says "Skill group" (a single registry skill stays "Skill").
  Path and a short purpose added; the cover list is plain links, kinds and worksheets show the first 3 and 5 with Show all, "Stop using a kind"
  is folded; the right rail is gone.
- **Panels**: Curriculum's activity panel, the timetable lesson panel and the lesson page use the same headings and order (What it is for, Run
  it, Lay out, Watch for, How to mark, Connects to). Curriculum's panel draws the shared read-only blocks (`components/activity/blocks.tsx`).

## Not done

- The lesson panel and the lesson page still have their own components (they read `LessonView`, not the activity page), so they share headings
  and order but not the block code. The lesson page keeps its tabs (Activity, Rubric, Materials, History); the rubric tab has no heading of its
  own and Materials still repeats Lay out. The panel in Curriculum is read only: editing is on the full page.
- No Approve & next in Curriculum's panel; the full page's one is the only place.
- The skill page has no grade of its own (a registry skill spans grades); "this grade" is the picker's choice, first grade with an activity.
- The one meaning of "skill" on screen (problem 10 of the analysis) is only half done: the skill group is renamed; the Curriculum tree and
  the skills list still say "skill set" in places.
- The Approve button inside Curriculum's panel still carries its old sentence ("Until then its marks reach no skill the machine linked").

## Tests

Deleted (they froze the old layout): `u100` tests 1 and 7, `m1-13c` two structure tests, `u73-teaching-pages` 3 and 14. Rewritten to the
new page: `u100`, `u109`, `m1-09` (2), `u73-teaching-pages` (1, 2, 4, 5, 7, 8, 9, 12, 13, 19), `u73-skill-set`, `u103` (heading name). New:
`u129-detail-pages.spec.ts` (four pages open, path links work, one section edits and saves, 400 px no sideways scroll).
