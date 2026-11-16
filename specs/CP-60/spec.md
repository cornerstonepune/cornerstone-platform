# CP-60: Voice note from the lesson (Record on the rubric)

Issue: https://github.com/cornerstonepune/cornerstone-platform/issues/793

## What
Nimish, 16 Nov: "I'm on the rubric but there is no way to put a voice note directly." Record (the site's existing recorder) on the lesson's rubric: in the timetable's lesson panel and in the lesson page's Rubric tab, for the lesson's own educator while recording is on. The note carries the lesson and is named by it in the notes queue. Marks and note are saved separately.

## Done when
1. The lesson panel on the timetable has Record on its rubric; Record, Stop, Send makes one note carrying that lesson and marks no child.
2. The lesson page's Rubric tab has Record too, with the same result.
3. The note appears in the notes queue naming the lesson's activity.
4. A coordinator who does not hold the class sees no Record.

## Out of scope
A new recorder or voice routes; switching recording on for everyone; any migration.

## Proofs
`apps/web/tests/u103-voice-note-from-the-lesson.spec.ts`, one test per line.
