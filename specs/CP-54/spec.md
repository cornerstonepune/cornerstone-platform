# CP-54: The learning objective is the atom — one chain from evidence to capable, kind, unafraid

Issue #775. Copied from the issue as approved on 16 Nov; the issue is the record.

**Status:** APPROVED by Nimish in chat, 16 Nov ("approved, coordinators check; go ahead"). Agreed in chat on 16 Nov:
- **The learning objective (LO) is the atom.**
- **The decisions at the end were settled the same day.**

The whole picture is drawn in the architecture page linked from the chat.

## Why

The mapping was done (`docs/spine/spine.json`, ADR 0037: 13,463 links from the three words down to skills), but it lives in a file the product never reads. The tables the product does read are not joined into one chain. Counted live on 16 Nov:

| Link | Today |
|---|---|
| Subject | 2 rows (Maths-Number, English). LOs carry 34 subject spellings as text, activities about 30 more. K2 alone uses 22, mixing subjects, routines, parts of subjects and character areas |
| Topic | 14 rows. LOs carry 422 "units" as text; 22 match a topic |
| LO → registry skill (the thread across grades) | 3,715 links; 6 LOs have none; 1,703 of the links are the machine's |
| Engine skill (the 155 the papers test) → LO | **none**. They are written like LOs but are joined to none of the school's 2,942 |
| Activity → LO | K2: 976 of 977. N, PG, K1: no LOs exist. G1–G4: LOs, no activities |
| Capability (8) and words (3) | **not in the database**; only in the spine file |
| Behaviours (204, where kind and unafraid live) | **not in the database**; council-reviewed draft |
| LO → capability | **none** in the database |

So the child's graph today stops at engine skills, for Maths and English only. Nothing reaches capable, kind or unafraid.

## What

One chain, with the LO as the atom:

```
evidence (a question answered · a rubric mark · a note)
   └─► learning objective        ← every piece of evidence lands on exactly one LO
         ├─► registry skill       the thread across grades: growth over years
         ├─► topic → subject → grade
         └─► capability (one of 8) → capable · kind · unafraid
```

