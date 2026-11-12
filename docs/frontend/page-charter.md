# Page charter (draft 1, 12 Nov 2026)

Why this exists. Nimish, 12 Nov: "We really need to have a very systematic process around what each page's
function is going to be and what it is supposed to do for a teacher. The functionality of the page needs to be
defined. The attributes of the page then need to be designed accordingly." Until now pages were built to "match the
wireframe" and "pass the tests"; nobody wrote down the one job each page does. This file is that, and it is the spec
every UI PR is checked against from now on (before the tests, not instead of them).

How to read it. Part A is the five shared decisions that change every page at once. Part B is the six screens that
matter most, each with its job and layout. Part C is a one-line verdict for every other screen (keep / rework / merge
/ delete). Nothing here asks for a new table; anything that needs a number the engine does not yet give is marked
**engine**.

Status: DRAFT for Nimish. Comment anywhere; nothing is built from it until he says go.

---

## Part A. Five decisions for every page

### A1. Menu: a left sidebar, always visible, grouped by the teacher's jobs

Today the bar has four doors and the real pages hide behind a small "… pages" fold. That is why "I don't even know
where I have to go to do what". Replace the fold with a **left sidebar** (collapsible to icons; a drawer on a phone):

| Section | Pages (in this order) | Who |
|---|---|---|
| **My day** | Today · Notes to confirm | everyone |
| **Timetable** | Week · Fortnight (plan, freeze, move) · Time by subject (analytics) · Materials | everyone; plan actions coordinator |
| **Children** | Class picture · A child · Parent reports | everyone |
| **Assessments** | Board (make → print → upload → check → results) · Question bank | everyone; approve coordinator |
| **School** (coordinator) | Across classes · Curriculum · Skills to approve · Staff · Classes · Timetable rules · How it works | coordinator |

Top bar keeps only: logo, search, who you are / Acting as, help, sign out. "Upload papers" stops being a page (it is
part of an assessment, see B6). The sidebar fills the empty left margin; the page body keeps the full width.

### A2. The right side is the **detail panel**, never leftovers

One rule: **click any thing on a page (a lesson block, a child, an activity, a paper, a skill) and its detail opens on
the right**, with tabs, without leaving the page. Close it and you are where you were. The panel can be opened full
page (its own address) for sharing a link.

- When nothing is selected the panel shows the page's **summary** (stat tiles: the 3–4 numbers that matter on that page),
  never "Connected to" link lists. Links to sibling pages move to the sidebar (A1).
- Tabs are the same everywhere for the same kind of thing (a lesson always has Activity · Children · Materials · History).

### A3. A visual language that carries meaning

- **Subject colour** (Numeracy blue, Language rose, Arts amber, …, from the subject rows) on every lesson, activity,
  analytics bar and chip, everywhere, not only the timetable.
- **State colour**, one scale site-wide: green secure / amber practising / red needs help / grey not seen. Rubric levels
  0–3 use the same scale (0 grey, 1 red, 2 amber, 3 green) with the activity's own words beside them.
- **At most two chips on a card**, one status chip and one count; everything else goes in the detail panel.
- **Numbers as stat tiles** (big number + one line), not sentences. **Lists as bullets**, never paragraphs of prose
  inside a list or card.
- Every page leads with its **one primary action button** (the job in B/C), top left under the title.

### A4. Density

Full width (done in #701). Cards are compact (title, one line of facts, ≤2 chips, one action). Filters sit in **one
row** with "More filters" for the rest. Long boards scroll inside their lane, not the whole page.

### A5. Three page shapes only

Every screen is one of: **Workspace** (list/grid on the left, detail panel on the right), **Board** (lanes of compact
cards, detail panel on click), **Dashboard** (stat tiles + charts + one table). A screen that fits none of these is
merged into one that does.

---

## Part B. The six screens that matter most

### B1. Today (educator) — Workspace
- **Job:** run my day: what I teach next, what to lay out, and record what children showed.
- **Primary action:** Open my next lesson.
- **Left:** today's lessons as a vertical timeline of subject-coloured blocks (time, subject, activity name, done / now
  / next). Above it 3 stat tiles: lessons today · notes to confirm · papers to check.
- **Right (lesson selected):** the lesson panel (B4 tabs). Default selection = the lesson now or next.
- **On a holiday:** the next school day's lessons, with "School is on holiday; Fortnight 10 starts 23-Nov".

### B1b. Today (coordinator) — Dashboard
- **Job:** see the school's day and what waits on me.
- **Primary action:** Open the first thing waiting on me.
- Stat tiles: classes in session now · notes unconfirmed past time · papers to check · approvals waiting. Then the
  "waiting on you" list (compact rows, one action each). Right panel opens any row.

