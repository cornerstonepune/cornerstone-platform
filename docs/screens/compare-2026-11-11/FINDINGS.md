# Wireframe against built: what the built pages lack

Built = main plus #651, run locally on a freshly built database. Wireframe = `docs/frontend/wireframes/<id>.html`, rendered with its `kit.css`. Coordinator signed in, except Today (educator), Period, Record and Confirm (educator). Pictures: `index.html` (wireframe left, built right, 1440 then 400 px).

**What I did not verify.** I read every 1440 pair closely. I looked at 400 px closely only for Today; the 400 px pictures are in the page but are not reviewed line by line. I could not see the live site (behind Vercel sign-in), so this is the code that will go live, not what is live now.

**Read this first: much of the "poorness" is thin test data, not the page.** The wireframes are drawn with 24 named children, a finished fortnight, notes, papers and reports. The local database has placeholder children, no last week, no draft, no materials. A page can look empty because it is. I separate the two below: **Defect** (wrong whatever the data), **Structure** (missing even with data), **Data** (will fill with real data; confirm on live).

## The five things an educator would notice first

1. **Period page does not load at all** (Defect). All 15 periods on Today for the educator show "This page could not load" (browser console: React error 441). Wireframe: three action cards, last-time summary, steps, peek panel. Every period row on Today leads here. Verify on CI/live; if it reproduces, it is the worst gap.
2. **Timetable and Moves by hand: every lesson is the same amber "Arts" block** (Defect). Wireframe colours by subject (blue Numeracy, rose Language, amber Arts) with an icon, and shows Done, Moved and Clash chips on blocks. The grid is also clipped on the right (Mon 30 and beyond cut off).
3. **No child panel anywhere** (Structure). The wireframe's right-hand "child's recent history" panel (Finn Fox: 6 secure, 3 practising, last five entries, Open Finn) is on Today, Children, Notes, Confirm, Period, Class picture and Skill. None of those built pages has it. UI-7c and UI-3b mention it as pending.
4. **Children is a flat table, not the grouped page** (Structure). Wireframe: sections "Secure / Practising / Not seen yet" with counts, name pills coloured by state, a row of dots for absences, "1 to confirm" chips, a whole-class bar and a "Needing attention" card. Built: one plain table, every name the same teal pill, "not available yet" in the Notes column.
5. **Right-hand "Connected to" is bare** (Structure, every screen). Wireframe: each link has an icon and a second line ("Fortnight 9 · live, frozen"; "Sr. No. 02 · answers to judge"). Built: underlined words only. There are also the "Latest notes", "Capture here" and "This fortnight" cards in the wireframe rail that the built rail lacks on most screens.

## Patterns on every screen

