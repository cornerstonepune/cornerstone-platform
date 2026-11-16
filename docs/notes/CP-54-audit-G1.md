# CP-54 audit, Grade 1: Step 1 inventory (2026-11-16)

1. Drive holds ONE Grade 1 planning workbook: "Grade 1 Planning Sheet_2026" (id 1CEf1s2TCUcr4tZYWlFZXiNNOHdSa0yiLdPJ-bTHSNsQ, created June 2023). There is no separate 2024-25, 2025-26 or 2026-27 G1 file; each year is a tab inside it. I searched by title and listed the grade folder (a few subfolders such as Activity list, Mathematics, English, Science, Hindi, Value Education, Visual Arts and Thematic curriculum are not yet opened).
2. The workbook has 60 tabs (about 36 hidden). Only the grid size was measured; the used range was not.
3. The 2025-26 plan is the hidden tab "AY 2025 - 26 Parent planner" (Jul 2025 to Apr 2026). The 2026-27 plan is the visible tab "AY 2026-27 Parent planner" (Jun 2026 to Apr 2027). The data worker took 0 rows from either.
4. The worker's source, "Monthly Detailed Plan", is the 2023-24 plan (Jul 2023 to Mar 2024), not 2025-26. It supplies 181 of the 421 rows in data/g1; "Curriculum - G1" supplies 113; the rest come from Docs and PDFs.
5. Tabs that hold activities (14): the two Parent planners, Monthly Detailed Plan, Curriculum - G1 (6 maths + 6 science projects under Enrichment), Time Table - G1 - 2026 (dated lessons 10 Jun to 3 Jul 2026), Value Education (6 lessons with steps), Visual Arts (week-by-week), Routines (13), Question of the Week (30 prompts), Exposures/contest (19 contests, 3 visits), Assembly Quizzes, Next steps (soil lesson), Ideas to be implemented (7, links only), Overall Syllabus (fitness test).
6. Not G1 content, despite their names: "Fortnight time table_2025-26" is G2's timetable; the three Activity-list tabs and "Edited Curriculum Online Session" are the SR KG list copied forward; "List" and the F.N communication tab are K2.
7. Read in full or in a useful range: 22 tabs. Header-peeked only: 9. Not read, deliberately: 29, all child lists, observations, feedback, graphs, parent one-on-ones, forms and name registers, because they hold children's names and no activities. A few template and old timetable tabs were also skipped by title.
8. Likely gap in the file: most activities from the 2025-26 and 2026-27 planners, the dated June-July 2026 lessons, the Value Education lessons, the Visual Arts tab, routines and question-of-the-week prompts. Step 2 will check each against the file by name.
9. Counts in the JSON are my reading estimates, not exact. "already_in_file" is exact for the two tabs the worker cites (181 and 113); for the other tabs it is 0 (a name-by-name check comes in Step 2).
10. Tool budget used: about 40 of 60 Drive/Sheets calls. Step 2 will need roughly 5 more (page tail of the Monthly Detailed Plan, the folder "Activity list", and the Docs/PDF overlap check).

Inventory: `supabase/seed/curriculum/audit/G1_planning_tabs.json`.

## Step 2 result (2026-11-16)

- Added 104 rows (G1-422 to G1-525) to `supabase/seed/curriculum/activities/G1.json`; rows G1-001 to G1-421 are untouched. 34 new LOs (`new:AUD-…`) are listed in `new_los` because no G1 objective fits them (mostly PE, value education, Hindi, computing, routines).
- Sources of the added rows: 2025-26 planner 50, 2026-27 planner 29, Visual Arts 4, Value Education 4, Routines 4, Time Table G1 2026 4, Exposures/contest 3, Ideas 2, and one each from Overall Syllabus, Question of the Week, Assembly Quizzes and Next steps.
- Basis: 102 rows `educator_plan` (the cell names the activity) and 2 rows `inferred` (Ideas tab, name and link only). Only 7 rows have steps taken from real sheet text (4 Value Education lessons, assembly quiz rules, the soil lesson, the fitness test). The rest have steps built from the cell's words, so most are confidence low or medium.
- Upgrades: 26 existing `inferred` rows can be confirmed as `educator_plan` because a 2025-26 or 2026-27 cell names them. They are listed, not applied, in `audit/G1_upgrades_and_stale.json`. The same file lists 98 rows from the 2023-24 plan that I did not find named in either later planner by keyword; treat that as advisory, since it was a manual keyword comparison.
- Not read: the Docs and PDFs inside the G1 subfolders beyond file names (Activity list holds only the Maths plan doc, which is already in the file; Hindi has "Hindi research 2026" and a worksheets folder; Value Education has Responsibility, Honesty, Respect, Peace and Buddy or Bully folders; Computer Primary has Archives, Safer Internet Day and Worksheets). The Docs "Monthly Planner_Grade 1" and "Grade 1_August planner 2024.pdf" were also not re-read. The folder searches were cut off by paging in several cases. About 52 of 60 calls used.
- Not read by choice: all child-name tabs. No child names appear in anything written.

## Step 2b (after the orchestrator's rulings)

