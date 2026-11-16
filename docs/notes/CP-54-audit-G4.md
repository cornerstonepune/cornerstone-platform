# CP-54 audit, Grade 4: step 1 inventory

1. Drive holds ONE Grade 4 planning workbook: "Grade 4_Planning Sheet_2026" (1gcNEJcv…, in folder "08_Grade 4 - 2026-27", created 2026-05-21). There is no separate 2025-26 G4 planning file, and none for 2023-24 or 2024-25 (searched titles, the grade folder, the "AY 2025-26" folders: those hold only PG and Nursery fortnight documents).
2. The 2025-26 plans are INSIDE that workbook: its "Parent planner" tab has Jun-Aug 2026 headed GRADE 4, and Sep 2025 to Apr 2026 (6 month-blocks) headed GRADE 3. Those are what the educators ran in 2025-26 for the cohort now in G4. They are Grade 3 content, not Grade 4 content.
3. The G4 workbook is a copy of "Grade 3 Planning Sheet_2024" (1NTYSiEt…): 44 tabs share names and sheet ids. G3's own 2026-27 planner (Jun-Jul) is word for word G4's Jun-Jul block.
4. The workbook has 49 tabs (19 hidden). I read 8 in full, peeked at 20 (first rows only), and did NOT read 32 (children lists, observation forms, parent one-on-one notes with names, timetables). The unread ones are mostly personal data; 4 are unread plan-like tabs (Graph 23-24, Graph_2022-23, Educator_Parents…, kid movies).
5. Real activities live in 7 tabs: Syllabus - Grade 4 (about 230 named things; the file has 177), Parent planner (about 130; the file has 67), Value Ed G1-3 (about 70 character activities, none in the file), Exposures/contest (22), Computer Primary/ICT Curriculum (8, G2/G3 columns), Next steps (1), and hidden "Graph 2024-25" (fortnight prose, grade unclear, only 5 rows seen).
6. The "Activity list" and "Edited Curriculum" tabs are the K2 (SR KG) list copied forward. Ignore for G4, as the brief says.
7. The data branch data/g4 has 291 rows. 177 come from the Syllabus tab, 67 from Parent planner, 47 from other documents. Zero from Value Ed, Exposures/contest or the hidden graph tabs.
8. Still unread and likely to matter: hidden "Graph 2024-25" and "Graph_2022-23" (fortnight-by-fortnight prose), and the other workbook "Curriculum Planning_All Grades" (1P8Ik…, 7 tabs, 2024 and 2026 curriculum plans). I will read these in step 2.
9. Sheet50, Update file and the parent one-on-one tabs name children and family details. Not copied, not to be extracted.
10. Row and column counts in the JSON are the sheet's grid size (get_spreadsheet), not the used range. "activities_found" values are approximate counts, marked as such. Drive/Sheets calls used: about 50 of 60.

Inventory file: `supabase/seed/curriculum/audit/G4_planning_tabs.json` (60 rows: 49 G4 tabs plus the G3 and all-grades workbooks).
