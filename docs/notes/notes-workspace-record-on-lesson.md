# Notes as a Workspace, Record merged into the lesson (page charter Part C)

## Verified

- "Notes / A note — keep, reshape to Workspace": `apps/web/tests/u95-notes-workspace.spec.ts`. The list (table or board) on the left;
  a row or card opens the note on the right in the DetailPanel (`/notes?open=note:<id>&tab=marks|children`), with the confirm screen's
  Marks (flagged problems, her words, the class grid, Confirm; Correct on a confirmed note) and the Children it names. Confirm in the
  panel opens the next waiting note there; a correction returns there. `/notes/<id>` is the same panel opened full page (inline).
  With nothing chosen, stat tiles: to confirm · left unconfirmed · confirmed · typed by form (and notes by class).
- "Record — merge into B4": `apps/web/tests/u95-record-on-the-lesson.spec.ts`. On `/period/<id>`, for the class's own educator:
  Record (Stop, Send) is the page's action, Type the marks and Add a photo beside the lesson's links, the 48-hour line, and in the
  History tab who is not yet seen on the activity and the class's latest notes. `/record?session=<id>` answers 308 to `/period/<id>`,
  any other `/record` 308 to `/today` (`next.config.ts`). The menu's Today line no longer matches `/record`.
- Moved, not lost: the Record tests of `u76-notes-loop` (typed note with the session's id, 400 px button, denied microphone, Add a
  photo) are in `u95-record-on-the-lesson`; `m1-04-k2-voice-notes` records and types on a lesson of the class (`k2Lesson` in
  `tests/k2-rows.ts`); `u76-period`, `u85-lesson-page`, `u51-ux-rules`, `u64`, `u73` follow the new place.

## Handoff

- Data used is only what the lib already read (`myVoice`, `draftOf`, `classNotes`, `seenOn`, `rosterOf`, `childrenByIds`); no
  engine or schema change.
- Dropped with the Record page: a voice note "not about one period" (the charter puts every note on a lesson). Class-level entry
  points (What needs doing's Record row, a child's "Add a note about this child", the activity page's Voice note, a could-not-read
  note's "Type the marks" when it names no lesson) now open Today, whose lessons carry Record; a note that names its lesson opens it.
- A coordinator still reads every class's notes and opens none (the engine reads a draft for its author only).
- The "Last time this ran" card of Record was already the lesson's History tab (`lastTime`), so it is not drawn twice.
