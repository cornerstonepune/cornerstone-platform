# Timetable builder: design

Cornerstone School, Pune · K2 and Grades 1 to 4 · written 17 Nov 2026 · research and design only (nothing in the repo,
the database or Drive was changed; the live database was read with SELECT only).

## 0. The one-page answer

**Build the two-week pattern once, not every fortnight.** The repo already holds a class's timetable as a standing
week A / week B pattern (`timetable_rule` rows of kind `frame`) from which each fortnight's dated lessons (`session`) are
made. So the builder is four small jobs, each done once and then only touched when something changes:

| Job | Done how often | Who | Where it is kept (exists today) |
|---|---|---|---|
| 1. The day's shape (period times, assembly, lunch) | 2 to 3 times a year | coordinator | `period`, `frame` rows of cell `fixed` |
| 2. The pattern (which subject sits where in week A and B) | once, then small edits | coordinator | `frame` rows of cell `subject` / `specialist` |
| 3. The fortnight (holidays, events, moved lessons) | each fortnight, a minute | coordinator | `school_day`, `session`, the existing planner |
| 4. What is taught in each lesson (objective, activity) | each fortnight | educator | `session` (one new column) |

"Copy last fortnight" is therefore the default that needs no click: the next fortnight **is** the pattern, and the
builder only shows what is different (a holiday, six lessons that need a slot). The educator's job is the picker, which
continues each subject from where the class stopped.

Recommendations in one line each:

- **Phase 1 needs no solver.** Paint and fill tools, copy tools, and a checker in code get Grades 1 to 3 built next week.
- **Solver for Phase 2: Google OR-Tools CP-SAT**, in one adapter file, replacing FET once it passes FET's existing tests.
- **Schema cost of the whole design: nine columns on four existing tables, no new table.**
- **No model anywhere in placing, checking or ranking.** Code decides; a model may only propose a teaching order that
  code checks and a person accepts.

What is true on the live database today (read 17 Nov 2026), because the design depends on it:

| Fact | Live number | What it means for the builder |
|---|---|---|
| Classes | K2, G1, G2, G3 (one section each, 2026-27) | **There is no Grade 4 class row.** It must be added before Grade 4 can be built. |
| Period rows | 15, all K2 | Grades 1 to 3 have no day shape. Step 1 of the builder creates it. |
| Timetable rules | 150, all K2 `frame` (70 fixed, 69 subject, 5 specialist, 6 empty) | 15 periods x 5 days x 2 weeks. **No block or limit row exists.** |
| Lessons (`session`) | 1,049, all K2, 23 Nov 2026 to 25 Mar 2027, all `planned` | Nothing has been marked taught yet; 3 lessons carry an activity; none names its educator. |
| Teaching fortnights | 8, all in state `planning` | The cycle (freeze, align, approve, list sent) is built but not yet walked live. |
| Solver runs kept (`timetable_run`) | 0 | FET has never produced a live timetable; switching solver loses nothing live. |
| Open grants | 1 class teacher, 5 subject-educator grants over 3 people | Who teaches what is mostly not on record for Grades 1 to 4. |
| Objectives with a `topic_code` | 0 | Topics cannot order objectives today. |
| Activity to objective links | 2,669 links, 2,133 objectives, 2,224 activities | "Has an activity" can be ranked on today. |

## A. Principles

1. **Never a blank grid.** Every screen opens on something already there: the pattern, a copy of another class, or the
   school's fixed rows. "Clear" exists; "start empty" is never the first offer.
2. **Build the pattern, see the fortnight.** One grid, two lenses: *Pattern* (week A, week B) and *Fortnight* (dated).
   The coordinator never places the same lesson ten times.
3. **Counts before cells.** She says "Maths, 9 a week" once. The palette then shows "Maths, 3 left", and filling is
   painting or one button, not block by block.
4. **Every action can be undone**, one step at a time, and every change is kept with who made it (`change_log`, the one
   trigger that exists).
5. **Plain English, the school's words.** Educator (never teacher), regroup / exchange, Easy / Medium / Hard / Advance.
   No "constraint", "frame", "session", "solver", "hard / soft" on a screen: the words are *rule*, *pattern*, *lesson*,
   *Fill it in for me*, *Must* / *Try to*.
6. **A problem is a sentence with a way out.** What clashes, which rule, who set it, and up to three fixes worked out by
   code. Never a red cell with no words; never colour alone (UX rule 10).
7. **A person's choice is never overwritten.** Anything the machine places is marked machine-made and stays editable; a
   cell or a lesson a person set is pinned for every later automatic step.
8. **Code decides, a model may suggest.** Placing, checking, counting and ranking are code. n8n only triggers.
9. **The house look.** White page, three font sizes, the shared `Screen`, `Cards`, `StatusChip`, `SubjectTag`,
   `DetailPanel`, `FilterBar` blocks, terracotta for the one main action, dark top bar, the school's subject colours
   (`lib/subject-looks.ts`). Few words on the page; the detail is in the right panel on click.
10. **Desktop builds, phone reads.** Building is a 1440 px job. On a phone an educator sees her day and can choose what
    she teaches; nobody builds a pattern on a phone.

## B. The journeys

### B1. The coordinator, building Grade 2 for the first time

**The first 60 seconds.** She opens *Timetable > Build*. She sees four class cards. K2 says "Ready: Fortnight 12 is the
same as Fortnight 11, 1 holiday". Grade 2 says "Not started" with one terracotta button, **Start from K2's day**. She
clicks it. The grid appears already holding the day's periods and the fixed rows (assembly, fruit break, lunch,
dispersal) on all ten days. The right panel is open on *Rules* and its first line asks for the only thing the machine
cannot know: how many lessons of each subject a week. She has not placed a single block and the timetable is a third
full.

Steps after that:

1. **Day shape** (1 minute). Adjust period times in the panel's *The day* section (existing `period` rule). Fixed rows
   are painted across every day with one "every day" tick.
2. **Specialists first** (2 minutes). Music, art, PE, Hindi, Marathi and computing are the scarce people. She opens the
   *Specialists* lens (one educator, all classes side by side), and places each specialist's lessons there, so a clash
   between classes cannot be made in the first place.
3. **How many a week** (1 minute). In *How much*, a row per subject: `Maths [9] a week`. Prefilled from the class she
   copied.
4. **Fill.** Phase 1: pick a subject in the palette and paint; "Maths, 3 left" counts down. Phase 2: **Fill it in for
   me**, which places the rest under the rules and shows the result as a preview she accepts or discards.
5. **Week B.** Starts as a mirror of week A ("Week B is the same as week A"); she changes only what differs.
6. **Check.** The panel's *Check* tab says "All clear" or lists problems as sentences. She fixes or allows each.
7. **Publish Fortnight 12.** One button. The lessons are written for the dated fortnight; educators see them in My day.
8. **Every later fortnight**: open Build, read the one line of what is different, publish.

### B2. The educator, choosing what she teaches

