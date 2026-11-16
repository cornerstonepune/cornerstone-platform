# CP-54 planning-sheet audit, Grade 3 — Step 1 (inventory)

1. There is only ONE Grade 3 planning workbook in Drive: "Grade 3 Planning Sheet_2024" (id 1NTYSiEte8HKxXWNKxRQwu8S_8AzCWuEmSWqVih6L1MQ). I found no separate 2023-24, 2024-25, 2025-26 or 2026-27 file for G3 (searched titles for Grade 3 / G3 / Planning, and listed its folder "07_Grade 3 -2026-27").
2. The "2024" in its title is stale: the file was created 27 May 2025 and edited today. It holds the 2025-26 plan (Dec 2025 to Apr 2026 blocks) and the 2026-27 plan (Jun to Nov 2026 blocks, day-by-day timetable from 10 June 2026) in the same tabs. So this one file is the "2025-26 sheet" Nimish means; it just also carries 2026-27.
3. The workbook has 53 tabs (12 visible, 41 hidden). I read 21 in full, looked at the first rows of 17, and read only the header row of 15 that hold or may hold children's names or contact details (not copied, on purpose).
4. Eight tabs hold G3 activities: Parent planner_2026-27 (the monthly detailed plan, about 70), Time Table G3 (day-by-day lessons, about 80), Curriculum - G3 (syllabus, about 120), Value Ed G1-3 (about 60), Routines (15), Exposures/contest (19), Computer Primary/ ICT Curriculum (8), Next steps (3). About 375 in all (an estimate; Step 2 will count exactly).
5. The data worker's file has 166 activities, but only 19 cite this workbook, and all 19 cite the one tab "Curriculum - G3". Nothing from the monthly plan, the day timetable, value education, routines or the ICT lessons is in it yet.
6. There is no tab called "Monthly Detailed Plan"; the monthly plan is "Parent planner_2026-27". The tab named "Activity list" is not present either; the activity-list tabs here are hidden SR KG copies (ignore).
7. The hidden tabs Graph 23-24, Graph 2024-25, Graph_2022-23, Review Curriculum and the fortnight/online plans are older plans for SKG and Grade 1 copied into this file. They name activities but for other grades, so I did not count them for G3.
8. A second workbook, "Curriculum Planning_All Grades" (id 1P8Ikp98lYLiv7js_jwc9481IYQ2w0OOiUXmsqy5KYZc, 7 tabs), is a staff task list and annual review; the G3 rows are empty. No activities.
9. Not touched: the sibling Drive documents (G3 syllabus doc, geography/history/arts/computing curricula, assessments); the data worker has used some of them.
10. Per-tab detail: supabase/seed/curriculum/audit/G3_planning_tabs.json (60 tab rows across the two workbooks).

Caveats: tab sizes are the sheet grid sizes (including empty rows). "activities_found" is a count by eye from the read text, to be firmed up in Step 2. Tabs with children's names (observations, class lists, parent notes) were not read beyond headers, so I cannot say there are no activity names inside them.


## Step 2 result (2026-11-16)

File: `supabase/seed/curriculum/activities/G3.json` = the data/g3 file at 0561c537a (166 rows) + 129 added rows (G3-177 to G3-305) + 16 upgraded rows + 7 new objectives (G3-NEWA-001 to 007).

### Rows added, by tab
- Parent planner_2026-27: 62
- Computer Primary/ ICT Curriculum: 4
- Time Table G3: 14
- Next steps: 2
- Routines: 9
- Value Ed G1-3: 21
- Exposures/contest: 8
- Detailed Planner: 5
- Rewali Diwali Workshop: 4

Basis: 101 educator_plan, 28 inferred (named in the sheet with no steps; confidence low). Character rows (Value Ed, 21) have levels null and three look-fors.

### Rows upgraded (inferred to educator_plan, source cell now the planner)
- G3-018 Chance cards: now Parent planner_2026-27 B45
- G3-027 Class survey: now Parent planner_2026-27 E21
- G3-033 Skeleton model: now Parent planner_2026-27 F4
- G3-034 Energy chain: now Time Table G3 T128
- G3-036 Volcano model and habitat: now Parent planner_2026-27 E21
- G3-040 Story opening writers: now Parent planner_2026-27 B4
- G3-041 Habitat information page: now Parent planner_2026-27 A15
- G3-042 Kenning poems: now Parent planner_2026-27 A21
- G3-064 Healthy plate: now Time Table G3 G271
- G3-078 Daily journal: now Routines B4
- G3-080 Spelling bee: now Exposures/contest A2
- G3-081 Crossword and word search: now Routines B16
- G3-082 Expanded sentences and dialogue: now Routines B11
- G3-083 Mental maths and sudoku: now Routines B18
- G3-084 Mini science observation: now Routines B8
- G3-085 Memory drawing and doodle: now Routines B15

Steps of upgraded rows are unchanged; only the source and basis moved, because the sheet names the activity but gives no steps (except G3-042 kennings, where the planner gives week-by-week detail).

### Rows only in an old year's plan
The hidden tabs Graph 23-24, Graph 2024-25, Graph_2022-23, Review Curriculum, Time Table (2023-24) and the fortnight/online plans hold activities for SKG and Grade 1 only. None was added to G3.

### Cells named but left out (no usable content)
Time Table G3: E27 'Can t wait to learn', E31 'Pyramid', E29 'Dice Game' (settling week, subject and method unclear); Anti-Bullying Awareness Week (K44, J50, D63, E69); International Yoga Day (C50); Friendship Day (N110); Photography Day (E168). They are events with no steps.
The many Hindi, Marathi, phonics and maths one-line lesson cells in Time Table G3 (for example 'Maths: revision of addition') are lessons, not named activities, and were not extracted.

### Still unread, and why
- 15 child-name tabs in the G3 workbook (observations, class lists, parent notes, Worksheets Assessments comments): skipped on purpose.
- Drive: the Mathematics, English and Hindi subfolders look empty to this account; 'Developmental Updates G3' and the per-child folders under '3rd Grade' hold child records (skipped); the Greenopia and G3/4 folders hold only photos and videos; the 'Worksheets' and 'Source_files_and_TG_docs' folders under Primary Computing, the 'Think outside the box' and 'Idiom of the Week' PDFs, 'Grade 3.docx', the Debugging PDFs, the robotics workbook and the weekly quiz PDF were not opened. Cambridge Visual Arts overview was not opened (its sibling 'G2-G3 Visual Arts Curriculum' is already used by the data worker).
- Budget: about 45 of 60 Drive/Sheets calls used.

### Things to check
- The existing data/g3 rows refer to objectives G3-NEW-001, -014 to -019 etc., but its new_los array lists only G3-NEW-001.
- Marathi, PE, music and value education have no Grade 3 objectives in the registry, so the new objectives (NEWA-001 to 007) are needed; subject codes used: MAR, GP (for PE), RTN (for value education), ART (music).
- Level text for the new rows is built from one work-product phrase per row, so levels 0 to 3 differ only in how much support is shown. Coordinators may want to sharpen them.
