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

## Step 2 result (revised after the orchestrator's rulings)

Merged file: `supabase/seed/curriculum/activities/G4.json` = the 291 rows from data/g4 + 3 new rows = 294. 9 rows carry `shared_with_g3: true` (same name as a data/g3 row; all came from document sources, not the planner).

Rulings applied: GRADE 3 blocks (Sep 2025-Apr 2026) are NOT G4; only GRADE 4 blocks (Jun-Aug 2026) and the Syllabus - Grade 4 tab count.
- My first push had 69 extra rows. All 69 are removed from G4.json and kept for the G3 auditor in `supabase/seed/curriculum/audit/G4_held_rows_not_g4.json` (50 from the GRADE 3 blocks, 8 Value Ed, 8 contests, 2 ICT G2/G3 column, 1 soil). The 3 rows now added are different, new, from the GRADE 4 blocks: Early Humans (F4/F9), States and Union Territories (F9), National Sports Day (F9).
- 63 existing GRADE 4 planner rows: basis inferred to educator_plan listed in `G4_basis_upgrades.json` (activity named in a real planner cell; steps still suggested). Applied in G4.json. Revert if the orchestrator wants educator_plan only where steps come from the cell.

Value Ed G1-3 tab: titled G1-3, so NOT G4. About 70 activities listed as "G1-3 only, not G4". 8 are in the held file. Not copied further.
Exposures/contest tab: 19 contests + 3 field exposures, not graded. 8 in the held file; the other 11 unlisted. Needs a ruling whether school-wide contests count for G4.

Tabs checked this pass:
- Graph 2024-25: fortnight prose for a Grade 2 class (Fantasy story Aqsa, plurals s/es). Skipped: G2.
- Graph_2022-23 and Graph 23-24: alphabet intro, Ali's Bedroom, number pairs. Skipped: G1 or earlier.
- Curriculum Planning_All Grades (7 tabs): 2024 and 2026 are task trackers (one line per grade review), ANNUAL CURRICULUM SYSTEM is a Nursery/K1 review (it names children), Tasks, Setup, Sheet5, Sheet6 are set-up and review lists. No G4 activities. Nothing copied.
- Still unread: the G4 Drive subfolders/Docs (English, Mathematics, Science, Hindi, History and Geography, Visual Arts, ICT, Developmental Updates). Not opened.
- Syllabus - Grade 4: not re-read; data/g4 has 177 rows from it.