### B2. Timetable (Week / Fortnight view) — Workspace
- **Job:** see what each class is taught when, and open any lesson.
- **Primary action:** Open today.
- **Left:** the grid (built in #709/#712): days across, periods down, subject-coloured blocks, bands for fixed periods,
  time printed once.
- **Right (block selected):** the lesson panel (B4). Coordinator also sees Move / Edit / Choose activity there (no
  buttons inside the blocks).
- **Right (nothing selected):** stat tiles for the shown week: lessons · % by subject (mini bar) · moved · clashes.
- The "lessons by subject" table is removed from this page; it becomes B3.

### B3. Time by subject (analytics) — Dashboard  *(new; **engine**: one read that sums lessons by subject and period)*
- **Job:** see how much time the class gives each subject, and whether it matches what the school intends.
- **Primary action:** choose the range (Week · Fortnight · Month · Quarter) and class (or all K2).
- Stacked bar per week (subject colours), a donut for the whole range, and a table: subject · minutes · % of
  teaching time · the school's target (from the timetable rules) · a chip Within / Over / Short.
- Clicking a bar segment opens that week's lessons of that subject in the right panel.

### B4. The lesson (and its activity) — Workspace  *(rework of /period and of the Activity button)*
- **Job:** teach this activity to this class and record, child by child, what each showed against its rubric.
- **Primary action:** Mark the class (the child grid).
- **Left: the class as a grid of child cards** (Sr. No. + first name, photo later), each card coloured by the level
  marked today (grey until marked). Tap a child → choose 0 / 1 / 2 / 3 (the activity's own words shown) or Absent / Not
  willing. "Mark the rest as expected" in one tap. Voice note button beside it (the note carries the lesson).
- **Right panel tabs:** **Activity** (objective in one line; steps as numbered bullets; what to lay out; watch for) ·
  **Rubric** (the four levels as coloured rows with their words) · **Materials** (bulleted, quantities) · **History**
  (last time this class did it; how many at each level then).
- No activity yet: the left says so; the coordinator gets **Choose an activity** (the engine's list for that kind of
  lesson). Nothing is invented.
- The curriculum-editing page of an activity (Keep / Send back / Where each part came from) stays under **School →
  Curriculum** for the coordinator only; a teacher never lands there from a lesson.

### B5. Class picture (Children) — Workspace
- **Job:** see where every child in my class stands, and act on the ones who need me.
- **Primary action:** Choose the skill (or "all skills").
- Stat tiles: secure · practising · needs help · not seen. **Left:** the class as a grid of child cards coloured by state
  on the chosen skill. **Right (child selected):** the child panel: tabs **Skills** (coloured list) · **Notes** ·
  **Papers** · **Report**. "A child" page is this panel opened full page.

### B6. Assessments — Board
- **Job:** move each assessment from made to results, and see what is stuck.
- **Primary action:** Make an assessment.
- Lanes: To approve and print · With the children · To read and check · Results in. **Compact cards:** title (topic +
  class), one line (date · n of m papers back), one status chip, one next-action button. No repeated stage text.
- Filters: one row (Class · Subject · Week) + "More filters".
- **Right (card selected):** the assessment panel: tabs **Copies** (each child's copy and its state) · **Upload**
  (drop zone, Drive link) · **Check** (answers waiting) · **Results**. **The separate Upload papers page is deleted**;
  uploading happens inside the assessment it belongs to.
- **Right (nothing selected):** stat tiles: papers waiting to check · answers to judge · overdue checks.

---

## Part C. Every other screen, one line each

| Screen | Verdict | Note |
|---|---|---|
| Notes / A note | keep, reshape to Workspace | list left, the note and its marks right |
| Record | merge into B4 | recording happens on the lesson |
| Fortnight (plan, freeze, move) | keep (#712) | right panel: state stepper, conflicts, Draft/Rules as tabs |
| Draft from the rules · Moves by hand | merged into Fortnight | already retired as pages |
| Materials | keep, reshape to Workspace | list by day left, a line's detail right |
| A child | becomes B5's panel opened full page | |
| Parent reports | keep, last (Nimish) | |
| Across classes | keep its job (Nimish locked it 22 Oct), reshape to Dashboard | stat tiles per class + one table: stage, overdue checks, papers missing > 3 days, children struggling in ≥2 subjects |
| An assessment / a child's paper | become B6's panel | full-page address kept for links |
| Upload papers | **delete** | inside B6 |
| Curriculum · Activity (editing) · Objective · Skill | keep for the coordinator under School | Workspace: list left, detail right |
| Skills to approve | keep, Workspace | one skill at a time on the right |
| Question bank / a question | keep, Workspace | |
| Staff · Classes | keep, Workspace | |
| What needs doing | merge into Today (coordinator) | it is the "waiting on you" list |
| How it works · Guide · Feedback · Login | keep as they are | |
| Blocks (the parts gallery) | keep, internal | |

---

## How we get there with the fewest tokens (the plan)

1. **This charter** — Nimish comments once; I fold the comments in. No building until then.
2. **One clickable mock** of the shell (sidebar + right panel) and the B4 lesson page, as a page Nimish can click,
   before any builder spends: the cheapest way to agree on "what good looks like".
3. **One shared PR**: sidebar (A1), detail panel with tabs (A2), stat tiles, chip and colour rules (A3–A4). This alone
   changes every page, because pages use the shared parts.
4. **The six screens**, one PR each, in this order: B4 lesson → B2 timetable → B1 today → B6 assessments → B5 class
   picture → B3 analytics (needs one **engine** read first, from the backend). Each PR shows its screen next to this
   charter and is merged only when it does the job written here.
5. **Part C** in small batches, mostly by adopting the shared parts; deletes/merges go with the screen that absorbs them.

Not a redo: the data, the engine calls and most components stay. What changes is the frame (menu, right panel), the
visual language, and each page's layout around its one job.
