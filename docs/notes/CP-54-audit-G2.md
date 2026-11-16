# CP-54 audit — Grade 2 planning sheets (Step 1: inventory)

**Summary (plain English)**
1. There is exactly **one** Grade 2 planning workbook in Drive: "Grade 2 Planning Sheet_2026" (id `15gFnhKvmioBWwcOdwsgReiN6wOiFMaZ1FMtlwSQ4Ucw`), in the folder "06_Grade 2 -2026-27". There is no separate 2023-24, 2024-25 or 2025-26 Grade 2 workbook; every year lives as tabs inside this one file.
2. It has **50 tabs: 12 visible and 38 hidden**. The data worker read one visible tab ("AY 2026-27 Parent planner") and never read "Curriculum - G2".
3. **The 2025-26 plan is a hidden tab, "AY 2025-26 Parent planner"** (July 2025 to April 2026, every subject). It is the richest G2 source and none of the 338 rows in `data/g2` cite it. Copies of Dec 2025 to Apr 2026 are also stacked at the bottom of the 2026-27 tab.
4. Tabs that hold real G2 activities: "Curriculum - G2" (syllabus, 12 named projects, enrichment items, 30 routines), "AY 2025-26 Parent planner", "AY 2026-27 Parent planner" (109 already in the file, about 15 more), "Routines" (12), "Exposures/contest" (22), "Next steps" (a soil lesson), "Time Table G2" (about 7 daily topics), and the two "Observations" logs (activity names the educators ran).
5. Ten more hidden tabs hold activity-like content but are **not Grade 2**: they are Sr KG / K2 copies from 2019-2022 (activity lists with L0-L3 levels, fortnight period grids, Circle Time). Two others, "Graph 23-24" and "Graph 2024-25", are Grade 1 level (numbers to 50, Stage 1 stories). The remaining 29 tabs are rosters, timetables, forms, templates and link lists with no activities.
6. Tabs read in full: 17. Sampled (first rows only, enough to classify): 17. Header only on purpose: 16, because they hold children's names, emails, attendance or comments. No child data was stored.
7. Sensitive items seen and **not** copied: a roster with parent emails, per-child worksheet comments, observation comments with names, and a PE block recording height/weight/BMI.
8. Calls used: about 36 of the 60 allowed.
9. **Question for Nimish:** are "Graph 23-24" and "Graph 2024-25" the Grade 1 plan copied into this workbook, or what Grade 2 actually followed in those years? Their content is Grade 1 level, so I will not add them to G2 unless told.
10. Outside the workbook, same folder: a Grade 2 August 2024 planner PDF (`115ikRQu2STAWoE4eaHCXNygF14YZC7yH`, 2024-25) and a "Grade 2" folder with fortnight sub-folders FN 1 to FN 10 (`1o6x0mpbEFGx7QO8_OB-CZDCd7zJM48m-`) that I did not open. Say if you want those audited in Step 2.

Per-tab detail: `supabase/seed/curriculum/audit/G2_planning_tabs.json` (50 rows: workbook, tab, rows, cols, kind, holds_activities, activities_found, already_in_file, read_status, grade_content, note).
`activities_found` is my count from what was read; `null` means the tab holds activity names but I have not counted them yet (Step 2). `rows` and `cols` are the sheet's declared grid size; the note gives the used range where I measured it.

## Step 2 plan (waits for "go step 2")
Re-read and extract, citing workbook id + tab + cell: "AY 2025-26 Parent planner", "Curriculum - G2", the uncovered parts of "AY 2026-27 Parent planner", "Routines", "Exposures/contest", "Next steps", "Time Table G2", and the activity-name columns only of both "Observations" tabs. Skip K2 and Grade 1 tabs. Keep the data worker's existing rows; upgrade only where my source has real steps.
