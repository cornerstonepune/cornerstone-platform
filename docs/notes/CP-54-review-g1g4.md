# CP-54 — second-reviewer check of the G1–G4 data (16 Nov 2026)

## Plain-English summary

**Recommendation: do not ship any band as it is.** The learning-objective rewrites are mostly fine:
- G1, G3 and G4 need about 4 to 12 rows fixed each.
- G2 needs its routine rows redone first.

The activities are not ready in any band:
- G1, G2 and G3: every sampled activity fails.
- G4: the activities are much better written, but most are padded or made up (pattern 3).

This file replaces `CP-54-review-g1g3.md`, and the data file replaces `review/G1-G3.json` (branch `data/review-g1g3`).

### Which branch heads were reviewed

| Branch | Head | What changed since the first review |
|---|---|---|
| `data/g1` | d792c21 | Activities only: 306 → 360 rows. The 54 new rows are PE and Routines. The `source` field changed on old rows. **Rubric levels are unchanged.** |
| `data/g2` | 3ac0ecc | Nothing. The files are byte-identical to what I reviewed before, even though the commit says "real levels". |
| `data/g3` | 04fb597 | Nothing. The files are byte-identical. |
| `data/g4` | 6c9b0cf | New: 426 LOs, 263 activities, 37 new LOs. |

### Results

| Band | LO rows sampled | LO ok / fix / wrong | LO error rate | Activities sampled | Activity ok / fix / wrong | Activity error rate | New LOs ok / fix / wrong |
|---|---|---|---|---|---|---|---|
| G1 | 59 | 47 / 10 / 2 | 20 % | 101 | 0 / 81 / 20 | 100 % | 24 / 10 / 5 |
| G2 | 34 | 20 / 6 / 8 | 41 % | 31 | 0 / 24 / 7 | 100 % | 11 / 1 / 0 |
| G3 | 57 | 45 / 10 / 2 | 21 % | 12 | 0 / 6 / 6 | 100 % | 1 / 0 / 0 |
| G4 | 60 | 49 / 4 / 7 | 18 % | 64 | 4 / 45 / 15 | 94 % | 27 / 7 / 3 |

**How the sample was drawn.** For LOs: every low-confidence row first (up to 40), then rows 1, 21, 41 … in file order. For activities: every 8th row, plus every row that links a new LO. All new LOs were reviewed.

**What was checked against what.**
- LOs were checked against their original titles in `supabase/seed/registry.json`.
- Activities were checked against each row's own source note. I did not open the Drive sheets, as instructed.

Row-by-row verdicts, with corrected text, are in `supabase/seed/curriculum/review/G1-G4.json`.

### Ship each band as it is?

- **G1 — no.**
  - LOs: 12 fixes. All 51 "keep" rows are topic names, not objectives ("Counting to 100 …").
  - Activities: the rubric levels are still a single template in all 360 rows. 218 rows have one step. 20 were built from syllabus bullets.
  - The new PE rows are real, named activities. They inherit the template levels.
  - Two of the new rows grade an emotion chart and a height/weight record. Neither is a learning objective, and the weight data is sensitive.
- **G2 — no.**
  - 8 of the 12 low-confidence LOs turn routine purposes into made-up actions ("Home Period", "No Uniform Day", "Evaluation").
  - All 142 activities use one rubric template.
- **G3 — LOs: yes, after 12 fixes. Activities: no.**
  - 73 of the 85 activities are built from the syllabus, not from an educator plan.
  - LO-G3-1007 and LO-G3-1008 are swapped.
- **G4 — LOs: yes, after 11 fixes. Activities: no.**
  - The rubric levels are bespoke and observable. This is the standard the other bands should copy.
  - However, 188 of the 263 activities say "steps extended from common sense", and 72 say "no educator plan exists". In 72 cases the activity, its steps and its LO were invented from a syllabus bullet or an event name ("Friendship Day", "Photography Day").
  - 38 G4 LO rewrites carry an "assumed / purpose" note. Every routine I sampled that had only a purpose line was wrong.

## The three most common failures, and the rule each one needs

1. **Content the sources do not hold.** This is the biggest failure in all four bands.
   - **LOs.** Routine and purpose lines were rewritten as assumed actions instead of `fold_into_unit` or `needs_human`. Rewrite notes saying "assumed" or "purpose": G1 11, G2 9, G3 20, G4 38.
   - **Activities.**
     - Built from syllabus bullets or event names: G1 20, G3 73, G4 72.
     - G4 padded the steps of 188 activities "from common sense".
     - Rows whose cell names only a topic were kept anyway ("Compare numbers.", "Look at rocks.").

   *Rule:*
   - A note containing "assumed", "common sense", "no educator plan" or "syllabus bullets" makes the row `needs_human`. It never becomes live data.
   - Suggested steps go in a separate `suggested_steps` field, so the educator can tell them apart from the school's own words.
   - Whether made-up activities are wanted at all is Nimish's decision, not a worker's.

2. **Rubric levels are templates that describe the child, not the work.** This affects G1 (all 360 rows) and G2 (all 142). In G3 it is the "The activity is done …" rows and the computing rows that start "The child …".
   - G4 shows the fix: level 0 to level 3 each name a concrete, visible thing for this LO and this activity.

   *Rule (validator):*
   - Reject a level whose text, with the activity name removed, appears in more than 3 rows.
   - Reject a level that starts "The child".
   - Reject a level 2 that does not contain the linked LO's main verb.

3. **More than one action in an LO, or no condition.**
   - Examples: "reads and writes", "adds and subtracts", "names … and says …", and new G4 LOs with four actions (G4-NEW-017 types, formats, colours and lists).
   - G1 and G4 "keep" topic names: 51 and 12 rows.
   - LOs with no condition: "names staple grains and pulses", "writes the numerals correctly".

   *Rule:*
   - `keep` only if the original starts "The child".
   - Reject two seen-verbs joined by "and".
   - Require a condition phrase ("with / using / from / when / in / on / after / by").

## Other findings for the orchestrator

- **New LOs are outside the brief.** The workers created 89 of them (G1 39, G2 12, G3 1, G4 37). The brief says to link an existing LO or none. Most of them are fine as objectives. A decision is still needed on whether new LOs are allowed. If they are, they need the same review as the rewrites.
- **Character and wellbeing items are being graded 0–3.** Examples: emotion logs (G1-314, G1-318), anti-bullying responses, kind messages, and a height/weight record (G1-NEW-032). These should not carry LOs or rubrics.
- **Subject codes outside the brief's list:** `PE`, `RTN`, `HIS`. Art LOs sit under Global perspectives in the upstream data, so ART activities cannot meet the "same subject" rule.
- **School vocabulary:** G1-105 says "carry"; the school says "regroup". G4-153 says "teacher"; the school says "educator".
- **G2 and G3 were not changed.** Their "second pass" commits did not change the reviewed files. Check that the workers pushed what they meant to push.