**The first 60 seconds.** She opens *Timetable > Fortnight*. Her Maths lessons carry a dotted outline and the words
"Suggested: Fractions, halves and quarters". The suggestion is right for five of nine. She clicks the sixth, the picker
opens on the right with **Next up** already highlighted, she presses Enter. For English there is no known order, so the
picker opens on the whole subject, units in the order the school listed them, and she picks the unit once; from then on
English continues by itself too.

Steps:

1. Open a lesson (click, or arrow keys and Enter). The right panel is the picker (B, wireframe 3).
2. Take **Next up**, or **Same as last week**, or browse the subject.
3. Or plan a subject in one go: **Plan Maths for the fortnight**, choose a unit, **Spread**; code lays the unit's
   objectives over the nine lessons, she drags a boundary if one needs longer.
4. Optional: choose an activity for the objective (the linked ones first).
5. Nothing to approve. What she did not touch keeps the machine's suggestion, marked as such, editable until the
   fortnight freezes (after that a change asks for a reason, as today).

### Wireframe 1: builder home (`/timetable/build`)

```
+--------------------------------------------------------------------------------------------------+
| [logo]   Search...                                           Acting as: -      ?    Person       |  dark bar
+-----------+--------------------------------------------------------------------------------------+
| My day    |  Timetable > Build                                                                   |
| Timetable |  Build the timetable                                   [ Publish Fortnight 12 ]      |  terracotta
|  Week     |  One pattern per class; each fortnight follows it.                                   |
|  Fortnight|                                                                                      |
|  Build  < |  Fortnight 12 · 7 to 18 Dec · 1 holiday (Fri 11 Dec)                                 |
|  Materials|                                                                                      |
| Children  |  +-------------------+ +-------------------+ +-------------------+ +---------------+ |
| Assessm.  |  | K2                | | Grade 1           | | Grade 2           | | Grade 3       | |
| School    |  | Same as last      | | Day set, pattern  | | Not started       | | 2 problems    | |
|           |  | fortnight         | | 41 of 60 placed   | |                   | |               | |
|           |  | (v) Ready         | | (~) To finish     | | ( ) To do         | | (!) Fix now   | |
|           |  | Open              | | Continue          | | Start from K2's   | | See problems  | |
|           |  |                   | |                   | | day               | |               | |
|           |  +-------------------+ +-------------------+ +-------------------+ +---------------+ |
|           |                                                                                      |
|           |  Specialists: 3 educators, 0 clashes                         See the specialists >   |
|           |  Next: choose what is taught >                                                       |
+-----------+--------------------------------------------------------------------------------------+
```

One card per class (`Cards`: a title, one line, one status chip, one link). The states are the four work states that
exist (green done, amber waiting, red do now, grey to do). The main action is the next fortnight's publish and is
disabled, with the reason beside it, while any class has an open problem nobody allowed.

### Wireframe 2: the grid with the rules panel (`/timetable/build?class=G2`)

```
 Timetable > Build > Grade 2                                 Undo  Redo     [ Publish Fortnight 12 ]
 Grade 2 · pattern from 7 Dec                 ( Pattern | Fortnight | Specialists )   Week (A | B)

 Paint:  [Maths 3 left] [English 0 left] [Hindi 1] [Science 2] [GP 1] [Home Sci 1] [VE 0] [Clear]
+------------------------------------------------------------------------+  +-----------------------+
|        Mon        Tue        Wed        Thu        Fri                 |  | Rules   Check (2)   >| |
| 08:30  Assembly ------------------------------------------- (fixed)    |  |-----------------------|
| 08:45  Maths      English    Maths      English    Maths               |  | v The day             |
| 09:25  English    Maths      Hindi*     Maths      English             |  |   11 periods, 08:30   |
| 10:05  Fruit break ---------------------------------------- (fixed)    |  |   to 15:10     Edit   |
| 10:20  Hindi*     Science    English    PE*        [ ]                 |  | v Who teaches         |
| 11:00  Computing* [ ]        Science    Marathi*   Music*              |  |   Hindi: educator H   |
| 11:40  Lunch ---------------------------------------------- (fixed)    |  |   Mon-Thu only        |
| 12:20  GP         Art*       [ ]        Home Sci   Maths !             |  | v How much            |
| 13:00  [ ]        PE*        GP         [ ]        Value Ed            |  |   Maths    [9] a week |
| ...                                                                    |  |   English  [8] a week |
|                                                                        |  |   Most of one subject |
| * a specialist's lesson     ! a problem     [ ] free                   |  |   in a day:  [2]      |
| dotted outline = placed by the machine      solid = placed by a person |  | > Where it sits (3)   |
+------------------------------------------------------------------------+  | > Days off, events (1)|
 Row menu: Fill this period every day...   Column menu: Copy Monday to...    | + Add a rule          |
 Week B is the same as week A  [x]                                           +-----------------------+
```

- The grid is the existing `FortnightGrid` block given pattern cells instead of dated lessons; like `ClassGrid` it is a
  grid, not a table, so the ten-row table rule does not apply.
- The right panel is the page's `DetailPanel` (charter A2). With nothing chosen it holds two tabs, **Rules** and
  **Check**; with a cell chosen it holds that cell (subject, educator, why it is there, its problems) and a back arrow.
  The `>|` control folds it to a 44 px strip that still shows the Check count, and the choice is remembered per person
  (browser storage, a convenience only).
- Each rule section is a native collapsible; closed sections show their count. Sections with a problem open by
  themselves.
- **Pointer**: click a palette chip then click or drag across cells to paint; drag a placed lesson to move or swap
  (the existing move rules); Shift-click fills from the last cell to this one.
- **Keyboard**: arrows move the cell cursor, a letter picks the subject whose name starts with it (M Maths, E English;
  a second press cycles), Space paints, Delete clears, Enter opens the cell in the panel, Ctrl+Z / Ctrl+Y undo and redo,
  `[` folds the panel. Every control is at least 44 px.
- **Bulk**: row menu "Fill this period every day with...", column menu "Copy Monday to..." (days ticked), "Copy week A
  to week B", "Copy from another class...", "Clear the week" (asks once, undoable).

### Wireframe 3: choose what is taught (the picker, in the right panel)

```
+--------------------------------------------------+
| <  Maths · Grade 2 · Tue 8 Dec, 08:45         x  |
|--------------------------------------------------|
| Last taught: Fractions · equal parts (Thu 3 Dec) |
|                                                  |
| NEXT UP                                          |
| (o) Halves and quarters of a shape   2 activities|   <- highlighted; Enter takes it
|                                                  |
| REST OF FRACTIONS                     2 of 6 done|
| ( ) Halves and quarters of a set     1 activity  |
| ( ) Fractions on a number line                   |
| ( ) Word problems with fractions     3 activities|
| (v) Equal parts                  taught 3 Dec    |   <- grey, can be picked again
|                                                  |
| NEXT UNIT: Shapes and geometry               >   |
|                                                  |
| [ Same as last week ]  [ Plan Maths for the      |
|                          fortnight ]             |
| Search Maths...                                  |
| > All of Maths (24 units, in the school's order) |
|--------------------------------------------------|
| Activity for this lesson                         |
| ( ) Paper folding: halves and quarters   Easy    |
| ( ) Sharing rotis equally                Medium  |
| [ None yet ]                                     |
+--------------------------------------------------+
```

