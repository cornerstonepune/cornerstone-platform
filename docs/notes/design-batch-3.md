# Design batch 3 (14 Nov 2026): main green again, Nimish's timetable / tables / curriculum / rubric list

Branch `claude/jolly-meitner-ca3grl`. One PR, one full CI.

## What changed

- **Main's red timetable specs** (u78, u79, u80, u81, u74, u75): on a Saturday the page chose a day no week holds and crashed
  (`weeks.find(...)!.days`). The chosen day is now always a school day of the fortnight.
- **Timetable**: day heads centred; break rows a visible grey band with their start in the time ruler; ruler one font, tabular, start
  in ink and "–end" muted; compact lesson cards (3 px subject rule, small subject tag, name medium weight, two lines).
  "Lessons by subject" names a head by `timetable.heads` when the subject table has no label (no more `general_awareness`).
- **Materials 404**: the page read today's lessons with a 404-throwing read; on a holiday the menu door led to "not found". Now a
  null-returning read (`dayOrNull`), the page says why and still shows the class's list (issue #691's rule).
- **Detail panel**: with a panel open, the title row spans both columns, so the panel starts level with the page's content.
- **Tables**: the shared DataTable has a card edge, tinted small-caps head, banding, hover, emphasised first column.
- **Curriculum**: subject chips → topic list → skill table; a skill opens on the right with its tags and its four levels read-only
  (`components/curriculum/`). URL keeps every state (`?subject=&topic=&open=`).
- **Rubric default (Nimish's rule, with a guardrail)**: on a lesson the educator has touched, every present unmarked child is taken at
  config `lesson.rest_default_level` (2). An untouched lesson writes nothing. Lesson page: the rule in words, tick several children
  and give them one level in one save. Engine: `tests/test_lesson_level.py` (23 passed).

## Not done (named, not deferred silently)

- Physical education draws as Arts: `timetable.subject_looks` has three looks (numeracy, language, arts); a fourth look needs tokens
  and a config migration — Nimish to approve the colour.
- Staff page avatars and role pills (the shared table style applies).
- Voice-note confirm path does not yet apply the default to unnamed children: its "as expected" is the note's expected level, not 2.
- Curriculum: no signal tag or activities per skill (no read carries them); subject chips all amber (looks are keyed by timetable codes).
- u66:112 and u68:185 failed on CI by time (1136 ms vs 1000 ms; a page load timeout): CI's full run decides.

## Fix after #761 (main red, 14 Nov)

main's run on #761 failed four specs, none of them the engine:
- u87-assessments-board:97 and u38:120 still read the class in the card title; Design PR 2 put it on the muted line. The tests now
  read the muted line.
- u70 inventory, Curriculum, hung for five minutes: its question fixtures opened `/setup/curriculum`, but the questions have been the
  `?view=asks` tab since Design PR 2, so the fold's driver waited for a summary that was on another tab. The fixture opens the tab.
- u70 inventory, Curriculum: the list now matches the page. #763's Approval filter, Approve button and Lessons to confirm tab are
  added, along with Design PR 2's draft fold. The offers and questions tables page with the one "Later" of their view. The topic step is
  checked on English. The view tabs come before the panel's tabs, because the panel's "Skills" claimed "Activities and skills" by name.
- u70 inventory, Today (coordinator): the panel's "Later" is checked on the topics-to-mark row, which has more than ten tasks. The
  answers row has five.
Local: u70 (curriculum, today-coordinator) 8 passed; u95, u94-curriculum, u87-timetable 15 passed; u87-board and u38 2 passed; bin/check 67 passed.