- Applied the 26 upgrade rulings in `activities/G1.json` (18 changed from `inferred`; 8 were already `educator_plan` and got the extra planner cell noted). Flagged 96 rows `plan_year_seen: "2023-24 only"`; nothing dropped.
- Checked the exact cells for the dated June 2026 lessons in Time Table G1 2026: E26, E27, F28 and N30 are correct. The two range refs stay as ranges.
- Read both planners below row 50 and the Monthly Detailed Plan below row 80: all empty, so nothing is missed there.
- Reused existing LOs for 5 of my 34 new LOs (G1-NEW-009, -027, -028, -045, -002). 29 stay, plus 3 added in this step.
- Added 14 rows from two Docs: 5 Computing sessions from "Monthly Planner_Grade 1" (real steps) and 9 Hindi activities from "Hindi research 2026" (real steps); upgraded the Spot the Bug row with Session 3's real steps. Total file: 539 rows.
- Still unread: the files inside the Value Education folders (Responsibility, Honesty, Respect, Peace, Buddy or Bully: Living Values PDFs and scenario images), Computer Primary (worksheets, Safer Internet Day, Climate Change, ICT PDFs), "Hindi worksheets" (empty listing), and "Grade 1_August planner 2024.pdf" (the earlier worker already took 9 rows from it).

## Step 2c: honest basis rule (reviewer round 3)

- Rule applied to the whole file: `educator_plan` only where the steps (and levels, if given) come from the text of the cell or document. Rows whose steps are built from a topic name are `inferred`, with `source.relation: "named in"` and the cell kept. False notes ("steps follow the cell", "extended from the educators' list" on one-line cells) were removed or corrected.
- Demoted: 89 of my added rows, 70 existing rows from the workbook tabs (Monthly Detailed Plan and Curriculum - G1) whose notes did not show a real list in the cell, and G1-099. G1-105's note now says the cell says "with carry".
- Kept `educator_plan`: rows from Docs and PDFs that hold lesson steps (Visual Arts, Cambridge maths plans, Geography, History, Handwork, Cooking and Stitching docs, the August planner, the Hindi curriculum doc, ICT PDF), 15 Monthly Detailed Plan rows with a real list, and my rows read from real text (4 Value Education lessons, quiz rules, soil lesson, fitness test, baking and steam, kindness, conflict resolution and self-regulation weeks, 5 computing sessions, 9 Hindi activities).
- G1-281 and G1-303 (syllabus topics, not activities) moved to `audit/G1_held_rows.json`. G1-314 and G1-318 have no LO links now.
- Not re-verified: the existing Docs/PDF rows labelled `educator_plan` were not re-read against their documents; they follow the first worker's labels.

## Step 2d: documents checked against their rows

Read in full and compared with the file's steps: G1 Visual Arts Curriculum, Cambridge Primary Maths Grade 1 plans, Grade 1 Geography Curriculum, Grade 1 History Curriculum, Handwork curriculum, Cooking Science, Stitching and Weaving, Hindi curriculum Grades 1-4, ICT Projects PDF, August 2024 planner PDF.

- Faithful (steps follow the document's own bullets or procedure): Visual Arts, Cambridge maths, Geography, History, Handwork, Cooking Science, Stitching and Weaving, ICT PDF, August planner. Kept `educator_plan`.
- Demoted to `inferred` (month grid gives one line per project; the steps and closing steps are suggested): all 11 Hindi curriculum rows, with `source.relation: "named in"`.
- Not read, so unverified (kept as labelled): the two session-based docs "History Grade 1" (3 rows) and "Geography Grade 1" (6 rows), and "Maths planning.docx" (1 row).
- Moved to `audit/G1_held_rows.json` (topics or syllabus bullets, not activities): G1-241, 272, 275, 282-300, 301, 302, 304, 305, 306, plus the earlier 281 and 303.

## Step 2e: last checks

- Read "History Grade 1" (3 rows), "Geography Grade 1" (6 rows) and "Maths planning.docx" (1 row). The History and Geography session docs hold the starter, story, activity and exit-ticket steps the rows use, so those 9 rows stay `educator_plan`. G1-367 follows only the phrases of a summary table in the Maths doc (no further detail), so it stays `educator_plan` with a note saying so.
- The 12 remaining Monthly Detailed Plan `educator_plan` rows (G1-007, 012, 025, 028, 035, 036, 037, 038, 039, 040, 043, 058): the cells are one-line topics (some with links), so the 4–5 steps are suggested. All 12 are now `inferred`. No Monthly Detailed Plan row is `educator_plan` any more.

## Step 2f: independent review round 4

- Every step of every `inferred` row now starts "Suggested:".
- Pattern A: 78 inferred rows moved to `audit/G1_held_rows.json` (topic, event or routine purpose, not a concrete task). The held file now has 107 rows.
- Pattern B: reviewer-listed rows fixed (G1-059, 062, 071, 099, 102, 110, 140, 185, 389, 393, 437, 459, 467, 485, 532, plus 156, 225, 226). A keyword sweep of the levels against the linked objectives flagged 18 more; 7 were fixed (070, 432, 442, 465, 492, 511, 519), the other 11 read as consistent. This sweep is a keyword check, not a full read of every level.
- Rows without an LO link (`needs_link`) are listed by an empty `lo_codes`.
