# CP-54 — second-reviewer check, round 2 (G1–G4 and K2), 16 Nov 2026

## Plain-English summary

**No band can ship as it is.** The learning objectives are close in G1, G3 and G4: 10–12 rows each still need fixing. The worst rubric problems from round 1 are gone in every band, in particular the copy-paste scoring levels. But:

- most G1, G3 and G4 activities still rest on steps or whole activities the workers made up;
- G2's routine rows still describe actions the source never names;
- K2's Story Telling, song and rhyme objectives cannot be told apart, because the story or song is never named.

### Review set-up

**Branch heads reviewed:**

| Band | Head |
|---|---|
| G1 | `9f01866` |
| G2 | `fb137f2` |
| G3 | `d742cbe` |
| G4 | `abd7aa3` |
| K2 | `6ea7cb1` |

**Sampling** followed the round-1 rules. For K2, I also sampled extra rows from the near-twin families and the Dance, Clay and Block Room families. The rates below count only the round-1-style sample.

**Who judged the rows.** One reviewer agent per band judged its rows against a single written rubric (my round-1 rulings, written down). I checked the results, spot-read them, and changed four G4 verdicts back to "fix" so they stay consistent with round 1.

**Where the details are.** Every row and its corrected text is in `supabase/seed/curriculum/review/round2.json`.

## Error rates compared with round 1

Error = fix + wrong.

| Band | LO, round 1 | LO, round 2 | Activities, round 1 | Activities, round 2 | of which only "label made-up steps as suggested" | New LOs, round 2 (error) |
|---|---|---|---|---|---|---|
| G1 | 20 % | **17 %** (58: 48 ok / 5 fix / 5 wrong) | 100 % | **95 %** (100: 5 / 68 / 27) | 57 → real errors **38 %** | 37 % (19) |
| G2 | 41 % | **27 %** (33: 24 / 2 / 7) | 100 % | **29 %** (31: 22 / 6 / 3) | 1 → real errors **26 %** | 17 % (12) |
| G3 | 21 % | **21 %** (58: 46 / 10 / 2) | 100 % | **92 %** (12: 1 / 5 / 6) | 0 → **92 %** | 0 % (5) |
| G4 | 18 % | **18 %** (60: 49 / 4 / 7) | 94 % | **94 %** (64: 4 / 44 / 16) | 40 → real errors **31 %** | 29 % (17) |
| K2 | — | **40 %** (96: 58 / 24 / 14) | — | no activities | — | 29 % (35) |

K2's extra sample of near-twin, Dance, Clay and Block Room rows had an 85 % error rate (146 rows: 22 ok / 119 fix / 5 wrong).

## Fixed since round 1, checked in the whole files, not just the sample

- **Copy-paste scoring levels are gone.** In G1, G2, G3 and G4, no level-0 or level-1 wording is repeated in more than 3 rows.
- **No level starts with "The child".**
- **No objective was kept as a topic name.** Every title starts "The child", none is over 25 words, and none uses a banned word.
- **No title has two actions** of the kinds round 1 flagged ("reads and writes", "names … and says …").
- **Character and wellbeing activities** have no scoring levels and exactly 3 look-fors: G1 10, G2 2, G3 3, G4 7.
- **The G3 rows LO-G3-1007 and LO-G3-1008 are no longer swapped.**

## Failures that remain, most common first

1. **Content the sources do not contain.** This is unchanged from round 1 and is now the main blocker.
   - **Activities made up from a topic, the syllabus or an event name:**
     - G1 has 27 such rows. Examples: G1-009, G1-089, G1-113, G1-289, G1-345.
     - G3 has 6 of the 12 sampled. These rows are untouched since round 1, including G3-017, G3-033 and G3-073.
     - G4 has 16 of the 64 sampled. Examples: G4-193 to G4-249, all built from the syllabus, and G4-252 to G4-258, all built from event names.
   - **Steps made up from an activity's name and not labelled as suggested:** 57 G1 rows and 40 G4 rows. The fix is one change: put them in a `suggested_steps` field, or label them in the text.
   - **Routine or purpose lines rewritten into an assumed action.** These are still present:
     - G1: 69 rewrites carry an "assumed / purpose" note. Wrong in the sample: LO-G1-0097, 0105, 0151, 0152, 0232.
     - G2: 0712, 0900, 0905, 0907, 0915 and 0917 are unchanged.
     - G3: 0997 and 1048 (field visits).
     - G4: 1504, 1636, 1721, 1723, 1726, 1727, 1728 are unchanged.
     - K2: 318 notes say "assumed". Examples: the Block Room "concentration" rows and the PE / fine-motor rows.
   - **Rule:** a row whose note says "assumed", "common sense", "no educator plan" or "built from the event name" must be `needs_human`, not live data.
