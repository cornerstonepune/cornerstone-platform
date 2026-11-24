# 0107 — K1 pilot: what the planning sheet holds, and what is still open

Date: 2026-11-24. Status: proposed (Plan). Nothing built yet.
Goal: none — this records what the sheet holds and what is open; the K1 pilot has no goal in PROJECT.md until Nimish answers.

## Context
Nimish asked for a K1 (Neev, Jr KG) pilot for "fortnight 10 and 11": Radhika ma'am opens the timetable, clicks a period, fills the
rubrics straight away, uploads a voice note, and the system parses it into the child knowledge graph. Source sheet:
Google Sheet `1O2qf5l7dRdVZMGfiaUWhw4KcTe8GpRErmnOrFF0uS2Q` ("K1 (Jr KG) Planning Sheet 26-27"), tab gid 1395547310.

## What the sheet actually holds (read 24 Nov, read-only)
- Tab `Sample_Time Table - 26-27` (gid 1395547310) has K1 **F.N 4 W1 (3–7 Aug 26), F.N 4 W2, F.N 5 W1, F.N 5 W2, F.N 6 W1, F.N 6 W2,
  F.N 7 W1 (21–25 Sep 26)**, plus a blank frame and a Neev/Gurukul class-activity grid at the top. It has **no** fortnight 10 or 11.
- Tab `Fortnight - Time Table - 2026 -27` has K1 F1 W1, F1 W2, F2 W1 filled (22 Jun – 10 Jul 26) and F2 W2, F3 W1/W2 as empty frames. No F10/F11.
- Other tabs exist (`Monthly planners - 2026-27`, `Activity List - Lesson Plans`, ` Graph 2026-27`, `Observations`); not read. F10/F11 may
  sit in one of them, or the sheet is behind Nimish's list. Today is 24 Nov, so F10/F11 would be roughly Nov–Dec 2026.
- Each week block is: Word of the week, Good deed, Prayer, Theme, Routines, Date, Day, Events/holidays, then 11 period rows
  (09:30 settling, 09:50 circle, 10:15 Academic 1, 10:40 Academic 2, 11:00 meal, 11:50 rhymes/story/Hindi, 12:15 extracurricular,
  12:40 extracurricular, 1:10 reflection, 1:20 dispersal ritual, 1:25 bus), then Note to parents and Note to educators (home engagement).
  A cell is the period name plus free text: what to do, workbook page numbers, YouTube links, "SHOW AND TELL", holiday and swap notes.
- Cells are free text; a slot can hold two things (e.g. "Music \n\nAcademic 1 General Awareness ..."), and some cells are blank on holidays.

## Correction (24 Nov, Nimish pointed to row 349 onwards)
Fortnights 10 and 11 ARE in tab gid 1395547310, below the F.N 7 block: F.N 10 W1 at row 349 (23–27 Nov 2026, filled: word "Honest",
theme "Plants (Germination - Seed to plant)", prayer Ek Onkar Gurbani; Tue 24 Nov is Guru Nanak Jayanti, a holiday; Sports Day practice
runs through most Academic periods), F.N 10 W2 at row ~373, F.N 11 W1 at ~397, F.N 11 W2 at ~421. All four weeks have now been read.
F.N 10 W1 and W2 are fully planned. F.N 11 W1 (7-11 Dec) and W2 (14-18 Dec, Evaluation Week + Sports Day rehearsal) have dates, word, good deed,
prayer, events and rhyme names but most Academic cells are only the period name: the educator must fill them before 7 Dec, and the importer
must keep an empty cell as 'not planned yet', never invent text. Some cells hold two periods (e.g. 'Clay ... Academic 2 English ...'); the importer
must split them by the period names inside the cell. Nimish confirmed K1 is a section (Neev) and Radhika is its educator. The pilot starts this week, so F.N 10 W1 is live now. Questions 1 and 2 below are answered.

## What our system already has
Migration `20261231090000_k2_plan_and_timetable.sql`: `fortnight`, `school_day`, `period` (per grade), `timetable_slot` (class x period x
week A/B x weekday), `plan_entry` (a class's fortnight plan lines, `activity_id` when mapped), `session` (class, day, period, delivery
state). Screens: `apps/web/app/(app)/period/[id]/page.tsx`, `notes/`, `timetable/` (S3, S4, S5, S6-S9 approved). Its header comment already
notes "the sheet's Fortnight 10 and 11 disagree" on length (that is the K2 Graph tab, not this one).

## Open questions for Nimish (block the milestone)
1. Which fortnights, exactly? The K1 sheet tabs hold F1-F2 and F4-F7, not 10/11. Does he mean the K1 fortnights running now (Nov-Dec), and where is that tab?
2. His first words said "K2", then he corrected to K1 (Neev, Radhika ma'am). Assume K1.
3. Does K1 get its own `period` rows (grade_code K1), or reuse K2's? The sheet's K1 day has 11 rows of its own times.

## Plan once answered (not decided)
M-K1: (a) importer for the K1 sheet into `fortnight`/`period`/`timetable_slot`/`plan_entry`/`session` (copy text, never write it); (b) map each cell to
an Activity-list row where one exists, leave the rest as `plan_entry` text; (c) period page: educator clicks the session, fills rubrics in the agreed
experience, uploads a voice note; (d) voice note -> engine -> evidence_event -> child graph (W3 path already exists). Each step a ticket; (c) needs
S3/S4/S5 wireframes to cover K1 periods (check `design/wireframes/`), else new wireframes need Nimish's approval first.