- **Two rows of navigation above the title.** Built has the door bar plus a second tab row (Today/Notes/Your day; Children/Assessments/…; and Setup's 14 tabs running off the right edge) plus a breadcrumb. The wireframes have the door bar and a breadcrumb only. Setup's tab row is the heaviest.
- **Buttons.** Wireframe: dark primary pill with a leading icon, secondary buttons filled and rounded. Built: thin-outlined, no icons ("Class picture grid", "Back to Today", "Timetable →"). Every built page ends with an extra outlined "next door →" button the wireframes do not have.
- **Density.** Wireframe tables sit in a rounded card with row hover and coloured state chips; built tables are mostly bare rows with small outlined badges (Notes "Fix this", Reports "nothing yet").
- **Title area.** Wireframe has an icon before the small-caps line; built has none. Built shows a tiny grey line under the title as the purpose; wireframe shows it larger.

## Per screen (rank = how visible to an educator; H high, M medium, L low)

| Screen | Rank | Built lacks against the wireframe |
|---|---|---|
| today-educator | H | Child panel, "Lay out" card, second line on period rows (subject and note state), state chips on rows (To do), the lit row, "Your class" card shows only a count (wireframe lists children by how they stand). Tiles, list, board, colours: present and close. |
| period | H | **Does not load** (see above). |
| record | M | Three summary cards (last time this ran, not yet seen, recent notes), "Start recording" as the one big button, After-send states. Built is a plain form with a Record box. |
| confirm | H | The 24-square class grid marked from the note (Above / As expected / Below / Not willing / Absent), "You said … read as" cards, "Confirm this note" button. Built shows red "could not read" lines only (this one note is a failed read, so partly data). |
| notes | M | Board of To confirm / Confirmed, "Children named" pills per row, Confirm button per row, summary cards (by state, by class, how they came in). Built: table with "Fix this" / "Read only" and no children named. |
| today-coordinator | M | Heat grid of last week by class and day, five "what waits" rows with a coloured state and a named button, "Next week" with real dates, "New activities", "The school this fortnight" counts. Built: one row, empty last week (Data) and a thinner Next week card (Structure). |
| timetable | H | See 2. Also: Day/Week/Fortnight switch, "Changed this fortnight" rail, "Lessons by subject against the rule" table, day-of-week highlight. |
| fortnight | M | State pills (Drafted, Approved, Live, Frozen), three cards (State, Plan lines, Hand moves) and "Every fortnight of the year, by state". Built: a 100-line plain list of plan lines. |
| draft | M | Class tabs and a drafted grid with subject colours, "Rules not met" table, "Last drafts by class", "What the draft reads". Built: "No draft made yet" (Data) and a stretched Make a draft button with a missing label gap. |
| moves | M | Moved/Clash chips on blocks, "Accept this clash" form, "Moves made" table, "Clashes in Fortnight 10". Built has the grid (see 2) and "No moves yet" (Data). |
| rules | M | Wireframe is calm read-only tables with an Edit per row, plus history. Built is 40 form rows (every period time has name, start, end and Save). Different design, not just thinner. **Check whether the wireframe or the page is right.** |
| materials | M | My class / School list tabs, To confirm and Set tables with editable quantity, School list card, Notes to read. Built: "Nothing in the plan needs materials" (Data). |
| children | H | See 4. |
| picture | H | Skill, Domain and Group-by filters, a stacked bar, children grouped by state with names, the six-fortnight line, "Ready for the next skill" clusters. Built: grey "Placeholder" squares and "no child seen" (Data), no filters, no bar. |
| child | H | Wheel of skills by domain, skill table, three summary cards, trend chart, "What was seen, newest last" with Details, Skill by skill. Built: "Not seen yet on any skill" (Data), none of the charts drawn. |
| assessments | L | Close. Missing: the right-hand "Capture here" card and the Table and By-topic views' detail. Board, make/read cards, tiles are all present. |
| assessment | M | Approval ledger and the second-pack card, grouped copies (Answers to judge / To sign off / Not printed / Results in), skill and "What it asks" detail. Built is much shorter and "The papers" bar is a single red bar. (Data: one paper only.) Very long title ran across two lines. |
| paper | M | Photographed page with the question outlined, a row per question with Read as / Mark / Why, "This scan" facts. Built shows a broken file picture ("A.pdf" stretched) and a single question. |
| reports | M | Three line cards per child, grouped tables by stage, the board, consent bar. Built: a row per child with "Placeholder's report" fold each (Data). |
| activity | M | Level cards with a bar chart of where the class sat, "Taught so far" tiles, "Fortnights it is in" with Taught / Coming up. Built shows steps and a column of Keep / Send back buttons, no chart (Data partly). |
| objective | M | Three skill cards with prerequisite chips, activities table, "Children seen on each skill". Built: one skill, an empty activities table (Data). |
| skill | H | **Link from Skills to approve gives 404.** Every row's name links to `/setup/skills/<code>` but the code is a skill-set code; the page only knows registry skills. Wireframe: class bar, spark line, clusters, grid by state. |
| skillset | M | Wireframe is a short page of skill cards. The built page at `/skill-sets/<code>` is the OLD long page (all levels, all sample questions, approve buttons, 1,500 px of forms). The new-frame screen is not built. |
| curriculum | H | **First column is one letter wide** (the name reads vertically, rows 250 px tall). Also missing: "Where the words came from", the drafted-parts board, offers waiting (Yes / No). |
| skills-approve | M | Levels as four small boxes in a row, grouped by subject with counts, "Levels to review". Built shows levels as small stacked text; no subject grouping; 109 rows. Close otherwise. |
| bank | M | "What the bank is" card with bars per difficulty, Grade defaults to the first grade, readable question stems. Built lists 19,643 questions across all grades with generic text "Read the question again…". |
| question | L | Clean. Missing: reviewer chip and the "As prints" preview is small. Wrong-answer table is richer than wireframe. |
| staff | M | Grouped by role with counts, "End a grant" and "Add a grant" form, "Last changes to grants". Built: three role tables and "End-to-end test's grants". |
| classes | M | One row per class with "Class picture" link, children moved in year, change log, "This year so far". Built lists 16 test classes, 0 children for one. |
| setup | M | Six cards (Curriculum with a primary button, Skills, Bank, Staff, Classes, School), "Waiting in set-up" and "Changed lately". Built: four cards, no School card, no Waiting or Changed lately. |
| help | L | "You came from Today" card and nine "I want to…" cards. Built has 8 cards and a 33-row list (rows labelled "the session's name", "{the built name}" show raw placeholders). |
| feedback | L | Wireframe adds a screenshot box, "After send" state, and "Your last reports". Built is the basic form. |
| login | L | See the pair. Wireframe sheet also draws three states. |
| blocks | — | Staff-only gallery; not compared. |

## Did #642 change a wireframe instead of the page?

#642 redrew four wireframes: curriculum, bank, question, skills-approve. I rendered each from the commit before it and from now (`wf-*-before-642.jpg`).

- **Visual richness: not lowered.** The "before" and "after" pictures look the same; #642 *added* controls the code already had (Topic and Taught filters, "Approve this table as written", "Ten offers a page") rather than removing any.
- The built pages for those four are still plainer than the wireframe, so this is a page gap, not a drawn-down wireframe.
- Other wireframe edits in recent history: #650 removed the activity photo element; #630 added the Skill set wireframe; #612 and #606 added Staff controls. I did not diff each of these.
- I cannot tell from here whether any wireframe was drawn down earlier. The orchestrator will need the history of `screens.json` for that.

## Suggested owners (from your note)

Period page (UI-3a / UI-7), subject colours and clipped grid (UI-6), child panel and Children grouping (UI-3b), the 404 on a skill row and the one-letter-wide Curriculum column (UI-11 / UI-3c), Setup tab row (UI-5).
