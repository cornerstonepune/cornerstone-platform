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
