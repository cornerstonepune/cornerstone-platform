# CP-54 — second-reviewer check of the G1–G3 data (16 Nov 2026)

## Plain-English summary

**Recommendation: do not ship any of the three bands as they are.** The learning-objective rewrites are close: fix the rows listed below and G1 and G3 can ship. The activities need a second pass in all three bands, because every sampled activity fails the rubric standard.

| Band | LO rows sampled | LO ok / fix / wrong | LO error rate | Activities sampled | Activity ok / fix / wrong | New LOs (made by the worker) ok / fix / wrong |
|---|---|---|---|---|---|---|
| G1 | 59 | 47 / 10 / 2 | 20 % | 73 | 0 / 57 / 16 | 16 / 6 / 3 |
| G2 | 34 | 20 / 6 / 8 | 41 % | 31 | 0 / 24 / 7 | 11 / 1 / 0 |
| G3 | 57 | 45 / 10 / 2 | 21 % | 12 | 0 / 6 / 6 | 1 / 0 / 0 |

The sample is skewed on purpose. It takes every low-confidence row (up to 40) first, then every 20th row. G1's *high*-confidence rows actually did worse (6 of 16 wrong) than its low ones (6 of 43), because of the "keep" problem (pattern 2 below). Row-by-row verdicts, with corrected text, are in `supabase/seed/curriculum/review/G1-G3.json`.

**Ship or not, per band**
- **G1 — no.** For the LOs, apply the 12 fixes and re-check all 51 "keep" rows: they are topic names, not objectives. All 306 activities use one fixed level-0/1 template. 187 of them have a single step, often just the topic repeated ("Compare numbers."). 20 were built from syllabus bullets that no plan cell names, and 11 link more than 3 LOs.
- **G2 — no.** 8 of the 12 low-confidence LO rows are wrong. All of them are routine or purpose lines ("Home Period", "No Uniform Day", "Evaluation") turned into made-up child actions. All 142 activities use one fill-in-the-blank rubric template. Level 2 is "complete and correct as the task asks" instead of the LO itself.
- **G3 — LOs yes after the 12 fixes. Activities no.** 73 of the 85 activities say "built from the unit syllabus, no educator plan exists". Where the syllabus names the activity (the Hindi unit activities), I judged the row fixable. Where it only names topics, the activity is made up.

## The three most common failures, and the rule each one needs

1. **The rubric levels are templates, and they describe the child instead of the work.** This hits every sampled activity in all three bands.
   - G1: "X is not yet seen, even with an educator's prompt…" and "X only when an educator prompts…".
   - G2: "The <activity> is not yet seen; there is no attempt…".
   - G3 computing: "The child …".

   *Rule for workers:* each level names a concrete thing in the work or the talk, specific to this LO and this activity: a count, a feature, or an error type. Level 2 restates the LO's observable result. No sentence may start "The child" or use a stem shared with another row. *Validator:* reject any level text that appears, after removing the activity name, in more than 3 rows. Also reject any level that starts "The child".

2. **Rows that are not objectives were turned into objectives.** This shows up in three forms:
   - (a) Purpose and routine lines with no child action were rewritten into assumed actions instead of `fold_into_unit` or `needs_human`. G1 0097 and 0232; G2 0563, 0712, 0900, 0905, 0907, 0915, 0917; G3 0997.
   - (b) G1 "kept" 51 topic names ("Counting to 100 (forwards and backwards)") that do not start "The child".
   - (c) Activities were made from topics or syllabus bullets that name no activity: G1 289, 297, 305; G2 019, 025, 089; most of G3. Plan cells that only name a topic were also kept: "Rocks", "Change materials".

   *Rule:* if the source names no child action, the row is `fold_into_unit` or `needs_human`, never a rewrite. Any note containing "assumed" must force `needs_human`. `keep` is allowed only if the original already starts "The child". An activity needs a cell that names something children do. A topic name alone gives no row.

3. **More than one action, or no condition.** Examples:
   - "reads and writes" (G2 0480; G3 0930, 0953)
   - "adds and subtracts" (G3 0966)
   - "names X and says Y" (G1-NEW-008, G1-NEW-016, G2-NEW-004)
   - LOs with no condition at all ("names staple grains and pulses", "describes what happens during an earthquake")

   *Rule:* the validator rejects "X and Y" where both X and Y are verbs in the seen-verb list. It also rejects a title that has no "with / using / from / on / in / when / after / by" phrase.

## Other findings for the orchestrator

- **New LOs:** the workers created 38 of them (G1 25, G2 12, G3 1). The brief says to link existing LOs or none. Some of these new LOs are good, for example the punctuation and plurals ones. Others restate the task ("makes a flashcard") or are linked to unrelated activities (G1-NEW-004 "action song" is used for the Republic Day song and the Christmas jingle). Nimish or the coordinators need to decide whether new LOs are allowed at all.
- **G3 LO-G3-1007/1008 have their actions swapped.** The Fraction Bakery task text is in 1007, which was folded. The heading in 1008 was rewritten instead.
- **Subject labels:** Art LOs in G1–G3 sit under "Global perspectives". This comes from the upstream data. As a result, ART activities link to GP LOs, which breaks the "same subject" rule.
- **School vocabulary:** G1-105 uses "carry"; the school's word is "regroup".
- **Limits of this review:** I checked faithfulness against the original LO text (`registry.json`) and against each activity's own cell note. I did not re-open the Drive sheets, as instructed, so a misquoted cell could still pass.