"Plan Maths for the fortnight" swaps the panel for a two-column sheet:

```
 Plan Maths · Fortnight 12 · 9 lessons            [ Spread ]   [ Same as last fortnight's unit ]
 Unit: [ Fractions v ]   4 objectives left
 Mon 7   08:45   Halves and quarters of a shape
 Tue 8   08:45   Halves and quarters of a shape
 Wed 9   08:45   Halves and quarters of a set        <- drag the line between two to give one longer
 Thu 10  09:25   Halves and quarters of a set
 Fri 11  holiday
 Mon 14  08:45   Fractions on a number line
 ...
 Left for next fortnight: nothing                                             [ Save 9 lessons ]
```

### Wireframe 4: a problem, explained

```
+--------------------------------------------------+
| <  Check                                      x  |
|--------------------------------------------------|
| (!) The Hindi educator is in two places          |
|     Wed week A, 09:25: Grade 2 Hindi and         |
|     Grade 3 Hindi (09:20 to 10:00) overlap.      |
|     Rule: an educator teaches one class at a     |
|     time. Built in; it cannot be switched off.   |
|                                                  |
|     Ways out                                     |
|     [ Move Grade 2 Hindi to Wed 11:00 ]  free    |
|     [ Swap with Grade 2 Science, Tue 10:20 ]     |
|     [ Show both classes side by side ]           |
|--------------------------------------------------|
| (~) Maths has 3 lessons on Friday                |
|     Rule: at most 2 of one subject in a day      |
|     (Try to; set by a coordinator, 12 Nov).      |
|     [ Move the 12:20 lesson to Thu 13:00 ]       |
|     [ Allow this once... ]   asks for a reason   |
|     [ Change the rule ]                          |
+--------------------------------------------------+
```

