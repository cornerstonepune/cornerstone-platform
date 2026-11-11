# UI-11b: retiring the old Setup content pages (carry-across list, issue #599 step 2)

Docs only: nothing is retired or changed here. Written 11 Nov 2026, after UI-11 (#582) merged. The four new screens are
`/setup/curriculum`, `/setup/skills/approve`, `/setup/question-bank` and `/setup/question-bank/[key]`. The old pages stay live until each
function below has a home on the new screens and its specs are moved at equal assertions (#599 guard rails). A function with **no home** is a
function the school has today: it is raised here, not dropped.

"Home" is where it lives or would live (`docs/frontend/screens.json`). Status: **Built** (on a new screen now), **Gap** (the new screen is built
but does less than the old page: found while writing this), **No home** (nothing lists it), **Other slice** (a screen another builder owns).
Spec names are the file names that mention the old address; each is read when it is moved.

## The old pages and what each holds

### `/` (the old Curriculum home: skills by grade, subject, topic) and `app/(app)/curriculum-skills.tsx`

| Function today | Who | Home | Status | Specs |
|---|---|---|---|---|
| One table of skills with grade, subject, topic, status; a filter row; a search | all | `curriculum` | **Built** (one list with the K2 activities) | u52-curriculum-table, u5-curriculum, u17-curriculum |
| Say a class has been taught a topic (or one skill of it), or not yet: `switchTopic`, a class dropdown and a switch on each row; an educator for their own classes, the coordinator for any | educator, coordinator | `today-*` has "Mark as taught" per topic; **Curriculum has none** | **Gap**: the row-level switch has no home on Curriculum; Today's group does the topic, not one skill of it | u52-taught-this-week, u42-curriculum-for-the-educator, s2-skill-map |
| "Taught" and "not taught yet" shown and filterable (a skill nobody teaches is greyed) | all | none: the new status filter has drafted / waiting / complete | **Gap** | u42, u52-curriculum-table |
| A link to the blocks gallery | staff | `setup/blocks` | **No home needed** (a link on the old page only) | none |
| Links "Skills to approve", "Every question in the bank", "Worksheets by taxonomy" | all | rail and Next on the new screens | **Built** except the taxonomy link (see `/worksheets/taxonomy`) | u17-curriculum |

### `/curriculum/browse`, `/curriculum/fill`, `/curriculum/offers` (the K2 curriculum screens, M1-13)

| Function today | Who | Home | Status | Specs |
|---|---|---|---|---|
| Browse the K2 activities by section, with a card per section (how many activities, a bar, a state, each part's "n of N") | educator, coordinator | `curriculum` list has a Filled column and a status chip, no per-section view | **No home**: the per-section cards | m1-13-curriculum-fill |
| An activity table by section, searchable by name or number, ten rows then pages | both | `curriculum` | **Built** | m1-13-curriculum-fill |
| "What is filled, and by whom": each of the eight parts counted as school / drafted / person / empty, a filter by part, each drafted count a link to the walk of that part | both | none | **No home** | m1-13-curriculum-fill |
| Skills offered: the activity, the offered skills, what was already linked, why it waits; Yes adds the link, No closes it | coordinator | `curriculum` offers table | **Built**, with one **Gap**: it shows the first ten offers and has no way to the rest (the old page paged) | m1-13-curriculum-fill |
| The gate: closed, preview (look, change nothing), reviewer, open; the strip of counts above each page (drafted parts, offers, parts still empty) | both | `curriculum` asks the gate softly (K2 rows, drafts and offers appear only when it is open) | **Built** (the strip of counts is not: the screen shows the drafts count in a card and no count of offers or empty parts) | m1-13-curriculum-fill |
| The walk of the drafted parts (keep, edit, send back) | coordinator | UI-3c's activity screen does Keep, Edit, Send back; "the walk queue gets its own element on the curriculum side" (UI-3c decision 3) | **Other slice, to be coordinated**: this note asks UI-3c to name the element; Curriculum's main action "Check the drafted parts" opens the first activity today | m1-13-curriculum-fill |

### `/asks` ("Questions to answer")

| Function today | Who | Home | Status | Specs |
|---|---|---|---|---|
| What the engine drafted about the curriculum, yours first: agree as drafted, or write what it should say (`answerAsk`); your name goes on it; answered ones folded below with who and what | the role the ask is for | `screens.json` lists `/asks` under Curriculum's `folds`, but no element | **No home** | u13-needs-you, u17-curriculum, u24-no-long-lists, u43, u49, u51 |

### `/skill-sets/approve` and `/skill-sets/levels`

| Function today | Who | Home | Status | Specs |
|---|---|---|---|---|
| Waiting skills as a table, a skill's levels read in the row, Approve one row (`approveSkills`, `only`), with the page-opened-at guard | coordinator | `skills-approve` | **Built** | u23-approve-filtered, u62, u65, u68, u32, u49 |
| Filters by grade, by topic, by "taught or not"; a grade as chips with counts | all | `skills-approve`: grade and subject | **Gap**: topic and taught are gone; the counts on the chips are gone | u23-approve-filtered |
| "Not taught yet" shown on a skill | all | none | **Gap** | u23, u54 |
| "Change the description and each level's sentence" link | whoever may change the skill | UI-3c skill screen | **Other slice** | u54-skill-shows-its-samples, u53 |
| "Approve this table as written": what a wrong answer counts against (`charges_table`), once, as shown | coordinator | `skills-approve` shows the table read-only in a fold | **Gap**: the approval is not on the new screen (the element list has the fold only) | u23, u27 |
| Levels to review: suggestions with their counts, filters (count by grade or class, grade, class, show, search), "I've looked at this" | coordinator, educator (own classes) | `skills-approve` tab "Levels to review" | **Built** (the controls are on the tab; the element list names the tab only) | u66-levels-to-review |

### `/library` and `/library/[key]` (the question bank)

| Function today | Who | Home | Status | Specs |
|---|---|---|---|---|
| What the bank is; the ready and removed counts | all | `bank` fold and counts | **Built** | s5-question-bank |
| **Proposals** from children's answers: a question far easier or harder than its level, with its evidence: Remove or Keep; a mistake learned: adopt (named) or reject (`decideProposal`) | whoever decides questions | none | **No home**: raised | s5-question-bank (and goals s21) |
| A grid of questions by skill set and level, each count a link into that cell; the person's own grade first | all | `bank` statistics fold: by grade and level only | **Gap**: by skill is gone | s5-question-bank, u17-curriculum, s3-worksheets |
| Filters: grade, level, kind (a chip per kind), "Ready to print" or "Removed", find by words, clear all | all | `bank`: grade, skill, difficulty, search | **Gap**: kind and the removed list are gone | s5-question-bank, u42, u17 |
| The table: the question, its answer, kind, the worksheets it is on (each a link), "Open" | all | `bank` table: question, skill, level, kind, status | **Gap**: the answer column and the worksheets column are gone | s5-question-bank, s3-worksheets |
| One question: as it prints, answer, wrong answers it catches | all | `question` | **Built** | s5-question-bank, s33-divide-advance |
| Correct the wording, Remove with a reason | coordinator (the old page: any member of staff whose role decides questions) | `question` | **Built** (coordinator only) | s5-question-bank, e2e |
| About it: the skill set (a link), the level and its words, who made it, the worksheets (each a link), "On papers: n children have had it" | all | `question` About fold | **Gap**: the worksheets and children counts are text without the links | s5-question-bank, u43 |
| A removed question says who removed it, why, and links to the corrected one; "See the original wording" | all | `question` shows the words, not the links | **Gap** | s5-question-bank |

### `/worksheets`, `/worksheets/[qr]`, `/worksheets/taxonomy`

| Function today | Who | Home | Status | Specs |
|---|---|---|---|---|
| The library of worksheets by skill and level: a grid, chips for grade and level, a table of worksheets, each a link, ten a page | all | `bank` folds `/worksheets`, no element | **No home** | s3-worksheets, s41, u45, u38, u49, u63, s7, m4, and about 20 more that open `/worksheets…` |
| One worksheet: its questions (each a link to the question), print it (`/api/worksheet/CODE`), make it for a child or a class (`/api/worksheet/CODE/for`), its place in the taxonomy | all | none; not in any `folds` list | **No home**; also the address `/worksheets/CS…` is how a class paper is opened from Assessments (the menu matches it) | s3-worksheets, s7-paper-from-library, s11-focus-paper |
| Worksheets by taxonomy: the school team's Addition and Subtraction taxonomy case by case, each case with its example, the level the rules set it at, and its worksheets; a tally; chapter tabs | coordinator | `bank` fold "Statistics (counts and worksheets by taxonomy)", but the fold holds counts by grade and level only | **No home**: raised | s12-worksheets-by-taxonomy, s8-taxonomy |

## Decisions needed before anything is retired

1. **Worksheets.** The library, one worksheet (print, make for a child or class) and the taxonomy are a whole subsystem, not a view of the bank, and
   Assessments opens `/worksheets/CS…`. Proposal: a screen "Worksheets" (library and one worksheet) and the taxonomy as a fold or a tab of it, added to
   `screens.json` and the wireframes first. If instead the worksheets are to be dropped, that costs the school printing and making papers from the library:
   raised, not done.
2. **Questions to answer (`/asks`).** Proposal: an element on Curriculum, a card "Questions to answer" with the count and a table of the open
   asks (agree / write a correction, one row each; answered folded). Coordinator or the role the ask is for.
3. **Bank proposals** (remove / keep / adopt / reject). Proposal: a table on the Question bank ("What children's answers suggest"), one row each.
4. **Row-level "taught" switch** on Curriculum (`switchTopic`, topic or one skill, per class). Proposal: a button on the skill row of the Curriculum list.
5. **The walk queue** (UI-3c decision 3): which screen names the element, UI-3c or this slice.

## Plan (separate pull requests, one at a time, each with its specs moved at equal assertions)

1. Carry across what is a **Gap** only (no new screen needed): offers beyond ten; the topic and "taught" filters and the approve-the-table button on Skills to approve;
   the bank's kind filter, removed list, answer and worksheets columns, by-skill statistics; the question's links in About and in a removed notice.
   Each needs its element in `screens.json` (and a `drive` where it changes something).
2. Carry across what needs a ruling above, as each is answered.
3. Retire, one old route at a time: 308 in `next.config.ts` to the new address, then delete the page, its components, queries and styles, and move the old
   specs to the new addresses. A spec is deleted only when the page it tested is gone and the same assertion lives on the new screen.
4. Keep `workflows.json` and `test_layout.py` in step, and `docs/notes` and the guide pages (`apps/web/guide/pages/curriculum.json`, `skills-to-approve.json`).