2. **K2 near-twins.**
   - 53 K2 rows share an identical title with another row. Example: "The child narrates the story to the class in their own words" appears 5 times.
   - 43 sampled Story Telling rows, the songs and rhymes, and the numeral rows never name their story, song or number range.
   - The Dance, Clay and Hindi 0517–0531 families each repeat one source text. The worker made the rows look different by inventing an act (a scarf, sticks, a leaf print, a sand tray).
   - **What it needs:**
     - each story, song or rhyme name from the K2 sheet, written into the title;
     - each repeated family folded to one row.
   - The reviewer left placeholders like `[story name from the unit sheet]` in the corrections.
3. **Objectives that miss a condition, or join two actions, and links that do not match.**
   - **Missing condition:** LO-G3-0942, 1034, 1037, 1042, 1208 (identical to round 1), 1288.
   - **Two actions:** LO-G3-0988 and 1040; the K2 Block Room rows "builds … and tells …"; G4-NEW-016, 025 and 049.
   - **Round-1 corrections never applied:** LO-G1-0101; LO-G4-1483, 1557, 1595 and 1599.
   - **Activity links that do not fit the activity:** G2-113, G2-137, G2-141; G3-009.

### Still present: sensitive and vocabulary items (the orchestrator's added checks)

- **G1-307 still records and grades height, weight and gender on a record card.** It must be removed. Its new objective G1-NEW-032 is also wrong.
- **Meditation is still graded** in G1-316 and G1-321.
- **G1-318** attaches a health objective to a feelings circle. One of G1-314's look-fors is an inner state, not something an educator can see.
- **"carry"** still appears in G1-105 (the title) and G1-149 ("without carry").
- **"teacher"** still appears in G4-153 ("teacher-chosen") and G4-212.
- G2-009 uses the Marathi शिक्षक ("teacher"). Someone needs to decide whether the "educator" rule applies to Marathi and Hindi text.

## Ship each band as it is?

| Band | Ship? | Why |
|---|---|---|
| G1 | **No** | The objectives could ship after 10 fixes and folding the routine "assumed" rows. The activities cannot: there is a graded height and weight record, graded meditation, 27 made-up activities, and steps nobody has labelled. |
| G2 | **No, but closest** | Activities are now mostly sound (29 % error). The six routine objectives still need folding or `needs_human`, and five activity links need fixing. This could ship after one short pass. |
| G3 | **No** | The objectives could ship after 12 fixes. The activities are still mostly built from the syllabus and untouched since round 1. |
| G4 | **No** | The objectives could ship after 11 fixes: 7 routine rows, plus 4 round-1 corrections that were never applied. For the activities, the 40 "label as suggested" rows are a one-line fix each, but 16 made-up activities must go or be confirmed by an educator. |
| K2 | **No** | 40 % error in the base sample and 85 % among the near-twin rows. The story, song and rhyme names must come from the K2 sheet, and the repeated families must be folded. |

## Caveats

- **K2 originals were not checked.** Its original objective texts are in a live sheet export that is not in the repo, and this review used no Drive or live SQL. So K2 faithfulness to the source is unchecked.
- **Activity refs were renumbered between rounds** (for example, G2 now has 141 rows). Each round judges the row that has a given ref at that time, so a round-1 verdict on G2-073 may be about a different activity.
- **G4 verdicts changed back.** The G4 reviewer agent called G4-039, 109, 121 and 137 "wrong". I changed them back to "fix", in line with the round-1 ruling: the cell names the activity, and only the steps are thin.
- **One round-1 verdict tightened.** LO-G3-1048 (Space Park visit) was ok in round 1. It is wrong in round 2 under the purpose-line ruling.