Each problem is: what and where (in the school's words, with times), the rule and who set it, then up to three fixes
that code has already checked are legal. A red problem (a *Must* rule) blocks publishing until fixed or allowed; an
amber one (a *Try to* rule) never blocks. "Allow this once" is the existing accepted-clash row with its reason.

### Wireframe 5: the phone (400 px)

```
+------------------------------+        What works on a phone
| [=]  logo      search   (P)  |        ---------------------------------------------------
| Timetable > Today            |        View only   : the day list (the existing DayOnPhone),
| Tue 8 Dec · Grade 2          |                      the week as a day-by-day list, rules as a
|------------------------------|                      read-only list, problems as a list.
| 08:30  Assembly              |        Editable    : what is taught in her own lesson (the
| 08:45  Maths                 |                      picker opens full screen, one column,
|        Halves and quarters > |                      44 px rows, Next up first), mark a
| 09:25  English               |                      lesson done or "did not happen".
|        Choose what to teach >|        Not offered : painting the pattern, rules editing, Fill
| 10:05  Fruit break           |                      it in for me, publish. The Build page
| ...                          |                      says "Open this on a computer to build"
+------------------------------+                      and shows the class cards read-only.
```

The picker is the only new `phone_gate` screen. Everything else must merely not break at 400 px (the existing smoke test).

## C. Starting structure

| Order | Option | When it is offered | Built from | Verdict |
|---|---|---|---|---|
| 1 | **Carry the pattern on** | A class that has a pattern (K2 today) | the `frame` rows, as `frame_lessons` already does | **The default; needs no click.** |
| 2 | **Start from another class's day** | A class with nothing (G1 to G3 today) | copy another class's `period` rows, fixed rows and, if ticked, its subject counts | **The default for a first build.** |
| 3 | **Copy week A to week B** / copy a day | Inside the grid | the same copy function at a smaller scope | Always there. |
| 4 | **Fill it in for me** | Phase 2, once counts and specialists are in | the solver, over all classes at once | The fast finish, never the start: it needs the counts and the specialists first. |
| 5 | Same fortnight of last year | Not built | nothing: there is no last year in the database and loading old sheets is on hold | Arrives for free in April 2027, because option 2 can copy from last year's class row. |
| 6 | Blank grid | Never the first offer | "Clear the week" | Kept as an escape only. |

Why "copy last fortnight" is not a button: a fortnight's lessons are made from the pattern, so last fortnight and this
one already agree unless someone moved a lesson by hand. Copying dated lessons would also copy one-off moves and
holidays, which is the wrong thing to repeat. What the founder asked for (get structure in place, then change the
activities) is options 1 and 2 for the structure and section D for the activities.

What a template is: another class's rows. No template table. "The school's usual day" is simply the class a coordinator
points at; the first one built becomes everyone's starting point.

## D. The picker: choosing the objective and the activity

### D1. What is known today, honestly

| The picker needs | Is it there? | Evidence |
|---|---|---|
| A lesson's objective | **No.** `session` has `activity_code` and `plan_entry_id`, no objective | live columns |
| What was taught last, per class and subject | **No direct record.** All 1,049 lessons are `planned`. "Taught" is recorded per *skill* for the assessment bank (`skill_set.taught`, `school_class.taught`: 4 skills across 2 classes), which is the "topics to mark as taught" job on What needs doing | live rows |
| A teaching order for objectives | **No column.** `topic.ord` exists but no objective has a `topic_code` | 0 of all objectives |
| Units inside a subject | Yes: `learning_objective.unit` (Grade 2 Maths: about two dozen units for about 120 live objectives) | live rows |
| The source order | Partly: codes run in the order the school's source listed them (`LO-G2-0480` Numbers to 1000, then Addition and Subtraction, Multiplication and Division, Fractions...). Objectives added later carry `N` codes that do not sort into place | live rows |
| Activities for an objective | Yes: `activity_objective` | 2,669 links |
| Noise to hide | Yes: a unit called "see source LO", one-off units such as a field visit or a celebration day, retired rows | live rows |

### D2. The smallest honest fix (three columns on two existing tables)

1. `session.lo_code` (text, linked to `learning_objective`): the one objective a lesson is mainly about. A column, not a
   link table: a lesson that touches more objectives reaches them through its activity's links, which exist.
2. `session.source` (`machine` | `person`, the repo's own convention): who chose the lesson's objective and activity.
   The suggestion job writes `machine`; any choice by a person writes `person` and is never overwritten.
3. `learning_objective.ord` (int): the teaching order within a grade and subject. Seeded once by code from the source
   order (four-digit codes by number; each `N` code placed at the end of its own unit), marked machine-made, and
   reordered by a coordinator by dragging units and objectives on the Curriculum page. A unit's order is the smallest
   `ord` it holds; no unit table is needed.

**Uncertainty to state plainly:** the source order is the order the school's documents listed things, which is probably
but not provably the teaching order. Before the picker trusts it, a coordinator should look at one subject (Grade 2
Maths) for five minutes and say whether the unit order is right. If it is wrong for a subject, that subject simply opens
on "All of the subject" until someone orders it, which is exactly the founder's fallback ("otherwise, for maths, show
the whole thing").

### D3. What "last taught" means (code, no model)

For a class and a subject, the **pointer** is the objective of the most recent lesson that (a) has an objective, (b) is
on a day already gone by, and (c) is not marked `not_done` or `moved`. A lesson marked `done` is certain; a past lesson
still `planned` counts for the suggestion only and shows "not confirmed", with one tap for "did not happen" (which
hands it to the existing delayed-lessons flow, and the pointer steps back).

When there is no pointer (every Grade 1 to 4 class today): the picker opens on the whole subject, units in order, and
the first choice she makes becomes the pointer. For Maths in Grades 1 to 4 there is one extra hint: an objective whose
linked skills (`learning_objective_skill`) are all marked taught for the class is shown as "probably covered". It is a
hint with thin data behind it (4 skills live), so it greys a row and never hides it.

### D4. The ranking (one pure function, `rank(objectives, pointer, taught, links) -> tiers`)

| Tier | Shown as | Rule | Data it reads |
|---|---|---|---|
| 1 | **Next up** (one row, preselected) | the first objective after the pointer in `ord`, in the pointer's unit, not yet taught to this class this year | `session.lo_code`, `learning_objective.ord`, `unit` |
| 2 | **Rest of the unit** | the unit's other objectives in `ord`; not yet taught first, then taught (greyed, with the date) | the same |
| 3 | **Next unit** | when the unit has two or fewer left: the first objectives of the next unit in order | `ord` |
| 4 | **All of the subject** | every unit in order as a folding list with "2 of 6 done", plus a search box; one-off and "see source" units last, under "Other" | `unit`, `retired`, `kind` |

Inside a tier, ties break in this fixed order: not yet taught this year, then has at least one activity for this grade,
then `ord`. The row shows the number of activities, never a score. Retired objectives never appear. If the pointer's
unit is finished, tier 1 is the first objective of the next unit and says "New unit".

K2 is activity-first, as today: its lessons carry an activity, the existing *Choose activity* offer (`/timetable/lesson/
offers`, by the lesson's head) stays the first thing shown, and the objective is read from the activity's links.

### D5. The one-click and many-at-once tools

| Tool | What code does |
|---|---|
| **Same as last week** | Copies objective and activity from the same subject's lesson in the same place one week earlier (week A to week B, or the previous fortnight's week B). For a topic that is simply continuing. |
| **Continue** (the suggestion job) | When a fortnight is published, code fills every lesson that has no objective with the next in sequence, as machine-made rows, live straight away (the standing order: nothing empty, marked machine-made, editable). Only for subjects that have a pointer and an order; others stay "Choose what to teach". |
| **Multi-select** | Tick several lessons of one subject in the fortnight grid (or Shift-click a range), choose once, all get it. |
| **Spread a unit** | `spread(objectives k, lessons n)`: if k <= n each objective gets `n // k` lessons and the first `n % k` objectives get one more, in order; if k > n the first n objectives get one lesson each and the rest are listed as "left for next fortnight". Holidays and fixed lessons are skipped. She can drag a boundary; the dragged boundary is a person's choice. |

There is no "approve all": suggestions need no approval (they are machine-made and live), and a person's edit is the
only thing that changes them, row by row.

### D6. What a model may do here

Nothing at pick time. Two offline jobs fit the house rule "a model may generate what code then verifies": proposing a
teaching order for a subject whose source order a coordinator rejects (code checks it is a complete reordering with
nothing added or dropped; a coordinator accepts it), and the existing activity skill proposing an activity for an
objective that has none. Both are prompts as rows with an eval, run through the engine on API credits.

## E. The rules panel

### E1. The rule types

Five sections in the panel, in the order a coordinator thinks. "Kept as" is the `timetable_rule` row; **bold** marks
what is new.

| Section | Rule in plain English (as shown) | Kept as | Must or Try to | Solver constraint |
|---|---|---|---|---|
| The day | "Periods run 08:30 to 15:10" (times, names) | `period` rows (exist); **`valid_from` / `valid_to`** so a year can hold 2 to 3 day shapes | Must | the slot grid |
| The day | "Assembly is 08:30 every day" | `frame`, cell `fixed` (exists) | Must | cell removed from the free set |
| Who teaches | "Hindi is taught by the Hindi educator" | the open `staff_role_grant` (subject educator for the class and subject, else the class teacher); no rule row | built in | gives each lesson its educator |
| Who teaches | "The Hindi educator is in school Mon to Thu" / "not free period 1" | **kind `away`** with **`staff_id`**, weekday, period or date | Must | educator's slot forbidden |
| built in | "An educator teaches one class at a time" | no row; always on | built in | at most one lesson per educator per overlapping time |
| built in | "A class has one lesson at a time" | the unique key on `session` and on the frame | built in | at most one per class per slot |
| How much | "Maths: 9 a week" (fewest and most) | `limit`, span `week` or `fortnight` (exists) | Must | sum of the subject's lessons within bounds |
| How much | "At most 2 of one subject in a day" | `limit` with **span `day`** | Try to (default) | per day sum <= most, with a penalty |
| Where it sits | "Spread Maths across the week" | `limit` span `day`, most 1 | Try to | the same |
| Where it sits | "No Maths after lunch" / "Maths in the morning" | `block` naming a subject (`subject_code`, column exists) on periods | Try to (default) | subject's slot forbidden or penalised |
| Where it sits | "No Maths straight after PE" | **kind `after`**: `subject_code` not directly after **`other_subject_code`** | Try to | forbids the adjacent pair |
| Where it sits | "No more than 2 lessons of a subject back to back" / "An educator has at most 4 in a row" | `limit` with **span `run`** (per subject, or per educator with `staff_id`) | Try to | sliding window sum |
| Where it sits | "Only one class in the computer room at a time" | **kind `share`** naming a subject | Must | at most one class has that subject per overlapping time |
| Days off and events | "Fri 11 Dec is a holiday" / "Sports day, Thu 17 Dec" | `school_day` (exists, with the planner) and `block` on a date (exists) | Must | the day or slot is not free |

Migration cost for all of it: four new columns on `timetable_rule` (`staff_id`, `other_subject_code`, `weight`, and `source` for F6), the
`kind` and `span` checks widened, `school_class_id` allowed empty for a rule about an educator, two dated columns on
`period`. No table. Rooms are not modelled: with one section per grade a class has its own room, and the only real
contention (computer room, ground, music room) is the `share` rule.

### E2. Must and Try to

- Two words only. *Must* stops publishing until fixed or allowed with a reason. *Try to* is counted and shown, never
  blocks.
- Stored as `timetable_rule.weight`: empty means Must; a number means Try to. The numbers come from config rows
  (`timetable.weights`: one per rule type), not from the coordinator. Untis exposes six slider levels per rule and its own
  help warns against overusing the top levels; a small school does not need that dial.
- The coordinator flips a rule between Must and Try to with one toggle on the rule's row. Built-in rules have no toggle.

### E3. How a rule is shown and edited

Each rule is one sentence with its values as inline controls: `Maths [9] a week`, `At most [2] of one subject in a day
(Try to v)`. Editing a value saves on blur, checks at once, and the Check count updates. "Add a rule" opens a short list
of sentence templates (the rows above), never a form of fields. Each row has a small history line on click ("set by a
coordinator, 12 Nov"), read from `change_log` as the Timetable rules page does today. The existing School > Timetable
rules page stays as the full list; the panel is the same engine door (`/timetable/rules/read`, `/change`) in a narrower
layout.

### E4. How a problem is explained

Sentences are built by code from the rule row and the places, the way `tt_need._say` and the `timetable_clash` view's
`detail` already do, moved to one place so the words are the same in the panel, the publish refusal and the solver's
report. Fixes are computed, not guessed: for a lesson in the wrong place, code lists the nearest slot that breaks no
Must rule, then the cheapest swap; each fix is run through the checker before it is offered. No model writes any of it.

When *Fill it in for me* cannot place everything: (1) the arithmetic checks that exist (`tt_need.checks`) name the rule
when the counts cannot fit the free cells; (2) otherwise the solver runs again letting each editable Must rule bend at a
high cost, and the report lists the fewest rules that had to bend, in words ("It fits if Hindi may be taught on
Friday"). This is the aSc idea of "test with relaxation", and it is more dependable than asking CP-SAT for an
infeasibility core, which community reports describe as not minimal and sometimes wrong (see I).

### E5. Who may edit

| Who | May |
|---|---|
| Coordinator, head (the existing `timetable.go_live_group`) | edit the day, the pattern and every rule; fill; publish; allow a problem once (the existing `timetable.accept_clash_group`) |
| Class teacher, subject educator | read the pattern and rules; choose what is taught in their own lessons; mark done or did not happen. Moving a lesson stays a coordinator's action, as today |
| Nobody | switch off a built-in rule |

A view, never a permission: the pages show by the staff row, the engine refuses by the group, as everywhere else.

## F. Architecture

### F1. The shape

```
 apps/web  /timetable/build  ──POST──>  engine api (thin)  ──>  w2_print/ tt_pattern   pattern door, copy, undo
   (Screen, FortnightGrid,                                                tt_check     the one rule evaluator + words + fixes
    DetailPanel)                                                          tt_publish   pattern -> dated lessons (wraps frame_lessons / go_live)
                                                                          tt_offer     the picker's ranking, spread, same-as-last-week
                                                                          tt_solve     builds the model, verifies the answer, keeps the run
                                                         adapters/cpsat.py             the only file that imports ortools
 n8n: one optional nightly trigger -> POST /timetable/lessons/suggest   (trigger and sequence only; no logic)
 Postgres: timetable_rule, period, session, school_day, fortnight, timetable_run, approval, change_log  (all exist)
```

All new engine files are W2 (assemble and print), each under 400 lines, each on a step in `workflows.json` (the map is
changed first, as `test_layout.py` demands). `tt_check`, the ranking and `spread` are pure functions with no database
in them, so they are tested without one.

### F2. Data model: reuse before add

Read against `docs/data-model.md`. **No new table.** Every addition and why it cannot be less:

| Change | Why a column and not less |
|---|---|
| `session.lo_code` | The lesson's objective exists nowhere; an activity link cannot stand in because a Grade 1 to 4 lesson may have an objective and no activity. |
| `session.source` | Machine-made versus person-made must be on the row a later job would overwrite; the history table answers "who" but is too slow and indirect to gate a write. |
| `learning_objective.ord` | No order exists; `topic.ord` cannot serve while no objective has a topic. |
| `timetable_rule.staff_id`, `.other_subject_code`, `.weight`, `.source` | New rule kinds are rows in the shared table (the rule the data model sets); they need a person, a second subject, Must versus Try to, and machine versus person on a pattern cell. Typed columns, not a JSON blob (ADR 0086: a rule's parts are its columns). |
| `period.valid_from`, `.valid_to` | A year has 2 to 3 day shapes; today a period has no dates, so a second shape would show both. |
| `timetable_clash` view gains kind `educator` | Clashes across classes are not detected today: the view checks blocks and limits inside one class only. |

That is nine columns in all across four tables; the picker itself needs three.
A pattern-made draft and a solver run are both rows of the existing `timetable_run` (who made it goes in its `report`).
Subject names: the timetable uses its own short heads (`math`, `story`) mapped by config (`timetable.heads`,
`core/subject_map`), while objectives and grants use the subject table's codes (`NUM`, `ENG`). Grades 1 to 4 should use
the subject table's codes directly as their heads; this is config rows, not schema, and it must be settled in the
Phase 1 spec because the picker joins on it.

Migrations run one at a time (the house rule): one for Phase 1 (rules, period dates, the view), one for Phase 2
(lesson objective, source, order).

### F3. Engine endpoints

All `POST`, keyed, beside the existing `/timetable/...` routes. *Italic* = exists today and is extended.

| Endpoint | In | Out |
|---|---|---|
| `/timetable/build/home` | year | per class: has a day, cells placed of total, next fortnight and what differs, open problems, state word |
| `/timetable/pattern/read` | class, as-of date | periods, week A and B cells (kind, subject, words, educator, machine or person), subject tallies against their counts, problems |
| `/timetable/pattern/change` | class, from-date, list of cell changes (set or clear), reason if a frozen fortnight is reached | the new pattern, problems, and the inverse change list (the Undo) |
| `/timetable/pattern/copy` | to class, from class or "week A" or a weekday, what to copy (day, fixed rows, specialists, subjects, counts), from-date | the new pattern, problems, the inverse |
| `/timetable/pattern/check` | classes (default all) | problems and unmet wishes, each: kind, sentence, rule, places, fixes |
| `/timetable/publish` | class or all, fortnight, `dry` | lessons written or moved, lessons needing a slot, refusal with its sentence |
| `/timetable/solve` | classes, keep (`person` cells or everything placed), seconds | run ids, outcome (`placed`, `unmeetable`, `not_found_in_time`), the draft, unmet wishes, rules that had to bend |
| `/timetable/solve/use` | run ids | writes the pattern cells as machine-made; the inverse |
| *`/timetable/rules/read`*, *`/change`* | as today, plus the new kinds | as today |
| *`/timetable/lesson/offers`* | lesson | the tiers of D4 and the activities for the chosen objective |
| *`/timetable/lesson/edit`* | lesson, plus `lo_code` | as today |
| `/timetable/lessons/fill` | class, subject, fortnight, mode (`list`, `spread` with a unit, `same_as_last_week`, `continue`), `dry` | the lessons as they would be or now are; what is left over |
| `/timetable/lessons/suggest` | fortnight | how many lessons got a machine-made suggestion (the nightly job; idempotent) |

Existing and untouched: `/timetable/move`, `/delayed`, `/day/mark`, `/day/needs-slot`, `/clash/accept`, `/go-live`,
`/day`, `/week`, `/period`, `/time`. CLI twins (`bin/engine timetable pattern ...`, `solve`, `publish`) follow the
existing `cli_timetable.py`.

### F4. Draft, published, frozen

No second state machine. The fortnight's existing states stay; the builder adds one moment before them.

| Word on screen | What exists | Who sees it | Changing it |
|---|---|---|---|
| **Draft** | the pattern (rule rows) only; the Fortnight lens is a preview worked out from pattern, holidays and events; no lesson rows | coordinators | free, undoable |
| **Published** (`planning`) | lesson rows for the dated fortnight, written by Publish | everyone, in My day and Week at once (those pages read `session` directly) | pattern edits apply from the next unpublished fortnight; this fortnight changes by move, edit, holiday (the existing tools), each kept in `change_log` |
| **Frozen** and after (`frozen`, `aligned`, `approved`, `list_sent`) | as today | everyone | a reason is asked (the existing `ensure_editable`); a Must problem must be fixed or allowed |

A pattern change always carries a from-date (default: the first day of the next unpublished fortnight), written as the
existing rules already are: the old cell's `valid_to` is the day before, the new cell's `valid_from` is the date. So a
published fortnight is never changed by a pattern edit, and the old pattern stays readable for any past date.

Re-publishing a fortnight whose pattern changed after publish uses the existing go-live path (it moves each planned
lesson to its subject's new place, keeping its id, plan line, objective, activity and materials links), fed a draft made
from the pattern instead of from FET.

**Honest note:** today K2's lessons are visible to educators while their fortnights are in `planning`; there is no
"hidden draft" of dated lessons, and this design does not add one. Draft means "not yet written as lessons".

### F5. How a published change reaches My day

My day, Week and the phone day read `session` rows on each request, so a change is there on the next load; nothing is
cached or pushed. What is added: a line on the educator's Today for a change to her own lessons after publish ("2 of your
lessons moved this week"), read from the `change_log` rows of op `move` and `edit` that already exist, through the
existing notify adapter if the school wants a message. No new store.

### F6. Machine-made and person-made; the audit trail

| Thing | Marker | Rule |
|---|---|---|
| A pattern cell | `timetable_rule.source` | the solver and copy write `machine`; a paint, move or edit writes `person`; the solver pins every `person` cell |
| A lesson's objective and activity | `session.source` | the suggestion job writes only where the objective is empty or the row is `machine`; a person's choice is `person` for good |
| A lesson's place | the `change_log` row of op `move` (exists) | re-publish and holiday re-placing never move a lesson a person moved, without asking |
| A solver run | `timetable_run` (append-only, exists): the exact input, output, seed, seconds, solver version, outcome | every run kept, used or not |
| Who and when | `change_log` by the one trigger (rules, periods, lessons, fortnight state); `approval` rows for publish, go-live, an allowed problem | staff id, never a name |

Undo is not a table: each change returns its inverse, the page holds the last 20, and applying an inverse is one more
change in the history. After a reload the history list ("12:04 Copied week A to week B: undo") offers the same from
`change_log`.

### F7. The solver: where it runs, how long, what it may not do

- **Where.** In the engine's own process on the server, called by `/timetable/solve`, through
  `adapters/cpsat.py` (ring C: the only file that names it). The adapter takes a plain description (classes, slots,
  lessons with their educator, pinned cells, rules as numbers) and returns placements; it knows nothing about the school.
  `tt_solve` builds that description from rows and reads the answer back. n8n is not involved.
- **Scope.** The pattern, all classes together (educator clashes are between classes). Also the existing "re-place the
  lessons that need a slot" after a holiday, over dated cells.
- **Size.** About 4 to 5 classes x 10 days x 8 to 10 free periods x about 12 subjects: a few thousand yes/no
  variables. **Estimate, not measured:** well under 5 seconds. Budget: 10 seconds on screen with a progress line, the
  existing `timetable.solve_seconds` row (120 live) as the ceiling, after which the best answer found is shown as
  `not_found_in_time`.
- **What it optimises.** Fewest broken *Try to* rules (by weight), then fewest cells changed from the current pattern,
  so pressing the button twice does not reshuffle a week people have learned.
- **Same input, same answer.** One worker and the seed from the existing `timetable.seed` row.
- **Code has the last word.** Every answer is run through `tt_check` before it is shown; an answer that breaks a Must
  rule is discarded and recorded as a failure. The solver proposes a placement; it never writes one.
- **A model's part: none.** Not in building the model, not in the explanation.

### F8. Failure modes

| What goes wrong | What the person sees | What the system does |
|---|---|---|
| The counts cannot fit (more lessons than free cells) | "Maths needs 9 a week and week A has 7 free places" before any solve | `tt_need.checks`, as today |
| The rules contradict | "It fits if ..." with the fewest rules to bend | second solve with bending (E4) |
| Out of time | the best partial answer, the unplaced lessons listed, "Try again with longer" | run kept as `not_found_in_time` |
| The solver library is missing on the machine | "Fill it in for me is not available; you can still place lessons by hand" | the adapter raises as `FetMissing` does today; painting never depends on it |
| Two coordinators edit one class | the second save says the pattern changed and shows the other's change | each change carries the version it was made on; a stale one is refused, nothing merged silently |
| A pattern edit would reach a frozen fortnight | a reason is asked | the existing gate |
| A specialist's grant is missing | the lesson shows "no educator named" (amber) and the educator-clash check skips it, saying so | never a silent pass |
| No order for a subject | the picker opens on the whole subject | D2 |
| A unit's name is noise ("see source LO") | sits under "Other", last | D4 |
| The suggestion is wrong | she changes the lesson; it becomes hers | D5 |

## G. Phasing

Effort is in working sessions (one session: one spec built test-first to a green core CI). Schema changes are
sequential. Each screen ships as its own small pull request.

### Phase 1: a coordinator can build Grades 1 to 3 next week (no solver)

Scope: the Build page; day shape by copy; paint, fill, copy week A to B, copy from a class; the checker with sentences
and computed fixes; the rules panel (the four kinds that exist, plus "most in a day", educator availability and the
educator clash); publish; undo.

Done when (each a test):

1. A class with no periods, given "start from" another class, has that class's periods and fixed rows on every weekday
   of weeks A and B, and nothing else.
2. One `pattern/change` call with 12 cell changes writes all 12 or none, and returns an inverse that, applied, leaves
   the pattern equal to what it was.
3. "Fill this period every day" and "Copy week A to week B" each produce the expected cells and never replace a `fixed`
   cell.
4. A pattern change dated from a fortnight leaves every lesson of an earlier published fortnight unchanged.
5. Two classes given the same educator at overlapping times (different period rows, overlapping clock times) produce
   exactly one `educator` problem whose sentence names both classes, the day and the times; non-overlapping times
   produce none.
6. A subject over its "most in a day" produces a Try to problem that does not stop publish; over its weekly most produces
   a Must problem that does.
7. Every fix offered for a problem, when applied, removes that problem and adds no Must problem.
8. Publish writes one lesson per non-empty pattern cell per school day of the fortnight, none on a holiday, and is
   refused with its sentence while a Must problem is open and not allowed.
9. A person outside the coordinators' group is refused by every write endpoint and can read the pattern.
10. A period layout with a `valid_to` is not offered for a date after it.
11. The Build page at 1440 px has one h1, one main action, the panel folds and unfolds by keyboard, and at 400 px
    renders with no sideways scroll and no paint controls.

Effort: 6 sessions (1 spec and migration; 2 engine: pattern door, copy, check, publish; 2 web: page, grid, panel;
1 keyboard, undo, phone, polish). Risks: the head-code versus subject-code mapping for Grades 1 to 4 (settle in the
spec); `timetable/page.tsx` is 13 lines under its ceiling, so Build must be its own route; data that is not code must
be entered first (a Grade 4 class row, who teaches which subject in each class); "next week" holds only if the spec is
approved by Wednesday.

### Phase 2: the picker with sequence, and Fill it in for me

Done when:

1. Given a class whose last past Maths lesson has objective X, `offers` returns as Next up the objective after X in
   order within X's unit, and X's unit's remaining objectives as tier 2 in order.
2. With no pointer, `offers` returns the whole subject, units in order, one-off units last, no retired objective.
3. Within a tier, a not-yet-taught objective with an activity ranks above one without, above one already taught.
4. `spread` over k objectives and n lessons returns the split defined in D5 for k < n, k = n and k > n, skipping
   holidays, and lists what is left.
5. "Same as last week" copies objective and activity from the lesson one week earlier and refuses, saying why, when
   there is none.
6. The suggestion job fills only lessons with no objective or a machine-made one, and a second run changes nothing.
7. A lesson a person set is unchanged by the suggestion job, by spread on other lessons, and by a re-publish.
8. `solve` on the fixture school places every needed lesson with no Must problem, keeps every person-made cell where
   it was, and gives the same answer twice with the same seed.
9. `solve` on a fixture that cannot be met returns `unmeetable` with at least one rule named in words, and writes
   nothing.
10. An answer that breaks a Must rule (injected in the test) is discarded and recorded as a failure.
11. The existing CP-11 generator proofs pass with the new adapter in FET's place.
12. The picker passes the phone gate at 400 px.

Effort: 7 sessions (1 migration and order seed; 2 ranking, fill, suggest; 2 picker and plan-a-subject screens; 2 solver
adapter, model, bend report, parity with CP-11). Risks: the source order is wrong for some subjects (mitigation: the
five-minute check, and the fallback); too few lessons get marked done, so the pointer leans on "not confirmed"
lessons; solver parity takes longer than two sessions (mitigation: FET stays until the proofs pass).

### Phase 3: what-if, cover, and views for others

Done when:

1. A what-if copy of the pattern can be changed and checked without changing the live pattern, and can replace it in
   one action or be dropped. (Kept as pattern rows with a future from-date and a label; no table.)
2. Marking an educator away for a date lists her lessons and offers, for each, the educators free at that time, ordered
   by fewest lessons that day; choosing one writes `session.led_by_staff_id` and a history row.
3. An educator's own week across classes (the Specialists lens for one person) is a page she can open and print.
4. A parent-facing week shows subjects and times only, the word educator, and no name.
5. A coordinator can reorder units and objectives on Curriculum by dragging, and the picker follows at once.

Effort: 6 to 8 sessions. Risks: cover needs every lesson's educator on record; parent views need the privacy review
that every parent screen gets.

## H. Decisions for the founder (six)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Do coordinators build a two-week **pattern** that every fortnight follows, or each fortnight on its own? | **The pattern.** It is how the system already keeps K2, it makes "copy last fortnight" automatic, and it is the only way the work is not block by block. |
| 2 | Which solver for "Fill it in for me": keep FET, or move to OR-Tools CP-SAT? | **CP-SAT, replacing FET** once it passes FET's tests. It can keep people's cells, change as little as possible, and say which rule must bend; its licence is permissive. Cost: about two sessions. FET has produced no live timetable, so nothing live is lost. |
| 3 | May a past lesson nobody marked count as taught, for suggesting the next one? | **Yes, for the suggestion only**, shown as "not confirmed", with one tap for "did not happen". Otherwise the sequence stalls the first week nobody ticks. |
| 4 | Accept the school's source order as the teaching order to begin with? | **Yes, marked machine-made**, after a coordinator checks Grade 2 Maths for five minutes; coordinators fix the rest by dragging. Waiting for a reviewed sequence for 2,593 objectives would hold the picker for weeks. |
| 5 | Should next fortnight's lessons arrive already filled with the next objectives? | **Yes** where a subject has an order and a starting point (the standing order: nothing empty, machine-made, editable). Elsewhere the lesson says "Choose what to teach". |
| 6 | Rules: two strengths (Must / Try to) and no rooms, or weights and rooms? | **Two strengths, no rooms.** Shared spaces are one rule ("one class at a time in the computer room"). Add rooms only if a second section per grade arrives. |

Also needed from the school before Phase 1 is useful (data, not decisions): a Grade 4 class row; which educator teaches
which subject in each of Grades 1 to 4; each grade's period times; the specialists' days.

## I. What I looked at

### I1. Products (competition and reference)

| Product | URL opened | How a user starts; rules; conflicts | Take or avoid |
|---|---|---|---|
| aSc Timetables | https://www.asctimetables.com/ | "Simply enter your requirements", then an automatic generator; cover advice for absent staff; an AI panel to type changes | **Take:** lessons as cards with a count left to place; "test with relaxation" to say which rule must loosen (help articles, see I3). **Avoid:** a data-entry marathon before anything shows. |
| Untis | https://webhelp.untis.at/HTML/WebHelp/uk/untis/opgewichtung.htm | Weighting dialogue: a slider per rule, six levels from 0 unimportant to 5 extremely important | **Avoid:** a dial per rule. Two words (Must / Try to) instead. |
| TimeTabler | https://www.timetabler.com/ | A Basic Data screen with five large buttons worked left to right; subjects get colours; a Visual Builder for drag and drop; class, staff and room views side by side | **Take:** steps in a fixed left-to-right order; the same timetable seen by class and by educator. |
| PlanbookEdu | https://help.planbookedu.com/help/writing-plans/bump-plans-forward/ | "Bump" moves a day's plans to the next teaching day and shifts later ones; locked plans stay; skips days off; Undo link at the top | **Take:** bump with an Undo, and "locked stays put" (our person-made pin). We have this as the delayed-lessons flow; keep its words that plain. |
| Planbook | https://help.planbook.com/knowledgebase/articles/2005963-how-to-create-a-cycle-schedule | A cycle schedule is set once per school year: number of days in the cycle, a name per day ("A Day", "B Day") | **Take:** the cycle is set once, not per week; confirms the pattern approach. |
| Toddle | https://www.toddleapp.com/planning/ | Yearly, unit and weekly plans in one place; scope and sequence from a standards library; coverage tracked | **Take:** "2 of 6 done" coverage per unit in the picker. Timetabling itself is not described on that page. |
| Edumerge (Indian school ERP) | https://www.edumerge.com/products/school-erp/timetable-substitution-management | A time-structure wizard, a scheduling-policies wizard (consecutive limits, first and last period, gaps), a drag grid; conflicts "flagged during construction; resolved before publishing"; substitution entries with history | **Take:** check while building, block only at publish. **Avoid:** two wizards before the grid; ours is one panel beside the grid. |

The five ideas worth copying: (1) the cycle or pattern is built once; (2) counts first, then cards with "n left";
(3) the same timetable by class and by educator, so cross-class clashes are prevented, not found; (4) check while
building, with a relaxation test that names the rule to loosen; (5) bump with undo and pinned lessons.

The traps: (1) data entry before any visible result; (2) a weight dial on every rule; (3) a generator that reshuffles
everything on each run; (4) red cells with no sentence; (5) wizards that hide the grid.

### I2. Solvers and repositories

| Project | URL opened | Licence | State | Verdict |
|---|---|---|---|---|
| **Google OR-Tools (CP-SAT)** | https://github.com/google/or-tools · https://developers.google.com/optimization/scheduling/employee_scheduling · https://developers.google.com/optimization/cp/cp_solver | Apache-2.0 | 14.4k stars, about 15,800 commits; Python package `ortools`; integer-only; statuses OPTIMAL, FEASIBLE, INFEASIBLE, UNKNOWN; the scheduling guide shows hard rules plus a weighted objective for requests | **Recommended.** A Python library inside the engine (no fourth language, no separate program), a true weighted objective for Try to rules and for "change as little as possible", permissive licence for a public repo. |
| FET | https://lalescu.ro/liviu/fet/ · https://lalescu.ro/liviu/fet/features.html | AGPL-3 | Active (the site listed 7.12.1 dated 11 Nov 2026); teachers, student sets, rooms, min and max days between activities, max hours daily and continuously; every constraint weighted 0 to 100 % | **In the repo today** (`adapters/fet.py`, run unmodified as a separate program; installed in the engine image and CI). Good at school timetables. Retire after parity: the adapter as written places one class with no educators, weights are not an objective, and it has no "stay close to the current timetable". |
| Timefold Solver | https://github.com/TimefoldAI/timefold-solver · https://github.com/TimefoldAI/timefold-quickstarts | Apache-2.0 (community); enterprise edition commercial | Java and Kotlin, JDK 21+; has a school-timetabling quickstart (lessons to timeslots and rooms) | Rejected: a JVM is a fourth language and a second runtime. |
| Timefold Solver for Python | https://github.com/TimefoldAI/timefold-solver-python | Apache-2.0 | **Archived** (the page said read-only since 6 Nov 2026); needed a JDK; its own README called it much slower than Java | Rejected. |
| UniTime | https://github.com/UniTime/unitime | Apache-2.0 | Java, university course and exam timetabling, a distributed system | Rejected: wrong scale and stack. |
| Python-MIP | https://github.com/coin-or/python-mip | EPL-2.0 | Python front end to the CBC and Gurobi solvers | Rejected: mixed-integer modelling is a clumsier fit than CP-SAT for the same problem. |
| opentimetables | https://github.com/rocristoi/opentimetables | none stated on the page | 2 commits, 2 stars; Python and OR-Tools; data as JSON | Ideas only; with no licence stated, copy no code. |
| OR-Tools versus FET (a vendor's note) | https://kinyoubiatelier.pages.dev/notes/or-tools-vs-fet-comparison/ | n/a | Says FET suits one school with standard rules, and OR-Tools costs engineering (encoder, explanations, snapshots) rather than licence | Fair warning, from a company that sells its own solver. Our answer: the encoder is small at this scale and the explanation layer is needed whichever solver is used. |

**Licence, for a public repo.** OR-Tools under Apache-2.0 is a normal dependency: keep its notice, nothing else follows.
FET under AGPL-3 is used the careful way already (unmodified, a separate program, never linked), and removing it removes
the question altogether. This is an engineer's reading, not legal advice.

**What stays code, what a model may do.** Code: the needs arithmetic, the model given to the solver, the check of its
answer, every count, every sentence, every fix, the ranking, the spread. Solver: proposes a placement, which code
verifies. A model: may propose a teaching order or an activity offline, each checked by code and accepted by a person;
never a number, a placement or a verdict.

### I3. What I could not verify

- **aSc's help articles** on testing, relaxation and "analyze by generation" (help.asctimetables.com, articles 130,
  540, 596, 1183, 1185): I saw them only as search-result summaries; the one I tried to open returned an error.
- **Untis's advice** to use the top weighting levels sparingly, and its diagnosis tools: from search summaries of its
  web help; the page I opened confirmed only the six slider levels. The Untis product page I tried returned "not found".
- **CP-SAT's infeasibility explanation** (`sufficient_assumptions_for_infeasibility`) being non-minimal or faulty:
  from search summaries of the OR-Tools discussion group and issue tracker, not opened. The design does not depend on
  it (it uses the bend-and-report solve instead).
- **Solve time**: an estimate from problem size. Nothing was run.
- **Not researched at all**: Edval, Bromcom, Arbor, SIMS, MyEd, TeacherMatic, Chalk (search summaries only), Teachmint,
  Fedena, Entab, MyClassboard (no usable product pages found), Google Calendar's editor. planbook.com's home page
  returned only its title.
- **UX patterns** (collapsible rule panels, click or drag to assign, bulk fills): I did not find or open a dedicated
  design source; section B draws on the products above and on this repo's own UX rules.
- **FET's version in production**: the site's latest and the Debian package the engine image installs differ; I did not
  check which version the live engine runs.
- **The teaching order**: that code order equals teaching order is an inference from one subject's codes (Grade 2
  Maths). It needs a coordinator's eye before it is relied on.
- **How lessons get marked done today**: the column and the reading code exist (`session.state`, used by Time by
  subject), and every live lesson is still `planned` because the first one is on 23 Nov. I did not trace the screen that
  sets it.
- **Whether Grade 4 has no class on purpose**: the live database has none; the brief says K2 to Grade 4.