An activity may name several LOs. Each row of its rubric is one LO. A project ("build a balloon cart") names its core LO (Newton's third law → capable) and the character LOs it also tests (turn-taking in the team → kind; testing again after a failure → unafraid). An LO has one capability; an activity reaches several through its LOs.

1. **One subject list.**
   - Every LO and activity names a `subject` row, or is marked a routine (CP-52's routine).
   - G1–G4 spellings are mapped once, in seed data.
   - **K2 is mapped by its own agent** (point 10), because K2's 22 labels mix four things:
     - subjects: English, Maths, Hindi, FMS, GMS, Science & Geo, Arts & Crafts, Music…
     - routines: Circle Time, Assembly
     - parts of a subject: Rhymes & Songs and Story Telling → English
     - character areas: Empathy & Happiness, Curiosity, Critical Thinking, Expression → character LOs
2. **Topics.** Every academic LO names a topic of its own subject. A unit that matches no topic gets a machine-made topic.
3. **Skill threads.** Every academic LO links to at least one registry skill.
4. **Engine skill → LO.** Each engine skill names the one school LO it tests. One LO may have several engine skills (finer slices). Where no school LO fits, a machine-made LO is added. Paper evidence then reaches the LO through its engine skill.
5. **Capabilities and words as rows.** The 8 capabilities and 3 words are loaded from the spine, worded exactly as the graduate profile.
6. **Behaviours are LOs.** The 204 behaviours, and K2's character areas, become LOs of kind *character*, each with its stage, its capability and its words. A note or rubric mark on one is evidence like any other.
7. **LO → one capability.**
   - Every LO names exactly one capability (the council's "one owner per moment").
   - Code drafts the link from the spine path (LO → registry skill → unit → NCF competency → capability) where that path gives one answer.
   - Where it gives several, a model chooses from the shortlist code hands it.
8. **Machine-made is live, tagged and checked as the work comes up** (Nimish, 16 Nov, replacing CP-51's "feeds nothing until approved" for these links):
   - Everything the machine makes is live at once and carries the machine mark ("machine-made, to check"), filterable on every list.
   - It counts in a child's picture. The picture says how much of it rests on unchecked links.
   - A person's correction changes the link. Because the picture is rebuilt from the evidence, which stays where it was recorded (on the activity or the question), the picture corrects itself. No evidence is rewritten.
   - **Checking is just in time.** At the start of each week or fortnight, the coordinator is shown only the unchecked links the coming lessons use.
   - **One gate stays:** a line of a parent report never rests on an unchecked link.
9. **The child's graph rolls up the chain.** A child's state per LO is rolled up to the skill thread, topic, subject, capability and word. It is a pure function of ring A, rebuilt by `engine graph`.
10. **The K2 mapping agent.**
    - One engine run proposes K2's subjects and places every K2 LO and activity into a subject and topic, a routine, or a character LO with its capability.
    - Inputs:
      - the K2 Planning Sheet
      - the 1,192 K2 LOs
      - the 977 K2 activities
      - the spine's foundational stage
    - Code decides what it can (exact names, the routine list in config). The model chooses only from lists code gives it.
    - Its prompt is a row. It is scored against about 30 cases the K2 coordinator classifies by hand, and runs only once its score is recorded.
11. **Every LO reads as something a child does.** Counted on 16 Nov (an approximate sort by pattern, rows checked by eye only in samples): of G1–G4's 1,750 LOs about 767 read as an objective; the rest are empty (~236), a heading ("Title: …", ~219), a syllabus list ("Reading: The Kite Fighters, …", ~148), a topic name only (~266) or a purpose ("Encourages creativity…", ~114). In K2, ~491 of 1,192 state the activity's purpose ("Will help them…") rather than what the child does. A heading or empty row is folded into the unit it heads or removed; a purpose, list or topic name is rewritten by a model into one observable statement ("The child …"), its source text kept beside it, machine-marked and live (point 8). Code decides which rows need it; the model writes only the wording; its prompt is a row with an eval scored against ~30 rows a coordinator rewrites by hand. This runs before point 7, because a capability is judged from the wording.
12. **On screen.**
    - Curriculum and Skills read Grade → Subject → Topic → LO → Activity, with capability, words and the machine mark as columns.
    - One LO page shows its whole chain in both directions.
    - The coordinator's "check this week" list (point 8).

**Data model** (read against `docs/data-model.md`):
- **One new table, `capability`** (8 rows: code, name, profile sentence, words). It cannot be a column or a `config` list: people edit it, code reads its attributes, and LOs point at it by key.
- **The words** are a `check` rule on `capability.words`. Their meanings are a `config` row.
- **Everything else is columns on existing tables:**
  - `learning_objective`: `subject_code`, `topic_code`, `kind` (academic | character), `stage`, `capability_code`, and each link's origin (sheet | machine | person, CP-48's three values)
  - `skill`: `lo_code`
- **Rollups:** derived state goes in views where a view is fast enough; a ring-B table only with its reason written in the plan.
- **Order of changes:** the schema changes land one at a time, in this order: subject, topic, capability, LO columns, skill → LO.

## How it ships (one full CI run, not one per step)

- **One branch, one pull request, a draft until the end.** A draft runs only CI's quick checks (`bin/ci-plan`).
- **The schema changes are commits in order inside that one branch.** "One database change at a time" forbids parallel branches, not several migrations in one.
- **On each step the builder runs locally only that step's tests**, plus `bin/check`, tsc and eslint.
- **The pull request is marked ready once, when every Done-when line passes locally.** The full suite runs once on that head, then the merge.
- **The K2 agent's run on live data is a separate, later step**, after its eval is recorded. It is a data run, not a code change, so it needs no CI.

## Done when

1. Every G1–G4 LO and activity resolves to a `subject` row. A subject spelling the seed map does not know fails the load.
2. Every academic LO names a topic of its own subject. A unit with no topic produces a machine-made topic carrying the machine mark.
3. Every academic LO links to at least one registry skill. The chain check reports n of n.
4. Each of the 155 engine skills names exactly one LO of its own grade and subject. A right answer on a paper for that engine skill appears in the child's state for that LO.
5. The 8 capabilities and 3 words exist as rows, worded exactly as in the spine file. A test compares the two.
6. The 204 behaviours exist as LOs of kind *character*, each naming its stage, capability and words. A rubric mark on one reaches the child's state for its capability and words.
7. Every LO names exactly one capability. A model's choice from outside the shortlist code gave it is refused.
8. Machine-made links are live and marked:
   - a machine-made link counts in the child's picture, and the picture reports the share resting on unchecked links;
   - correcting the link changes the picture on the next rebuild and changes no evidence row;
   - a parent report line resting on an unchecked link is refused.
9. The "check this week" list shows exactly the unchecked links used by lessons in the coming week or fortnight, and nothing else. Checking one records an `approval` row and removes the machine mark.
10. An activity naming three LOs with three capabilities sends each rubric row's mark to its own LO, and the child's picture shows all three capabilities.
11. One engine function returns a child's picture by LO, skill thread, topic, subject, capability and word. Rebuilding it from scratch gives the same answer twice.
12. Blank, wrong and wrong-with-working stay three distinct counts at every level of the roll-up.
13. The K2 agent:
    - places a K2 label that config names as a routine with no model call;
    - refuses a model answer outside its list;
    - does not run until its eval score against the coordinator's cases is recorded.
14. `engine audit` counts every link in the chain for K2 and G1–G4 and fails when any link is below n of n.
15. Curriculum lists Grade → Subject → Topic → LO → Activity with capability, words and the machine mark. An LO page shows the chain both ways. One screenshot test per screen.
16. Every LO in scope is an observable statement or carries the machine mark of a rewrite with its source text kept; no LO is empty or a heading; the rewrite's eval score is recorded before it runs.
17. No new number, word list or prompt text inside code. Every prompt is a row with its eval score.

## Out of scope

- Storing NCF-SE or NCERT statements as tables (ADR 0041). The spine file is used only to draft links.
- Writing LOs for N, PG, K1 or G5–G7, and writing activities for G1–G4.
- The founders' edits to the behaviours' wording. They load as the council-reviewed draft, machine-marked.
- What parents read in a report, beyond the one gate in point 8.
- The Today, timetable, paper-checking and assessment-card work (separate specs).
- The "database did not answer in 8 seconds" fix (its own small pull request, no schema change).

## Decisions (settled by Nimish, 16 Nov)

1. **Subjects vs routines in K2.**
   - Circle Time and similar are routines, not subjects.
   - FMS and GMS are subjects.
   - Rhymes belong to English.
   - A K2 mapping agent builds the K2 subject → LO mapping (point 10).
2. **Approval.** Everything machine-made is live with a machine mark. Checking happens as each week or fortnight starts, not in bulk (point 8). This replaces CP-51's rule for these links. The parent-report gate stays.
3. **Grades.** K2 and G1–G4.
4. **One major capability per LO.** A project reaches more capabilities through the several LOs its activity names (point 10 of Done when).

5. **Checking:** each grade's coordinator, through the "check this week" list.

**Still open:**
- **Who classifies the ~30 K2 cases** the K2 agent is scored against, and the ~30 rows the LO rewrite is scored against? (Proposed: the K2 coordinator and one G1–G4 coordinator.)

