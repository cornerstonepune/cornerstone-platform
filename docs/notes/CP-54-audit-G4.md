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

## Step 2, second pass (after the second ruling)

Applied: the GRADE 3 block rows are in `audit/G4_rows_from_G3_blocks.json` (46 rows, `belongs_to: "G3"`); `audit/G4_rows_g1_3_or_ungraded.json` holds 23 rows (Value Ed G1-3, ICT G2/G3, contests, soil). `G4_held_rows_not_g4.json` is replaced by these two. activities/G4.json has none of them. The 63 basis upgrades stand, accepted.

New real G4 rows (13), from Drive files that are not planning-sheet tabs:
- "Grade 4.docx" (1gw-CZXb8NiTRlsX7510atd5C_KyTglH6, a maths strategy guide): 11 rows, G4 sections only (School Budget, Books sold table and bar graph, Which method would YOU use, School Trip Planner, Travel distance, Bar model, Which method is smarter, Plan a School Trip, Classroom flooring area model, Which multiplication is easier, Mini Business). Its final section is Grade 3 division: not used.
- G1-G4 Friendship Day (1Ssr17kf…): 1 row, card making; also detail added to G4-242.
- ALL ABOUT ME plan (1ZjOU0Zs…): 1 row, My Identity Shield (family part left out); detail added to G4-037. "How Tall I Am" (height) not used.
- class4_hindi.docx (1mFMXd6c…): a Hindi assessment paper, not activities. Not used.

The G4 Drive subfolders (English, Mathematics, Science, Hindi, History and Geography, Visual Arts, ICT, Developmental Updates) listed as EMPTY to the Drive search tool (three of them queried one by one), so nothing could be read from them. Not opened by other means. Unread: Independence Day K1 and G4 doc (1Byex0Uk…, 3 MB), Grade 3 and 4 Think outside the box and Idiom of the week PDFs, October Greenopia SDG (G3-4) folder (page 1 only photos), Syllabus G4 Google Doc, the Developmental Update docs (child data, not to be read).

## Final ruling notes

School-wide, not loaded (Exposures/contest tab, ungraded; none are in G4.json): Spelling bee, Reading contest, Colouring contest, Card making contest, Poetry contest, Speech contest, Creative contest (inter-school), Quiz contest, Drawing contest, Story telling day contest (inter-school), Comic contest, Narrative writing contest, Fun math contest (inter-school), Junior chef contest, Group song (inter-school), JAM (just a minute), Mono acting contest, Debate contest, Eco-friendly contest; and three field exposures: Science park Pimpri Chinchwad, Rajiv Gandhi zoological park, Joshi's Museum of Miniature Railways. Eight of these have draft rows in G4_rows_g1_3_or_ungraded.json.

Drive subfolders of "08_Grade 4 - 2026-27": English (two folders), Mathematics, Science, Hindi, History and Geography, Visual Arts, ICT: all listed one by one, each returned no files (created 2026-04-23, never modified since; Mathematics metadata checked: private, owner nehay). Likely empty. Developmental Updates not listed on purpose: it holds child data. Nothing in them was read.

## Syllabus - Grade 4 gap closed

Diffed the tab (all rows, read in step 2) against G4.json name by name. 32 items had no row and were added (basis syllabus, confidence low, steps suggested from the item name; the cell field holds the item name, not a pinned cell address):
Dictation; Home Science: Stitching in our community, Healthy eating habits, Fruits and vegetables, Grains and pulses, Dairy and proteins, Understanding tools, Festive foods, Review and assessment; Geography/History: Continents and oceans, Asia and India's place, Physical features of India, Discovery of fire and tools, Agriculture begins, Trade and exchange, Water bodies, Natural resources, Land use, Indus Valley, Occupations then and now, Inventions that changed life, World heroes; Art: Clay and dough, Junk sculpture, Texture in nature; Routines: Think Outside the Box, Champak magazine, Home Period; Computing: Animal animations, Data all around, Presenting data, Hardware and software.
Covered by an existing row, not added: Hindi units 1-15 activity lists (G4-013 to 022, 049-050, 101-123), Marathi units 1-26 (G4-023 to 029, 058-059, 124-142, 209), maths enrichment and projects (G4-061 to 071, 185-198, 219, 230, 236), science projects and enrichment (G4-072 to 081, 199-206), literacy units 1-9 (G4-007 to 009, 044 to 048, 082 to 094), literacy enrichment (G4-095 to 100, 207, 208), routines (G4-213 to 237, 039 to 043, 060), art units (G4-155 to 180), computing (G4-001 to 006, 052 to 054, 210 to 212, 251 onward). Grammar points and "key learnings" lines in the Hindi and Marathi units are not activities and have no rows; maths and science term unit lists are topics, not activities.
Independence Day K1 & G4 doc (G4 part only, child names not copied): 4 rows (skit and dance, National Anthem practice, song with harmonium, speech). K1/K2 sections and the "DO NOT REFER THIS" section not used.

## New basis rule applied (orchestrator, after reviewer round 3)

educator_plan only where the steps come from the cell or doc text. 98 rows whose notes said the steps were suggested/extended/made up (including the 63 planner rows I had upgraded) are back to inferred, each with `also_source` = "named in <tab>!<cell>", and the sentence about a raised basis or steps following the cell removed. My 32 syllabus rows and two Independence Day rows with invented steps are inferred too. Stay educator_plan: rows from Drive docs with real steps (ICT, History, Handwork, Hindi curriculum, maths documents, Friendship Day card making, Identity Shield, skit, anthem practice). G4_basis_upgrades.json is now history only: none of it is applied.
Moved to `audit/G4_held_rows.json`: G4-239 to 245 (event names) and G4-190, 191, 203 (syllabus-built). Also noticed and left in place (ask if they should move): G4-238 International Yoga Day and G4-246 Evaluation - 1 are the same kind of event row; and 50 more rows carry the note "built from the unit's syllabus bullets; no activity in the planning sheets", the likely group of the "other 3 of 6".
New learning objectives that existed only for the moved event rows (G4-NEW-039 to 045, 068) are dropped.

## Final reversal (orchestrator, third ruling)

Checked: none of the 63 upgraded planner rows is still educator_plan (all inferred, each with also_source). The 32 syllabus-topic rows (Dictation, Continents and oceans, Asia, Discovery of fire and tools, ... Hardware and software) are topics, not activities: moved to `audit/G4_held_rows.json`. The 4 Independence Day rows and 13 Drive-doc rows stay; two of the Independence Day rows (speech, harmonium song) are inferred because their steps are mine, not the doc's.
