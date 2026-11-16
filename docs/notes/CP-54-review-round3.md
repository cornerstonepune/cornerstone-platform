# CP-54 review, round 3 (16 Nov 2026)

**Heads reviewed:**

| Band | Head |
|---|---|
| G1 | 78f27572f |
| G2 | f6cc06a41 |
| G3 | d4ae1be7e |
| G4 | ab49ebc2a |
| K2 | c57d1dcad (lo_rewrites/K2.json blob 814a715e) |

**How the sample was drawn.** I took a fresh random sample with seed 20261116:
- 40 LOs per band, plus 20 near-twin rows for K2;
- 30 activities per G band;
- 10–15 new LOs per band;
- every item flagged in round 2, as "recheck" rows.

The error rates below count random rows only.

**Rubric.** The same rubric as round 2, plus one change for this round. An activity marked `basis=inferred` is not counted as an error, provided the cell names a real activity and the row is otherwise sound. Activities invented from a topic, an event name or a routine's purpose still count as wrong.

**Drive check.** I made 7 Drive reads, one document each, read-only.

## Can each band be loaded? (bar: LOs ≤ 10 % and activities ≤ 10 %)

| Band | LO error | Activity error | Real problems in activities* | New-LO error | Load? |
|---|---|---|---|---|---|
| G1 | **5 %** (2/40) ✓ | 37 % (11/30) | 27 % | 30 % | **No.** LOs pass; activities do not. |
| G2 | **7.5 %** (3/40) ✓ | 77 % (23/30) | 37 % | 20 % | **No.** LOs pass; activities do not. |
| G3 | 20 % (8/40) | 63 % (19/30) | 57 % | 20 % | **No** |
| G4 | 17.5 % (7/40) | 47 % (14/30) | 47 % | 30 % | **No** |
| K2 | 22.5 % (9/40); near-twin rows 30 % (6/20) | — | — | 33 % | **No** |

\*"Real problems" leaves out activities whose only fault is a wrong basis label: marked `educator_plan` while the steps were invented.

The G1 and G2 LO rates are 2 and 3 failures in 40 rows. That is not enough to prove the true rate is under 10 %: the 95 % upper bound is about 17–20 %. The known failures are rows I can list, though: see "What remains", item 1. Once those are fixed, both LO sets can load.

## Round-2 items: what happened

| Status | Items |
|---|---|
| **Fixed** | <ul><li>G1 body data is gone.</li><li>G1 meditation is now ungraded, with look_fors.</li><li>"carry" is gone (G1-105 and G1-149 now say "regroup").</li><li>"teacher" is gone from G4.</li><li>LO-G1-0101.</li><li>LO-G4-1483, 1557, 1595 and 1599.</li><li>G3 LOs with no condition or two actions (0942, 1034, 1037, 1042, 1208, 1288, 0988, 1040).</li><li>G2 activity links (113, 137, 097).</li><li>G3-009 levels.</li><li>G3-011 Plus/Delta.</li><li>K2: no identical titles remain (0 of 1,192).</li></ul> |
| **Still present** | <ul><li>Every routine or purpose LO: G1 0097/0105/0151/0152/0232; G2 0712/0900/0905/0907/0915/0917/0732; G3 0997/1048 (plus 1295 and 1310 in the random sample); G4 1504/1636/1721/1723/1726/1727/1728 (plus 1444).</li><li>Activities invented from event names (G4-239 to 245) and from the syllabus (G3 ×6, G4 ×6, G1-281/303).</li><li>G1-314 and G1-318 still link an LO to a wellbeing activity.</li><li>K2: the Dance, Clay and Hindi families still share one source text, made distinct by invented acts.</li></ul> |

## Faithfulness to the school's documents (7 Drive reads, 42 activities)

**Curriculum documents are copied faithfully: 29 of 32 rows.**
- G1/G2/G3 Visual Arts: 14 of 14 faithful.
- Hindi Grades 1–4: 6 of 6 faithful.
- Handwork Grades 2–4: 6 of 6 faithful.
- Computing, Grades 2–4 Monthly Planner: 7 of 9 faithful. G2-136 borrows a step from the G3 pathway. G3-009 adds "write a corrected line", which is not in the plan.

