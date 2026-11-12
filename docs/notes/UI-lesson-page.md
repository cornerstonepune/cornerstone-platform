# The lesson page, /period/<lesson> (PR 3 after #712, on CP-35, CP-39, CP-40)

Nimish (12 Nov 2026, via the backend): the lesson page shows the activity in full, lets the coordinator choose one where there is none, and carries a form that logs what each child showed.

What it does now:
- The activity in full, from the engine's own call (`POST /timetable/activity`): what it is for, the steps, what to lay out, watch for, objectives, skills and the four level words, in the school's own words. A part the school has not written says so ("None written for this activity."); nothing is made up.
- A lesson with no activity says "This lesson has no activity yet." and, naming what kind of lesson it is, that nothing can be marked against it. The coordinator gets "Choose an activity" there (and "Choose another activity" once it has one): the engine's offers for the lesson's head (`/timetable/lesson/offers`), then `/timetable/lesson/edit` with `activity_code`, with a reason past planning (the engine asks, in its words). An educator sees "The coordinator chooses a lesson's activity."
- The form: the class as squares by Sr. No., a tap picks what a child showed (above, below, not willing, absent), "the rest did as expected", the expected level 0 to 3 with the activity's own level words beside each, Save: `POST /voice/form` with the lesson (its activity and day are the lesson's). A refusal comes back in words; a lesson that holds no activity says "Choose an activity first." Marks are kept against this lesson (`activity_observation.session_id`).
- The voice note is the page's main action, carrying the lesson (`/record?session=`).
- `lib/period.ts` now finds a lesson's activity as the engine does: its own chosen one first, its plan line's second (so a lesson the coordinator just chose for shows it).

Choices worth knowing:
- Per child "As expected" is the "rest" switch, as on the confirm board: the engine records an as-expected child only through `rest`, so the form offers above, below, not willing, absent and Clear, and the rest switch says the others.
- The form shows only to a person who holds the class and with the voice screens on (as "Record a note" always did); otherwise the page is read-only.

Remaining differences from `docs/frontend/wireframes/period.html` (images in `docs/screens/ui-lesson-page/`, wireframe left, built right):
- The wireframe has no form; this is added, between "Last time this ran" and the folds.
- Record a note is the page's main button, not a card; the cards row has Type the marks and The activity.
- No "class on this activity's skills" bar and no child peek in the rail (the rail is Connected to only).
- Steps, lay out and watch for are folds; the steps read as the engine's text (one line per step), not always a numbered list.
- The eyebrow shows the time as a range only when the period has an end time.