**Planner sheets are not copied faithfully: 1 of 10 rows.** These are the G1 Monthly Detailed Plan and the G2 2026-27 Parent planner.
- Their cells are one-line topics, such as "Dictation of 8 words" or "2.3 What is fiction and non-fiction?".
- The rows add 4–5 invented steps but are marked `educator_plan`. Their notes often say "Steps follow the educators' planner cell", which is false.
- Affected rows: G1-059, 099, 105, 128 and G2-002, 021, 036, 038.
- G1-105's note says "the cell said 'regroup'", but the cell says "with carry".
- The one faithful planner row is G2-004 (Shopkeeper's Ledger), whose cell describes the task.

**Expected planner tabs are not cited.** No activity cites the "2025-26 hidden planner tabs" (G1/G2) or "Parent planner_2026-27" (G3), so I could not check those.

## What remains, most common first

1. **Purpose-only routine and visit LOs rewritten into assumed actions.** These are listed above, and they are the whole remaining LO blocker for G1 and G2. **Fix:** set `fold_into_unit` or `needs_human` on those exact codes.
2. **Activities that are not the school's.**
   - Invented from a syllabus topic or an event name: G3 6/30, G4 7/30, G1 2/30.
   - Planner topics padded into steps and labelled `educator_plan`.
   - **Fix:** relabel the padded rows `basis=inferred` (most G1 and G2 activity fixes are exactly this), and drop or `needs_human` the invented ones.
3. **Levels or links that don't match the LO, and LOs with no condition.**
   - Levels or links: G1-062, G1-071, G1-322; G2-179, G2-215, G2-217; G3-112, G3-124, G3-147, G3-152; G4-048, G4-251.
   - Template level prefixes: G2-242, 264, 287, 300, 305, 309; G4-171.
   - No condition: G2-0644, G2-0686; G3-0960, 0982, 1187; G4-1416, 1419, 1591, 1670.
   - K2: rhymes and stories still unnamed (0535, 0563; 19 new LOs that say "story N").

### Example failures (3 per band and kind)

- **G1**
  - LO: LO-G1-0097 (quiz purpose); LO-G1-0173 (a "Speaking" heading borrowing a sibling's content).
  - Activity: G1-281 (topic only); G1-303 (syllabus-built); G1-059 (mislabelled basis, and level 2 grades single words while the LO is a dictated sentence).
  - New LO: G1-NEW-036 (a warm-up); G1-NEW-043 (grades conduct); G1-NEWLO-015.
- **G2**
  - LO: LO-G2-0492 (tables 3 and 4 dropped with no note); 0644 ("with expression"); 0686 (no condition).
  - Activity: G2-025 (project title only); G2-002 and G2-021 (planner padding labelled `educator_plan`, confirmed on Drive).
  - New LO: G2-NEW-058 (two outputs); G2-LONEW-017 (near-twin of NEW-054).
- **G3**
  - LO: 1295 (Home Period); 1310 (Theme-Based Learnings); 0960 (no condition).
  - Activity: G3-015, 027, 036 (invented from unit topics).
  - New LO: G3-NEW-005 (near-twin); G3-NEW-025 (two actions).
- **G4**
  - LO: 1444 (Science Park purpose); 1640 (duplicates NEW-005); 1591 (no condition).
  - Activity: G4-190, 191, 203 (syllabus-built).
  - New LO: G4-NEW-040 (field visit); G4-NEW-045 (BharatQuest); G4-NEW-020.
- **K2**
  - LO: 0149-1 (mandala assumed); 0212-1 (line walking assumed); 0232-2 (beam assumed).
  - New LO: 5-025 (rhyme unnamed); 5-057 ("story 20"); 5-020 (duplicates its parent).

## Caveats

- **Reviewers.** One reviewer agent per band judged the rows against one written rubric. I spot-read their work, and overrode 4 G2 and G1 rows using the Drive evidence.
- **Renumbered refs.** Activity refs changed again between rounds, so round-2 items were matched by content, not by ref.
- **K2 originals.** These are still not in the repo, so K2 was not checked against its source.
